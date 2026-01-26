import { useState, useCallback, useRef } from 'react';

export interface AudioPeak {
  time: number; // seconds
  intensity: number; // 0-1
}

export interface AudioAnalysisResult {
  peaks: AudioPeak[];
  suggestedCuts: number[]; // timestamps in seconds
  duration: number;
}

interface UseAudioAnalyzerOptions {
  minPeakDistance?: number; // minimum seconds between peaks
  numPeaks?: number; // number of top peaks to return
  clipDuration?: number; // desired clip duration for suggested cuts
}

export function useAudioAnalyzer(options: UseAudioAnalyzerOptions = {}) {
  const {
    minPeakDistance = 10,
    numPeaks = 10,
    clipDuration = 30,
  } = options;

  const [analyzing, setAnalyzing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<AudioAnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef(false);

  const analyzeAudio = useCallback(async (file: File): Promise<AudioAnalysisResult | null> => {
    setAnalyzing(true);
    setProgress(0);
    setError(null);
    setResult(null);
    abortRef.current = false;

    try {
      console.log('[AudioAnalyzer] Starting analysis...');

      // Create audio context
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      
      // Read file as array buffer
      setProgress(5);
      const arrayBuffer = await file.arrayBuffer();
      
      if (abortRef.current) {
        throw new Error('Analysis aborted');
      }

      // Decode audio
      setProgress(15);
      console.log('[AudioAnalyzer] Decoding audio...');
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
      
      const duration = audioBuffer.duration;
      const sampleRate = audioBuffer.sampleRate;
      const channelData = audioBuffer.getChannelData(0); // Use first channel
      
      console.log('[AudioAnalyzer] Audio decoded:', { duration, sampleRate, samples: channelData.length });

      if (abortRef.current) {
        throw new Error('Analysis aborted');
      }

      // Analyze audio in chunks to find peaks
      setProgress(25);
      console.log('[AudioAnalyzer] Finding peaks...');
      
      // Window size: ~100ms for granularity
      const windowSize = Math.floor(sampleRate * 0.1);
      const numWindows = Math.floor(channelData.length / windowSize);
      const windowEnergies: { time: number; energy: number }[] = [];

      for (let i = 0; i < numWindows; i++) {
        if (abortRef.current) {
          throw new Error('Analysis aborted');
        }

        const start = i * windowSize;
        const end = Math.min(start + windowSize, channelData.length);
        
        // Calculate RMS energy for this window
        let sum = 0;
        for (let j = start; j < end; j++) {
          sum += channelData[j] * channelData[j];
        }
        const rms = Math.sqrt(sum / (end - start));
        
        windowEnergies.push({
          time: (start + windowSize / 2) / sampleRate,
          energy: rms,
        });

        // Update progress
        if (i % 100 === 0) {
          setProgress(25 + Math.floor((i / numWindows) * 50));
        }
      }

      if (abortRef.current) {
        throw new Error('Analysis aborted');
      }

      setProgress(80);

      // Normalize energies
      const maxEnergy = Math.max(...windowEnergies.map(w => w.energy));
      const normalizedEnergies = windowEnergies.map(w => ({
        time: w.time,
        intensity: maxEnergy > 0 ? w.energy / maxEnergy : 0,
      }));

      // Find local maxima (peaks)
      const allPeaks: AudioPeak[] = [];
      const threshold = 0.3; // Only consider peaks above 30% of max

      for (let i = 1; i < normalizedEnergies.length - 1; i++) {
        const prev = normalizedEnergies[i - 1].intensity;
        const curr = normalizedEnergies[i].intensity;
        const next = normalizedEnergies[i + 1].intensity;

        if (curr > prev && curr > next && curr > threshold) {
          allPeaks.push({
            time: normalizedEnergies[i].time,
            intensity: curr,
          });
        }
      }

      console.log('[AudioAnalyzer] Found', allPeaks.length, 'raw peaks');

      // Filter peaks by minimum distance and select top N
      const filteredPeaks: AudioPeak[] = [];
      const sortedPeaks = [...allPeaks].sort((a, b) => b.intensity - a.intensity);

      for (const peak of sortedPeaks) {
        // Check if this peak is far enough from already selected peaks
        const tooClose = filteredPeaks.some(
          p => Math.abs(p.time - peak.time) < minPeakDistance
        );

        if (!tooClose) {
          filteredPeaks.push(peak);
          if (filteredPeaks.length >= numPeaks) break;
        }
      }

      // Sort by time
      filteredPeaks.sort((a, b) => a.time - b.time);

      console.log('[AudioAnalyzer] Filtered to', filteredPeaks.length, 'peaks');

      setProgress(90);

      // Calculate suggested cut points based on peaks
      // Each cut should start slightly before the peak for context
      const suggestedCuts: number[] = [];
      const halfClip = clipDuration / 2;

      for (const peak of filteredPeaks) {
        // Start the clip a few seconds before the peak
        let cutStart = Math.max(0, peak.time - halfClip);
        
        // Make sure the cut doesn't extend past the video duration
        if (cutStart + clipDuration > duration) {
          cutStart = Math.max(0, duration - clipDuration);
        }

        // Avoid duplicate cut points
        const isDuplicate = suggestedCuts.some(
          c => Math.abs(c - cutStart) < minPeakDistance
        );

        if (!isDuplicate) {
          suggestedCuts.push(Math.floor(cutStart));
        }
      }

      setProgress(100);

      const analysisResult: AudioAnalysisResult = {
        peaks: filteredPeaks,
        suggestedCuts: suggestedCuts.slice(0, numPeaks),
        duration,
      };

      console.log('[AudioAnalyzer] Analysis complete:', analysisResult);
      setResult(analysisResult);

      // Cleanup
      await audioContext.close();

      return analysisResult;
    } catch (err) {
      console.error('[AudioAnalyzer] Error:', err);
      setError(err instanceof Error ? err.message : 'Failed to analyze audio');
      return null;
    } finally {
      setAnalyzing(false);
    }
  }, [minPeakDistance, numPeaks, clipDuration]);

  const abort = useCallback(() => {
    abortRef.current = true;
  }, []);

  const reset = useCallback(() => {
    setResult(null);
    setError(null);
    setProgress(0);
    abortRef.current = false;
  }, []);

  return {
    analyzeAudio,
    analyzing,
    progress,
    result,
    error,
    abort,
    reset,
  };
}
