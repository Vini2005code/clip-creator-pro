import { useState, useRef } from 'react';
import { motion } from 'framer-motion';
import { Play, Pause, Download, Clock, Type } from 'lucide-react';
import { ProcessedClip } from '@/hooks/useFFmpegWorker';
import { Button } from '@/components/ui/button';

interface ViralClipCardProps {
  clip: ProcessedClip;
  index: number;
}

export function ViralClipCard({ clip, index }: ViralClipCardProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  const handleTogglePlay = () => {
    const video = videoRef.current;
    if (!video) return;

    if (isPlaying) {
      video.pause();
    } else {
      // Pause other videos
      document.querySelectorAll('video').forEach(v => {
        if (v !== video) v.pause();
      });
      video.play();
    }
    setIsPlaying(!isPlaying);
  };

  const handleDownload = () => {
    const a = document.createElement('a');
    a.href = clip.url;
    a.download = clip.name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9, y: 20 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ delay: index * 0.1 }}
      className="group rounded-2xl overflow-hidden glass gradient-border"
    >
      {/* Video Preview - 9:16 aspect ratio */}
      <div className="relative aspect-[9/16] bg-black">
        <video
          ref={videoRef}
          src={clip.url}
          className="w-full h-full object-cover"
          muted
          playsInline
          loop
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
        />
        
        {/* Play/Pause overlay */}
        <button
          onClick={handleTogglePlay}
          className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity"
        >
          <motion.div
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.95 }}
            className="p-4 rounded-full bg-primary/90 glow-primary"
          >
            {isPlaying ? (
              <Pause className="w-8 h-8 text-primary-foreground" />
            ) : (
              <Play className="w-8 h-8 text-primary-foreground ml-1" />
            )}
          </motion.div>
        </button>

        {/* Caption preview badge */}
        {clip.caption && (
          <div className="absolute top-3 left-3 right-3">
            <div className="px-3 py-1.5 rounded-lg bg-black/60 backdrop-blur-sm border border-white/10 flex items-center gap-2">
              <Type className="w-3 h-3 text-primary" />
              <span className="text-xs text-white font-medium truncate">{clip.caption}</span>
            </div>
          </div>
        )}

        {/* 9:16 badge */}
        <div className="absolute top-3 right-3 px-2 py-1 rounded bg-black/60 backdrop-blur-sm">
          <span className="text-xs text-white font-mono">9:16</span>
        </div>
      </div>

      {/* Info & Actions */}
      <div className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="font-semibold text-foreground text-sm">Corte #{index + 1}</h4>
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Clock className="w-3 h-3" />
            <span className="font-mono">
              {formatTime(clip.startTime)} → {formatTime(clip.endTime)}
            </span>
          </div>
        </div>

        <Button
          onClick={handleDownload}
          className="w-full gap-2"
          size="sm"
        >
          <Download className="w-4 h-4" />
          Download
        </Button>
      </div>
    </motion.div>
  );
}
