import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { aiChat, describeAIError } from "../_shared/ai-call.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const fieldPrompts: Record<string, string> = {
  description: `Você é um especialista em copywriting para vendas B2B. 
Reescreva a descrição do produto para ser mais clara, profissional e persuasiva.
Mantenha a essência, mas torne-a mais impactante para vendedores usarem.`,
  
  icp: `Você é um especialista em definição de ICP (Ideal Customer Profile).
Reescreva o perfil do cliente ideal para ser mais detalhado e acionável.
Inclua características demográficas, comportamentais e sinais de compra.`,
  
  pitch_15s: `Você é um especialista em elevator pitch.
Reescreva este pitch de 15 segundos para ser memorável, impactante e gerar curiosidade.
Deve ser algo que um vendedor pode falar naturalmente em uma conversa.`,
  
  pitch_30s: `Você é um especialista em apresentações de vendas.
Reescreva este pitch de 30 segundos para incluir problema, solução e valor.
Mantenha natural e conversacional, mas persuasivo.`,
  
  pitch_2min: `Você é um especialista em storytelling para vendas.
Reescreva este pitch de 2 minutos usando a estrutura: Problema → Impacto → Solução → Resultados.
Inclua elementos de prova social e urgência quando apropriado.`,
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { field, value, productContext } = await req.json();

    if (!field || !value) {
      return new Response(
        JSON.stringify({ error: "Field and value are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Resolve org from auth header for routing
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);
    let organizationId: string | null = null;
    try {
      const auth = req.headers.get("Authorization");
      if (auth) {
        const u = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!,
          { global: { headers: { Authorization: auth } }, auth: { persistSession: false } });
        const { data: ud } = await u.auth.getUser();
        if (ud?.user) {
          const { data: prof } = await supabase.from("profiles").select("organization_id").eq("id", ud.user.id).maybeSingle();
          organizationId = prof?.organization_id ?? null;
        }
      }
    } catch (_) {}

    const systemPrompt = fieldPrompts[field] || `Você é um especialista em vendas B2B.
Reescreva o conteúdo para ser mais profissional, claro e persuasivo.
Mantenha a essência original, mas torne-o mais impactante.`;

    const contextInfo = productContext ? `
Contexto do produto:
- Nome: ${productContext.name || 'Não definido'}
- Descrição: ${productContext.description || 'Não definida'}
- ICP: ${productContext.icp || 'Não definido'}
` : '';

    const { response, config } = await aiChat({
      organizationId,
      capability: 'content_generation',
      model: 'google/gemini-3-flash-preview',
      label: 'optimize-product-field',
      supabase,
      body: {
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `${contextInfo}\n\nTexto original para otimizar:\n"${value}"\n\nRetorne APENAS o texto otimizado, sem explicações ou marcadores.` },
        ],
        tools: [{
          type: "function",
          function: {
            name: "optimize_text",
            description: "Return the optimized text with improvements",
            parameters: {
              type: "object",
              properties: {
                optimized: { type: "string" },
                improvements: { type: "array", items: { type: "string" } },
              },
              required: ["optimized", "improvements"],
              additionalProperties: false,
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "optimize_text" } },
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
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    
    if (toolCall?.function?.arguments) {
      const result = JSON.parse(toolCall.function.arguments);
      return new Response(
        JSON.stringify(result),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fallback to content if no tool call
    const content = data.choices?.[0]?.message?.content || value;
    return new Response(
      JSON.stringify({ optimized: content, improvements: [] }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
