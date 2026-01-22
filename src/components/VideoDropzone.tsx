import { useCallback, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Upload, Film, X, AlertCircle } from 'lucide-react';

interface VideoDropzoneProps {
  onFileSelect: (file: File) => void;
  selectedFile: File | null;
  onClear: () => void;
}

export function VideoDropzone({ onFileSelect, selectedFile, onClear }: VideoDropzoneProps) {
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
    const validTypes = ['video/mp4', 'video/quicktime', 'video/x-m4v'];
    if (!validTypes.includes(file.type)) {
      setError('Formato inválido. Use MP4 ou MOV.');
      return false;
    }
    if (file.size > 2 * 1024 * 1024 * 1024) { // 2GB limit
      setError('Arquivo muito grande. Máximo 2GB.');
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
    if (files && files.length > 0) {
      const file = files[0];
      if (validateFile(file)) {
        onFileSelect(file);
      }
    }
  }, [onFileSelect]);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      const file = files[0];
      if (validateFile(file)) {
        onFileSelect(file);
      }
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
        className="relative p-6 rounded-xl glass gradient-border"
      >
        <div className="flex items-center gap-4">
          <div className="p-3 rounded-lg bg-primary/20">
            <Film className="w-8 h-8 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-medium text-foreground truncate">{selectedFile.name}</p>
            <p className="text-sm text-muted-foreground">{formatFileSize(selectedFile.size)}</p>
          </div>
          <button
            onClick={onClear}
            className="p-2 rounded-lg hover:bg-secondary transition-colors"
          >
            <X className="w-5 h-5 text-muted-foreground" />
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
          backgroundColor: isDragging ? 'hsl(var(--primary) / 0.1)' : 'transparent',
        }}
        className="relative flex flex-col items-center justify-center p-12 border-2 border-dashed rounded-xl cursor-pointer transition-all hover:border-primary/50 hover:bg-primary/5"
      >
        <input
          type="file"
          accept="video/mp4,video/quicktime,.mp4,.mov"
          onChange={handleFileInput}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
        />
        
        <motion.div
          animate={{ 
            scale: isDragging ? 1.1 : 1,
            rotate: isDragging ? 5 : 0,
          }}
          className="p-4 mb-4 rounded-full bg-primary/20"
        >
          <Upload className="w-10 h-10 text-primary" />
        </motion.div>
        
        <p className="text-lg font-medium text-foreground mb-2">
          {isDragging ? 'Solte o vídeo aqui' : 'Arraste seu vídeo aqui'}
        </p>
        <p className="text-sm text-muted-foreground">
          ou clique para selecionar • MP4, MOV até 2GB
        </p>
      </motion.div>

      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="mt-4 p-4 rounded-lg bg-destructive/10 border border-destructive/20 flex items-center gap-3"
          >
            <AlertCircle className="w-5 h-5 text-destructive" />
            <p className="text-sm text-destructive">{error}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
