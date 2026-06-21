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
    const { productId } = await req.json();

    if (!productId) {
      return new Response(
        JSON.stringify({ error: "productId is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch product details (incl. org for routing)
    const { data: product, error: productError } = await supabase
      .from("products")
      .select("name, description, pitch_15s, pitch_30s, pitch_2min, icp, differentials, pricing, organization_id")
      .eq("id", productId)
      .single();
    const organizationId = (product as any)?.organization_id ?? null;

    if (productError || !product) {
      return new Response(
        JSON.stringify({ error: "Product not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch knowledge base
    const { data: knowledge } = await supabase
      .from("ai_knowledge_base")
      .select("title, content, category")
      .eq("product_id", productId)
      .eq("is_active", true);

    // Build product context
    const productContext = `
PRODUTO: ${product.name}
DESCRIÇÃO: ${product.description || "Não informada"}
PITCH 15s: ${product.pitch_15s || "Não definido"}
PITCH 30s: ${product.pitch_30s || "Não definido"}
PITCH 2min: ${product.pitch_2min || "Não definido"}
ICP (Cliente Ideal): ${product.icp || "Não definido"}
DIFERENCIAIS: ${product.differentials?.join(", ") || "Não definidos"}
PRICING: ${JSON.stringify(product.pricing) || "Não definido"}
`;

    let knowledgeContext = "";
    if (knowledge && knowledge.length > 0) {
      knowledgeContext = "\nBASE DE CONHECIMENTO:\n" + knowledge
        .map(k => `- ${k.title} (${k.category}): ${k.content}`)
        .join("\n\n");
    }

    const systemPrompt = `Você é um especialista em vendas via WhatsApp. Gere objeções prováveis com respostas CURTAS e DIRETAS, otimizadas para mensagens de texto.

${productContext}
${knowledgeContext}

CATEGORIAS:
- price: Preço/orçamento
- timing: "Não é o momento"  
- trust: Falta de confiança
- thinking: "Vou pensar"
- partner: "Preciso falar com sócio"
- competitor: "Já uso outra solução"

⚠️ REGRAS CRÍTICAS - RESPOSTAS PARA WHATSAPP:
1. SIGNIFICADO: Máximo 1 linha (20-30 palavras)
2. RESPOSTA: Máximo 3-4 linhas curtas, use emojis estratégicos (✅ 💡 🎯 ⏰ 💰)
3. PERGUNTA: Uma única pergunta direta (máximo 15 palavras)
4. Use quebras de linha para facilitar leitura no celular
5. Tom conversacional, como mensagem de WhatsApp
6. Gere 6 objeções variadas`;

    const { response, config } = await aiChat({
      organizationId,
      capability: 'content_generation',
      model: 'google/gemini-3-flash-preview',
      label: 'generate-objections',
      supabase,
      body: {
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: "Analise o produto e gere as objeções mais prováveis com suas respectivas respostas estratégicas." }
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "generate_objections",
              description: "Generate a list of probable sales objections with strategic responses",
              parameters: {
                type: "object",
                properties: {
                  objections: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        category: { type: "string", enum: ["price", "timing", "trust", "thinking", "partner", "competitor"] },
                        what_they_say: { type: "string" },
                        what_they_mean: { type: "string" },
                        suggested_response: { type: "string" },
                        follow_up_question: { type: "string" }
                      },
                      required: ["category", "what_they_say", "what_they_mean", "suggested_response", "follow_up_question"],
                      additionalProperties: false
                    }
                  }
                },
                required: ["objections"],
                additionalProperties: false
              }
            }
          }
        ],
        tool_choice: { type: "function", function: { name: "generate_objections" } },
      },
    });

    if (!response.ok) {
      const errMsg = await describeAIError(response, config.provider);
      return new Response(JSON.stringify({ error: errMsg }), {
        status: response.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }


    const data = await response.json();
    
    // Extract the tool call result
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall || toolCall.function.name !== "generate_objections") {
      return new Response(
        JSON.stringify({ error: "Failed to generate objections" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const generatedObjections = JSON.parse(toolCall.function.arguments);

    return new Response(
      JSON.stringify({ 
        success: true, 
        objections: generatedObjections.objections,
        productName: product.name
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("generate-objections error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
