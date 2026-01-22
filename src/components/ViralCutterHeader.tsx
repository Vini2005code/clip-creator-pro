import { motion } from 'framer-motion';
import { Zap, TrendingUp, Shield } from 'lucide-react';

export function ViralCutterHeader() {
  return (
    <motion.header
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      className="text-center py-10"
    >
      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: 0.1, type: 'spring', stiffness: 200 }}
        className="inline-flex items-center justify-center gap-4 mb-6"
      >
        <div className="relative">
          <div className="absolute inset-0 blur-2xl bg-gradient-to-r from-primary via-accent to-primary opacity-60 animate-pulse-glow" />
          <div className="relative p-4 rounded-2xl bg-gradient-to-br from-primary via-primary/80 to-accent glow-primary">
            <Zap className="w-10 h-10 text-primary-foreground" />
          </div>
        </div>
        <div className="text-left">
          <h1 className="text-5xl md:text-6xl font-extrabold text-gradient tracking-tight">
            ViralCutter
          </h1>
          <p className="text-sm font-medium text-primary mt-1">
            ANTI-DETECTION ENGINE v2.0
          </p>
        </div>
      </motion.div>
      
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.3 }}
        className="text-xl text-muted-foreground max-w-2xl mx-auto mb-6"
      >
        Transforme vídeos horizontais em cortes{' '}
        <span className="text-foreground font-semibold">9:16 únicos</span>{' '}
        que burlam a detecção de duplicação do TikTok
      </motion.p>
      
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
        className="flex flex-wrap items-center justify-center gap-4 text-sm"
      >
        {[
          { icon: TrendingUp, text: 'Ken Burns Effect', color: 'text-primary' },
          { icon: Shield, text: 'Hash Único', color: 'text-accent' },
          { icon: Zap, text: 'Speed Boost', color: 'text-success' },
        ].map((feature, index) => (
          <motion.div
            key={feature.text}
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.6 + index * 0.1 }}
            className="flex items-center gap-2 px-4 py-2 rounded-full bg-secondary/50 border border-border"
          >
            <feature.icon className={`w-4 h-4 ${feature.color}`} />
            <span className="text-foreground font-medium">{feature.text}</span>
          </motion.div>
        ))}
      </motion.div>
    </motion.header>
  );
}
