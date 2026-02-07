import { useState, useRef, useCallback } from 'react';
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';
import { supabase } from '@/integrations/supabase/client';
import { SmartCaptionConfig, SmartCaptionResult } from './useSmartCaption';
import { renderCaptionsWithFallback } from '@/lib/ffmpeg/captionPipeline';
import { segmentTranscription, type WordTimestamp } from './useASRTranscription';

export interface CutConfig {
  duration: number;
  count: number;
  speed: number;
  zoomIntensity: number;
  enableCaptions: boolean;
  captionStyle: 'hook' | 'parts' | 'custom';
  customCaption: string;
}

export interface ProcessedClip {
  id: string;
  name: string;
  blob: Blob;
  url: string;
  startTime: number;
  endTime: number;
  caption: string;
}

export interface ClipTimings {
  startTime: number;
  endTime: number;
  peakIntensity?: number;
}

export type ProcessingStage = 'idle' | 'loading-ffmpeg' | 'reading-file' | 'analyzing' | 'generating-captions' | 'applying-filters' | 'encoding' | 'finalizing' | 'complete' | 'error' | 'aborted';

export interface ProcessingProgress {
  currentClip: number;
  totalClips: number;
  clipProgress: number;
  stage: ProcessingStage;
  stageMessage: string;
}

