import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface TranscribeRequest {
  audio: string; // base64 encoded audio (WAV 16kHz mono)
  language?: string; // 'pt', 'en', 'auto'
}

interface WordTimestamp {
  word: string;
  start: number;
  end: number;
  confidence: number;
}

interface TranscribeResponse {
  success: boolean;
  transcription: string;
  words: WordTimestamp[];
  language: string;
  error?: string;
}

/**
 * Estimate word timestamps based on audio duration and word positions.
 * This provides reasonable timing when the AI can't return precise timestamps.
 */
function estimateWordTimestamps(
  text: string,
  audioDurationMs: number
): WordTimestamp[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];

  // Estimate based on typical speech rate: ~150 words per minute = 2.5 words/sec
  // But use actual audio duration for better accuracy
  const totalDuration = audioDurationMs / 1000; // Convert to seconds
  
  // Calculate character-weighted timing for more natural distribution
  const totalChars = words.reduce((sum, w) => sum + w.length, 0);
  let currentTime = 0;
  
  return words.map((word, idx) => {
    // Weight by word length for more natural timing
    const wordWeight = word.length / totalChars;
    const wordDuration = Math.max(0.15, totalDuration * wordWeight);
    
    const start = Math.round(currentTime * 100) / 100;
    currentTime += wordDuration;
    const end = Math.round(currentTime * 100) / 100;
    
    // Add small gap between words
    currentTime += 0.05;
    
    return {
      word,
      start,
      end: Math.min(end, totalDuration),
      confidence: 0.85,
    };
  });
}

/**
 * Parse AI response to extract transcription and word timestamps.
 * Handles various response formats with robust fallbacks.
 */
function parseAIResponse(
  content: string,
  audioDurationMs: number,
  requestedLanguage: string
): { transcription: string; words: WordTimestamp[]; language: string } {
  // Try to extract JSON from the response
  let parsed: any = null;
  
  // Method 1: Direct JSON parse
  try {
    parsed = JSON.parse(content.trim());
  } catch {
    // Method 2: Extract from markdown code blocks
    const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      try {
        parsed = JSON.parse(jsonMatch[1].trim());
      } catch { /* continue to fallback */ }
    }
    
    // Method 3: Find JSON object in text
    if (!parsed) {
      const objectMatch = content.match(/\{[\s\S]*"transcription"[\s\S]*\}/);
      if (objectMatch) {
        try {
          parsed = JSON.parse(objectMatch[0]);
        } catch { /* continue to fallback */ }
      }
    }
  }
  
  // If we got valid JSON with transcription
  if (parsed && typeof parsed.transcription === "string") {
    const transcription = parsed.transcription.trim();
    let words = parsed.words || [];
    const language = parsed.language || requestedLanguage;
    
    // Validate and fix word timestamps
    if (Array.isArray(words) && words.length > 0) {
      // Check if timestamps are valid
      const hasValidTimestamps = words.every(
        (w: any) => 
          typeof w.word === "string" &&
          typeof w.start === "number" &&
          typeof w.end === "number" &&
          w.start >= 0 &&
          w.end >= w.start
      );
      
      if (!hasValidTimestamps) {
        console.log("[TranscribeAudio] Invalid timestamps, re-estimating...");
        words = estimateWordTimestamps(transcription, audioDurationMs);
      } else {
        // Normalize confidence scores
        words = words.map((w: any) => ({
          word: String(w.word).trim(),
          start: Number(w.start),
          end: Number(w.end),
          confidence: typeof w.confidence === "number" ? w.confidence : 0.9,
        }));
      }
    } else if (transcription) {
      // No words array, estimate from transcription
      words = estimateWordTimestamps(transcription, audioDurationMs);
    }
    
    return { transcription, words, language };
  }
  
  // Fallback: Extract plain text transcription
  const plainText = content
    .replace(/```[\s\S]*?```/g, "")
    .replace(/\{[\s\S]*?\}/g, "")
    .replace(/^[^a-zA-ZÀ-ÿ]+/, "") // Remove leading non-letter chars
    .trim();
  
  if (plainText && plainText.length > 3) {
    return {
      transcription: plainText,
      words: estimateWordTimestamps(plainText, audioDurationMs),
      language: requestedLanguage === "auto" ? "unknown" : requestedLanguage,
    };
  }
  
  return { transcription: "", words: [], language: requestedLanguage };
}

/**
 * Estimate audio duration from base64 WAV data.
 * WAV 16kHz mono 16-bit: duration = (dataSize / 2) / 16000
 */
