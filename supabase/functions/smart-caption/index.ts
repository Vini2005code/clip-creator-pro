import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface SmartCaptionRequest {
  audio?: string; // base64 encoded audio
  transcript?: string; // or pre-existing transcript
  startTime: number;
  endTime: number;
  outputLanguage: 'en' | 'pt';
  enableRehook: boolean;
  rehookStyle: 'curiosity' | 'conflict' | 'promise';
  retentionAdjust: boolean;
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

    const body: SmartCaptionRequest = await req.json();
    const { 
      transcript, 
      startTime, 
      endTime, 
      outputLanguage, 
      enableRehook, 
      rehookStyle, 
      retentionAdjust 
    } = body;

    const clipDuration = endTime - startTime;

    // Build the AI prompt for semantic caption generation
    const systemPrompt = `You are an expert video editor specializing in viral short-form content for TikTok and Reels. Your task is to process video transcripts and generate optimized captions, hooks, and timing adjustments.

Output language: ${outputLanguage === 'pt' ? 'Portuguese (Brazil)' : 'English'}

CRITICAL RULES:
1. Break sentences by SEMANTIC IMPACT, not just timing
2. Highlight the most emotionally charged or curiosity-inducing words
3. Keep caption segments short (3-8 words max) for mobile readability
4. If rewriting to another language, maintain natural fluency - never literal translation
5. Hooks should be 2-5 words that create immediate curiosity or tension`;

    const userPrompt = transcript 
      ? `Analyze this transcript and generate smart captions:

TRANSCRIPT:
${transcript}

CLIP TIMING: ${startTime}s to ${endTime}s (${clipDuration}s total)

Generate a JSON response with:
{
  "captions": [
    {
      "text": "caption text",
      "start": 0.0,
      "end": 2.5,
      "keywords": ["highlighted", "words"]
    }
  ],
  ${enableRehook ? `"rehook": {
    "text": "hook text (2-5 words, ${rehookStyle} style)",
    "style": "${rehookStyle}"
  },` : ''}
  ${retentionAdjust ? `"suggestedStartTime": ${startTime},
  "suggestedEndTime": ${endTime},
  "adjustmentReason": "why these timings optimize retention"` : ''}
}`
      : `Generate a placeholder hook for a ${clipDuration}s video clip.

Style: ${rehookStyle}
Language: ${outputLanguage === 'pt' ? 'Portuguese' : 'English'}

Return JSON:
{
  "captions": [],
  "rehook": {
    "text": "hook text here",
    "style": "${rehookStyle}"
  }
}`;

    console.log('[SmartCaption] Calling AI Gateway...');

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-1.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
        temperature: 0.7,
        max_tokens: 2000,
      }),
    });

    if (!aiResponse.ok) {
      if (aiResponse.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again later." }), 
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (aiResponse.status === 402) {
        return new Response(
          JSON.stringify({ error: "Credits exhausted. Please add credits to continue." }), 
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const errorText = await aiResponse.text();
      console.error('[SmartCaption] AI Gateway error:', aiResponse.status, errorText);
      throw new Error(`AI Gateway error: ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();
    const content = aiData.choices?.[0]?.message?.content || '';

    console.log('[SmartCaption] AI Response:', content);

    // Parse JSON from response
    let result;
    try {
      // Extract JSON from markdown code blocks if present
      const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, content];
      const jsonStr = jsonMatch[1]?.trim() || content.trim();
      result = JSON.parse(jsonStr);
    } catch (parseError) {
      console.error('[SmartCaption] JSON parse error:', parseError);
      // Return fallback structure
      result = {
        captions: [],
        rehook: enableRehook ? {
          text: outputLanguage === 'pt' ? 'Você precisa ver isso...' : 'You need to see this...',
          style: rehookStyle
        } : null,
        suggestedStartTime: startTime,
        suggestedEndTime: endTime,
      };
    }

    // Ensure required fields exist
    const response = {
      transcription: transcript || '',
      words: [],
      captions: result.captions || [],
      rehook: result.rehook || null,
      suggestedStartTime: result.suggestedStartTime ?? startTime,
      suggestedEndTime: result.suggestedEndTime ?? endTime,
    };

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("[SmartCaption] Error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: errorMessage }), 
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
