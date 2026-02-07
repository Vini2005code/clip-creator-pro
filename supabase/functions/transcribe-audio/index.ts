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
  
  // Explicit check: if the entire text is just "json" (case insensitive), reject
  const normalized = text.trim().toLowerCase();
  if (normalized === 'json' || normalized === 'json.' || normalized === '"json"') return false;
  
  // Must have at least some letters
  const letterCount = (text.match(/[\p{L}]/gu) || []).length;
  if (letterCount < 3) return false;
  
  // Check ratio of letters to total characters
  const letterRatio = letterCount / text.length;
  if (letterRatio < 0.5) return false;
  
  // Check for garbage patterns - whole text is garbage
  if (/^(json|null|undefined|true|false)$/i.test(normalized)) return false;
  
  // Check if text is mostly garbage keywords
  const garbagePattern = /\b(json|null|undefined|true|false|object|array|string|number|boolean)\b/gi;
  const garbageMatches = text.match(garbagePattern) || [];
  const wordCount = text.split(/\s+/).length;
  if (garbageMatches.length > wordCount * 0.3) return false;
  
  // Check for repeated punctuation garbage
  if (/[,.\-_:;]{3,}/.test(text)) return false;
  
  // Check for JSON-like structures leaked into text
  if (/\[\s*\]|\{\s*\}/.test(text)) return false;
  
  return true;
}

/**
 * Parse AI response to extract transcription and word timestamps.
 * Handles various response formats with robust fallbacks.
 */
function extractJsonFromText(content: string): any | null {
  // Strategy 1: Direct JSON parse (cleanest case)
  try {
    const trimmed = content.trim();
    if (trimmed.startsWith('{')) {
      return JSON.parse(trimmed);
    }
  } catch { /* continue */ }

  // Strategy 2: Extract from markdown code blocks
  const codeBlockMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) {
    try {
      return JSON.parse(codeBlockMatch[1].trim());
    } catch { /* continue */ }
  }

  // Strategy 3: Find the outermost JSON object using bracket matching
  // This is the KEY fix - find the first '{' and match to its closing '}'
  const firstBrace = content.indexOf('{');
  if (firstBrace !== -1) {
    let depth = 0;
    let lastBrace = -1;
    for (let i = firstBrace; i < content.length; i++) {
      if (content[i] === '{') depth++;
      else if (content[i] === '}') {
        depth--;
        if (depth === 0) {
          lastBrace = i;
          break;
        }
      }
    }
    if (lastBrace !== -1) {
      const candidate = content.substring(firstBrace, lastBrace + 1);
      try {
        return JSON.parse(candidate);
      } catch {
        console.log("[TranscribeAudio] Bracket-matched JSON failed to parse, length:", candidate.length);
      }
    }
  }

  return null;
}

function parseAIResponse(
  content: string,
  audioDurationMs: number,
  requestedLanguage: string
): { transcription: string; words: WordTimestamp[]; language: string } {
  const maxDuration = audioDurationMs / 1000;

  console.log("[TranscribeAudio] Parsing response, length:", content.length);

  // Extract JSON using robust strategies
  const parsed = extractJsonFromText(content);

  // If we got valid JSON with transcription
  if (parsed && typeof parsed.transcription === "string") {
    const rawTranscription = parsed.transcription.trim();
    const detectedLanguage = parsed.language || requestedLanguage;
    let words: WordTimestamp[] = [];

    console.log("[TranscribeAudio] Extracted transcription:", rawTranscription.substring(0, 120));

    // Validate transcription is real speech
    if (!isValidTranscription(rawTranscription)) {
      console.log("[TranscribeAudio] Invalid transcription detected, returning empty");
      return { transcription: "", words: [], language: detectedLanguage };
    }

    // Process word timestamps if available
    if (Array.isArray(parsed.words) && parsed.words.length > 0) {
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

  // NO plainText fallback - if JSON extraction failed, return empty
  // This prevents "json", "Here is your json", etc. from leaking as captions
  console.log("[TranscribeAudio] Failed to extract valid JSON from AI response. Returning empty.");
  console.log("[TranscribeAudio] Response preview:", content.substring(0, 300));
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
    const systemPrompt = `You are a speech-to-text engine. Your ONLY output is a single raw JSON object. No markdown, no explanations, no greetings, no code fences.

RULES:
1. LANGUAGE: Detect language ONCE. Use ONLY that language for entire transcription.${language !== 'auto' ? ` Expected: ${languageName}.` : ''}
2. FIDELITY: Transcribe EXACTLY what is spoken. Include fillers (uh, um, né, tipo). Include stutters. NEVER paraphrase.
3. NAMES: "Jason" = "Jason" (NEVER "json"). Use common spelling for proper nouns.
4. UNCLEAR: Use [inaudible] for genuinely unclear audio. NEVER guess. NEVER fill silence with text.
5. CONFIDENCE: Score each word 0.0-1.0. Below 0.7 = use [inaudible].
6. TIMESTAMPS: Sequential, non-overlapping, max ${maxDuration}s, 2 decimal places.
7. FORBIDDEN in transcription field: json, null, undefined, true, false, {, }, [, ], repeated commas/punctuation.

OUTPUT FORMAT - Return ONLY this JSON object, nothing else before or after:
{"transcription":"exact transcription here","words":[{"word":"Hello","start":0.00,"end":0.35,"confidence":0.98}],"language":"${language !== 'auto' ? language : 'pt'}"}

If NO SPEECH detected: {"transcription":"","words":[],"language":"${language}"}`;

    const userPrompt = `Transcribe this audio. Output ONLY the raw JSON object, no text before or after it.${language !== 'auto' ? ` Language: ${languageName}.` : ''} Duration: ~${maxDuration}s.`;

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
