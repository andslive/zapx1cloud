import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { aiChat, describeAIError } from "../_shared/ai-call.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { objection, productId } = await req.json();

    if (!objection || !productId) {
      return new Response(
        JSON.stringify({ error: "Objection and productId are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch product context (incl org for routing)
    const { data: product } = await supabase
      .from("products")
      .select("name, description, pitch_15s, pitch_30s, pitch_2min, icp, differentials, pricing, organization_id")
      .eq("id", productId)
      .single();
    const organizationId = (product as any)?.organization_id ?? null;

    // Fetch knowledge base
    const { data: knowledge } = await supabase
      .from("ai_knowledge_base")
      .select("title, content, category")
      .eq("product_id", productId)
      .eq("is_active", true);

    // Fetch existing objections for context
    const { data: existingObjections } = await supabase
      .from("objections")
      .select("category, what_they_say, suggested_response")
      .eq("product_id", productId)
      .limit(10);

    // Build context
    let productContext = "";
    if (product) {
      productContext = `
PRODUTO: ${product.name}
DESCRIÇÃO: ${product.description || "Não informada"}
PITCH CURTO: ${product.pitch_15s || product.pitch_30s || "Não definido"}
ICP (Cliente Ideal): ${product.icp || "Não definido"}
DIFERENCIAIS: ${product.differentials?.join(", ") || "Não definidos"}
PRICING: ${JSON.stringify(product.pricing) || "Não definido"}
`;
    }

    let knowledgeContext = "";
    if (knowledge && knowledge.length > 0) {
      knowledgeContext = "\nBASE DE CONHECIMENTO:\n" + knowledge
        .map(k => `- ${k.title}: ${k.content}`)
        .join("\n");
    }

    let objectionsContext = "";
    if (existingObjections && existingObjections.length > 0) {
      objectionsContext = "\nOBJEÇÕES CONHECIDAS E RESPOSTAS:\n" + existingObjections
        .map(o => `- "${o.what_they_say}" → ${o.suggested_response}`)
        .join("\n");
    }

    const systemPrompt = `Você é um especialista em vendas via WhatsApp. Gere respostas CURTAS e DIRETAS para copiar e enviar.

${productContext}
${knowledgeContext}
${objectionsContext}

⚠️ REGRAS CRÍTICAS - FORMATO WHATSAPP:
1. Respostas CURTAS - máximo 3-4 linhas por seção
2. Use emojis estratégicos: ✅ 💡 🎯 ⏰ 💰 🤝
3. Quebras de linha para facilitar leitura no celular
4. Tom conversacional e direto
5. NUNCA seja agressivo - vendas é ajudar

FORMATO DE RESPOSTA:

**O QUE ELE QUER DIZER:**
[1 linha máximo - o medo/dúvida real]

**RESPOSTA SUGERIDA:**
[Mensagem pronta para WhatsApp - 3-4 linhas curtas com emoji]

**PERGUNTA DE RETORNO:**
[1 pergunta direta de até 15 palavras]`;

    const { response, config } = await aiChat({
      organizationId,
      capability: 'sales_copilot',
      model: 'google/gemini-3-flash-preview',
      label: 'handle-objection',
      supabase,
      body: {
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `O cliente disse: "${objection}"\n\nGere uma resposta estratégica para contornar essa objeção.` }
        ],
        stream: true,
      },
    });

    if (!response.ok) {
      const errMsg = await describeAIError(response, config.provider);
      return new Response(JSON.stringify({ error: errMsg }), {
        status: response.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (error) {
    console.error("handle-objection error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
