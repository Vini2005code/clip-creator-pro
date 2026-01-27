import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Package, CheckCircle2, Loader2 } from 'lucide-react';
import JSZip from 'jszip';
import { ProcessedClip } from '@/hooks/useFFmpegWorker';
import { Button } from '@/components/ui/button';
import { ViralClipCard } from './ViralClipCard';

interface ViralClipsGridProps {
  clips: ProcessedClip[];
}

export function ViralClipsGrid({ clips }: ViralClipsGridProps) {
  const [downloadingZip, setDownloadingZip] = useState(false);
  const [zipProgress, setZipProgress] = useState(0);

  const handleDownloadAll = async () => {
    if (clips.length === 0 || downloadingZip) return;
    
    setDownloadingZip(true);
    setZipProgress(0);
    
    try {
      console.log('[ZIP] Iniciando compactação de', clips.length, 'arquivos');
      
      // Create new JSZip instance
      const zip = new JSZip();
      const folder = zip.folder('cortes_virais');
      
      if (!folder) {
        throw new Error('Falha ao criar pasta no ZIP');
      }

      // Add each clip blob to the ZIP
      for (let i = 0; i < clips.length; i++) {
        const clip = clips[i];
        
        // Convert blob to ArrayBuffer
        const arrayBuffer = await clip.blob.arrayBuffer();
        
        // Add to ZIP with proper filename
        const filename = clip.name || `corte_${i + 1}.mp4`;
        folder.file(filename, arrayBuffer);
        
        // Update progress
        const progress = Math.round(((i + 1) / clips.length) * 50);
        setZipProgress(progress);
        
        console.log(`[ZIP] Adicionado: ${filename}`);
      }

      console.log('[ZIP] Gerando arquivo ZIP...');
      
      // Generate ZIP with compression
      const content = await zip.generateAsync(
        { 
          type: 'blob',
          compression: 'DEFLATE',
          compressionOptions: { level: 6 }
        },
        (metadata) => {
          // Update progress during generation (50-100%)
          const progress = 50 + Math.round(metadata.percent / 2);
          setZipProgress(progress);
        }
      );

      console.log('[ZIP] ZIP gerado, tamanho:', (content.size / 1024 / 1024).toFixed(2), 'MB');

      // Create download URL from the generated blob
      const url = URL.createObjectURL(content);
      
      // Create and trigger download
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = url;
      a.download = `cortes_virais_${new Date().toISOString().split('T')[0]}.zip`;
      
      document.body.appendChild(a);
      a.click();
      
      // Cleanup after small delay
      await new Promise(resolve => setTimeout(resolve, 100));
      
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      console.log('[ZIP] Download iniciado com sucesso');
    } catch (error) {
      console.error('[ZIP] Erro ao criar ZIP:', error);
    } finally {
      setDownloadingZip(false);
      setZipProgress(0);
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
            className="gap-2 min-w-[180px]"
          >
            {downloadingZip ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Compactando... {zipProgress}%
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
