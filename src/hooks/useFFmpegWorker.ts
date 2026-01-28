import { useState, useRef, useCallback } from 'react';
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';

export interface CutConfig {
  duration: number;
  count: number;
  speed: number;
  zoomIntensity: number; // Mantido na interface mas desativado no motor para segurança
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

export type ProcessingStage = 'idle' | 'loading-ffmpeg' | 'reading-file' | 'analyzing' | 'applying-filters' | 'encoding' | 'finalizing' | 'complete' | 'error' | 'aborted';

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

  // Função para carregar o FFmpeg
  const load = useCallback(async () => {
    if (loaded || loading) return;
    setLoading(true);
    
    try {
      const ffmpeg = new FFmpeg();
      ffmpegRef.current = ffmpeg;

      // Logs para debug
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

  // Função Principal de Processamento
  const processVideo = useCallback(async (
    file: File,
    config: CutConfig,
    videoDuration: number
  ): Promise<ProcessedClip[]> => {
    if (!ffmpegRef.current) await load();
    const ffmpeg = ffmpegRef.current!;
    
    abortRef.current = false;
    setProcessing(true);
    setClips([]);
    
    const processedClips: ProcessedClip[] = [];
    const count = config.count;
    // Cálculo simples do intervalo entre cortes
    const interval = (videoDuration - config.duration) / (count > 1 ? count - 1 : 1);

    try {
      // 1. Escrever arquivo na memória
      setProgress(p => ({ ...p, stage: 'reading-file', stageMessage: 'Lendo arquivo...' }));
      const inputData = await fetchFile(file);
      await ffmpeg.writeFile('input.mp4', inputData);

      for (let i = 0; i < count; i++) {
        if (abortRef.current) break;

        const startTime = i * interval;
        const outputName = `clip_${i + 1}.mp4`;

        setProgress(p => ({
          ...p,
          currentClip: i + 1,
          totalClips: count,
          stage: 'encoding',
          stageMessage: `Processando corte ${i + 1}/${count}...`
        }));

        // COMANDO DIAGNÓSTICO: Apenas crop + scale (sem filtros pesados)
        // - ss/t: corte preciso
        // - crop: transforma em 9:16 (vertical)
        // - scale: garante 1080x1920
        // - map_metadata -1: remove todos os metadados
        // - pix_fmt yuv420p: OBRIGATÓRIO para compatibilidade
        const exitCode = await ffmpeg.exec([
          '-ss', startTime.toFixed(2),
          '-i', 'input.mp4',
          '-t', config.duration.toString(),
          '-vf', 'crop=ih*(9/16):ih:(iw-ih*(9/16))/2:0,scale=1080:1920',
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

        // 2. Leitura Segura do Arquivo (Evita 0 bytes)
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
          endTime: startTime + config.duration,
          caption: ''
        };

        processedClips.push(clip);
        setClips(prev => [...prev, clip]);
        
        // Limpa memória imediatamente
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
