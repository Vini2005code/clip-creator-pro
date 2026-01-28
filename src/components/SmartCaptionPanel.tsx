import React, { forwardRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Type, 
  Languages, 
  Sparkles, 
  Target,
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

const REHOOK_STYLES = [
  { value: 'curiosity', label: 'Curiosidade', emoji: '🤔', desc: '"Você não vai acreditar..."' },
  { value: 'conflict', label: 'Conflito', emoji: '⚡', desc: '"O problema é que..."' },
  { value: 'promise', label: 'Promessa', emoji: '✨', desc: '"Isso vai mudar..."' },
] as const;

const CAPTION_STYLES = [
  { value: 'modern', label: 'Modern', preview: 'font-bold tracking-wide' },
  { value: 'bold', label: 'Bold', preview: 'font-black uppercase' },
  { value: 'minimal', label: 'Minimal', preview: 'font-medium' },
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
                <h3 className="font-semibold text-foreground">Smart Caption & Rehook</h3>
                <p className="text-xs text-muted-foreground">Legendas inteligentes com IA</p>
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
                    <h3 className="font-semibold text-foreground">Idioma das Legendas</h3>
                    <p className="text-xs text-muted-foreground">Reescrita natural, não tradução literal</p>
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

              {/* Auto-Rehook */}
              <div className="p-5 rounded-2xl glass gradient-border space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-xl bg-accent/20">
                      <Sparkles className="w-5 h-5 text-accent" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-foreground">Auto-Rehook</h3>
                      <p className="text-xs text-muted-foreground">Hook textual nos primeiros 0.5-1s</p>
                    </div>
                  </div>
                  <Switch
                    checked={config.enableRehook}
                    onCheckedChange={(checked) => onConfigChange({ enableRehook: checked })}
                  />
                </div>

                {config.enableRehook && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    className="space-y-3"
                  >
                    <Label className="text-xs text-muted-foreground">Estilo do Hook</Label>
                    <div className="grid grid-cols-3 gap-2">
                      {REHOOK_STYLES.map((style) => (
                        <motion.button
                          key={style.value}
                          whileHover={{ scale: 1.02 }}
                          whileTap={{ scale: 0.98 }}
                          onClick={() => onConfigChange({ rehookStyle: style.value })}
                          className={`py-2 px-2 rounded-xl text-xs font-medium transition-all flex flex-col items-center gap-1 ${
                            config.rehookStyle === style.value
                              ? 'bg-accent text-accent-foreground'
                              : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
                          }`}
                        >
                          <span className="text-base">{style.emoji}</span>
                          <span>{style.label}</span>
                        </motion.button>
                      ))}
                    </div>
                    <p className="text-xs text-muted-foreground/70 text-center">
                      {REHOOK_STYLES.find(s => s.value === config.rehookStyle)?.desc}
                    </p>
                  </motion.div>
                )}
              </div>

              {/* Retention-Aware Adjustment */}
              <div className="p-5 rounded-2xl glass gradient-border">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-xl bg-success/20">
                      <Target className="w-5 h-5 text-success" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-foreground">Ajuste de Retenção</h3>
                      <p className="text-xs text-muted-foreground">Otimiza início/fim para loop (20-45s)</p>
                    </div>
                  </div>
                  <Switch
                    checked={config.retentionAdjust}
                    onCheckedChange={(checked) => onConfigChange({ retentionAdjust: checked })}
                  />
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
                    <p className="font-medium text-foreground text-sm mb-1">Como funciona</p>
                    <ul className="text-xs text-muted-foreground space-y-1">
                      <li className="flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                        IA transcreve e analisa semanticamente o áudio
                      </li>
                      <li className="flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-accent" />
                        Quebra frases por impacto, não tempo
                      </li>
                      <li className="flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-success" />
                        Gera hook semântico conectado ao conteúdo
                      </li>
                      <li className="flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-warning" />
                        Ajusta corte para máxima retenção e loop
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
