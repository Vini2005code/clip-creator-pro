import { useCallback, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Upload, Film, X, AlertCircle, Sparkles } from 'lucide-react';

interface UploadZoneProps {
  onFileSelect: (file: File) => void;
  selectedFile: File | null;
  onClear: () => void;
}

export function UploadZone({ onFileSelect, selectedFile, onClear }: UploadZoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDragIn = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragOut = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const validateFile = (file: File): boolean => {
    const validTypes = ['video/mp4', 'video/quicktime', 'video/x-m4v', 'video/webm'];
    if (!validTypes.includes(file.type)) {
      setError('Formato inválido. Use MP4, MOV ou WebM.');
      return false;
    }
    if (file.size > 4 * 1024 * 1024 * 1024) {
      setError('Arquivo muito grande. Máximo 4GB.');
      return false;
    }
    setError(null);
    return true;
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = e.dataTransfer.files;
    if (files?.[0] && validateFile(files[0])) {
      onFileSelect(files[0]);
    }
  }, [onFileSelect]);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files?.[0] && validateFile(files[0])) {
      onFileSelect(files[0]);
    }
  }, [onFileSelect]);

  const formatFileSize = (bytes: number): string => {
    if (bytes >= 1024 * 1024 * 1024) {
      return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
    }
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
  };

  if (selectedFile) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="relative p-5 rounded-2xl glass gradient-border"
      >
        <div className="flex items-center gap-4">
          <div className="p-3 rounded-xl bg-gradient-to-br from-primary/30 to-accent/30">
            <Film className="w-8 h-8 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-foreground truncate">{selectedFile.name}</p>
            <p className="text-sm text-muted-foreground">{formatFileSize(selectedFile.size)}</p>
          </div>
          <button
            onClick={onClear}
            className="p-2 rounded-xl hover:bg-secondary transition-colors"
          >
            <X className="w-5 h-5 text-muted-foreground hover:text-foreground" />
          </button>
        </div>
      </motion.div>
    );
  }

  return (
    <div>
      <motion.div
        onDragEnter={handleDragIn}
        onDragLeave={handleDragOut}
        onDragOver={handleDrag}
        onDrop={handleDrop}
        animate={{
          borderColor: isDragging ? 'hsl(var(--primary))' : 'hsl(var(--border))',
          boxShadow: isDragging 
            ? '0 0 40px hsl(var(--primary) / 0.3), 0 0 80px hsl(var(--primary) / 0.1)' 
            : 'none',
        }}
        className="relative flex flex-col items-center justify-center p-16 border-2 border-dashed rounded-2xl cursor-pointer transition-all hover:border-primary/50 overflow-hidden group"
      >
        {/* Animated background glow */}
        <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-primary/20 rounded-full blur-3xl" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-48 h-48 bg-accent/20 rounded-full blur-2xl animate-pulse" />
        </div>

        <input
          type="file"
          accept="video/mp4,video/quicktime,video/webm,.mp4,.mov,.webm"
          onChange={handleFileInput}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
        />
        
        <motion.div
          animate={{ 
            scale: isDragging ? 1.15 : 1,
            rotate: isDragging ? 5 : 0,
          }}
          className="relative p-5 mb-5 rounded-2xl bg-gradient-to-br from-primary/20 to-accent/20 border border-primary/20"
        >
          <Upload className="w-12 h-12 text-primary" />
          <motion.div
            animate={{ scale: [1, 1.2, 1], opacity: [0.5, 1, 0.5] }}
            transition={{ duration: 2, repeat: Infinity }}
            className="absolute -top-1 -right-1"
          >
            <Sparkles className="w-4 h-4 text-accent" />
          </motion.div>
        </motion.div>
        
        <p className="relative text-xl font-semibold text-foreground mb-2">
          {isDragging ? 'Solte o vídeo aqui' : 'Arraste seu vídeo horizontal'}
        </p>
        <p className="relative text-sm text-muted-foreground">
          ou clique para selecionar • MP4, MOV, WebM até 4GB
        </p>
      </motion.div>

      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="mt-4 p-4 rounded-xl bg-destructive/10 border border-destructive/20 flex items-center gap-3"
          >
            <AlertCircle className="w-5 h-5 text-destructive shrink-0" />
            <p className="text-sm text-destructive">{error}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
