import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface SmartCaptionConfig {
  enabled: boolean;
  outputLanguage: 'en' | 'pt';
  enableRehook: boolean;
  rehookStyle: 'curiosity' | 'conflict' | 'promise';
  retentionAdjust: boolean;
  captionStyle: 'modern' | 'bold' | 'minimal';
  primaryColor: string;
  secondaryColor: string;
}

export interface TranscriptionWord {
  word: string;
  start: number;
  end: number;
  confidence: number;
}

export interface SmartCaption {
  text: string;
  start: number;
  end: number;
  keywords: string[];
  isHook: boolean;
}

export interface RehookSuggestion {
  text: string;
  style: 'curiosity' | 'conflict' | 'promise';
}

export interface SmartCaptionResult {
  transcription: string;
  words: TranscriptionWord[];
  captions: SmartCaption[];
  rehook: RehookSuggestion | null;
  suggestedStartTime: number;
  suggestedEndTime: number;
}

export const DEFAULT_SMART_CAPTION_CONFIG: SmartCaptionConfig = {
  enabled: false,
  outputLanguage: 'pt',
  enableRehook: true,
  rehookStyle: 'curiosity',
  retentionAdjust: true,
  captionStyle: 'modern',
  primaryColor: '#FFFFFF',
  secondaryColor: '#FFD700',
};

export function useSmartCaption() {
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SmartCaptionResult | null>(null);

  const processClip = useCallback(async (
    audioBlob: Blob,
    clipStartTime: number,
    clipEndTime: number,
    config: SmartCaptionConfig
  ): Promise<SmartCaptionResult | null> => {
    if (!config.enabled) return null;
    
    setProcessing(true);
    setProgress(0);
    setError(null);
    
    try {
      // Convert blob to base64 for transmission
      const arrayBuffer = await audioBlob.arrayBuffer();
      const base64Audio = btoa(
        new Uint8Array(arrayBuffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
      );
      
      setProgress(20);
      
      // Call edge function for transcription and semantic analysis
      const { data, error: functionError } = await supabase.functions.invoke('smart-caption', {
        body: {
          audio: base64Audio,
          startTime: clipStartTime,
          endTime: clipEndTime,
          outputLanguage: config.outputLanguage,
          enableRehook: config.enableRehook,
          rehookStyle: config.rehookStyle,
          retentionAdjust: config.retentionAdjust,
        }
      });
      
      if (functionError) {
        throw new Error(functionError.message);
      }
      
      setProgress(100);
      setResult(data);
      return data;
      
    } catch (err) {
      console.error('[SmartCaption] Error:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
      return null;
    } finally {
      setProcessing(false);
    }
  }, []);

  const generateCaptionOverlay = useCallback((
    caption: SmartCaption,
    config: SmartCaptionConfig,
    videoWidth: number,
    videoHeight: number
  ): string => {
    // Generate FFmpeg drawtext filter for this caption
    const fontSize = Math.round(videoHeight * 0.045);
    const y = Math.round(videoHeight * 0.85);
    
    // Escape text for FFmpeg
    const escapedText = caption.text
      .replace(/'/g, "'\\''")
      .replace(/:/g, '\\:')
      .replace(/\\/g, '\\\\');
    
    // Highlight keywords by using different styling
    let text = escapedText;
    caption.keywords.forEach(keyword => {
      text = text.replace(
        new RegExp(`\\b${keyword}\\b`, 'gi'),
        `{\\c&H${config.secondaryColor.slice(1)}&}${keyword}{\\c&H${config.primaryColor.slice(1)}&}`
      );
    });
    
    const fontStyle = config.captionStyle === 'bold' ? 'bold' : 
                      config.captionStyle === 'minimal' ? '' : 'bold';
    
    return `drawtext=text='${text}':fontsize=${fontSize}:fontcolor=white:x=(w-text_w)/2:y=${y}:enable='between(t,${caption.start},${caption.end})'`;
  }, []);

  const reset = useCallback(() => {
    setProcessing(false);
    setProgress(0);
    setError(null);
    setResult(null);
  }, []);

  return {
    processing,
    progress,
    error,
    result,
    processClip,
    generateCaptionOverlay,
    reset,
  };
}
