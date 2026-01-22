import { motion, AnimatePresence } from 'framer-motion';
import { Loader2, CheckCircle2, XCircle, Zap, Film, Palette, Type, Package } from 'lucide-react';
import { ProcessingProgress, ProcessingStage } from '@/hooks/useFFmpegWorker';
import { Progress } from '@/components/ui/progress';

interface ProcessingOverlayProps {
  progress: ProcessingProgress;
  isProcessing: boolean;
  onAbort?: () => void;
}

const stageIcons: Record<ProcessingStage, typeof Loader2> = {
  'idle': Zap,
  'loading-ffmpeg': Loader2,
  'reading-file': Film,
  'analyzing': Zap,
  'applying-filters': Palette,
  'adding-captions': Type,
  'encoding': Film,
  'finalizing': Package,
  'complete': CheckCircle2,
  'error': XCircle,
};

const stageColors: Record<ProcessingStage, string> = {
  'idle': 'text-muted-foreground',
  'loading-ffmpeg': 'text-primary',
  'reading-file': 'text-primary',
  'analyzing': 'text-accent',
  'applying-filters': 'text-warning',
  'adding-captions': 'text-primary',
  'encoding': 'text-accent',
  'finalizing': 'text-success',
  'complete': 'text-success',
  'error': 'text-destructive',
};

export function ProcessingOverlay({ progress, isProcessing, onAbort }: ProcessingOverlayProps) {
  const Icon = stageIcons[progress.stage];
  const iconColor = stageColors[progress.stage];
  
  const overallProgress = progress.totalClips > 0
    ? ((progress.currentClip - 1) / progress.totalClips * 100) + (progress.clipProgress / progress.totalClips)
    : 0;

  const stages: ProcessingStage[] = [
    'reading-file',
    'analyzing', 
    'applying-filters',
    'encoding',
    'finalizing',
  ];

  const currentStageIndex = stages.indexOf(progress.stage);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="p-6 rounded-2xl glass gradient-border space-y-6"
    >
      {/* Header */}
      <div className="flex items-center gap-4">
        <motion.div
          animate={isProcessing ? { rotate: 360 } : {}}
          transition={{ duration: 2, repeat: isProcessing ? Infinity : 0, ease: 'linear' }}
          className={`p-3 rounded-xl ${
            progress.stage === 'complete' 
              ? 'bg-success/20' 
              : progress.stage === 'error'
              ? 'bg-destructive/20'
              : 'bg-primary/20'
          }`}
        >
          <Icon className={`w-6 h-6 ${iconColor}`} />
        </motion.div>
        <div className="flex-1">
          <h3 className="font-semibold text-foreground text-lg">{progress.stageMessage}</h3>
          {progress.totalClips > 0 && (
            <p className="text-sm text-muted-foreground">
              Corte {progress.currentClip} de {progress.totalClips}
            </p>
          )}
        </div>
        {isProcessing && onAbort && (
          <button
            onClick={onAbort}
            className="px-4 py-2 rounded-lg bg-destructive/20 text-destructive text-sm font-medium hover:bg-destructive/30 transition-colors"
          >
            Cancelar
          </button>
        )}
      </div>

      {/* Stage indicators */}
      <div className="flex items-center gap-2">
        {stages.map((stage, index) => {
          const isActive = index === currentStageIndex;
          const isComplete = index < currentStageIndex || progress.stage === 'complete';
          
          return (
            <div key={stage} className="flex-1 flex items-center">
              <motion.div
                animate={{
                  scale: isActive ? [1, 1.1, 1] : 1,
                }}
                transition={{ duration: 1, repeat: isActive ? Infinity : 0 }}
                className={`w-3 h-3 rounded-full transition-colors ${
                  isComplete
                    ? 'bg-success'
                    : isActive
                    ? 'bg-primary'
                    : 'bg-secondary'
                }`}
              />
              {index < stages.length - 1 && (
                <div className={`flex-1 h-0.5 mx-1 transition-colors ${
                  isComplete ? 'bg-success' : 'bg-secondary'
                }`} />
              )}
            </div>
          );
        })}
      </div>

      {/* Progress bars */}
      {isProcessing && (
        <div className="space-y-4">
          {/* Current clip progress */}
          <div>
            <div className="flex justify-between text-xs text-muted-foreground mb-1.5">
              <span>Progresso do corte atual</span>
              <span className="font-mono">{progress.clipProgress}%</span>
            </div>
            <div className="relative h-2 bg-secondary rounded-full overflow-hidden">
              <motion.div
                className="absolute inset-y-0 left-0 bg-primary rounded-full"
                animate={{ width: `${progress.clipProgress}%` }}
                transition={{ duration: 0.3 }}
              />
            </div>
          </div>

          {/* Overall progress */}
          <div>
            <div className="flex justify-between text-xs text-muted-foreground mb-1.5">
              <span>Progresso total</span>
              <span className="font-mono">{Math.round(overallProgress)}%</span>
            </div>
            <div className="relative h-3 bg-secondary rounded-full overflow-hidden">
              <motion.div
                className="absolute inset-y-0 left-0 bg-gradient-to-r from-primary via-accent to-success rounded-full"
                animate={{ width: `${overallProgress}%` }}
                transition={{ duration: 0.3 }}
              />
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent animate-shimmer bg-[length:200%_100%]" />
            </div>
          </div>
        </div>
      )}

      {/* Complete state */}
      <AnimatePresence>
        {progress.stage === 'complete' && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="p-4 rounded-xl bg-success/10 border border-success/20"
          >
            <p className="text-success font-medium flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5" />
              Todos os {progress.totalClips} cortes foram processados com sucesso!
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Error state */}
      <AnimatePresence>
        {progress.stage === 'error' && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="p-4 rounded-xl bg-destructive/10 border border-destructive/20"
          >
            <p className="text-destructive font-medium flex items-center gap-2">
              <XCircle className="w-5 h-5" />
              {progress.stageMessage}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
