import { motion } from 'framer-motion';
import { Loader2, CheckCircle2, Sparkles } from 'lucide-react';
import { ProcessingProgress } from '@/hooks/useFFmpeg';
import { Progress } from '@/components/ui/progress';

interface ProcessingStatusProps {
  progress: ProcessingProgress;
  isProcessing: boolean;
}

export function ProcessingStatus({ progress, isProcessing }: ProcessingStatusProps) {
  const overallProgress = progress.totalClips > 0
    ? ((progress.currentClip - 1) / progress.totalClips * 100) + (progress.clipProgress / progress.totalClips)
    : 0;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="p-6 rounded-xl glass gradient-border"
    >
      <div className="flex items-center gap-3 mb-4">
        {isProcessing ? (
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
            className="p-2 rounded-lg bg-primary/20"
          >
            <Loader2 className="w-5 h-5 text-primary" />
          </motion.div>
        ) : progress.status === 'Concluído!' ? (
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className="p-2 rounded-lg bg-success/20"
          >
            <CheckCircle2 className="w-5 h-5 text-success" />
          </motion.div>
        ) : (
          <div className="p-2 rounded-lg bg-accent/20">
            <Sparkles className="w-5 h-5 text-accent" />
          </div>
        )}
        <div>
          <h3 className="font-semibold text-foreground">{progress.status}</h3>
          {progress.totalClips > 0 && (
            <p className="text-sm text-muted-foreground">
              Corte {progress.currentClip} de {progress.totalClips}
            </p>
          )}
        </div>
      </div>

      {isProcessing && (
        <div className="space-y-3">
          {/* Current clip progress */}
          <div>
            <div className="flex justify-between text-xs text-muted-foreground mb-1">
              <span>Progresso do corte atual</span>
              <span className="font-mono">{progress.clipProgress}%</span>
            </div>
            <Progress value={progress.clipProgress} className="h-2" />
          </div>

          {/* Overall progress */}
          <div>
            <div className="flex justify-between text-xs text-muted-foreground mb-1">
              <span>Progresso total</span>
              <span className="font-mono">{Math.round(overallProgress)}%</span>
            </div>
            <div className="relative h-3 bg-secondary rounded-full overflow-hidden">
              <motion.div
                className="absolute inset-y-0 left-0 bg-gradient-to-r from-primary to-accent rounded-full"
                animate={{ width: `${overallProgress}%` }}
                transition={{ duration: 0.3 }}
              />
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent animate-shimmer bg-[length:200%_100%]" />
            </div>
          </div>
        </div>
      )}

      {progress.status === 'Concluído!' && (
        <motion.p
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-sm text-success mt-2"
        >
          Todos os cortes foram processados com sucesso!
        </motion.p>
      )}
    </motion.div>
  );
}
