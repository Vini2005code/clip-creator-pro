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

// Minimum confidence threshold - words below this are rejected
const CONFIDENCE_THRESHOLD = 0.5;

// Patterns that indicate invalid/garbage tokens
const INVALID_TOKEN_PATTERNS = [
  /^[,.\-_:;!?]+$/, // Only punctuation
  /^json$/i, // Common AI garbage
  /^\[.*\]$/, // Bracketed placeholders (except [inaudible])
  /^[0-9.]+$/, // Only numbers (timestamps leaked)
  /^[a-z]$/, // Single letters
  /^(null|undefined|true|false)$/i, // Programming tokens
  /^(start|end|word|confidence)$/i, // JSON keys leaked
];

// Words that are clearly not speech
const GARBAGE_WORDS = new Set([
  'json', 'null', 'undefined', 'true', 'false',
  'object', 'array', 'string', 'number', 'boolean',
]);

/**
 * Validate if a word token is valid speech
 */
function isValidWord(word: string): boolean {
  if (!word || typeof word !== 'string') return false;
  
  const trimmed = word.trim();
  if (trimmed.length === 0) return false;
  
  // Allow [inaudible] marker
  if (trimmed.toLowerCase() === '[inaudible]') return true;
  
  // Check against invalid patterns
  for (const pattern of INVALID_TOKEN_PATTERNS) {
    if (pattern.test(trimmed)) return false;
  }
  
  // Check against known garbage words
  if (GARBAGE_WORDS.has(trimmed.toLowerCase())) return false;
  
  // Must contain at least one letter (any language)
  if (!/[\p{L}]/u.test(trimmed)) return false;
  
  return true;
}

/**
 * Clean and normalize a word while preserving proper nouns
 */
