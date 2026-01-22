import { motion } from 'framer-motion';
import { Scissors, Sparkles } from 'lucide-react';

export function Header() {
  return (
    <motion.header
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      className="text-center py-8"
    >
      <motion.div
        initial={{ scale: 0.8 }}
        animate={{ scale: 1 }}
        transition={{ delay: 0.2, type: 'spring', stiffness: 200 }}
        className="inline-flex items-center justify-center gap-3 mb-4"
      >
        <div className="relative">
          <div className="absolute inset-0 blur-xl bg-primary/40 rounded-full" />
          <div className="relative p-3 rounded-xl bg-gradient-to-br from-primary to-accent glow-primary">
            <Scissors className="w-8 h-8 text-primary-foreground" />
          </div>
        </div>
        <h1 className="text-4xl md:text-5xl font-bold text-gradient">
          ClipForge
        </h1>
      </motion.div>
      
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.4 }}
        className="text-lg text-muted-foreground max-w-xl mx-auto"
      >
        Transforme vídeos longos em cortes únicos para{' '}
        <span className="text-foreground font-medium">TikTok</span> e{' '}
        <span className="text-foreground font-medium">Reels</span>{' '}
        com filtros anti-duplicação
      </motion.p>
      
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.6 }}
        className="flex items-center justify-center gap-2 mt-4 text-sm text-muted-foreground"
      >
        <Sparkles className="w-4 h-4 text-primary" />
        <span>Processamento 100% local • Zero custo • Privacidade total</span>
      </motion.div>
    </motion.header>
  );
}
