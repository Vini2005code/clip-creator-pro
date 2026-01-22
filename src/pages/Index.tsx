import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Wand2, AlertTriangle, Loader2 } from 'lucide-react';
import { Header } from '@/components/Header';
import { VideoDropzone } from '@/components/VideoDropzone';
import { VideoPreview } from '@/components/VideoPreview';
import { CutConfiguration } from '@/components/CutConfiguration';
import { ProcessingStatus } from '@/components/ProcessingStatus';
import { ClipsList } from '@/components/ClipsList';
import { useFFmpeg } from '@/hooks/useFFmpeg';
import { Button } from '@/components/ui/button';

const Index = () => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [videoDuration, setVideoDuration] = useState(0);
  const [cutDuration, setCutDuration] = useState(30);
  const [cutCount, setCutCount] = useState(3);
  const [error, setError] = useState<string | null>(null);

  const {
    load: loadFFmpeg,
    loaded: ffmpegLoaded,
    loading: ffmpegLoading,
    processing,
    progress,
    clips,
    processVideo,
    reset,
  } = useFFmpeg();

  const handleFileSelect = useCallback((file: File) => {
    setSelectedFile(file);
    setError(null);
    reset();
  }, [reset]);

  const handleClearFile = useCallback(() => {
    setSelectedFile(null);
    setVideoDuration(0);
    setError(null);
    reset();
  }, [reset]);

  const handleDurationChange = useCallback((duration: number) => {
    setVideoDuration(duration);
    // Adjust cut count if needed
    const maxClips = Math.floor(duration / cutDuration);
    if (cutCount > maxClips) {
      setCutCount(Math.max(1, maxClips));
    }
  }, [cutDuration, cutCount]);

  const handleProcess = async () => {
    if (!selectedFile) return;

    setError(null);

    try {
      if (!ffmpegLoaded) {
        await loadFFmpeg();
      }

      await processVideo(selectedFile, {
        duration: cutDuration,
        count: cutCount,
      }, videoDuration);
    } catch (err) {
      console.error('Processing error:', err);
      setError('Erro ao processar o vídeo. Tente novamente.');
    }
  };

  const canProcess = selectedFile && videoDuration > 0 && cutDuration <= videoDuration && !processing;

  return (
    <div className="min-h-screen bg-background">
      {/* Background effects */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-primary/10 rounded-full blur-3xl" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-accent/10 rounded-full blur-3xl" />
      </div>

      <div className="relative max-w-6xl mx-auto px-4 pb-16">
        <Header />

        <div className="grid gap-8 lg:grid-cols-2">
          {/* Left column - Upload and Preview */}
          <div className="space-y-6">
            <VideoDropzone
              onFileSelect={handleFileSelect}
              selectedFile={selectedFile}
              onClear={handleClearFile}
            />

            <AnimatePresence mode="wait">
              {selectedFile && (
                <VideoPreview
                  key="preview"
                  file={selectedFile}
                  onDurationChange={handleDurationChange}
                />
              )}
            </AnimatePresence>
          </div>

          {/* Right column - Configuration and Processing */}
          <div className="space-y-6">
            <AnimatePresence mode="wait">
              {selectedFile && videoDuration > 0 && (
                <>
                  <CutConfiguration
                    key="config"
                    duration={cutDuration}
                    count={cutCount}
                    maxDuration={videoDuration}
                    onDurationChange={setCutDuration}
                    onCountChange={setCutCount}
                  />

                  {/* Process button */}
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 }}
                  >
                    <Button
                      onClick={handleProcess}
                      disabled={!canProcess || ffmpegLoading}
                      size="lg"
                      className="w-full gap-3 h-14 text-lg font-semibold glow-primary disabled:opacity-50 disabled:glow-none"
                    >
                      {ffmpegLoading ? (
                        <>
                          <Loader2 className="w-5 h-5 animate-spin" />
                          Carregando FFmpeg...
                        </>
                      ) : processing ? (
                        <>
                          <Loader2 className="w-5 h-5 animate-spin" />
                          Processando...
                        </>
                      ) : (
                        <>
                          <Wand2 className="w-5 h-5" />
                          Gerar {cutCount} Corte{cutCount > 1 ? 's' : ''}
                        </>
                      )}
                    </Button>
                  </motion.div>

                  {/* Error message */}
                  <AnimatePresence>
                    {error && (
                      <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className="p-4 rounded-lg bg-destructive/10 border border-destructive/20 flex items-center gap-3"
                      >
                        <AlertTriangle className="w-5 h-5 text-destructive" />
                        <p className="text-sm text-destructive">{error}</p>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* Processing status */}
                  {(processing || progress.status === 'Concluído!') && (
                    <ProcessingStatus progress={progress} isProcessing={processing} />
                  )}
                </>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Clips list */}
        <div className="mt-12">
          <ClipsList clips={clips} />
        </div>
      </div>
    </div>
  );
};

export default Index;
