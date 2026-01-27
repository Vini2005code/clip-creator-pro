import { useState, useRef, useCallback } from 'react';
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';

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

export type ProcessingStage = 
  | 'idle'
  | 'loading-ffmpeg'
  | 'reading-file'
  | 'analyzing'
  | 'cleaning-metadata'
  | 'applying-crop'
  | 'applying-zoom'
  | 'applying-filters'
  | 'generating-hash'
  | 'adding-captions'
  | 'encoding'
  | 'finalizing'
  | 'complete'
  | 'error'
  | 'aborted';

export interface ProcessingProgress {
  currentClip: number;
  totalClips: number;
  clipProgress: number;
  stage: ProcessingStage;
  stageMessage: string;
}

const HOOK_CAPTIONS = [
  "Wait for it... 👀",
  "You won't believe this 🔥",
  "This changed everything",
  "POV: When you...",
  "Watch until the end",
  "This is insane 😱",
  "No one talks about this",
];

const STAGE_MESSAGES: Record<ProcessingStage, string> = {
  'idle': 'Pronto para processar',
  'loading-ffmpeg': 'Carregando motor FFmpeg...',
  'reading-file': 'Lendo arquivo de vídeo...',
  'analyzing': 'Analisando dimensões...',
  'cleaning-metadata': 'Limpando metadados...',
  'applying-crop': 'Aplicando Smart Crop 9:16...',
  'applying-zoom': 'Aplicando Zoom Dinâmico...',
  'applying-filters': 'Aplicando filtros de cor...',
  'generating-hash': 'Gerando hash único (grain)...',
  'adding-captions': 'Adicionando legendas...',
  'encoding': 'Codificando vídeo...',
  'finalizing': 'Finalizando exportação...',
  'complete': 'Processamento concluído!',
  'error': 'Erro no processamento',
  'aborted': 'Processamento cancelado',
};

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
    stageMessage: STAGE_MESSAGES['idle'],
  });
  const [clips, setClips] = useState<ProcessedClip[]>([]);
  const abortControllerRef = useRef<AbortController | null>(null);
  const isAbortedRef = useRef(false);

  const updateProgress = useCallback((updates: Partial<ProcessingProgress>) => {
    setProgress(prev => {
      const newProgress = { ...prev, ...updates };
      if (updates.stage && !updates.stageMessage) {
        newProgress.stageMessage = STAGE_MESSAGES[updates.stage] || updates.stage;
      }
      return newProgress;
    });
  }, []);

  const load = useCallback(async () => {
    // Check ref directly to avoid stale closure
    if (ffmpegRef.current || loading) return;
    
    setLoading(true);
    updateProgress({ stage: 'loading-ffmpeg' });
    console.log('[FFmpeg] Iniciando carregamento...');
    
    try {
      const ffmpeg = new FFmpeg();
      ffmpegRef.current = ffmpeg;

      ffmpeg.on('log', ({ message }) => {
        console.log('[FFmpeg]', message);
      });

      ffmpeg.on('progress', ({ progress: p }) => {
        const percentage = Math.min(100, Math.max(0, Math.round(p * 100)));
        updateProgress({ clipProgress: percentage });
      });

      const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm';
      
      await ffmpeg.load({
        coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
        wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
      });

      setLoaded(true);
      updateProgress({ stage: 'idle' });
      console.log('[FFmpeg] Carregado com sucesso!');
    } catch (error) {
      console.error('[FFmpeg] Erro ao carregar:', error);
      updateProgress({ stage: 'error', stageMessage: 'Falha ao carregar FFmpeg' });
      throw error;
    } finally {
      setLoading(false);
    }
  }, [loaded, loading, updateProgress]);

  const generateRandomColorGrade = () => {
    // Random subtle variations for unique hash per clip
    const brightness = (Math.random() * 0.04 - 0.02).toFixed(4); // -0.02 to +0.02
    const contrast = (1 + Math.random() * 0.06 - 0.03).toFixed(4); // 0.97 to 1.03
    const saturation = (1 + Math.random() * 0.1 - 0.05).toFixed(4); // 0.95 to 1.05
    const gamma = (1 + Math.random() * 0.04 - 0.02).toFixed(4); // 0.98 to 1.02
    return { brightness, contrast, saturation, gamma };
  };

  const getCaption = (config: CutConfig, clipIndex: number): string => {
    if (!config.enableCaptions) return '';
    
    switch (config.captionStyle) {
      case 'hook':
        return HOOK_CAPTIONS[clipIndex % HOOK_CAPTIONS.length];
      case 'parts':
        return `Part ${clipIndex + 1} 🔥`;
      case 'custom':
        return config.customCaption || `Clip ${clipIndex + 1}`;
      default:
        return '';
    }
  };

  const buildFilterChain = (
    config: CutConfig,
    clipIndex: number,
    inputWidth: number,
    inputHeight: number,
    onStageChange: (stage: ProcessingStage) => void
  ): string => {
    const colorGrade = generateRandomColorGrade();
    const caption = getCaption(config, clipIndex);
    
    // Calculate perfect center crop for 9:16
    const targetRatio = 9 / 16;
    const inputRatio = inputWidth / inputHeight;
    
    let cropW: number, cropH: number;
    if (inputRatio > targetRatio) {
      // Input is wider - crop width
      cropH = inputHeight;
      cropW = Math.floor(inputHeight * targetRatio);
    } else {
      // Input is taller - crop height
      cropW = inputWidth;
      cropH = Math.floor(inputWidth / targetRatio);
    }

    // Ensure even dimensions for h264
    cropW = cropW - (cropW % 2);
    cropH = cropH - (cropH % 2);

    const filters: string[] = [];

    // 1. Speed adjustment first (setpts for video)
    if (config.speed !== 1.0) {
      filters.push(`setpts=${(1/config.speed).toFixed(4)}*PTS`);
    }

    // 2. Smart Crop - perfectly centered for 9:16
    onStageChange('applying-crop');
    filters.push(`crop=${cropW}:${cropH}:(in_w-${cropW})/2:(in_h-${cropH})/2`);

    // 3. Scale to final 1080x1920 (TikTok/Reels optimal)
    filters.push(`scale=1080:1920:flags=lanczos`);

    // 4. Ken Burns Effect (zoom + subtle pan) - optimized to prevent stuttering
    if (config.zoomIntensity > 0) {
      onStageChange('applying-zoom');
      const zoomAmount = (config.zoomIntensity / 100) * 0.12; // Max 12% zoom
      const fps = 30;
      const totalFrames = config.duration * fps;
      
      // Smooth easing with sine interpolation to prevent stuttering
      filters.push(
        `zoompan=z='1+${zoomAmount.toFixed(4)}*sin(on/${totalFrames}*PI*0.5)':` +
        `x='iw/2-(iw/zoom/2)':` +
        `y='ih/2-(ih/zoom/2)':` +
        `d=1:s=1080x1920:fps=${fps}`
      );
    }

    // 5. Random color grading for unique hash
    onStageChange('applying-filters');
    filters.push(
      `eq=brightness=${colorGrade.brightness}:contrast=${colorGrade.contrast}:` +
      `saturation=${colorGrade.saturation}:gamma=${colorGrade.gamma}`
    );

    // 6. Digital grain (noise) for hash uniqueness - invisible but effective
    // Note: 'seed' parameter is not supported in FFmpeg WASM, using compatible syntax
    onStageChange('generating-hash');
    filters.push(`noise=alls=3:allf=t+u`);

    // 7. Caption overlay (if enabled)
    if (caption) {
      onStageChange('adding-captions');
      // Escape special FFmpeg characters
      const escapedCaption = caption
        .replace(/\\/g, '\\\\')
        .replace(/'/g, "'\\''")
        .replace(/:/g, '\\:')
        .replace(/\[/g, '\\[')
        .replace(/\]/g, '\\]');
      
      filters.push(
        `drawtext=text='${escapedCaption}':` +
        `fontsize=56:fontcolor=white:` +
        `borderw=4:bordercolor=black:` +
        `x=(w-text_w)/2:y=h*0.82`
      );
    }

    return filters.join(',');
  };

  const cleanupFile = async (ffmpeg: FFmpeg, filename: string) => {
    try {
      await ffmpeg.deleteFile(filename);
      console.log(`[FFmpeg] Arquivo ${filename} removido da memória`);
    } catch (e) {
      console.warn(`[FFmpeg] Falha ao remover ${filename}:`, e);
    }
  };

  const processVideo = useCallback(async (
    file: File,
    config: CutConfig,
    videoDuration: number
  ): Promise<ProcessedClip[]> => {
    // Check directly on the ref instead of stale state
    if (!ffmpegRef.current) {
      console.log('[FFmpeg] FFmpeg não está carregado, tentando carregar automaticamente...');
      await load();
      
      // Re-check after load attempt
      if (!ffmpegRef.current) {
        throw new Error('FFmpeg não carregado');
      }
    }

    const ffmpeg = ffmpegRef.current;
    
    // Setup abort controller
    abortControllerRef.current = new AbortController();
    isAbortedRef.current = false;
    
    setProcessing(true);
    setClips([]);
    
    const processedClips: ProcessedClip[] = [];
    const { duration: clipDuration, count } = config;

    // Calculate effective duration accounting for speed
    const effectiveClipDuration = clipDuration / config.speed;
    const availableTime = videoDuration - effectiveClipDuration;
    const interval = count > 1 ? availableTime / (count - 1) : 0;

    console.log('[FFmpeg] Configuração:', {
      videoDuration,
      clipDuration,
      effectiveClipDuration,
      count,
      speed: config.speed,
      zoomIntensity: config.zoomIntensity,
    });

    try {
      // Read input file
      updateProgress({
        currentClip: 0,
        totalClips: count,
        clipProgress: 0,
        stage: 'reading-file',
      });

      const inputData = await fetchFile(file);
      await ffmpeg.writeFile('input.mp4', inputData);
      console.log('[FFmpeg] Arquivo de entrada escrito');

      // Analyze video - get actual dimensions from video element
      updateProgress({ stage: 'analyzing' });
      
      // Create a temporary video element to get dimensions
      const videoEl = document.createElement('video');
      videoEl.preload = 'metadata';
      
      const dimensionsPromise = new Promise<{ width: number; height: number }>((resolve) => {
        videoEl.onloadedmetadata = () => {
          resolve({ width: videoEl.videoWidth, height: videoEl.videoHeight });
          URL.revokeObjectURL(videoEl.src);
        };
        videoEl.onerror = () => {
          resolve({ width: 1920, height: 1080 }); // Fallback
          URL.revokeObjectURL(videoEl.src);
        };
        videoEl.src = URL.createObjectURL(file);
      });
      
      const { width: inputWidth, height: inputHeight } = await dimensionsPromise;
      console.log(`[FFmpeg] Dimensões do vídeo: ${inputWidth}x${inputHeight}`);

      // Process each clip
      for (let i = 0; i < count; i++) {
        // Check for abort
        if (isAbortedRef.current) {
          console.log('[FFmpeg] Processamento abortado pelo usuário');
          updateProgress({ stage: 'aborted', stageMessage: 'Cancelado pelo usuário' });
          break;
        }

        const startTime = count === 1 ? 0 : Math.floor(i * interval);
        const caption = getCaption(config, i);

        updateProgress({
          currentClip: i + 1,
          totalClips: count,
          clipProgress: 0,
          stage: 'cleaning-metadata',
          stageMessage: `Corte ${i + 1}/${count}: ${STAGE_MESSAGES['cleaning-metadata']}`,
        });

        console.log(`[FFmpeg] Processando corte ${i + 1}: ${startTime}s - ${startTime + effectiveClipDuration}s`);

        const outputName = `viral_clip_${i + 1}.mp4`;
        
        // Build filter chain with stage callbacks
        const filterChain = buildFilterChain(
          config, 
          i, 
          inputWidth, 
          inputHeight,
          (stage) => updateProgress({ 
            stage, 
            stageMessage: `Corte ${i + 1}/${count}: ${STAGE_MESSAGES[stage]}` 
          })
        );

        // Build FFmpeg command with optimized settings
        const ffmpegArgs = [
          '-ss', startTime.toString(),
          '-i', 'input.mp4',
          '-t', effectiveClipDuration.toFixed(2),
          '-map_metadata', '-1', // Remove ALL metadata for anti-detection
          '-fflags', '+bitexact', // Ensure no timestamps leak
          '-flags:v', '+bitexact',
          '-flags:a', '+bitexact',
          '-vf', filterChain,
        ];

        // Audio speed adjustment with tempo
        if (config.speed !== 1.0) {
          // atempo only supports 0.5-2.0, chain if needed
          const tempo = config.speed;
          if (tempo >= 0.5 && tempo <= 2.0) {
            ffmpegArgs.push('-af', `atempo=${tempo.toFixed(2)}`);
          }
        }

        ffmpegArgs.push(
          '-c:v', 'libx264',
          '-pix_fmt', 'yuv420p', // Required for web player compatibility
          '-preset', 'fast',
          '-crf', '22',
          '-profile:v', 'high',
          '-level', '4.1',
          '-c:a', 'aac',
          '-b:a', '128k',
          '-ar', '44100',
          '-movflags', '+faststart',
          '-y',
          outputName
        );

        updateProgress({
          stage: 'encoding',
          stageMessage: `Corte ${i + 1}/${count}: ${STAGE_MESSAGES['encoding']}`,
        });

        // Execute FFmpeg
        const exitCode = await ffmpeg.exec(ffmpegArgs);
        
        if (exitCode !== 0) {
          console.error(`[FFmpeg] Comando falhou com código ${exitCode}`);
          throw new Error(`FFmpeg retornou código de erro ${exitCode}`);
        }

        // Check abort again after encoding
        if (isAbortedRef.current) {
          await cleanupFile(ffmpeg, outputName);
          break;
        }

        // Read output and immediately cleanup
        updateProgress({
          stage: 'finalizing',
          stageMessage: `Corte ${i + 1}/${count}: ${STAGE_MESSAGES['finalizing']}`,
        });

        const data = await ffmpeg.readFile(outputName);
        
        // CRITICAL: Immediately delete from virtual FS to prevent RAM overflow
        await cleanupFile(ffmpeg, outputName);
        
        // Convert to Blob - handle SharedArrayBuffer from FFmpeg WASM
        // FFmpeg readFile returns Uint8Array backed by SharedArrayBuffer
        // We need to copy to a regular ArrayBuffer for Blob compatibility
        const rawData = data as Uint8Array;
        const arrayBuffer = new ArrayBuffer(rawData.byteLength);
        new Uint8Array(arrayBuffer).set(rawData);
        const blob = new Blob([arrayBuffer], { type: 'video/mp4' });
        const url = URL.createObjectURL(blob);
        
        console.log(`[FFmpeg] Clip ${i + 1} gerado: ${(blob.size / 1024 / 1024).toFixed(2)} MB`);

        const clip: ProcessedClip = {
          id: `viral-clip-${i + 1}-${Date.now()}`,
          name: `viral_${i + 1}_${clipDuration}s_${config.speed}x.mp4`,
          blob,
          url,
          startTime,
          endTime: startTime + clipDuration,
          caption,
        };

        processedClips.push(clip);
        setClips(prev => [...prev, clip]);

        console.log(`[FFmpeg] Corte ${i + 1} concluído e memória limpa`);
      }

      // Cleanup input file
      await cleanupFile(ffmpeg, 'input.mp4');

      if (!isAbortedRef.current) {
        updateProgress({
          currentClip: count,
          totalClips: count,
          clipProgress: 100,
          stage: 'complete',
        });
        console.log('[FFmpeg] Todos os cortes processados:', processedClips.length);
      }

      return processedClips;
    } catch (error) {
      console.error('[FFmpeg] Erro no processamento:', error);
      
      // Cleanup on error
      try {
        await cleanupFile(ffmpeg, 'input.mp4');
      } catch {}
      
      updateProgress({
        stage: 'error',
        stageMessage: `Erro: ${error instanceof Error ? error.message : 'Falha no processamento'}`,
      });
      throw error;
    } finally {
      setProcessing(false);
      abortControllerRef.current = null;
    }
  }, [load, updateProgress]);

  const abort = useCallback(async () => {
    console.log('[FFmpeg] Iniciando abort...');
    isAbortedRef.current = true;
    
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    
    // Try to terminate FFmpeg if possible
    if (ffmpegRef.current) {
      try {
        // FFmpeg.wasm doesn't have a direct abort, but we can try to terminate
        await ffmpegRef.current.terminate();
        ffmpegRef.current = null;
        setLoaded(false);
      } catch (e) {
        console.warn('[FFmpeg] Erro ao terminar:', e);
      }
    }
    
    setProcessing(false);
    updateProgress({ 
      stage: 'aborted', 
      stageMessage: 'Processamento cancelado pelo usuário' 
    });
  }, [updateProgress]);

  const reset = useCallback(() => {
    // Revoke all blob URLs to free memory
    clips.forEach(clip => {
      try {
        URL.revokeObjectURL(clip.url);
      } catch {}
    });
    setClips([]);
    setProgress({
      currentClip: 0,
      totalClips: 0,
      clipProgress: 0,
      stage: 'idle',
      stageMessage: STAGE_MESSAGES['idle'],
    });
    isAbortedRef.current = false;
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
    reset,
  };
}
