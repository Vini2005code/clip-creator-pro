import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Download, Play, Pause, Package, CheckCircle2 } from 'lucide-react';
import JSZip from 'jszip';
import { ProcessedClip } from '@/hooks/useFFmpeg';
import { Button } from '@/components/ui/button';

interface ClipsListProps {
  clips: ProcessedClip[];
}

export function ClipsList({ clips }: ClipsListProps) {
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [downloadingZip, setDownloadingZip] = useState(false);

  const handleDownload = (clip: ProcessedClip) => {
    const a = document.createElement('a');
    a.href = clip.url;
    a.download = clip.name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleDownloadAll = async () => {
    setDownloadingZip(true);
    try {
      const zip = new JSZip();
      
      for (const clip of clips) {
        const arrayBuffer = await clip.blob.arrayBuffer();
        zip.file(clip.name, arrayBuffer);
      }
      
      const content = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(content);
      const a = document.createElement('a');
      a.href = url;
      a.download = `cortes_${new Date().toISOString().split('T')[0]}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } finally {
      setDownloadingZip(false);
    }
  };

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const togglePlay = (clipId: string, videoElement: HTMLVideoElement) => {
    if (playingId === clipId) {
      videoElement.pause();
      setPlayingId(null);
    } else {
      // Pause any other playing videos
      document.querySelectorAll('video').forEach((v) => v.pause());
      videoElement.play();
      setPlayingId(clipId);
    }
  };

  if (clips.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-4"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-success/20">
            <CheckCircle2 className="w-5 h-5 text-success" />
          </div>
          <h3 className="text-lg font-semibold text-foreground">
            {clips.length} Corte{clips.length > 1 ? 's' : ''} Pronto{clips.length > 1 ? 's' : ''}
          </h3>
        </div>
        
        {clips.length > 1 && (
          <Button
            onClick={handleDownloadAll}
            disabled={downloadingZip}
            variant="secondary"
            className="gap-2"
          >
            <Package className="w-4 h-4" />
            {downloadingZip ? 'Criando ZIP...' : 'Baixar Todos (.zip)'}
          </Button>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <AnimatePresence>
          {clips.map((clip, index) => (
            <motion.div
              key={clip.id}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ delay: index * 0.1 }}
              className="rounded-xl overflow-hidden glass gradient-border"
            >
              <div className="relative aspect-[9/16] bg-black">
                <video
                  src={clip.url}
                  className="w-full h-full object-contain"
                  muted
                  playsInline
                  loop
                  onEnded={() => setPlayingId(null)}
                  onClick={(e) => togglePlay(clip.id, e.currentTarget)}
                />
                <button
                  onClick={(e) => {
                    const video = e.currentTarget.parentElement?.querySelector('video');
                    if (video) togglePlay(clip.id, video);
                  }}
                  className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 hover:opacity-100 transition-opacity"
                >
                  <motion.div
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.95 }}
                    className="p-3 rounded-full bg-primary/90"
                  >
                    {playingId === clip.id ? (
                      <Pause className="w-6 h-6 text-primary-foreground" />
                    ) : (
                      <Play className="w-6 h-6 text-primary-foreground ml-0.5" />
                    )}
                  </motion.div>
                </button>
              </div>
              
              <div className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-medium text-sm text-foreground truncate">
                    {clip.name}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground font-mono">
                    {formatTime(clip.startTime)} → {formatTime(clip.endTime)}
                  </span>
                  <Button
                    size="sm"
                    onClick={() => handleDownload(clip)}
                    className="gap-1.5"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Baixar
                  </Button>
                </div>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
