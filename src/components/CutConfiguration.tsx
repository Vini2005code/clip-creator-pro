import { motion } from 'framer-motion';
import { Clock, Scissors, Info } from 'lucide-react';
import { Slider } from '@/components/ui/slider';

interface CutConfigurationProps {
  duration: number;
  count: number;
  maxDuration: number;
  onDurationChange: (value: number) => void;
  onCountChange: (value: number) => void;
}

const DURATION_PRESETS = [15, 30, 60, 90];

export function CutConfiguration({
  duration,
  count,
  maxDuration,
  onDurationChange,
  onCountChange,
}: CutConfigurationProps) {
  const maxPossibleClips = Math.floor(maxDuration / duration) || 1;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1 }}
      className="p-6 rounded-xl glass gradient-border space-y-6"
    >
      <div className="flex items-center gap-3 mb-6">
        <div className="p-2 rounded-lg bg-accent/20">
          <Scissors className="w-5 h-5 text-accent" />
        </div>
        <h3 className="text-lg font-semibold text-foreground">Configuração de Cortes</h3>
      </div>

      {/* Duration selector */}
      <div className="space-y-3">
        <label className="flex items-center gap-2 text-sm font-medium text-foreground">
          <Clock className="w-4 h-4 text-muted-foreground" />
          Duração de cada corte
        </label>
        
        <div className="grid grid-cols-4 gap-2">
          {DURATION_PRESETS.map((preset) => (
            <motion.button
              key={preset}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => onDurationChange(preset)}
              disabled={preset > maxDuration}
              className={`py-3 px-4 rounded-lg font-medium text-sm transition-all ${
                duration === preset
                  ? 'bg-primary text-primary-foreground glow-primary'
                  : preset > maxDuration
                  ? 'bg-secondary/50 text-muted-foreground cursor-not-allowed'
                  : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
              }`}
            >
              {preset}s
            </motion.button>
          ))}
        </div>

        {/* Custom duration slider */}
        <div className="pt-4">
          <div className="flex justify-between text-sm text-muted-foreground mb-2">
            <span>Personalizado</span>
            <span className="font-mono">{duration}s</span>
          </div>
          <Slider
            value={[duration]}
            min={5}
            max={Math.min(maxDuration, 180)}
            step={5}
            onValueChange={([value]) => onDurationChange(value)}
            className="w-full"
          />
        </div>
      </div>

      {/* Count selector */}
      <div className="space-y-3 pt-4 border-t border-border">
        <label className="flex items-center gap-2 text-sm font-medium text-foreground">
          <Scissors className="w-4 h-4 text-muted-foreground" />
          Quantidade de cortes
        </label>
        
        <div className="flex items-center gap-4">
          <Slider
            value={[count]}
            min={1}
            max={Math.min(maxPossibleClips, 20)}
            step={1}
            onValueChange={([value]) => onCountChange(value)}
            className="flex-1"
          />
          <div className="px-4 py-2 rounded-lg bg-secondary font-mono text-lg font-semibold min-w-[60px] text-center">
            {count}
          </div>
        </div>
        
        <p className="text-xs text-muted-foreground">
          Máximo: {maxPossibleClips} cortes de {duration}s
        </p>
      </div>

      {/* Info box */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.3 }}
        className="p-4 rounded-lg bg-primary/10 border border-primary/20"
      >
        <div className="flex gap-3">
          <Info className="w-5 h-5 text-primary shrink-0 mt-0.5" />
          <div className="text-sm text-foreground/80">
            <p className="font-medium mb-1">Filtros Anti-Duplicação Ativos</p>
            <ul className="text-xs text-muted-foreground space-y-1">
              <li>• Remoção de metadados</li>
              <li>• Zoom imperceptível (+1%)</li>
              <li>• Ajuste de brilho/contraste</li>
            </ul>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
