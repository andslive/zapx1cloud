import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { conversationId } = await req.json();
    if (!conversationId) throw new Error("conversationId is required");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch messages
    const { data: messages, error: msgError } = await supabase
      .from("webchat_messages")
      .select("content, sender_type, created_at, direction")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true });

    if (msgError) {
      console.error("Error fetching messages:", msgError);
      throw new Error("Failed to fetch messages");
    }

    if (!messages || messages.length === 0) {
      return new Response(JSON.stringify({ error: "No messages found" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch conversation details
    const { data: conv } = await supabase
      .from("webchat_conversations")
      .select("*, webchat_widgets(products(name, description))")
      .eq("id", conversationId)
      .single();

    const productName = conv?.webchat_widgets?.products?.name || "Produto não identificado";

    const transcript = messages
      .map((m: any) => `[${m.sender_type || m.direction}]: ${m.content}`)
      .join("\n");

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const prompt = `Analise a seguinte conversa de atendimento comercial para o produto "${productName}".

Transcrição:
${transcript}

Retorne a análise usando a ferramenta analyze_conversation.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          {
            role: "system",
            content: `Você é um analista de qualidade de vendas. Analise conversas de atendimento e forneça feedback detalhado. Avalie:
- Tempo de resposta (rápido, adequado, lento)
- Tom da conversa (profissional, amigável, frio)
- Técnicas de vendas utilizadas (rapport, SPIN, gatilhos mentais, etc.)
- Objeções identificadas e como foram tratadas
- Nota geral de 1 a 10
- Pontos fortes e fracos específicos
- Sugestões de melhoria acionáveis`,
          },
          { role: "user", content: prompt },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "analyze_conversation",
              description: "Return structured conversation analysis",
              parameters: {
                type: "object",
                properties: {
                  score: { type: "number", description: "Score 1-10" },
                  strengths: { type: "array", items: { type: "string" } },
                  weaknesses: { type: "array", items: { type: "string" } },
                  suggestions: { type: "array", items: { type: "string" } },
                  metrics: {
                    type: "object",
                    properties: {
                      avgResponseTime: { type: "string" },
                      tone: { type: "string" },
                      salesTechniques: { type: "array", items: { type: "string" } },
                      objectionsHandled: { type: "number" },
                    },
                    required: ["avgResponseTime", "tone", "salesTechniques", "objectionsHandled"],
                  },
                },
                required: ["score", "strengths", "weaknesses", "suggestions", "metrics"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "analyze_conversation" } },
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("AI error:", response.status, errText);
      
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Try again later." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error("AI gateway error");
    }

    const aiData = await response.json();
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
    
    if (!toolCall?.function?.arguments) {
      throw new Error("No tool call response");
    }

    const analysis = JSON.parse(toolCall.function.arguments);

    return new Response(JSON.stringify(analysis), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("analyze-conversation error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
