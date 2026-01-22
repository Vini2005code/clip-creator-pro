import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Download, Package, CheckCircle2, Loader2 } from 'lucide-react';
import JSZip from 'jszip';
import { ProcessedClip } from '@/hooks/useFFmpegWorker';
import { Button } from '@/components/ui/button';
import { ViralClipCard } from './ViralClipCard';

interface ViralClipsGridProps {
  clips: ProcessedClip[];
}

export function ViralClipsGrid({ clips }: ViralClipsGridProps) {
  const [downloadingZip, setDownloadingZip] = useState(false);

  const handleDownloadAll = async () => {
    if (clips.length === 0) return;
    
    setDownloadingZip(true);
    try {
      const zip = new JSZip();
      const folder = zip.folder('viral_cuts');
      
      if (folder) {
        for (const clip of clips) {
          const arrayBuffer = await clip.blob.arrayBuffer();
          folder.file(clip.name, arrayBuffer);
        }
      }
      
      const content = await zip.generateAsync({ 
        type: 'blob',
        compression: 'DEFLATE',
        compressionOptions: { level: 6 }
      });
      
      const url = URL.createObjectURL(content);
      const a = document.createElement('a');
      a.href = url;
      a.download = `viral_cuts_${new Date().toISOString().split('T')[0]}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } finally {
      setDownloadingZip(false);
    }
  };

  if (clips.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className="p-3 rounded-xl bg-success/20"
          >
            <CheckCircle2 className="w-6 h-6 text-success" />
          </motion.div>
          <div>
            <h2 className="text-xl font-bold text-foreground">
              {clips.length} Corte{clips.length > 1 ? 's' : ''} Pronto{clips.length > 1 ? 's' : ''}
            </h2>
            <p className="text-sm text-muted-foreground">Formato 9:16 • Anti-duplicação aplicado</p>
          </div>
        </div>

        {clips.length > 1 && (
          <Button
            onClick={handleDownloadAll}
            disabled={downloadingZip}
            variant="secondary"
            size="lg"
            className="gap-2"
          >
            {downloadingZip ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Compactando...
              </>
            ) : (
              <>
                <Package className="w-4 h-4" />
                Download All (.zip)
              </>
            )}
          </Button>
        )}
      </div>

      {/* Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
        <AnimatePresence>
          {clips.map((clip, index) => (
            <ViralClipCard key={clip.id} clip={clip} index={index} />
          ))}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
