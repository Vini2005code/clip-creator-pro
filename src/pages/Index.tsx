import { useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Zap, Loader2, AlertTriangle } from 'lucide-react';
import { ViralCutterHeader } from '@/components/ViralCutterHeader';
import { UploadZone } from '@/components/UploadZone';
import { VideoPreviewEnhanced, VideoPreviewEnhancedRef } from '@/components/VideoPreviewEnhanced';
import { ViralConfigPanel } from '@/components/ViralConfigPanel';
import { ProcessingOverlay } from '@/components/ProcessingOverlay';
import { ViralClipsGrid } from '@/components/ViralClipsGrid';
import { AudioAnalyzerPanel } from '@/components/AudioAnalyzerPanel';
import { useFFmpegWorker, CutConfig } from '@/hooks/useFFmpegWorker';
import { useAudioAnalyzer } from '@/hooks/useAudioAnalyzer';
import { Button } from '@/components/ui/button';

const DEFAULT_CONFIG: CutConfig = {
  duration: 30,
  count: 3,
  speed: 1.05,
  zoomIntensity: 50,
  enableCaptions: true,
  captionStyle: 'hook',
  customCaption: '',
};

const Index = () => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [videoDuration, setVideoDuration] = useState(0);
  const [videoDimensions, setVideoDimensions] = useState({ width: 0, height: 0 });
  const [config, setConfig] = useState<CutConfig>(DEFAULT_CONFIG);
  const [error, setError] = useState<string | null>(null);
  const videoPreviewRef = useRef<VideoPreviewEnhancedRef>(null);

  const {
    load: loadFFmpeg,
    loaded: ffmpegLoaded,
    loading: ffmpegLoading,
    processing,
    progress,
    clips,
    processVideo,
    abort,
    reset,
  } = useFFmpegWorker();

  const audioAnalyzer = useAudioAnalyzer({
    minPeakDistance: config.duration * 0.8, // Avoid overlapping clips
    numPeaks: 10,
    clipDuration: config.duration,
  });

  const handleFileSelect = useCallback((file: File) => {
    console.log('[Index] File selected:', file.name, file.size);
    setSelectedFile(file);
    setVideoDuration(0); // Reset to force re-detection
    setVideoDimensions({ width: 0, height: 0 });
    setError(null);
    reset();
    audioAnalyzer.reset();
  }, [reset, audioAnalyzer]);

  const handleClearFile = useCallback(() => {
    setSelectedFile(null);
    setVideoDuration(0);
    setVideoDimensions({ width: 0, height: 0 });
    setError(null);
    reset();
    audioAnalyzer.reset();
  }, [reset, audioAnalyzer]);

  const handleDurationChange = useCallback((duration: number) => {
    console.log('[Index] Duration changed:', duration);
    setVideoDuration(duration);
    // Adjust count if needed
    const maxClips = Math.floor(duration / config.duration);
    if (config.count > maxClips && maxClips > 0) {
      setConfig(prev => ({ ...prev, count: Math.max(1, maxClips) }));
    }
  }, [config.duration, config.count]);

  const handleDimensionsChange = useCallback((width: number, height: number) => {
    console.log('[Index] Dimensions changed:', width, height);
    setVideoDimensions({ width, height });
  }, []);

  const handleConfigChange = useCallback((updates: Partial<CutConfig>) => {
    setConfig(prev => ({ ...prev, ...updates }));
  }, []);

  const handleAnalyzeAudio = useCallback(async () => {
    if (!selectedFile) return;
    await audioAnalyzer.analyzeAudio(selectedFile);
  }, [selectedFile, audioAnalyzer]);

  const handleApplySuggestions = useCallback((cuts: number[]) => {
    // Use the number of detected cuts
    setConfig(prev => ({ ...prev, count: cuts.length }));
  }, []);

  const handleProcess = async () => {
    if (!selectedFile) return;

    setError(null);

    try {
      if (!ffmpegLoaded) {
        await loadFFmpeg();
      }

      await processVideo(selectedFile, config, videoDuration);
    } catch (err) {
      console.error('Processing error:', err);
      setError('Erro ao processar o vídeo. Verifique o console para mais detalhes.');
    }
  };

  const canProcess = selectedFile && videoDuration > 0 && config.duration <= videoDuration && !processing;
  const showConfig = selectedFile && videoDuration > 0;

  return (
    <div className="min-h-screen bg-background">
      {/* Animated background */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <motion.div
          animate={{
            x: [0, 100, 0],
            y: [0, 50, 0],
          }}
          transition={{ duration: 20, repeat: Infinity, ease: 'linear' }}
          className="absolute top-0 left-1/4 w-[600px] h-[600px] bg-primary/8 rounded-full blur-3xl"
        />
        <motion.div
          animate={{
            x: [0, -100, 0],
            y: [0, -50, 0],
          }}
          transition={{ duration: 25, repeat: Infinity, ease: 'linear' }}
          className="absolute bottom-0 right-1/4 w-[500px] h-[500px] bg-accent/8 rounded-full blur-3xl"
        />
        <motion.div
          animate={{
            scale: [1, 1.2, 1],
          }}
          transition={{ duration: 15, repeat: Infinity, ease: 'easeInOut' }}
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-gradient-radial from-primary/5 to-transparent rounded-full"
        />
      </div>

      <div className="relative max-w-7xl mx-auto px-4 pb-20">
        <ViralCutterHeader />

        {/* Main content grid */}
        <div className="grid gap-8 lg:grid-cols-5">
          {/* Left column - Upload and Preview (3 cols) */}
          <div className="lg:col-span-3 space-y-6">
            <UploadZone
              onFileSelect={handleFileSelect}
              selectedFile={selectedFile}
              onClear={handleClearFile}
            />

            <AnimatePresence mode="wait">
              {selectedFile && (
                <motion.div
                  key="preview"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                >
                  <VideoPreviewEnhanced
                    ref={videoPreviewRef}
                    file={selectedFile}
                    onDurationChange={handleDurationChange}
                    onDimensionsChange={handleDimensionsChange}
                  />
                </motion.div>
              )}
            </AnimatePresence>

            {/* Processing overlay - show in left column when processing */}
            {(processing || progress.stage === 'complete' || progress.stage === 'error') && (
              <ProcessingOverlay
                progress={progress}
                isProcessing={processing}
                onAbort={abort}
                onRetryLoad={loadFFmpeg}
              />
            )}
          </div>

          {/* Right column - Configuration (2 cols) */}
          <div className="lg:col-span-2 space-y-6">
            <AnimatePresence mode="wait">
              {showConfig && (
                <>
                  {/* Audio Analyzer Panel */}
                  <AudioAnalyzerPanel
                    onAnalyze={handleAnalyzeAudio}
                    analyzing={audioAnalyzer.analyzing}
                    progress={audioAnalyzer.progress}
                    result={audioAnalyzer.result}
                    error={audioAnalyzer.error}
                    onApplySuggestions={handleApplySuggestions}
                    clipDuration={config.duration}
                  />

                  <ViralConfigPanel
                    key="config"
                    config={config}
                    maxDuration={videoDuration}
                    onConfigChange={handleConfigChange}
                  />

                  {/* Process button */}
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3 }}
                  >
                    <Button
                      onClick={handleProcess}
                      disabled={!canProcess || ffmpegLoading}
                      size="lg"
                      className="w-full gap-3 h-16 text-lg font-bold relative overflow-hidden group"
                    >
                      {/* Animated gradient background */}
                      <div className="absolute inset-0 bg-gradient-to-r from-primary via-accent to-primary bg-[length:200%_100%] group-hover:animate-shimmer opacity-0 group-hover:opacity-100 transition-opacity" />
                      
                      <span className="relative flex items-center gap-3">
                        {ffmpegLoading ? (
                          <>
                            <Loader2 className="w-6 h-6 animate-spin" />
                            Carregando Engine...
                          </>
                        ) : processing ? (
                          <>
                            <Loader2 className="w-6 h-6 animate-spin" />
                            Processando...
                          </>
                        ) : (
                          <>
                            <Zap className="w-6 h-6" />
                            Gerar {config.count} Corte{config.count > 1 ? 's' : ''} Virais
                          </>
                        )}
                      </span>
                    </Button>

                    {!ffmpegLoaded && !ffmpegLoading && (
                      <p className="text-center text-xs text-muted-foreground mt-2">
                        Primeira execução carrega o motor FFmpeg (~31MB)
                      </p>
                    )}
                  </motion.div>

                  {/* Error message */}
                  <AnimatePresence>
                    {error && (
                      <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className="p-4 rounded-xl bg-destructive/10 border border-destructive/20 flex items-center gap-3"
                      >
                        <AlertTriangle className="w-5 h-5 text-destructive shrink-0" />
                        <p className="text-sm text-destructive">{error}</p>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Clips grid - full width */}
        <div className="mt-12">
          <ViralClipsGrid clips={clips} />
        </div>
      </div>
    </div>
  );
};

export default Index;
