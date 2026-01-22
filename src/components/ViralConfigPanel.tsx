import { motion } from 'framer-motion';
import { 
  Clock, 
  Scissors, 
  Zap, 
  Move, 
  Type, 
  Sparkles,
  Info,
  Shield
} from 'lucide-react';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { CutConfig } from '@/hooks/useFFmpegWorker';

interface ViralConfigPanelProps {
  config: CutConfig;
  maxDuration: number;
  onConfigChange: (updates: Partial<CutConfig>) => void;
}

const DURATION_PRESETS = [15, 30, 60, 90];
const SPEED_PRESETS = [1.0, 1.05, 1.1, 1.15];

export function ViralConfigPanel({
  config,
  maxDuration,
  onConfigChange,
}: ViralConfigPanelProps) {
  const maxPossibleClips = Math.floor(maxDuration / config.duration) || 1;

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      className="space-y-6"
    >
      {/* Duration Configuration */}
      <div className="p-6 rounded-2xl glass gradient-border space-y-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-primary/20">
            <Clock className="w-5 h-5 text-primary" />
          </div>
          <h3 className="font-semibold text-foreground">Duração do Corte</h3>
        </div>

        <div className="grid grid-cols-4 gap-2">
          {DURATION_PRESETS.map((preset) => (
            <motion.button
              key={preset}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => onConfigChange({ duration: preset })}
              disabled={preset > maxDuration}
              className={`py-3 rounded-xl font-mono font-semibold text-sm transition-all ${
                config.duration === preset
                  ? 'bg-primary text-primary-foreground glow-primary'
                  : preset > maxDuration
                  ? 'bg-secondary/30 text-muted-foreground/50 cursor-not-allowed'
                  : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
              }`}
            >
              {preset}s
            </motion.button>
          ))}
        </div>

        <div>
          <div className="flex justify-between text-sm text-muted-foreground mb-2">
            <span>Personalizado</span>
            <span className="font-mono text-primary">{config.duration}s</span>
          </div>
          <Slider
            value={[config.duration]}
            min={10}
            max={Math.min(maxDuration, 180)}
            step={5}
            onValueChange={([value]) => onConfigChange({ duration: value })}
          />
        </div>
      </div>

      {/* Cut Count */}
      <div className="p-6 rounded-2xl glass gradient-border space-y-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-accent/20">
            <Scissors className="w-5 h-5 text-accent" />
          </div>
          <h3 className="font-semibold text-foreground">Quantidade de Cortes</h3>
        </div>

        <div className="flex items-center gap-4">
          <Slider
            value={[config.count]}
            min={1}
            max={Math.min(maxPossibleClips, 20)}
            step={1}
            onValueChange={([value]) => onConfigChange({ count: value })}
            className="flex-1"
          />
          <div className="px-5 py-3 rounded-xl bg-accent/20 border border-accent/30 font-mono text-xl font-bold text-accent min-w-[70px] text-center">
            {config.count}
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Máximo: {maxPossibleClips} cortes de {config.duration}s
        </p>
      </div>

      {/* Retention Speed */}
      <div className="p-6 rounded-2xl glass gradient-border space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-success/20">
              <Zap className="w-5 h-5 text-success" />
            </div>
            <div>
              <h3 className="font-semibold text-foreground">Retention Speed</h3>
              <p className="text-xs text-muted-foreground">Aumenta energia e tempo de visualização</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-2">
          {SPEED_PRESETS.map((preset) => (
            <motion.button
              key={preset}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => onConfigChange({ speed: preset })}
              className={`py-3 rounded-xl font-mono font-semibold text-sm transition-all ${
                config.speed === preset
                  ? 'bg-success text-primary-foreground'
                  : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
              }`}
            >
              {preset}x
            </motion.button>
          ))}
        </div>

        <div className="p-3 rounded-lg bg-success/10 border border-success/20">
          <p className="text-xs text-success flex items-center gap-2">
            <Sparkles className="w-3 h-3" />
            1.05x-1.1x é quase imperceptível mas aumenta retenção em até 15%
          </p>
        </div>
      </div>

      {/* Ken Burns / Zoom */}
      <div className="p-6 rounded-2xl glass gradient-border space-y-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-warning/20">
            <Move className="w-5 h-5 text-warning" />
          </div>
          <div>
            <h3 className="font-semibold text-foreground">Dynamic Zoom (Ken Burns)</h3>
            <p className="text-xs text-muted-foreground">Movimento sutil de câmera para retenção</p>
          </div>
        </div>

        <div>
          <div className="flex justify-between text-sm mb-2">
            <span className="text-muted-foreground">Intensidade</span>
            <span className="font-mono text-warning">{config.zoomIntensity}%</span>
          </div>
          <Slider
            value={[config.zoomIntensity]}
            min={0}
            max={100}
            step={10}
            onValueChange={([value]) => onConfigChange({ zoomIntensity: value })}
          />
          <div className="flex justify-between text-xs text-muted-foreground mt-1">
            <span>Desligado</span>
            <span>Máximo</span>
          </div>
        </div>
      </div>

      {/* Smart Captions */}
      <div className="p-6 rounded-2xl glass gradient-border space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-primary/20">
              <Type className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h3 className="font-semibold text-foreground">Smart Captions</h3>
              <p className="text-xs text-muted-foreground">Legendas de hook para engajamento</p>
            </div>
          </div>
          <Switch
            checked={config.enableCaptions}
            onCheckedChange={(checked) => onConfigChange({ enableCaptions: checked })}
          />
        </div>

        {config.enableCaptions && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            className="space-y-3"
          >
            <div className="grid grid-cols-3 gap-2">
              {[
                { value: 'hook', label: 'Hooks 🔥' },
                { value: 'parts', label: 'Parts 📍' },
                { value: 'custom', label: 'Custom ✏️' },
              ].map((style) => (
                <button
                  key={style.value}
                  onClick={() => onConfigChange({ captionStyle: style.value as CutConfig['captionStyle'] })}
                  className={`py-2 rounded-lg text-sm font-medium transition-all ${
                    config.captionStyle === style.value
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
                  }`}
                >
                  {style.label}
                </button>
              ))}
            </div>

            {config.captionStyle === 'custom' && (
              <Input
                placeholder="Digite sua legenda..."
                value={config.customCaption}
                onChange={(e) => onConfigChange({ customCaption: e.target.value })}
                className="bg-secondary border-border"
              />
            )}
          </motion.div>
        )}
      </div>

      {/* Anti-Detection Info */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.3 }}
        className="p-5 rounded-2xl bg-gradient-to-br from-primary/10 via-accent/10 to-primary/10 border border-primary/20"
      >
        <div className="flex gap-3">
          <Shield className="w-6 h-6 text-primary shrink-0" />
          <div>
            <p className="font-semibold text-foreground mb-2">Sistema Anti-Duplicação Ativo</p>
            <ul className="text-xs text-muted-foreground space-y-1.5">
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                Metadados removidos completamente
              </li>
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-accent" />
                Color grade randômico (±0.03 brilho/contraste)
              </li>
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-success" />
                Ruído digital invisível (grain 0.1%)
              </li>
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-warning" />
                Conversão automática para 9:16 (1080x1920)
              </li>
            </ul>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
