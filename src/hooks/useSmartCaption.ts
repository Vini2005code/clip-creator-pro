import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { segmentTranscription, WordTimestamp } from './useASRTranscription';

export interface SmartCaptionConfig {
  enabled: boolean;
  outputLanguage: 'en' | 'pt';
  enableRehook: boolean;
  rehookStyle: 'curiosity' | 'conflict' | 'promise';
  retentionAdjust: boolean;
  captionStyle: 'modern' | 'bold' | 'minimal';
  captionPosition: 'top' | 'center' | 'bottom';
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
  isHook?: boolean;
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
  enabled: true,
  outputLanguage: 'pt',
  enableRehook: false, // Disabled by default - ASR is the source of truth
  rehookStyle: 'curiosity',
  retentionAdjust: false,
  captionStyle: 'modern',
  captionPosition: 'bottom',
  primaryColor: '#FFFFFF',
  secondaryColor: '#FFD700',
};

export function useSmartCaption() {
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SmartCaptionResult | null>(null);

  /**
   * Transcribe audio using ASR and return caption segments
   * NO creative generation - only faithful transcription
   */
  const transcribeAudio = useCallback(async (
    audioBlob: Blob,
    language: 'pt' | 'en' | 'auto' = 'auto',
    retryCount: number = 0
  ): Promise<{ transcription: string; words: WordTimestamp[] } | null> => {
    const maxRetries = 2;
    
    try {
      // Convert blob to base64
      const arrayBuffer = await audioBlob.arrayBuffer();
      const base64Audio = btoa(
        new Uint8Array(arrayBuffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
      );

      console.log('[SmartCaption] Calling ASR transcription...', { 
        size: audioBlob.size, 
        language,
        attempt: retryCount + 1 
      });

      const { data, error: functionError } = await supabase.functions.invoke('transcribe-audio', {
        body: {
          audio: base64Audio,
          language,
        }
      });

      if (functionError) {
        throw new Error(functionError.message);
      }

      if (!data.success) {
        throw new Error(data.error || 'Transcription failed');
      }

      // Validate: if no transcription, retry
      if (!data.transcription && (!data.words || data.words.length === 0)) {
        if (retryCount < maxRetries) {
          console.warn('[SmartCaption] No speech detected, retrying...');
          return transcribeAudio(audioBlob, language, retryCount + 1);
        }
        console.warn('[SmartCaption] No speech detected after retries');
        return null; // No speech - don't fake it
      }

      return {
        transcription: data.transcription,
        words: data.words || [],
      };

    } catch (err) {
      console.error('[SmartCaption] ASR error:', err);
      
      // Retry on transient errors
      if (retryCount < maxRetries) {
        console.log('[SmartCaption] Retrying transcription...');
        return transcribeAudio(audioBlob, language, retryCount + 1);
      }
      
      return null; // Never return fake captions
    }
  }, []);

  /**
   * Process a video clip to generate captions from ASR
   * CRITICAL: Captions are ONLY from real speech transcription
   */
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
      const clipDuration = clipEndTime - clipStartTime;
      
      setProgress(10);
      
      // Step 1: Get real ASR transcription
      const asrResult = await transcribeAudio(
        audioBlob, 
        config.outputLanguage === 'pt' ? 'pt' : config.outputLanguage === 'en' ? 'en' : 'auto'
      );
      
      setProgress(60);

      // CRITICAL: If no transcription, return null - NEVER generate fake captions
      if (!asrResult || (!asrResult.transcription && asrResult.words.length === 0)) {
        console.warn('[SmartCaption] No speech detected in audio - no captions will be generated');
        setError('Nenhuma fala detectada no áudio');
        return null;
      }

      // Step 2: Segment transcription into caption chunks
      // Using natural speech patterns (pauses, sentence endings)
      const segments = segmentTranscription(asrResult.words, 6, 3.0);
      
      setProgress(80);

      // Step 3: Convert segments to SmartCaption format
      // NO keyword highlighting or creative additions - just the real text
      const captions: SmartCaption[] = segments.map(seg => ({
        text: seg.text,
        start: seg.start,
        end: seg.end,
        keywords: [], // No AI-generated keywords - pure transcription
        isHook: false,
      }));

      setProgress(90);

      // Validate all captions have valid timestamps
      const validCaptions = captions.filter(c => {
        if (c.start < 0 || c.end < 0) return false;
        if (c.end <= c.start) return false;
        if (c.end > clipDuration) return false;
        if (!c.text.trim()) return false;
        return true;
      });

      if (validCaptions.length === 0) {
        console.warn('[SmartCaption] No valid captions after validation');
        setError('Não foi possível criar legendas válidas');
        return null;
      }

      const result: SmartCaptionResult = {
        transcription: asrResult.transcription,
        words: asrResult.words,
        captions: validCaptions,
        rehook: null, // No creative hooks - ASR only
        suggestedStartTime: clipStartTime,
        suggestedEndTime: clipEndTime,
      };
      
      setProgress(100);
      setResult(result);
      
      console.log('[SmartCaption] ASR captions generated:', {
        wordCount: asrResult.words.length,
        captionCount: validCaptions.length,
        duration: clipDuration,
      });
      
      return result;
      
    } catch (err) {
      console.error('[SmartCaption] Error:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
      return null; // NEVER return fake captions
    } finally {
      setProcessing(false);
    }
  }, [transcribeAudio]);

  const generateCaptionOverlay = useCallback((
    caption: SmartCaption,
    config: SmartCaptionConfig,
    videoWidth: number,
    videoHeight: number
  ): string => {
    // Generate FFmpeg drawtext filter for this caption
    const fontSize = Math.round(videoHeight * 0.045);
    const yPosition = config.captionPosition === 'top' ? 0.15 
                    : config.captionPosition === 'center' ? 0.50 
                    : 0.85;
    const y = Math.round(videoHeight * yPosition);
    
    // Escape text for FFmpeg - preserve original text exactly
    const escapedText = caption.text
      .replace(/'/g, "'\\''")
      .replace(/:/g, '\\:')
      .replace(/\\/g, '\\\\');
    
    return `drawtext=text='${escapedText}':fontsize=${fontSize}:fontcolor=white:x=(w-text_w)/2:y=${y}:enable='between(t,${caption.start},${caption.end})'`;
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