function cleanWord(word: string): string {
  let cleaned = word.trim();
  
  // Remove leading/trailing punctuation except apostrophes
  cleaned = cleaned.replace(/^[^\p{L}]+/u, '');
  cleaned = cleaned.replace(/[^\p{L}']+$/u, '');
  
  // Preserve internal punctuation (apostrophes, hyphens in names)
  return cleaned;
}

/**
 * Conservative post-processing: only remove invalid tokens and fix basic punctuation
 * NEVER modifies the actual transcribed words
 */
function postProcessWords(words: WordTimestamp[]): WordTimestamp[] {
  const cleaned: WordTimestamp[] = [];
  
  for (const w of words) {
    // Skip low confidence words
    if (w.confidence < CONFIDENCE_THRESHOLD) {
      console.log(`[PostProcess] Skipping low confidence word: "${w.word}" (${w.confidence})`);
      continue;
    }
    
    // Validate word is real speech
    if (!isValidWord(w.word)) {
      console.log(`[PostProcess] Removing invalid token: "${w.word}"`);
      continue;
    }
    
    // Clean the word conservatively
    const cleanedWord = cleanWord(w.word);
    if (!cleanedWord || cleanedWord.length === 0) {
      continue;
    }
    
    cleaned.push({
      word: cleanedWord,
      start: w.start,
      end: w.end,
      confidence: w.confidence,
    });
  }
  
  return cleaned;
}

/**
 * Validate timestamp sequence - ensure non-overlapping and sequential
 */
function validateTimestamps(words: WordTimestamp[], maxDuration: number): WordTimestamp[] {
  const validated: WordTimestamp[] = [];
  let lastEnd = 0;
  
  for (const w of words) {
    let start = Math.max(w.start, lastEnd);
    let end = Math.max(w.end, start + 0.1);
    
    // Clamp to max duration
    if (start >= maxDuration) break;
    end = Math.min(end, maxDuration);
    
    validated.push({
      word: w.word,
      start: Math.round(start * 100) / 100,
      end: Math.round(end * 100) / 100,
      confidence: w.confidence,
    });
    
    lastEnd = end + 0.02; // Small gap between words
  }
  
  return validated;
}

/**
 * Estimate word timestamps based on audio duration and word positions.
 * Uses character-weighted timing for natural distribution.
 */
function estimateWordTimestamps(
  text: string,
  audioDurationMs: number
): WordTimestamp[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];

  const totalDuration = audioDurationMs / 1000;
  const totalChars = words.reduce((sum, w) => sum + w.length, 0);
  let currentTime = 0;
  
  const result: WordTimestamp[] = [];
  
  for (const word of words) {
    // Skip invalid words during estimation
    if (!isValidWord(word)) continue;
    
    const cleanedWord = cleanWord(word);
    if (!cleanedWord) continue;
    
    const wordWeight = word.length / totalChars;
    const wordDuration = Math.max(0.15, totalDuration * wordWeight * 0.9);
    
    const start = Math.round(currentTime * 100) / 100;
    currentTime += wordDuration;
    const end = Math.round(Math.min(currentTime, totalDuration) * 100) / 100;
    currentTime += 0.05;
    
    result.push({
      word: cleanedWord,
      start,
      end,
      confidence: 0.85,
    });
  }
  
  return result;
}

/**
 * Validate final transcription is readable human speech
 */
function isValidTranscription(text: string): boolean {
  if (!text || text.length < 2) return false;
  
  // Must have at least some letters
  const letterCount = (text.match(/[\p{L}]/gu) || []).length;
  if (letterCount < 3) return false;
  
  // Check ratio of letters to total characters
  const letterRatio = letterCount / text.length;
  if (letterRatio < 0.5) return false;
  
  // Check for garbage patterns
  if (/json|null|undefined|\[\s*\]|\{\s*\}/i.test(text)) return false;
  
  // Check for repeated punctuation garbage
  if (/[,.\-_:;]{3,}/.test(text)) return false;
  
  return true;
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
  const maxDuration = audioDurationMs / 1000;
  
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
    const rawTranscription = parsed.transcription.trim();
    const detectedLanguage = parsed.language || requestedLanguage;
    let words: WordTimestamp[] = [];
    
    // Validate transcription is real speech
    if (!isValidTranscription(rawTranscription)) {
      console.log("[TranscribeAudio] Invalid transcription detected, returning empty");
      return { transcription: "", words: [], language: detectedLanguage };
    }
    
    // Process word timestamps if available
    if (Array.isArray(parsed.words) && parsed.words.length > 0) {
      // Convert to proper format
      const rawWords: WordTimestamp[] = parsed.words
        .filter((w: any) => w && typeof w.word === "string")
        .map((w: any) => ({
          word: String(w.word).trim(),
          start: typeof w.start === "number" ? w.start : 0,
          end: typeof w.end === "number" ? w.end : 0,
          confidence: typeof w.confidence === "number" ? w.confidence : 0.9,
        }));
      
      // Post-process: remove invalid tokens, apply confidence threshold
      words = postProcessWords(rawWords);
      
      // Validate timestamps
      words = validateTimestamps(words, maxDuration);
      
      // If post-processing removed too many words, re-estimate
      if (words.length < rawWords.length * 0.3 && rawTranscription) {
        console.log("[TranscribeAudio] Too many words filtered, re-estimating timestamps");
        words = estimateWordTimestamps(rawTranscription, audioDurationMs);
      }
    } else if (rawTranscription) {
      // No words array, estimate from transcription
      words = estimateWordTimestamps(rawTranscription, audioDurationMs);
    }
    
    // Rebuild transcription from cleaned words
    const cleanedTranscription = words.map(w => w.word).join(' ');
    
    return { 
      transcription: cleanedTranscription || rawTranscription, 
      words, 
      language: detectedLanguage 
    };
  }
  
  // Fallback: Extract plain text transcription
  const plainText = content
    .replace(/```[\s\S]*?```/g, "")
    .replace(/\{[\s\S]*?\}/g, "")
    .replace(/^[^a-zA-ZÀ-ÿ\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff]+/, "")
    .trim();
  
  if (plainText && isValidTranscription(plainText)) {
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
    const byteCount = base64Audio.length * 0.75;
    const dataBytes = Math.max(0, byteCount - 44);
    return (dataBytes / 32000) * 1000;
  } catch {
    return 10000;
  }
}

/**
 * Get language name for prompt
 */