export function useFFmpegWorker() {
  const ffmpegRef = useRef<FFmpeg | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState<ProcessingProgress>({
    currentClip: 0,
    totalClips: 0,
    clipProgress: 0,
    stage: 'idle',
    stageMessage: 'Pronto para processar',
  });
  const [clips, setClips] = useState<ProcessedClip[]>([]);
  const abortRef = useRef(false);

  const load = useCallback(async (opts?: { force?: boolean }) => {
    if (!opts?.force && (loaded || loading)) return;
    setLoading(true);
    
    try {
      const ffmpeg = new FFmpeg();
      ffmpegRef.current = ffmpeg;

      ffmpeg.on('log', ({ message }) => console.log('[FFmpeg Log]', message));
      ffmpeg.on('progress', ({ progress: p }) => {
        setProgress(prev => ({ ...prev, clipProgress: Math.round(p * 100) }));
      });

      const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm';
      await ffmpeg.load({
        coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
        wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
      });

      setLoaded(true);
      console.log('FFmpeg Carregado!');
    } catch (error) {
      console.error('Erro ao carregar FFmpeg:', error);
      throw error;
    } finally {
      setLoading(false);
    }
  }, [loaded, loading]);

  const blobToBase64 = async (blob: Blob): Promise<string> => {
    const arrayBuffer = await blob.arrayBuffer();
    return btoa(
      new Uint8Array(arrayBuffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
    );
  };

  /**
   * Extract a small WAV preview from the input video via FFmpeg (WASM-compatible).
   * This avoids sending MP4 bytes to ASR and makes transcription deterministic.
   */
  const extractWavPreview = async (opts: {
    inputFile: string;
    startTime: number;
    duration: number;
  }): Promise<Blob> => {
    const ff = ffmpegRef.current;
    if (!ff) throw new Error('FFmpeg not initialized');

    const outName = 'asr_preview.wav';
    // 16kHz mono PCM WAV is widely compatible.
    const exitCode = await ff.exec([
      '-ss', opts.startTime.toFixed(2),
      '-i', opts.inputFile,
      '-t', opts.duration.toFixed(2),
      '-vn',
      '-ac', '1',
      '-ar', '16000',
      '-f', 'wav',
      '-y',
      outName,
    ]);
    if (exitCode !== 0) throw new Error(`FFmpeg falhou ao extrair áudio (código ${exitCode})`);

    const wavData = await ff.readFile(outName);
    await ff.deleteFile(outName);
    const uint8Array = new Uint8Array(wavData as any);
    return new Blob([uint8Array.buffer], { type: 'audio/wav' });
  };

  /**
   * Preview helper: transcribe a short snippet and return 2–3 caption lines
   * (ASR-only; no texto inventado).
   */
  const generateCaptionPreview = useCallback(async (opts: {
    file: File;
    language: 'pt' | 'en' | 'auto';
  }): Promise<{ lines: string[] } | null> => {
    try {
      if (!ffmpegRef.current) await load();
      const ff = ffmpegRef.current!;

      // Write input (isolated from the cutting pipeline)
      const inputData = await fetchFile(opts.file);
      await ff.writeFile('preview_input.mp4', inputData);

      // 12s is enough to get 2–3 segments in most content
      const wavBlob = await extractWavPreview({ inputFile: 'preview_input.mp4', startTime: 0, duration: 12 });
      const base64Wav = await blobToBase64(wavBlob);

      console.log('[CaptionPreview] Calling ASR...', { wavBytes: wavBlob.size, language: opts.language });
      const { data, error } = await supabase.functions.invoke('transcribe-audio', {
        body: { audio: base64Wav, language: opts.language },
      });

      await ff.deleteFile('preview_input.mp4');

      if (error) {
        console.error('[CaptionPreview] ASR invoke error:', error);
        return null;
      }
      if (!data?.success) {
        console.warn('[CaptionPreview] ASR returned failure:', data);
        return null;
      }

      const words: WordTimestamp[] = Array.isArray(data.words) ? data.words : [];
      const segments = segmentTranscription(words, 6, 3.0);
      const lines = segments
        .map(s => s.text.trim())
        .filter(Boolean)
        .slice(0, 3);

      if (lines.length === 0) return null;
      return { lines };
    } catch (e) {
      console.error('[CaptionPreview] Failed:', e);
      return null;
    }
  }, [load]);

  /**
   * Generate captions using ASR transcription
   * CRITICAL: Only real speech transcription - no creative text generation
   */
  const generateASRCaptions = async (
    clipStart: number,
    clipEnd: number,
    config: SmartCaptionConfig,
    inputFileName: string = 'input.mp4'
  ): Promise<SmartCaptionResult | null> => {
    if (!config.enabled) {
      console.log('[FFmpegWorker] Captions disabled, skipping...');
      return null;
    }

    try {
      console.log('[FFmpegWorker] Starting ASR transcription...', { clipStart, clipEnd });

      // IMPORTANT: Extract WAV audio via FFmpeg (WASM) before calling ASR.
      // Sending MP4 bytes to ASR is unreliable and breaks transcription.
      const clipDuration = Math.max(0.1, clipEnd - clipStart);

      // Skip ASR for very short clips - timestamps will be invalid
      if (clipDuration < 0.5) {
        console.warn('[FFmpegWorker] Clip too short for ASR:', clipDuration, 's');
        return null;
      }
      const wavBlob = await extractWavPreview({
        inputFile: inputFileName,
        startTime: clipStart,
        duration: clipDuration,
      });
      const base64Audio = await blobToBase64(wavBlob);

      // Call ASR transcription edge function
      const { data, error } = await supabase.functions.invoke('transcribe-audio', {
        body: {
          audio: base64Audio,
          language: config.outputLanguage === 'pt' ? 'pt' : config.outputLanguage === 'en' ? 'en' : 'auto',
        }
      });

      if (error) {
        console.error('[FFmpegWorker] ASR API error:', error);
        return null; // No fake captions
      }

      if (!data.success || (!data.transcription && (!data.words || data.words.length === 0))) {
        console.warn('[FFmpegWorker] No speech detected in audio');
        return null; // No fake captions
      }

      // Segment the transcription into caption chunks
      const words: { word: string; start: number; end: number; confidence: number }[] = data.words || [];
      
      // Create caption segments from words using natural breaks
      const segments = segmentWordsIntoCaptions(words, clipDuration);
      
      console.log('[FFmpegWorker] ASR captions generated:', {
        wordCount: words.length,
        segmentCount: segments.length,
        transcription: data.transcription.substring(0, 100),
      });

      return {
        transcription: data.transcription,
        words: words,
        captions: segments,
        rehook: null, // No creative hooks - ASR only
        suggestedStartTime: clipStart,
        suggestedEndTime: clipEnd,
      };

    } catch (err) {
      console.error('[FFmpegWorker] Failed to transcribe audio:', err);
      return null; // NEVER generate fake captions
    }
  };

  /**
   * Segment words into caption chunks using natural speech patterns
   */
  const segmentWordsIntoCaptions = (
    words: { word: string; start: number; end: number; confidence: number }[],
    clipDuration: number
  ): SmartCaptionResult['captions'] => {
    if (!words || words.length === 0) return [];

    const maxWordsPerSegment = 6;
    const maxSegmentDuration = 3.0;
    const segments: SmartCaptionResult['captions'] = [];
    
    let currentWords: typeof words = [];
    let segmentStart = words[0]?.start || 0;

    for (let i = 0; i < words.length; i++) {
      const word = words[i];
      const nextWord = words[i + 1];
      
      currentWords.push(word);

      const segmentDuration = word.end - segmentStart;
      const wordCount = currentWords.length;
      
      // Break conditions based on natural speech
      const hasMaxWords = wordCount >= maxWordsPerSegment;
      const hasPause = nextWord && (nextWord.start - word.end) > 0.5;
      const hasMaxDuration = segmentDuration >= maxSegmentDuration;
      const hasSentenceEnd = /[.!?]$/.test(word.word);
      const isLastWord = i === words.length - 1;

      if (hasMaxWords || hasPause || hasMaxDuration || hasSentenceEnd || isLastWord) {
        const text = currentWords.map(w => w.word).join(' ').trim();
        
        if (text) {
          // Clamp timestamps to clip duration
          const start = Math.max(0, Math.min(segmentStart, clipDuration));
          const end = Math.max(0, Math.min(word.end, clipDuration));
          
          if (end > start) {
            segments.push({
              text,
              start,
              end,
              keywords: [], // No AI-generated keywords
              isHook: false,
            });
          }
        }

        currentWords = [];
        if (nextWord) {
          segmentStart = nextWord.start;
        }
      }
    }

    return segments;
  };

  const shouldRetryEngine = (err: unknown) => {
    const msg = err instanceof Error ? err.message : String(err);
    return /aborted\(\)/i.test(msg) || /exit code\s*1/i.test(msg) || /ffmpeg falhou com código 1/i.test(msg);
  };

  // Calculate clip timings with highlight-first logic
  const calculateClipTimings = (
    videoDuration: number,
    config: CutConfig,
    audioHighlights?: { time: number; intensity: number }[]
  ): ClipTimings[] => {
    const timings: ClipTimings[] = [];
    const clipDuration = config.duration;
    const count = config.count;

    if (audioHighlights && audioHighlights.length > 0) {
      // Sort highlights by intensity (best first)
      const sortedHighlights = [...audioHighlights]
        .sort((a, b) => b.intensity - a.intensity)
        .slice(0, count);

      // Use best highlights as start points
      sortedHighlights.forEach((highlight, index) => {
        // Start clip 2-3 seconds before the peak to capture the buildup
        let startTime = Math.max(0, highlight.time - 3);
        let endTime = startTime + clipDuration;
        
        // Ensure we don't go past video duration
        if (endTime > videoDuration) {
          endTime = videoDuration;
          startTime = Math.max(0, endTime - clipDuration);
        }

        // Check for overlap with existing timings
        const hasOverlap = timings.some(t => 
          (startTime >= t.startTime && startTime < t.endTime) ||
          (endTime > t.startTime && endTime <= t.endTime)
        );

        if (!hasOverlap) {
          timings.push({
            startTime,
            endTime,
            peakIntensity: highlight.intensity
          });
        }
      });

      // Fill remaining slots with linear distribution if needed
      if (timings.length < count) {
        const interval = (videoDuration - clipDuration) / (count - timings.length);
        let currentStart = 0;
        
        while (timings.length < count && currentStart + clipDuration <= videoDuration) {
          const hasOverlap = timings.some(t => 
            (currentStart >= t.startTime && currentStart < t.endTime) ||
            (currentStart + clipDuration > t.startTime && currentStart + clipDuration <= t.endTime)
          );
          
          if (!hasOverlap) {
            timings.push({
              startTime: currentStart,
              endTime: currentStart + clipDuration
            });
          }
          currentStart += interval;
        }
      }
    } else {
      // Fallback: linear distribution
      const interval = (videoDuration - clipDuration) / (count > 1 ? count - 1 : 1);
      
      for (let i = 0; i < count; i++) {
        const startTime = i * interval;
        timings.push({
          startTime,
          endTime: startTime + clipDuration
        });
      }
    }

    // Sort by position in video
    return timings.sort((a, b) => a.startTime - b.startTime);
  };

  // Main processing function
  const processVideo = useCallback(async (
    file: File,
    config: CutConfig,
    videoDuration: number,
    smartCaptionConfig?: SmartCaptionConfig,
    audioHighlights?: { time: number; intensity: number }[]
  ): Promise<ProcessedClip[]> => {
    if (!ffmpegRef.current) await load();
    const ffmpeg = ffmpegRef.current!;
    
    abortRef.current = false;
    setProcessing(true);
    setClips([]);
    
    const processedClips: ProcessedClip[] = [];
    
    // Calculate clip timings (with highlight-first logic if available)
    const clipTimings = calculateClipTimings(videoDuration, config, audioHighlights);
    const count = clipTimings.length;

    try {
      // 1. Write input file
      setProgress(p => ({ ...p, stage: 'reading-file', stageMessage: 'Lendo arquivo...' }));
      const inputData = await fetchFile(file);
      await ffmpeg.writeFile('input.mp4', inputData);

      for (let i = 0; i < count; i++) {
        if (abortRef.current) break;

        const { startTime, endTime, peakIntensity } = clipTimings[i];
        const clipDuration = endTime - startTime;
        const outputName = `clip_${i + 1}.mp4`;

        const captionsRequired = Boolean(config.enableCaptions);

        // 2. Generate captions from ASR (real speech only - no fake text)
        let captionResult: SmartCaptionResult | null = null;
        if (smartCaptionConfig?.enabled) {
          setProgress(p => ({
            ...p,
            currentClip: i + 1,
            totalClips: count,
            stage: 'generating-captions',
            stageMessage: `Transcrevendo áudio (${i + 1}/${count})...`
          }));
          
          // Use ASR to get real transcription
           captionResult = await generateASRCaptions(
             startTime,
             endTime,
             smartCaptionConfig,
             'input.mp4'
           );
          
          // If no speech detected, captionResult will be null
          // We do NOT generate fake captions
          if (!captionResult) {
            console.warn(`[FFmpegWorker] No speech detected in clip ${i + 1}`);
          }
        }

        setProgress(p => ({
          ...p,
          currentClip: i + 1,
          totalClips: count,
          stage: 'encoding',
          stageMessage: `Processando corte ${i + 1}/${count}...`
        }));

        // 3. Render captions with multi-strategy fallback (A->B->C)
        setProgress(p => ({
          ...p,
          currentClip: i + 1,
          totalClips: count,
          stage: 'applying-filters',
          stageMessage: `Aplicando legendas/filtros (${i + 1}/${count})...`
        }));

        const baseVideoFilter = 'crop=ih*(9/16):ih:(iw-ih*(9/16))/2:0,scale=1080:1920';
        const captionCfg = smartCaptionConfig;
        const captionInput = {
          duration: clipDuration,
          position: captionCfg?.captionPosition ?? 'bottom',
          primaryColorHex: captionCfg?.primaryColor ?? '#FFFFFF',
          highlightColorHex: captionCfg?.secondaryColor,
          hookText: captionCfg?.enableRehook ? (captionResult?.rehook?.text ?? null) : null,
          segments: (captionResult?.captions ?? []).map(c => ({
            text: c.text,
            start: c.start,
            end: c.end,
          })),
        } as const;

        const videoEncodeArgs = ['-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-preset', 'ultrafast', '-crf', '23'];
        // Audio encode args: -c:a aac only applies if stream exists (mapped with 0:a?)
        const audioEncodeArgs = ['-c:a', 'aac', '-b:a', '128k'];

        const runEncode = async () => {
          const ff = ffmpegRef.current!;
          if (!captionsRequired) {
            // If captions are not required, we still try to include them when available, but we won't block on it.
            try {
              const { usedStrategy } = await renderCaptionsWithFallback({
                ffmpeg: ff,
                inputFile: 'input.mp4',
                outputFile: outputName,
                startTime,
                duration: clipDuration,
                baseVideoFilter,
                videoEncodeArgs,
                audioMapArgs: audioEncodeArgs,
                captions: captionInput,
                captionsRequired: false,
              });
              console.log('[Captions] Non-mandatory captions used strategy:', usedStrategy);
              return;
            } catch (e) {
            console.warn('[Captions] Non-mandatory caption render failed; encoding without captions.', e);
              const exitCode = await ff.exec([
                '-ss', startTime.toFixed(2),
                '-i', 'input.mp4',
                '-t', clipDuration.toFixed(2),
                '-vf', baseVideoFilter,
                '-map_metadata', '-1',
                '-map', '0:v',
                '-map', '0:a?',
                ...videoEncodeArgs,
                ...audioEncodeArgs,
                '-shortest',
                '-y',
                outputName
              ]);
              if (exitCode !== 0) throw new Error(`FFmpeg falhou com código ${exitCode}`);
              return;
            }
          }

          // Captions are mandatory
          const { usedStrategy } = await renderCaptionsWithFallback({
            ffmpeg: ff,
            inputFile: 'input.mp4',
            outputFile: outputName,
            startTime,
            duration: clipDuration,
            baseVideoFilter,
            videoEncodeArgs,
            audioMapArgs: audioEncodeArgs,
            captions: captionInput,
            captionsRequired: true,
          });
          console.log('[Captions] Captions rendered with strategy:', usedStrategy);
        };

        try {
          await runEncode();
        } catch (e) {
          console.warn('[FFmpegWorker] Encoding failed (will check for engine retry)...', e);
          if (shouldRetryEngine(e)) {
            console.warn('[FFmpegWorker] Detected aborted/exitCode=1. Recarregando engine e tentando novamente...');
            setLoaded(false);
            await load({ force: true });
            await runEncode();
          } else {
            throw e;
          }
        }

        // 5. Read and create blob
        const data = await ffmpegRef.current!.readFile(outputName);
        const uint8Array = new Uint8Array(data as any);
        const blob = new Blob([uint8Array.buffer], { type: 'video/mp4' });
        const url = URL.createObjectURL(blob);

        if (blob.size === 0) {
          throw new Error("Erro: Arquivo gerado tem 0 bytes.");
        }

        const clip: ProcessedClip = {
          id: `clip-${i}-${Date.now()}`,
          name: `corte_viral_${i + 1}.mp4`,
          blob,
          url,
          startTime,
          endTime,
          caption: captionResult?.rehook?.text || ''
        };

        processedClips.push(clip);
        setClips(prev => [...prev, clip]);
        
        // Cleanup clip file
        await ffmpegRef.current!.deleteFile(outputName);
      }

      await ffmpegRef.current!.deleteFile('input.mp4');
      
      setProgress(p => ({ ...p, stage: 'complete', stageMessage: 'Concluído!' }));
      return processedClips;

    } catch (error) {
      console.error('Erro Fatal:', error);
      setProgress(p => ({ ...p, stage: 'error', stageMessage: 'Erro ao processar vídeo.' }));
      throw error;
    } finally {
      setProcessing(false);
    }
  }, [load]);

  const abort = useCallback(() => {
    abortRef.current = true;
  }, []);

  const reset = useCallback(() => {
    clips.forEach(c => URL.revokeObjectURL(c.url));
    setClips([]);
    setProgress({ currentClip: 0, totalClips: 0, clipProgress: 0, stage: 'idle', stageMessage: 'Pronto' });
  }, [clips]);

  return {
    load,
    loaded,
    loading,
    processing,
    progress,
    clips,
    generateCaptionPreview,
    processVideo,
    abort,
    reset
  };
}
