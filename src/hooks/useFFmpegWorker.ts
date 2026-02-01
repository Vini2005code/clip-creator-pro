import { useState, useRef, useCallback } from 'react';
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';
import { supabase } from '@/integrations/supabase/client';
import { SmartCaptionConfig, SmartCaptionResult } from './useSmartCaption';

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

  const load = useCallback(async () => {
    if (loaded || loading) return;
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

  // Build drawtext filter for captions
  const buildCaptionFilter = (
    captions: SmartCaptionResult['captions'],
    rehook: SmartCaptionResult['rehook'] | null,
    config: SmartCaptionConfig
  ): string => {
    const filters: string[] = [];
    
    // Get font style based on config
    const fontWeight = config.captionStyle === 'bold' ? 'bold' : '';
    const fontSize = 48;
    const fontColor = config.primaryColor.replace('#', '');
    const highlightColor = config.secondaryColor.replace('#', '');
    
    // Add rehook at the beginning (0-1.5s)
    if (rehook && config.enableRehook) {
      const hookText = escapeFFmpegText(rehook.text.toUpperCase());
      filters.push(
        `drawtext=text='${hookText}':fontsize=56:fontcolor=0x${highlightColor}:borderw=3:bordercolor=black:x=(w-text_w)/2:y=h*0.15:enable='between(t,0,1.5)'`
      );
    }
    
    // Add each caption segment
    captions.forEach((caption, index) => {
      let text = caption.text;
      
      // Highlight keywords by making them uppercase (simple approach for FFmpeg)
      caption.keywords.forEach(keyword => {
        text = text.replace(new RegExp(`\\b${keyword}\\b`, 'gi'), keyword.toUpperCase());
      });
      
      const escapedText = escapeFFmpegText(text);
      const yPosition = 'h*0.82'; // Bottom area for subtitles
      
      filters.push(
        `drawtext=text='${escapedText}':fontsize=${fontSize}:fontcolor=0x${fontColor}:borderw=2:bordercolor=black:x=(w-text_w)/2:y=${yPosition}:enable='between(t,${caption.start.toFixed(2)},${caption.end.toFixed(2)})'`
      );
    });
    
    return filters.join(',');
  };

  // Escape text for FFmpeg drawtext filter
  const escapeFFmpegText = (text: string): string => {
    return text
      .replace(/\\/g, '\\\\')
      .replace(/'/g, "'\\''")
      .replace(/:/g, '\\:')
      .replace(/\[/g, '\\[')
      .replace(/\]/g, '\\]')
      .replace(/%/g, '\\%');
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

        // 2. Generate smart captions if enabled
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

        // 3. Build filter chain
        let filterChain = 'crop=ih*(9/16):ih:(iw-ih*(9/16))/2:0,scale=1080:1920';
        
        // Add caption overlay if we have captions
        if (captionResult && smartCaptionConfig) {
          const captionFilter = buildCaptionFilter(
            captionResult.captions,
            captionResult.rehook,
            smartCaptionConfig
          );
          if (captionFilter) {
            filterChain += ',' + captionFilter;
          }
        }

        // 4. Execute FFmpeg with captions
        const exitCode = await ffmpeg.exec([
          '-ss', startTime.toFixed(2),
          '-i', 'input.mp4',
          '-t', clipDuration.toFixed(2),
          '-vf', filterChain,
          '-map_metadata', '-1',
          '-c:v', 'libx264',
          '-pix_fmt', 'yuv420p',
          '-preset', 'ultrafast',
          '-crf', '23',
          '-c:a', 'aac',
          '-b:a', '128k',
          '-y',
          outputName
        ]);

        if (exitCode !== 0) {
          throw new Error(`FFmpeg falhou com código ${exitCode}`);
        }

        // 5. Read and create blob
        const data = await ffmpeg.readFile(outputName);
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
        await ffmpeg.deleteFile(outputName);
      }

      await ffmpeg.deleteFile('input.mp4');
      
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
