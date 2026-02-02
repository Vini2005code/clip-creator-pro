import { useState, useRef, useCallback } from 'react';
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';
import { supabase } from '@/integrations/supabase/client';
import { SmartCaptionConfig, SmartCaptionResult } from './useSmartCaption';
import { renderCaptionsWithFallback } from '@/lib/ffmpeg/captionPipeline';

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

  // Generate smart captions via edge function
  const generateSmartCaptions = async (
    clipStart: number,
    clipEnd: number,
    config: SmartCaptionConfig,
    transcript?: string
  ): Promise<SmartCaptionResult | null> => {
    if (!config.enabled) {
      console.log('[FFmpegWorker] Smart captions disabled, skipping...');
      return null;
    }

    const clipDuration = clipEnd - clipStart;

    try {
      console.log('[FFmpegWorker] Generating smart captions...', { clipStart, clipEnd, config });
      
      const { data, error } = await supabase.functions.invoke('smart-caption', {
        body: {
          transcript: transcript || `Conteúdo viral do momento ${clipStart.toFixed(1)}s até ${clipEnd.toFixed(1)}s`,
          startTime: clipStart,
          endTime: clipEnd,
          outputLanguage: config.outputLanguage,
          enableRehook: config.enableRehook,
          rehookStyle: config.rehookStyle,
          retentionAdjust: config.retentionAdjust,
        }
      });

      if (error) {
        console.error('[FFmpegWorker] Smart caption API error:', error);
        // Return fallback captions instead of null
        return createFallbackCaptions(clipDuration, config);
      }

      // Validate response has required data
      if (!data || (!data.captions?.length && !data.rehook)) {
        console.warn('[FFmpegWorker] Invalid caption response, using fallback');
        return createFallbackCaptions(clipDuration, config);
      }

      console.log('[FFmpegWorker] Smart captions generated:', data);
      return data;
    } catch (err) {
      console.error('[FFmpegWorker] Failed to generate smart captions:', err);
      // Return fallback captions on error
      return createFallbackCaptions(clipDuration, config);
    }
  };

  // Create fallback captions when API fails
  const createFallbackCaptions = (
    duration: number,
    config: SmartCaptionConfig
  ): SmartCaptionResult => {
    const isPortuguese = config.outputLanguage === 'pt';
    
    const hooks = {
      curiosity: isPortuguese ? 'VOCÊ NÃO VAI ACREDITAR...' : 'YOU WON\'T BELIEVE...',
      conflict: isPortuguese ? 'ISSO MUDOU TUDO!' : 'THIS CHANGED EVERYTHING!',
      promise: isPortuguese ? 'ASSISTA ATÉ O FINAL' : 'WATCH UNTIL THE END',
    };

    const segmentDuration = Math.min(3, duration / 3);
    const captions: SmartCaptionResult['captions'] = [];
    
    // Generate timed caption segments
    for (let i = 0; i < Math.floor(duration / segmentDuration); i++) {
      const start = 1.5 + (i * segmentDuration);
      const end = Math.min(start + segmentDuration, duration);
      if (end <= start) break;
      
      captions.push({
        text: isPortuguese ? `Parte ${i + 1}` : `Part ${i + 1}`,
        start,
        end,
        keywords: [],
        isHook: false,
      });
    }

    return {
      transcription: '',
      words: [],
      captions,
      rehook: config.enableRehook ? {
        text: hooks[config.rehookStyle],
        style: config.rehookStyle,
      } : null,
      suggestedStartTime: 0,
      suggestedEndTime: duration,
    };
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

        // 2. Generate smart captions if enabled (or if captionsRequired, we still generate fallback)
        let captionResult: SmartCaptionResult | null = null;
        if (smartCaptionConfig?.enabled) {
          setProgress(p => ({
            ...p,
            currentClip: i + 1,
            totalClips: count,
            stage: 'generating-captions',
            stageMessage: `Gerando legendas IA (${i + 1}/${count})...`
          }));
          
          captionResult = await generateSmartCaptions(
            startTime,
            endTime,
            smartCaptionConfig,
            peakIntensity ? `Momento de alta energia (${Math.round(peakIntensity * 100)}% intensidade)` : undefined
          );
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
                ...videoEncodeArgs,
                ...audioEncodeArgs,
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
    processVideo,
    abort,
    reset
  };
}
