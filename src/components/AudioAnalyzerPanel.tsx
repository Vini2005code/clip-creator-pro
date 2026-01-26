import { motion } from 'framer-motion';
import { AudioLines, Zap, Loader2, CheckCircle2, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { AudioAnalysisResult } from '@/hooks/useAudioAnalyzer';

interface AudioAnalyzerPanelProps {
  onAnalyze: () => void;
  analyzing: boolean;
  progress: number;
  result: AudioAnalysisResult | null;
  error: string | null;
  onApplySuggestions: (cuts: number[]) => void;
  clipDuration: number;
}

export function AudioAnalyzerPanel({
  onAnalyze,
  analyzing,
  progress,
  result,
  error,
  onApplySuggestions,
  clipDuration,
}: AudioAnalyzerPanelProps) {
  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="p-6 rounded-2xl glass gradient-border space-y-4"
    >
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-xl bg-accent/20">
          <AudioLines className="w-5 h-5 text-accent" />
        </div>
        <div>
          <h3 className="font-semibold text-foreground">Auto-Detect Highlights</h3>
          <p className="text-xs text-muted-foreground">
            Analisa picos de áudio para encontrar momentos virais
          </p>
        </div>
      </div>

      {/* Analyze button or progress */}
      {!result && !error && (
        <div className="space-y-3">
          <Button
            onClick={onAnalyze}
            disabled={analyzing}
            variant="secondary"
            className="w-full gap-2"
          >
            {analyzing ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Analisando áudio...
              </>
            ) : (
              <>
                <Zap className="w-4 h-4" />
                Detectar Highlights Automaticamente
              </>
            )}
          </Button>

          {analyzing && (
            <div className="space-y-1">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Processando waveform...</span>
                <span className="font-mono">{progress}%</span>
              </div>
              <Progress value={progress} className="h-1.5" />
            </div>
          )}
        </div>
      )}

      {/* Results */}
      {result && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="space-y-4"
        >
          <div className="flex items-center gap-2 text-success">
            <CheckCircle2 className="w-4 h-4" />
            <span className="text-sm font-medium">
              {result.suggestedCuts.length} pontos de corte encontrados
            </span>
          </div>

          {/* Peaks visualization */}
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">Picos de intensidade detectados:</p>
            <div className="flex gap-1 h-12 items-end">
              {result.peaks.slice(0, 20).map((peak, i) => (
                <motion.div
                  key={i}
                  initial={{ height: 0 }}
                  animate={{ height: `${peak.intensity * 100}%` }}
                  transition={{ delay: i * 0.05 }}
                  className="flex-1 bg-gradient-to-t from-accent to-primary rounded-t"
                  title={`${formatTime(peak.time)} - ${Math.round(peak.intensity * 100)}%`}
                />
              ))}
            </div>
          </div>

          {/* Suggested cuts */}
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">Cortes sugeridos ({clipDuration}s cada):</p>
            <div className="flex flex-wrap gap-2">
              {result.suggestedCuts.map((time, i) => (
                <div
                  key={i}
                  className="px-3 py-1.5 rounded-lg bg-secondary text-sm font-mono"
                >
                  {formatTime(time)} → {formatTime(time + clipDuration)}
                </div>
              ))}
            </div>
          </div>

          {/* Apply button */}
          <Button
            onClick={() => onApplySuggestions(result.suggestedCuts)}
            className="w-full gap-2"
          >
            <Zap className="w-4 h-4" />
            Usar {result.suggestedCuts.length} Cortes Detectados
          </Button>
        </motion.div>
      )}

      {/* Error */}
      {error && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 flex items-center gap-2"
        >
          <XCircle className="w-4 h-4 text-destructive" />
          <span className="text-sm text-destructive">{error}</span>
        </motion.div>
      )}
    </motion.div>
  );
}
