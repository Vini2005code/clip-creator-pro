import { motion, AnimatePresence } from 'framer-motion';
import { 
  Loader2, 
  CheckCircle2, 
  XCircle, 
  FileVideo, 
  Search, 
  Trash2, 
  Crop, 
  Move, 
  Palette, 
  Fingerprint, 
  Type, 
  Film, 
  Package,
  Ban,
  RefreshCw
} from 'lucide-react';
import { ProcessingProgress, ProcessingStage } from '@/hooks/useFFmpegWorker';
import { Button } from '@/components/ui/button';

interface ProcessingOverlayProps {
  progress: ProcessingProgress;
  isProcessing: boolean;
  onAbort?: () => void;
  onRetryLoad?: () => void;
}

const stageConfig: Record<ProcessingStage, { icon: typeof Loader2; color: string; label: string }> = {
  'idle': { icon: FileVideo, color: 'text-muted-foreground', label: 'Aguardando' },
  'loading-ffmpeg': { icon: Loader2, color: 'text-primary', label: 'Motor FFmpeg' },
  'reading-file': { icon: FileVideo, color: 'text-primary', label: 'Lendo Arquivo' },
  'analyzing': { icon: Search, color: 'text-accent', label: 'Analisando' },
  'cleaning-metadata': { icon: Trash2, color: 'text-warning', label: 'Limpando Metadados' },
  'applying-crop': { icon: Crop, color: 'text-success', label: 'Smart Crop 9:16' },
  'applying-zoom': { icon: Move, color: 'text-accent', label: 'Zoom Dinâmico' },
  'applying-filters': { icon: Palette, color: 'text-warning', label: 'Filtros de Cor' },
  'generating-hash': { icon: Fingerprint, color: 'text-primary', label: 'Hash Único' },
  'adding-captions': { icon: Type, color: 'text-accent', label: 'Legendas' },
  'encoding': { icon: Film, color: 'text-primary', label: 'Codificando' },
  'finalizing': { icon: Package, color: 'text-success', label: 'Finalizando' },
  'complete': { icon: CheckCircle2, color: 'text-success', label: 'Concluído' },
  'error': { icon: XCircle, color: 'text-destructive', label: 'Erro' },
  'aborted': { icon: Ban, color: 'text-warning', label: 'Cancelado' },
};

// Stages that appear in the visual pipeline
const pipelineStages: ProcessingStage[] = [
  'cleaning-metadata',
  'applying-crop',
  'applying-zoom',
  'applying-filters',
  'generating-hash',
  'encoding',
];

export function ProcessingOverlay({ progress, isProcessing, onAbort, onRetryLoad }: ProcessingOverlayProps) {
  const config = stageConfig[progress.stage];
  const Icon = config.icon;
  
  const overallProgress = progress.totalClips > 0
    ? ((progress.currentClip - 1) / progress.totalClips * 100) + (progress.clipProgress / progress.totalClips)
    : 0;

  const currentStageIndex = pipelineStages.indexOf(progress.stage);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="p-6 rounded-2xl glass gradient-border space-y-6"
    >
      {/* Header with current stage */}
      <div className="flex items-center gap-4">
        <motion.div
          animate={isProcessing && progress.stage !== 'complete' && progress.stage !== 'error' ? { rotate: 360 } : {}}
          transition={{ duration: 2, repeat: isProcessing ? Infinity : 0, ease: 'linear' }}
          className={`p-3 rounded-xl ${
            progress.stage === 'complete' 
              ? 'bg-success/20' 
              : progress.stage === 'error'
              ? 'bg-destructive/20'
              : progress.stage === 'aborted'
              ? 'bg-warning/20'
              : 'bg-primary/20'
          }`}
        >
          <Icon className={`w-6 h-6 ${config.color}`} />
        </motion.div>
        <div className="flex-1">
          <h3 className="font-semibold text-foreground text-lg">{progress.stageMessage}</h3>
          {progress.totalClips > 0 && progress.stage !== 'complete' && progress.stage !== 'error' && (
            <p className="text-sm text-muted-foreground">
              Corte {progress.currentClip} de {progress.totalClips}
            </p>
          )}
        </div>
        {isProcessing && onAbort && (
          <Button
            onClick={onAbort}
            variant="destructive"
            size="sm"
            className="gap-2"
          >
            <Ban className="w-4 h-4" />
            Cancelar
          </Button>
        )}
      </div>

      {/* Viralization Pipeline Stages */}
      {isProcessing && (
        <div className="space-y-3">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Estágios de Viralização
          </p>
          <div className="grid grid-cols-6 gap-1">
            {pipelineStages.map((stage, index) => {
              const stageConf = stageConfig[stage];
              const StageIcon = stageConf.icon;
              const isActive = stage === progress.stage;
              const isComplete = currentStageIndex > index || progress.stage === 'complete';
              
              return (
                <motion.div
                  key={stage}
                  animate={isActive ? { scale: [1, 1.05, 1] } : {}}
                  transition={{ duration: 1, repeat: isActive ? Infinity : 0 }}
                  className={`flex flex-col items-center gap-1.5 p-2 rounded-lg transition-all ${
                    isActive 
                      ? 'bg-primary/20 border border-primary/30' 
                      : isComplete
                      ? 'bg-success/10'
                      : 'bg-secondary/30'
                  }`}
                >
                  <StageIcon className={`w-4 h-4 ${
                    isComplete ? 'text-success' : isActive ? stageConf.color : 'text-muted-foreground/50'
                  }`} />
                  <span className={`text-[10px] text-center leading-tight ${
                    isComplete ? 'text-success' : isActive ? 'text-foreground' : 'text-muted-foreground/50'
                  }`}>
                    {stageConf.label.split(' ')[0]}
                  </span>
                  {isComplete && (
                    <CheckCircle2 className="w-3 h-3 text-success absolute -top-1 -right-1" />
                  )}
                </motion.div>
              );
            })}
          </div>
        </div>
      )}

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
            <p className="text-xs text-success/70 mt-1">
              Anti-duplicação aplicado: metadados limpos, hash único por corte
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
            {progress.stageMessage.includes('FFmpeg') && onRetryLoad && (
              <Button
                onClick={onRetryLoad}
                variant="outline"
                size="sm"
                className="mt-3 gap-2 border-destructive/30 text-destructive hover:bg-destructive/10"
              >
                <RefreshCw className="w-4 h-4" />
                Tentar Recarregar Engine
              </Button>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Aborted state */}
      <AnimatePresence>
        {progress.stage === 'aborted' && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="p-4 rounded-xl bg-warning/10 border border-warning/20"
          >
            <p className="text-warning font-medium flex items-center gap-2">
              <Ban className="w-5 h-5" />
              Processamento cancelado
            </p>
            <p className="text-xs text-warning/70 mt-1">
              {progress.currentClip > 1 ? `${progress.currentClip - 1} corte(s) foram salvos antes do cancelamento.` : 'Nenhum corte foi finalizado.'}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
