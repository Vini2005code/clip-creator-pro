import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface TranscribeRequest {
  audio: string; // base64 encoded audio
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

    console.log("[TranscribeAudio] Starting ASR transcription...");
    console.log("[TranscribeAudio] Audio length:", audio.length, "bytes (base64)");
    console.log("[TranscribeAudio] Language:", language);

    // Use Lovable AI Gateway for Whisper-based transcription
    // We'll use Gemini's audio understanding capabilities for accurate ASR
    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content: `You are an ASR (Automatic Speech Recognition) system. Your ONLY task is to transcribe audio EXACTLY as spoken.

CRITICAL RULES:
1. Transcribe EXACTLY what is said - word for word, no changes
2. DO NOT summarize, paraphrase, or rewrite
3. DO NOT add, remove, or modify any words
4. Preserve the original language of the audio
5. Include filler words (uh, um, like, etc.)
6. Include repetitions if the speaker repeats themselves
7. Mark unclear words with [inaudible]
8. Return JSON format with word-level timestamps

Output format (JSON only, no markdown):
{
  "transcription": "full transcription text here",
  "words": [
    {"word": "word1", "start": 0.0, "end": 0.5, "confidence": 0.95},
    {"word": "word2", "start": 0.5, "end": 0.9, "confidence": 0.92}
  ],
  "language": "detected language code (pt, en, es, etc.)"
}

If no speech is detected, return:
{
  "transcription": "",
  "words": [],
  "language": "${language}"
}`
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `Transcribe this audio clip exactly as spoken. Return ONLY valid JSON.${language !== "auto" ? ` Expected language: ${language}.` : ""}`
              },
              {
                type: "image_url",
                image_url: {
                  url: `data:audio/wav;base64,${audio}`
                }
              }
            ]
          }
        ],
        temperature: 0.1, // Low temperature for accuracy
        max_tokens: 4000,
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

    console.log("[TranscribeAudio] Raw AI response:", content.substring(0, 500));

    // Parse JSON response
    let result: { transcription: string; words: WordTimestamp[]; language: string };
    try {
      // Extract JSON from markdown code blocks if present
      const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, content];
      const jsonStr = jsonMatch[1]?.trim() || content.trim();
      result = JSON.parse(jsonStr);
    } catch (parseError) {
      console.error("[TranscribeAudio] JSON parse error:", parseError);
      console.error("[TranscribeAudio] Raw content:", content);
      
      // If parsing fails, try to extract plain text transcription
      const plainText = content
        .replace(/```[\s\S]*?```/g, "")
        .replace(/\{[\s\S]*?\}/g, "")
        .trim();
      
      if (plainText) {
        // Create word-level segments from plain text
        const words = plainText.split(/\s+/).filter(Boolean);
        const avgWordDuration = 0.4;
        result = {
          transcription: plainText,
          words: words.map((word: string, i: number) => ({
            word,
            start: i * avgWordDuration,
            end: (i + 1) * avgWordDuration,
            confidence: 0.8,
          })),
          language: language === "auto" ? "unknown" : language,
        };
      } else {
        return new Response(
          JSON.stringify({ success: false, error: "Failed to parse transcription" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Validate the response
    if (!result.transcription && (!result.words || result.words.length === 0)) {
      console.log("[TranscribeAudio] No speech detected in audio");
      return new Response(
        JSON.stringify({
          success: true,
          transcription: "",
          words: [],
          language: result.language || language,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("[TranscribeAudio] Transcription complete:", {
      wordCount: result.words?.length || 0,
      language: result.language,
      preview: result.transcription?.substring(0, 100),
    });

    const response: TranscribeResponse = {
      success: true,
      transcription: result.transcription || "",
      words: result.words || [],
      language: result.language || language,
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
