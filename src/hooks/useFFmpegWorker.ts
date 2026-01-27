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
  | 'applying-filters'
  | 'adding-captions'
  | 'encoding'
  | 'finalizing'
  | 'complete'
  | 'error';

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

  const updateProgress = useCallback((updates: Partial<ProcessingProgress>) => {
    setProgress(prev => ({ ...prev, ...updates }));
  }, []);

  const getStageMessage = (stage: ProcessingStage, clipNum?: number, total?: number): string => {
    const messages: Record<ProcessingStage, string> = {
      'idle': 'Pronto para processar',
      'loading-ffmpeg': 'Carregando motor de vídeo...',
      'reading-file': 'Lendo arquivo de vídeo...',
      'analyzing': 'Analisando conteúdo...',
      'applying-filters': `Aplicando filtros virais (${clipNum}/${total})...`,
      'adding-captions': 'Adicionando legendas...',
      'encoding': `Codificando corte ${clipNum}/${total}...`,
      'finalizing': 'Finalizando exportação...',
      'complete': 'Processamento concluído!',
      'error': 'Erro no processamento',
    };
    return messages[stage];
  };

  const load = useCallback(async () => {
    if (loaded || loading) return;
    
    setLoading(true);
    updateProgress({ stage: 'loading-ffmpeg', stageMessage: getStageMessage('loading-ffmpeg') });
    console.log('[FFmpeg Worker] Iniciando carregamento...');
    
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
      updateProgress({ stage: 'idle', stageMessage: getStageMessage('idle') });
      console.log('[FFmpeg Worker] Carregado com sucesso!');
    } catch (error) {
      console.error('[FFmpeg Worker] Erro ao carregar:', error);
      updateProgress({ stage: 'error', stageMessage: 'Falha ao carregar FFmpeg' });
      throw error;
    } finally {
      setLoading(false);
    }
  }, [loaded, loading, updateProgress]);

  const generateRandomColorGrade = () => {
    const brightness = (Math.random() * 0.04 - 0.02).toFixed(3);
    const contrast = (1 + Math.random() * 0.06 - 0.03).toFixed(3);
    const saturation = (1 + Math.random() * 0.1 - 0.05).toFixed(3);
    const gamma = (1 + Math.random() * 0.04 - 0.02).toFixed(3);
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
    inputHeight: number
  ): string => {
    const colorGrade = generateRandomColorGrade();
    const caption = getCaption(config, clipIndex);
    
    const targetRatio = 9 / 16;
    const inputRatio = inputWidth / inputHeight;
    
    let cropW: number, cropH: number;
    if (inputRatio > targetRatio) {
      cropH = inputHeight;
      cropW = Math.floor(inputHeight * targetRatio);
    } else {
      cropW = inputWidth;
      cropH = Math.floor(inputWidth / targetRatio);
    }

    const filters: string[] = [];

    // 1. Ajuste de Velocidade
    if (config.speed !== 1.0) {
      filters.push(`setpts=${(1/config.speed).toFixed(4)}*PTS`);
    }

    // 2. Crop 9:16 (Smart Crop)
    // Removemos o zoompan complexo para evitar estouro de memória
    filters.push(`crop=${cropW}:${cropH}:(in_w-${cropW})/2:(in_h-${cropH})/2`);

    // 3. Escala para 1080x1920 (Padrão Viral)
    filters.push(`scale=1080:1920:flags=lanczos`);

    // 4. Color Grading (Anti-Shadowban simples)
    filters.push(
      `eq=brightness=${colorGrade.brightness}:contrast=${colorGrade.contrast}:` +
      `saturation=${colorGrade.saturation}:gamma=${colorGrade.gamma}`
    );

    // 5. Ruído (Noise) - SEM SEED para evitar crash
    filters.push(`noise=c0s=2:allf=t`);

    // 6. Legendas - SEM FONTFILE para evitar crash
    if (caption) {
      const escapedCaption = caption.replace(/'/g, "'\\''").replace(/:/g, '\\:');
      filters.push(
        `drawtext=text='${escapedCaption}':` +
        `fontsize=64:fontcolor=white:` +
        `borderw=4:bordercolor=black:` +
        `x=(w-text_w)/2:y=h*0.85`
      );
    }

    return filters.join(',');
  };

  const processVideo = useCallback(async (
    file: File,
    config: CutConfig,
    videoDuration: number
  ): Promise<ProcessedClip[]> => {
    if (!ffmpegRef.current || !loaded) {
      throw new Error('FFmpeg não carregado');
    }

    const ffmpeg = ffmpegRef.current;
    abortRef.current = false;
    setProcessing(true);
    setClips([]);
    
    const processedClips: ProcessedClip[] = [];
    const { duration: clipDuration, count } = config;

    // Calcular duração efetiva
    const effectiveClipDuration = clipDuration / config.speed;
    const availableTime = videoDuration - effectiveClipDuration;
    const interval = count > 1 ? availableTime / (count - 1) : 0;

    console.log('[FFmpeg Worker] Configuração:', {
      videoDuration,
      clipDuration,
      effectiveClipDuration,
      count,
      speed: config.speed,
    });

    try {
      updateProgress({
        currentClip: 0,
        totalClips: count,
        clipProgress: 0,
        stage: 'reading-file',
        stageMessage: getStageMessage('reading-file'),
      });

      const inputData = await fetchFile(file);
      await ffmpeg.writeFile('input.mp4', inputData);
      console.log('[FFmpeg Worker] Arquivo de entrada escrito');

      // Dimensões padrão caso probe falhe (evita await extra)
      let inputWidth = 1920;
      let inputHeight = 1080;

      for (let i = 0; i < count; i++) {
        if (abortRef.current) break;

        const startTime = count === 1 ? 0 : Math.floor(i * interval);
        const caption = getCaption(config, i);

        updateProgress({
          currentClip: i + 1,
          totalClips: count,
          clipProgress: 0,
          stage: 'applying-filters',
          stageMessage: getStageMessage('applying-filters', i + 1, count),
        });

        const outputName = `viral_clip_${i + 1}.mp4`;
        const filterChain = buildFilterChain(config, i, inputWidth, inputHeight);

        const ffmpegArgs = [
          '-ss', startTime.toString(),
          '-i', 'input.mp4',
          '-t', effectiveClipDuration.toFixed(2),
          '-map_metadata', '-1',
          '-vf', filterChain,
        ];

        if (config.speed !== 1.0) {
          ffmpegArgs.push('-af', `atempo=${config.speed.toFixed(2)}`);
        }

        ffmpegArgs.push(
          '-c:v', 'libx264',
          '-pix_fmt', 'yuv420p', // CRÍTICO: Garante que o vídeo toque em qualquer lugar
          '-preset', 'ultrafast', // CRÍTICO: Evita uso excessivo de memória
          '-crf', '26',
          '-c:a', 'aac',
          '-b:a', '128k',
          '-movflags', '+faststart',
          '-y',
          outputName
        );

        updateProgress({
          stage: 'encoding',
          stageMessage: getStageMessage('encoding', i + 1, count),
        });

        await ffmpeg.exec(ffmpegArgs);

        updateProgress({
          stage: 'finalizing',
          stageMessage: getStageMessage('finalizing'),
        });

        // Leitura segura do Blob para evitar corrupção
        const data = await ffmpeg.readFile(outputName);
        const videoData = new Uint8Array(data as ArrayBuffer);
        const blob = new Blob([videoData.buffer], { type: 'video/mp4' });
        const url = URL.createObjectURL(blob);

        const clip: ProcessedClip = {
          id: `viral-clip-${i + 1}-${Date.now()}`,
          name: `viral_${i + 1}_${clipDuration}s.mp4`,
          blob,
          url,
          startTime,
          endTime: startTime + clipDuration,
          caption,
        };

        processedClips.push(clip);
        setClips(prev => [...prev, clip]);

        await ffmpeg.deleteFile(outputName);
        console.log(`[FFmpeg Worker] Corte ${i + 1} concluído`);
      }

      await ffmpeg.deleteFile('input.mp4');

      updateProgress({
        currentClip: count,
        totalClips: count,
        clipProgress: 100,
        stage: 'complete',
        stageMessage: getStageMessage('complete'),
      });

      return processedClips;
    } catch (error) {
      console.error('[FFmpeg Worker] Erro no processamento:', error);
      updateProgress({
        stage: 'error',
        stageMessage: `Erro: ${error instanceof Error ? error.message : 'Falha no processamento'}`,
      });
      throw error;
    } finally {
      setProcessing(false);
    }
  }, [loaded, updateProgress]);

  const abort = useCallback(() => {
    abortRef.current = true;
  }, []);

  const reset = useCallback(() => {
    clips.forEach(clip => URL.revokeObjectURL(clip.url));
    setClips([]);
    setProgress({
      currentClip: 0,
      totalClips: 0,
      clipProgress: 0,
      stage: 'idle',
      stageMessage: getStageMessage('idle'),
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
    abort,
    reset,
  };
}
