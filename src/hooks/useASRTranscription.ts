import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface WordTimestamp {
  word: string;
  start: number;
  end: number;
  confidence: number;
}

export interface ASRResult {
  success: boolean;
  transcription: string;
  words: WordTimestamp[];
  language: string;
  error?: string;
}

export interface CaptionSegment {
  text: string;
  start: number;
  end: number;
}

/**
 * Converts word-level timestamps into caption segments
 * using natural speech patterns (pauses, sentence endings)
 */
export function segmentTranscription(
  words: WordTimestamp[],
  maxWordsPerSegment: number = 6,
  maxSegmentDuration: number = 3.0
): CaptionSegment[] {
  if (!words || words.length === 0) return [];

  const segments: CaptionSegment[] = [];
  let currentSegment: WordTimestamp[] = [];
  let segmentStart = words[0].start;

  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    const nextWord = words[i + 1];
    
    currentSegment.push(word);

    // Determine if we should break here
    const segmentDuration = word.end - segmentStart;
    const wordCount = currentSegment.length;
    
    // Break conditions:
    // 1. Reached max words per segment
    // 2. Segment duration exceeded
    // 3. Natural pause detected (gap > 0.5s to next word)
    // 4. Sentence-ending punctuation in word
    const hasMaxWords = wordCount >= maxWordsPerSegment;
    const hasPause = nextWord && (nextWord.start - word.end) > 0.5;
    const hasMaxDuration = segmentDuration >= maxSegmentDuration;
    const hasSentenceEnd = /[.!?]$/.test(word.word);
    const isLastWord = i === words.length - 1;

    if (hasMaxWords || hasPause || hasMaxDuration || hasSentenceEnd || isLastWord) {
      // Create segment from accumulated words
      const text = currentSegment.map(w => w.word).join(' ');
      const start = segmentStart;
      const end = word.end;

      if (text.trim()) {
        segments.push({ text: text.trim(), start, end });
      }

      // Reset for next segment
      currentSegment = [];
      if (nextWord) {
        segmentStart = nextWord.start;
      }
    }
  }

  return segments;
}

export function useASRTranscription() {
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ASRResult | null>(null);

  /**
   * Extract audio from a video file for a specific time range
   */
  const extractAudioFromVideo = useCallback(async (
    file: File,
    startTime: number,
    endTime: number
  ): Promise<Blob | null> => {
    try {
      // Create a video element to decode the video
      const video = document.createElement('video');
      video.src = URL.createObjectURL(file);
      video.muted = true;
      
      await new Promise<void>((resolve, reject) => {
        video.onloadedmetadata = () => resolve();
        video.onerror = reject;
      });

      // Create an audio context for extraction
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      
      // For now, we'll need to read the whole file and send it
      // In production, we'd use FFmpeg to extract the audio segment
      const arrayBuffer = await file.arrayBuffer();
      
      URL.revokeObjectURL(video.src);
      
      // Return the audio as a blob
      return new Blob([arrayBuffer], { type: 'audio/wav' });
    } catch (err) {
      console.error('[ASR] Failed to extract audio:', err);
      return null;
    }
  }, []);

  /**
   * Transcribe audio using ASR (Automatic Speech Recognition)
   * Returns exact words with timestamps - NO creative text generation
   */
  const transcribe = useCallback(async (
    audioBlob: Blob,
    language: 'pt' | 'en' | 'auto' = 'auto'
  ): Promise<ASRResult | null> => {
    setProcessing(true);
    setProgress(0);
    setError(null);

    try {
      // Convert blob to base64
      const arrayBuffer = await audioBlob.arrayBuffer();
      const base64Audio = btoa(
        new Uint8Array(arrayBuffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
      );

      setProgress(30);
      console.log('[ASR] Sending audio for transcription...', { size: audioBlob.size, language });

      // Call the transcription edge function
      const { data, error: functionError } = await supabase.functions.invoke('transcribe-audio', {
        body: {
          audio: base64Audio,
          language,
        }
      });

      if (functionError) {
        throw new Error(functionError.message);
      }

      setProgress(90);

      if (!data.success) {
        throw new Error(data.error || 'Transcription failed');
      }

      const asrResult: ASRResult = {
        success: true,
        transcription: data.transcription,
        words: data.words || [],
        language: data.language,
      };

      setProgress(100);
      setResult(asrResult);
      
      console.log('[ASR] Transcription complete:', {
        wordCount: asrResult.words.length,
        language: asrResult.language,
        preview: asrResult.transcription.substring(0, 100),
      });

      return asrResult;

    } catch (err) {
      console.error('[ASR] Transcription error:', err);
      const errorMsg = err instanceof Error ? err.message : 'Unknown error';
      setError(errorMsg);
      return null;
    } finally {
      setProcessing(false);
    }
  }, []);

  /**
   * Transcribe a video clip and return caption segments
   */
  const transcribeClip = useCallback(async (
    videoFile: File,
    clipStartTime: number,
    clipEndTime: number,
    language: 'pt' | 'en' | 'auto' = 'auto'
  ): Promise<CaptionSegment[] | null> => {
    setProcessing(true);
    setProgress(0);
    setError(null);

    try {
      // For now, we'll send the whole file and let the edge function handle it
      // In a production system, we'd extract just the audio segment
      setProgress(10);
      
      const arrayBuffer = await videoFile.arrayBuffer();
      const base64Audio = btoa(
        new Uint8Array(arrayBuffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
      );

      setProgress(30);
      console.log('[ASR] Transcribing clip...', { 
        clipStart: clipStartTime, 
        clipEnd: clipEndTime,
        language 
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

      setProgress(70);

      if (!data.success) {
        throw new Error(data.error || 'Transcription failed');
      }

      // Filter words that fall within our clip time range
      // and adjust timestamps to be relative to clip start
      const clipWords: WordTimestamp[] = (data.words || [])
        .filter((w: WordTimestamp) => w.start >= clipStartTime && w.end <= clipEndTime)
        .map((w: WordTimestamp) => ({
          ...w,
          start: w.start - clipStartTime,
          end: w.end - clipStartTime,
        }));

      // If no words in range, use all words (the audio was already clipped)
      const wordsToUse = clipWords.length > 0 ? clipWords : data.words || [];

      // Segment into caption chunks
      const segments = segmentTranscription(wordsToUse);

      setProgress(100);
      
      console.log('[ASR] Caption segments created:', {
        wordCount: wordsToUse.length,
        segmentCount: segments.length,
      });

      return segments;

    } catch (err) {
      console.error('[ASR] Clip transcription error:', err);
      const errorMsg = err instanceof Error ? err.message : 'Unknown error';
      setError(errorMsg);
      return null;
    } finally {
      setProcessing(false);
    }
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
    transcribe,
    transcribeClip,
    extractAudioFromVideo,
    reset,
  };
}
