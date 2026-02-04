import { forwardRef, useRef, useEffect, useState, useImperativeHandle } from 'react';
import { motion } from 'framer-motion';
import { Play, Pause, Volume2, VolumeX, Monitor, Smartphone } from 'lucide-react';

interface VideoPreviewEnhancedProps {
  file: File;
  onDurationChange: (duration: number) => void;
  onDimensionsChange: (width: number, height: number) => void;
  captionPreview?: {
    enabled: boolean;
    lines: string[];
    position: 'top' | 'center' | 'bottom';
    primaryColor: string;
    secondaryColor: string;
    style: 'modern' | 'bold' | 'minimal';
  };
}

export interface VideoPreviewEnhancedRef {
  getVideoElement: () => HTMLVideoElement | null;
}

export const VideoPreviewEnhanced = forwardRef<VideoPreviewEnhancedRef, VideoPreviewEnhancedProps>(
  ({ file, onDurationChange, onDimensionsChange, captionPreview }, ref) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [isMuted, setIsMuted] = useState(true);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [videoUrl, setVideoUrl] = useState<string | null>(null);
    const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
    const [showPortrait, setShowPortrait] = useState(false);
    const [isLoaded, setIsLoaded] = useState(false);

    // Expose video element to parent
    useImperativeHandle(ref, () => ({
      getVideoElement: () => videoRef.current,
    }));

    useEffect(() => {
      const url = URL.createObjectURL(file);
      setVideoUrl(url);
      setIsLoaded(false);
      setDuration(0);
      setCurrentTime(0);
      return () => URL.revokeObjectURL(url);
    }, [file]);

    useEffect(() => {
      const video = videoRef.current;
      if (!video || !videoUrl) return;

      const handleLoadedMetadata = () => {
        console.log('[VideoPreview] Metadata loaded:', {
          duration: video.duration,
          width: video.videoWidth,
          height: video.videoHeight,
        });
        
        const dur = Math.floor(video.duration);
        if (dur > 0) {
          setDuration(dur);
          onDurationChange(dur);
          setIsLoaded(true);
        }
        
        const dims = { width: video.videoWidth, height: video.videoHeight };
        if (dims.width > 0 && dims.height > 0) {
          setDimensions(dims);
          onDimensionsChange(dims.width, dims.height);
        }
      };

      const handleCanPlay = () => {
        // Fallback if loadedmetadata didn't fire properly
        if (!isLoaded && video.duration > 0) {
          console.log('[VideoPreview] CanPlay fallback:', video.duration);
          const dur = Math.floor(video.duration);
          setDuration(dur);
          onDurationChange(dur);
          setIsLoaded(true);
          
          if (video.videoWidth > 0) {
            setDimensions({ width: video.videoWidth, height: video.videoHeight });
            onDimensionsChange(video.videoWidth, video.videoHeight);
          }
        }
      };

      const handleTimeUpdate = () => {
        setCurrentTime(video.currentTime);
      };

      const handleDurationChange = () => {
        // Some browsers update duration after initial load
        if (video.duration && !isNaN(video.duration) && video.duration !== Infinity) {
          const dur = Math.floor(video.duration);
          if (dur > 0 && dur !== duration) {
            console.log('[VideoPreview] Duration updated:', dur);
            setDuration(dur);
            onDurationChange(dur);
            setIsLoaded(true);
          }
        }
      };

      video.addEventListener('loadedmetadata', handleLoadedMetadata);
      video.addEventListener('canplay', handleCanPlay);
      video.addEventListener('timeupdate', handleTimeUpdate);
      video.addEventListener('durationchange', handleDurationChange);

      // Force load
      video.load();

      return () => {
        video.removeEventListener('loadedmetadata', handleLoadedMetadata);
        video.removeEventListener('canplay', handleCanPlay);
        video.removeEventListener('timeupdate', handleTimeUpdate);
        video.removeEventListener('durationchange', handleDurationChange);
      };
    }, [videoUrl, onDurationChange, onDimensionsChange, isLoaded, duration]);

    const togglePlay = () => {
      const video = videoRef.current;
      if (!video) return;

      if (isPlaying) {
        video.pause();
      } else {
        video.play().catch(console.error);
      }
      setIsPlaying(!isPlaying);
    };

    const toggleMute = () => {
      const video = videoRef.current;
      if (!video) return;
      video.muted = !video.muted;
      setIsMuted(!isMuted);
    };

    const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
      const video = videoRef.current;
      if (!video) return;
      const time = parseFloat(e.target.value);
      video.currentTime = time;
      setCurrentTime(time);
    };

    const formatTime = (seconds: number): string => {
      const mins = Math.floor(seconds / 60);
      const secs = Math.floor(seconds % 60);
      return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    const aspectRatio = dimensions.width / dimensions.height || 16/9;
    const isHorizontal = aspectRatio > 1;

    // Calculate 9:16 crop preview area
    const targetRatio = 9 / 16;
    let cropPreview = { x: 0, y: 0, width: '100%', height: '100%' };
    
    if (showPortrait && isHorizontal && dimensions.width > 0) {
      const cropWidth = (dimensions.height * targetRatio) / dimensions.width * 100;
      cropPreview = {
        x: (100 - cropWidth) / 2,
        y: 0,
        width: `${cropWidth}%`,
        height: '100%',
      };
    }

    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-2xl overflow-hidden glass"
      >
        {/* Video container */}
        <div className="relative bg-black">
          <div className="relative aspect-video">
            {videoUrl && (
              <video
                ref={videoRef}
                src={videoUrl}
                className="w-full h-full object-contain"
                muted={isMuted}
                playsInline
                preload="metadata"
                onPlay={() => setIsPlaying(true)}
                onPause={() => setIsPlaying(false)}
              />
            )}

            {/* Caption preview overlay (no export) */}
            {captionPreview?.enabled && captionPreview.lines.length > 0 && (
              <div className="absolute inset-0 pointer-events-none">
                <div
                  className="absolute left-1/2 -translate-x-1/2 w-[92%] max-w-[680px] px-3"
                  style={{
                    top: captionPreview.position === 'top' ? '8%' : undefined,
                    bottom: captionPreview.position === 'bottom' ? '10%' : undefined,
                    transform:
                      captionPreview.position === 'center'
                        ? 'translate(-50%, -50%)'
                        : undefined,
                    left: '50%',
                    ...(captionPreview.position === 'center' ? { top: '50%' } : {}),
                  }}
                >
                  <div className="space-y-2">
                    {captionPreview.lines.slice(0, 3).map((line, idx) => {
                      const words = line.trim().split(/\s+/);
                      const last = words.pop();
                      const head = words.join(' ');
                      const className =
                        captionPreview.style === 'bold'
                          ? 'font-black uppercase'
                          : captionPreview.style === 'minimal'
                            ? 'font-medium'
                            : 'font-bold tracking-wide';

                      return (
                        <div
                          key={`${idx}-${line}`}
                          className={`text-center leading-tight drop-shadow-[0_2px_12px_rgba(0,0,0,0.55)] ${className}`}
                          style={{
                            color: captionPreview.primaryColor,
                            fontSize: 'clamp(18px, 3.2vw, 44px)',
                            textShadow:
                              '0 2px 10px rgba(0,0,0,0.75), 0 0 2px rgba(0,0,0,0.75)',
                          }}
                        >
                          {head ? <span>{head} </span> : null}
                          {last ? (
                            <span style={{ color: captionPreview.secondaryColor }}>{last}</span>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
            
            {/* Loading indicator */}
            {!isLoaded && videoUrl && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
              </div>
            )}
            
            {/* 9:16 crop preview overlay */}
            {showPortrait && isHorizontal && isLoaded && (
              <>
                {/* Darkened areas */}
                <div 
                  className="absolute inset-y-0 left-0 bg-black/70 transition-all duration-300"
                  style={{ width: `${cropPreview.x}%` }}
                />
                <div 
                  className="absolute inset-y-0 right-0 bg-black/70 transition-all duration-300"
                  style={{ width: `${cropPreview.x}%` }}
                />
                {/* Center border */}
                <div 
                  className="absolute inset-y-0 border-2 border-primary border-dashed transition-all duration-300"
                  style={{ 
                    left: `${cropPreview.x}%`, 
                    width: cropPreview.width,
                  }}
                >
                  <div className="absolute top-2 left-1/2 -translate-x-1/2 px-2 py-1 rounded bg-primary text-primary-foreground text-xs font-mono">
                    9:16
                  </div>
                </div>
              </>
            )}

            {/* Play overlay */}
            {isLoaded && (
              <button
                onClick={togglePlay}
                className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 hover:opacity-100 transition-opacity"
              >
                <motion.div
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.95 }}
                  className="p-5 rounded-full bg-primary/90 glow-primary"
                >
                  {isPlaying ? (
                    <Pause className="w-10 h-10 text-primary-foreground" />
                  ) : (
                    <Play className="w-10 h-10 text-primary-foreground ml-1" />
                  )}
                </motion.div>
              </button>
            )}
          </div>

          {/* Video info badges */}
          {isLoaded && (
            <div className="absolute top-3 left-3 flex gap-2">
              <div className="px-2 py-1 rounded-lg bg-black/60 backdrop-blur-sm border border-white/10">
                <span className="text-xs text-white font-mono">
                  {dimensions.width}×{dimensions.height}
                </span>
              </div>
              <div className={`px-2 py-1 rounded-lg backdrop-blur-sm border ${
                isHorizontal 
                  ? 'bg-success/20 border-success/30 text-success' 
                  : 'bg-warning/20 border-warning/30 text-warning'
              }`}>
                <span className="text-xs font-medium">
                  {isHorizontal ? 'Horizontal ✓' : 'Vertical'}
                </span>
              </div>
              <div className="px-2 py-1 rounded-lg bg-primary/20 backdrop-blur-sm border border-primary/30">
                <span className="text-xs text-primary font-mono">
                  {formatTime(duration)}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Controls */}
        {isLoaded && (
          <div className="p-4 bg-card/80">
            {/* Progress bar */}
            <div className="relative mb-4">
              <input
                type="range"
                min={0}
                max={duration || 100}
                value={currentTime}
                onChange={handleSeek}
                className="w-full h-1.5 bg-secondary rounded-full appearance-none cursor-pointer
                  [&::-webkit-slider-thumb]:appearance-none
                  [&::-webkit-slider-thumb]:w-4
                  [&::-webkit-slider-thumb]:h-4
                  [&::-webkit-slider-thumb]:rounded-full
                  [&::-webkit-slider-thumb]:bg-primary
                  [&::-webkit-slider-thumb]:cursor-pointer
                  [&::-webkit-slider-thumb]:shadow-lg
                  [&::-webkit-slider-thumb]:transition-transform
                  [&::-webkit-slider-thumb]:hover:scale-110"
                style={{
                  background: duration > 0 
                    ? `linear-gradient(to right, hsl(var(--primary)) ${(currentTime / duration) * 100}%, hsl(var(--secondary)) ${(currentTime / duration) * 100}%)`
                    : 'hsl(var(--secondary))',
                }}
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <button
                  onClick={togglePlay}
                  className="p-2 rounded-xl hover:bg-secondary transition-colors"
                >
                  {isPlaying ? (
                    <Pause className="w-5 h-5 text-foreground" />
                  ) : (
                    <Play className="w-5 h-5 text-foreground" />
                  )}
                </button>
                <button
                  onClick={toggleMute}
                  className="p-2 rounded-xl hover:bg-secondary transition-colors"
                >
                  {isMuted ? (
                    <VolumeX className="w-5 h-5 text-foreground" />
                  ) : (
                    <Volume2 className="w-5 h-5 text-foreground" />
                  )}
                </button>
                <span className="text-sm font-mono text-muted-foreground ml-2">
                  {formatTime(currentTime)} / {formatTime(duration)}
                </span>
              </div>

              <div className="flex items-center gap-2">
                {/* Preview mode toggle */}
                {isHorizontal && (
                  <div className="flex items-center gap-1 p-1 rounded-xl bg-secondary">
                    <button
                      onClick={() => setShowPortrait(false)}
                      className={`p-2 rounded-lg transition-colors ${
                        !showPortrait ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
                      }`}
                      title="Preview original"
                    >
                      <Monitor className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setShowPortrait(true)}
                      className={`p-2 rounded-lg transition-colors ${
                        showPortrait ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
                      }`}
                      title="Preview 9:16 crop"
                    >
                      <Smartphone className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </motion.div>
    );
  }
);

VideoPreviewEnhanced.displayName = 'VideoPreviewEnhanced';
