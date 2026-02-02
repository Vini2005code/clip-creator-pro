import React, { forwardRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Type, 
  Languages, 
  Palette,
  Info,
  Wand2
} from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { SmartCaptionConfig } from '@/hooks/useSmartCaption';

interface SmartCaptionPanelProps {
  config: SmartCaptionConfig;
  onConfigChange: (updates: Partial<SmartCaptionConfig>) => void;
}

const LANGUAGES = [
  { value: 'pt', label: 'Português', flag: '🇧🇷' },
  { value: 'en', label: 'English', flag: '🇺🇸' },
] as const;

const CAPTION_STYLES = [
  { value: 'modern', label: 'Modern', preview: 'font-bold tracking-wide' },
  { value: 'bold', label: 'Bold', preview: 'font-black uppercase' },
  { value: 'minimal', label: 'Minimal', preview: 'font-medium' },
] as const;

const CAPTION_POSITIONS = [
  { value: 'top', label: 'Topo' },
  { value: 'center', label: 'Centro' },
  { value: 'bottom', label: 'Rodapé' },
] as const;

const COLOR_PRESETS = [
  { primary: '#FFFFFF', secondary: '#FFD700', name: 'Dourado' },
  { primary: '#FFFFFF', secondary: '#00FF88', name: 'Neon' },
  { primary: '#FFFFFF', secondary: '#FF6B6B', name: 'Coral' },
  { primary: '#FFFFFF', secondary: '#7C3AED', name: 'Roxo' },
];

export const SmartCaptionPanel = forwardRef<HTMLDivElement, SmartCaptionPanelProps>(
  function SmartCaptionPanel({ config, onConfigChange }, ref) {
    return (
      <motion.div
        ref={ref}
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        className="space-y-4"
      >
        {/* Master Toggle */}
        <div className="p-5 rounded-2xl glass gradient-border">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-gradient-to-br from-primary/20 to-accent/20">
                <Wand2 className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h3 className="font-semibold text-foreground">Legendas Automáticas (ASR)</h3>
                <p className="text-xs text-muted-foreground">Transcrição fiel do áudio real</p>
              </div>
            </div>
            <Switch
              checked={config.enabled}
              onCheckedChange={(checked) => onConfigChange({ enabled: checked })}
            />
          </div>
        </div>

        <AnimatePresence>
          {config.enabled && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="space-y-4 overflow-hidden"
            >
              {/* Language Selection */}
              <div className="p-5 rounded-2xl glass gradient-border space-y-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-xl bg-primary/20">
                    <Languages className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-foreground">Idioma da Transcrição</h3>
                    <p className="text-xs text-muted-foreground">Transcrição no idioma original do áudio</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  {LANGUAGES.map((lang) => (
                    <motion.button
                      key={lang.value}
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => onConfigChange({ outputLanguage: lang.value })}
                      className={`py-3 px-4 rounded-xl font-medium text-sm transition-all flex items-center justify-center gap-2 ${
                        config.outputLanguage === lang.value
                          ? 'bg-primary text-primary-foreground glow-primary'
                          : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
                      }`}
                    >
                      <span className="text-lg">{lang.flag}</span>
                      {lang.label}
                    </motion.button>
                  ))}
                </div>
              </div>


              {/* Visual Style */}
              <div className="p-5 rounded-2xl glass gradient-border space-y-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-xl bg-warning/20">
                    <Type className="w-5 h-5 text-warning" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-foreground">Identidade Visual</h3>
                    <p className="text-xs text-muted-foreground">Estilo único anti-genérico</p>
                  </div>
                </div>

                {/* Caption Style */}
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Tipografia</Label>
                  <div className="grid grid-cols-3 gap-2">
                    {CAPTION_STYLES.map((style) => (
                      <motion.button
                        key={style.value}
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => onConfigChange({ captionStyle: style.value })}
                        className={`py-3 rounded-xl transition-all ${
                          config.captionStyle === style.value
                            ? 'bg-warning text-warning-foreground'
                            : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
                        }`}
                      >
                        <span className={style.preview}>{style.label}</span>
                      </motion.button>
                    ))}
                  </div>
                </div>

                {/* Caption Position */}
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Posição da legenda</Label>
                  <div className="grid grid-cols-3 gap-2">
                    {CAPTION_POSITIONS.map((pos) => (
                      <motion.button
                        key={pos.value}
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => onConfigChange({ captionPosition: pos.value })}
                        className={`py-3 rounded-xl transition-all text-xs font-medium ${
                          config.captionPosition === pos.value
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
                        }`}
                      >
                        {pos.label}
                      </motion.button>
                    ))}
                  </div>
                </div>

                {/* Color Presets */}
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground flex items-center gap-1">
                    <Palette className="w-3 h-3" />
                    Paleta de Cores
                  </Label>
                  <div className="grid grid-cols-4 gap-2">
                    {COLOR_PRESETS.map((preset) => (
                      <motion.button
                        key={preset.name}
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => onConfigChange({ 
                          primaryColor: preset.primary, 
                          secondaryColor: preset.secondary 
                        })}
                        className={`aspect-square rounded-xl border-2 transition-all relative overflow-hidden ${
                          config.secondaryColor === preset.secondary
                            ? 'border-foreground ring-2 ring-foreground/20'
                            : 'border-border hover:border-foreground/50'
                        }`}
                        title={preset.name}
                      >
                        <div 
                          className="absolute inset-0 bottom-1/2" 
                          style={{ backgroundColor: preset.primary }}
                        />
                        <div 
                          className="absolute inset-0 top-1/2" 
                          style={{ backgroundColor: preset.secondary }}
                        />
                      </motion.button>
                    ))}
                  </div>
                </div>

                {/* Preview */}
                <div className="p-4 rounded-xl bg-black/80 border border-border">
                  <p 
                    className={`text-center ${
                      config.captionStyle === 'bold' ? 'font-black uppercase' :
                      config.captionStyle === 'minimal' ? 'font-medium' : 'font-bold tracking-wide'
                    }`}
                    style={{ color: config.primaryColor }}
                  >
                    Isso vai mudar{' '}
                    <span style={{ color: config.secondaryColor }}>TUDO</span>
                    {' '}que você sabe
                  </p>
                </div>
              </div>

              {/* Info Box */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.2 }}
                className="p-4 rounded-2xl bg-gradient-to-br from-primary/10 via-accent/10 to-primary/10 border border-primary/20"
              >
                <div className="flex gap-3">
                  <Info className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium text-foreground text-sm mb-1">Transcrição ASR</p>
                    <ul className="text-xs text-muted-foreground space-y-1">
                      <li className="flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                        Transcrição fiel: palavra por palavra do áudio
                      </li>
                      <li className="flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-accent" />
                        Timestamps precisos por segmento de fala
                      </li>
                      <li className="flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-success" />
                        Segmentação natural por pausas e respiração
                      </li>
                      <li className="flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-warning" />
                        Zero criatividade: sem resumo ou reescrita
                      </li>
                    </ul>
                  </div>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    );
  }
);