function getLanguageName(code: string): string {
  const languages: Record<string, string> = {
    'pt': 'Brazilian Portuguese',
    'en': 'English',
    'es': 'Spanish',
    'fr': 'French',
    'de': 'German',
    'it': 'Italian',
    'auto': 'the language spoken in the audio',
  };
  return languages[code] || languages['auto'];
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
    const maxDuration = (audioDurationMs / 1000).toFixed(2);
    const languageName = getLanguageName(language);
    
    console.log("[TranscribeAudio] Starting transcription...");
    console.log("[TranscribeAudio] Audio size:", audio.length, "chars (base64)");
    console.log("[TranscribeAudio] Estimated duration:", maxDuration, "seconds");
    console.log("[TranscribeAudio] Language:", language, "->", languageName);

    // Build system prompt with strict ASR requirements
    const systemPrompt = `You are a professional speech-to-text transcription engine. Transcribe audio EXACTLY as spoken.

## CRITICAL RULES - ABSOLUTE REQUIREMENTS:

### 1. LANGUAGE LOCK
- Detect the spoken language ONCE at the start
- Use ONLY that language for the ENTIRE transcription
- NEVER mix languages or switch mid-transcription
- For "${language !== 'auto' ? languageName : 'unknown'}" audio: transcribe in that language only

### 2. EXACT TRANSCRIPTION
- Write EXACTLY what you hear - every word, every sound
- Include filler words: "uh", "um", "né", "tipo", "like", "you know"
- Include stutters and repetitions: "I-I think", "ele ele disse"
- Include false starts: "I went— I mean, I walked"
- NEVER summarize, paraphrase, or "clean up" speech
- NEVER add words that weren't spoken
- NEVER remove words that were spoken

### 3. PROPER NOUNS
- Transcribe names EXACTLY as heard
- "Jason" stays "Jason" (never "json")
- "Michael" stays "Michael" (never "mikal")
- Prioritize literal spelling over phonetic interpretation
- When uncertain, use most common spelling

### 4. UNCLEAR AUDIO
- Mark genuinely inaudible sections as: [inaudible]
- Do NOT guess or fill in unclear words
- Better to omit than invent
- NEVER use placeholder punctuation like ", , ," or "..."

### 5. CONFIDENCE SCORES
- Provide confidence (0.0-1.0) for EACH word
- High (0.9+): clearly heard
- Medium (0.7-0.9): mostly clear
- Low (<0.7): uncertain - mark as [inaudible] instead of guessing

### 6. FORBIDDEN OUTPUT
- NEVER output: json, null, undefined, true, false
- NEVER output programming syntax or JSON keys as words
- NEVER output standalone punctuation as words
- NEVER output timestamps as transcription text
- NEVER invent text to fill silence

### 7. TIMESTAMP REQUIREMENTS
- Every word gets start/end times in seconds
- Timestamps must be sequential (no overlap)
- word[n+1].start >= word[n].end
- Maximum timestamp: ${maxDuration} seconds
- Precision: 2 decimal places

## OUTPUT FORMAT (valid JSON only, no markdown):
{
  "transcription": "exact word-for-word transcription",
  "words": [
    {"word": "Hello", "start": 0.00, "end": 0.35, "confidence": 0.98},
    {"word": "world", "start": 0.40, "end": 0.72, "confidence": 0.95}
  ],
  "language": "pt" // ISO 639-1 code of detected/specified language
}

If NO SPEECH is detected, return exactly:
{"transcription": "", "words": [], "language": "${language}"}`;

    const userPrompt = `Transcribe this audio EXACTLY as spoken. Return ONLY valid JSON.
${language !== 'auto' ? `\nIMPORTANT: This audio is in ${languageName}. Transcribe ONLY in ${languageName}.` : ''}
Audio duration: approximately ${maxDuration} seconds.`;

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-pro",
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: [
              { type: "text", text: userPrompt },
              {
                type: "input_audio",
                input_audio: { data: audio, format: "wav" }
              }
            ]
          }
        ],
        temperature: 0.0, // Zero temperature for deterministic output
        max_tokens: 8000,
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
    console.log("[TranscribeAudio] Response preview:", content.substring(0, 500));

    // Parse with robust validation and post-processing
    const result = parseAIResponse(content, audioDurationMs, language);

    // Final validation
    if (!result.transcription && result.words.length === 0) {
      console.log("[TranscribeAudio] No valid speech detected");
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