function estimateAudioDuration(base64Audio: string): number {
  try {
    // Base64 to byte count: base64.length * 0.75
    const byteCount = base64Audio.length * 0.75;
    // WAV header is 44 bytes, data is the rest
    // 16kHz mono 16-bit = 32000 bytes per second
    const dataBytes = Math.max(0, byteCount - 44);
    return (dataBytes / 32000) * 1000; // Return in milliseconds
  } catch {
    return 10000; // Default 10 seconds
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const body: TranscribeRequest = await req.json();
    const { audio, language = "auto" } = body;

    if (!audio) {
      return new Response(
        JSON.stringify({ success: false, error: "No audio provided" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const audioDurationMs = estimateAudioDuration(audio);
    console.log("[TranscribeAudio] Starting transcription...");
    console.log("[TranscribeAudio] Audio size:", audio.length, "chars (base64)");
    console.log("[TranscribeAudio] Estimated duration:", (audioDurationMs / 1000).toFixed(2), "seconds");
    console.log("[TranscribeAudio] Requested language:", language);

    // Use the most advanced model for accurate transcription
    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-pro", // Most accurate model for ASR
        messages: [
          {
            role: "system",
            content: `You are a professional speech-to-text transcription system. Your ONLY job is to transcribe audio EXACTLY as spoken.

CRITICAL REQUIREMENTS:
1. Transcribe EXACTLY what you hear - word for word, no modifications
2. DO NOT summarize, paraphrase, improve, or rewrite anything
3. DO NOT add words that were not spoken
4. DO NOT remove words that were spoken
5. Preserve the EXACT language of the audio (Portuguese, English, etc.)
6. Include filler words (uh, um, né, tipo, like, etc.)
7. Include repetitions and stutters
8. Mark unclear words with [inaudible]

TIMESTAMP REQUIREMENTS:
- Provide start and end times for EACH word in seconds
- Timestamps must be sequential and non-overlapping
- Start time of word N+1 must be >= end time of word N
- All timestamps must be positive numbers
- Maximum timestamp should not exceed ${(audioDurationMs / 1000).toFixed(2)} seconds

OUTPUT FORMAT (JSON only, no markdown):
{
  "transcription": "exact transcription text",
  "words": [
    {"word": "first", "start": 0.00, "end": 0.35, "confidence": 0.95},
    {"word": "second", "start": 0.40, "end": 0.75, "confidence": 0.92}
  ],
  "language": "pt" or "en" or detected code
}

If no speech is detected, return:
{"transcription": "", "words": [], "language": "${language}"}`
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `Transcribe this audio EXACTLY as spoken. Return ONLY valid JSON with word-level timestamps.${language !== "auto" ? ` The audio is in ${language === "pt" ? "Portuguese" : "English"}.` : ""} Audio duration: approximately ${(audioDurationMs / 1000).toFixed(1)} seconds.`
              },
              {
                type: "input_audio",
                input_audio: {
                  data: audio,
                  format: "wav"
                }
              }
            ]
          }
        ],
        temperature: 0.0, // Zero temperature for maximum accuracy
        max_tokens: 8000, // Allow longer transcriptions
      }),
    });

    if (!aiResponse.ok) {
      if (aiResponse.status === 429) {
        return new Response(
          JSON.stringify({ success: false, error: "Rate limit exceeded. Please try again later." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (aiResponse.status === 402) {
        return new Response(
          JSON.stringify({ success: false, error: "Credits exhausted." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const errorText = await aiResponse.text();
      console.error("[TranscribeAudio] AI Gateway error:", aiResponse.status, errorText);
      throw new Error(`AI Gateway error: ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();
    const content = aiData.choices?.[0]?.message?.content || "";

    console.log("[TranscribeAudio] Raw response length:", content.length);
    console.log("[TranscribeAudio] Response preview:", content.substring(0, 300));

    // Parse the response with robust handling
    const result = parseAIResponse(content, audioDurationMs, language);

    // Validate: if no transcription found
    if (!result.transcription && result.words.length === 0) {
      console.log("[TranscribeAudio] No speech detected in audio");
      return new Response(
        JSON.stringify({
          success: true,
          transcription: "",
          words: [],
          language: result.language,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("[TranscribeAudio] Transcription complete:", {
      wordCount: result.words.length,
      language: result.language,
      preview: result.transcription.substring(0, 100),
      firstWord: result.words[0],
      lastWord: result.words[result.words.length - 1],
    });

    const response: TranscribeResponse = {
      success: true,
      transcription: result.transcription,
      words: result.words,
      language: result.language,
    };

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("[TranscribeAudio] Error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});