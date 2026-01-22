import { useState, useRef, useCallback } from 'react';
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';

export interface CutConfig {
  duration: number;
  count: number;
}

export interface ProcessedClip {
  id: string;
  name: string;
  blob: Blob;
  url: string;
  startTime: number;
  endTime: number;
}

export interface ProcessingProgress {
  currentClip: number;
  totalClips: number;
  clipProgress: number;
  status: string;
}

export function useFFmpeg() {
  const ffmpegRef = useRef<FFmpeg | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState<ProcessingProgress>({
    currentClip: 0,
    totalClips: 0,
    clipProgress: 0,
    status: 'idle',
  });
  const [clips, setClips] = useState<ProcessedClip[]>([]);

  const load = useCallback(async () => {
    if (loaded || loading) return;
    
    setLoading(true);
    console.log('[FFmpeg] Starting load...');
    
    try {
      const ffmpeg = new FFmpeg();
      ffmpegRef.current = ffmpeg;

      ffmpeg.on('log', ({ message }) => {
        console.log('[FFmpeg Log]', message);
      });

      ffmpeg.on('progress', ({ progress: p }) => {
        console.log('[FFmpeg Progress]', Math.round(p * 100) + '%');
        setProgress(prev => ({
          ...prev,
          clipProgress: Math.round(p * 100),
        }));
      });

      const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm';
      
      await ffmpeg.load({
        coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
        wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
      });

      setLoaded(true);
      console.log('[FFmpeg] Loaded successfully!');
    } catch (error) {
      console.error('[FFmpeg] Failed to load:', error);
      throw error;
    } finally {
      setLoading(false);
    }
  }, [loaded, loading]);

  const processVideo = useCallback(async (
    file: File,
    config: CutConfig,
    videoDuration: number
  ): Promise<ProcessedClip[]> => {
    if (!ffmpegRef.current || !loaded) {
      throw new Error('FFmpeg not loaded');
    }

    const ffmpeg = ffmpegRef.current;
    setProcessing(true);
    setClips([]);
    
    const processedClips: ProcessedClip[] = [];
    const { duration: clipDuration, count } = config;

    // Calculate start times evenly distributed across video
    const totalClipTime = clipDuration * count;
    const availableTime = videoDuration - clipDuration;
    const interval = count > 1 ? availableTime / (count - 1) : 0;

    console.log('[FFmpeg] Processing config:', {
      videoDuration,
      clipDuration,
      count,
      interval,
    });

    try {
      // Write input file
      setProgress({
        currentClip: 0,
        totalClips: count,
        clipProgress: 0,
        status: 'Carregando vídeo...',
      });

      const inputData = await fetchFile(file);
      await ffmpeg.writeFile('input.mp4', inputData);
      console.log('[FFmpeg] Input file written');

      for (let i = 0; i < count; i++) {
        const startTime = count === 1 ? 0 : Math.floor(i * interval);
        const endTime = startTime + clipDuration;

        setProgress({
          currentClip: i + 1,
          totalClips: count,
          clipProgress: 0,
          status: `Processando corte ${i + 1}/${count}...`,
        });

        console.log(`[FFmpeg] Processing clip ${i + 1}: ${startTime}s - ${endTime}s`);

        const outputName = `clip_${i + 1}.mp4`;

        // FFmpeg command with anti-duplication filters
        await ffmpeg.exec([
          '-ss', startTime.toString(),
          '-i', 'input.mp4',
          '-t', clipDuration.toString(),
          '-map_metadata', '-1', // Remove all metadata
          '-vf', 'scale=iw*1.01:-1,crop=iw/1.01:ih/1.01,eq=brightness=0.01:contrast=1.01',
          '-c:v', 'libx264',
          '-preset', 'fast',
          '-crf', '23',
          '-c:a', 'aac',
          '-b:a', '128k',
          '-movflags', '+faststart',
          '-y',
          outputName,
        ]);

        // Read output file
        const data = await ffmpeg.readFile(outputName);
        const uint8Array = data instanceof Uint8Array ? data : new TextEncoder().encode(data as string);
        const blob = new Blob([new Uint8Array(uint8Array)], { type: 'video/mp4' });
        const url = URL.createObjectURL(blob);

        const clip: ProcessedClip = {
          id: `clip-${i + 1}-${Date.now()}`,
          name: `corte_${i + 1}_${clipDuration}s.mp4`,
          blob,
          url,
          startTime,
          endTime,
        };

        processedClips.push(clip);
        setClips(prev => [...prev, clip]);

        // Clean up output file
        await ffmpeg.deleteFile(outputName);

        console.log(`[FFmpeg] Clip ${i + 1} completed`);
      }

      // Clean up input file
      await ffmpeg.deleteFile('input.mp4');

      setProgress({
        currentClip: count,
        totalClips: count,
        clipProgress: 100,
        status: 'Concluído!',
      });

      console.log('[FFmpeg] All clips processed:', processedClips.length);
      return processedClips;
    } catch (error) {
      console.error('[FFmpeg] Processing error:', error);
      throw error;
    } finally {
      setProcessing(false);
    }
  }, [loaded]);

  const reset = useCallback(() => {
    clips.forEach(clip => URL.revokeObjectURL(clip.url));
    setClips([]);
    setProgress({
      currentClip: 0,
      totalClips: 0,
      clipProgress: 0,
      status: 'idle',
    });
  }, [clips]);

  return {
    load,
    loaded,
    loading,
    processing,
    progress,
    clips,
    processVideo,
    reset,
  };
}
