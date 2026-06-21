import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { resolveAIConfig, logAIConfig, prepareAIRequestBody } from "../_shared/ai-router.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const rawMessages = Array.isArray(body?.messages) ? body.messages : [];
    const { productId, productName } = body || {};

    // Sanitize: keep only valid {role, content} entries with non-empty content
    const messages = rawMessages.filter((m: any) => {
      if (!m || typeof m.role !== "string") return false;
      if (typeof m.content === "string") return m.content.trim().length > 0;
      if (Array.isArray(m.content)) return m.content.length > 0;
      return false;
    });

    if (messages.length === 0) {
      console.warn("[sales-copilot] empty messages. body keys:", Object.keys(body || {}), "rawLen:", rawMessages.length);
      return new Response(
        JSON.stringify({ error: "Nenhuma mensagem enviada ao copiloto." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Resolve organization from caller (auth header) so we can route correctly.
    let organizationId: string | null = null;
    try {
      const authHeader = req.headers.get("Authorization");
      if (authHeader) {
        const userClient = createClient(
          supabaseUrl,
          Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!,
          { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } },
        );
        const { data: u } = await userClient.auth.getUser();
        if (u?.user) {
          const { data: prof } = await supabase
            .from("profiles").select("organization_id").eq("id", u.user.id).maybeSingle();
          organizationId = prof?.organization_id ?? null;
        }
      }
    } catch (e) {
      console.warn("[sales-copilot] could not resolve org:", e);
    }

    // Fetch knowledge base for this product
    let knowledgeContext = "";

    if (productId) {

      // Fetch AI knowledge base (manual entries)
      const { data: knowledge } = await supabase
        .from("ai_knowledge_base")
        .select("title, content, category")
        .eq("product_id", productId)
        .eq("is_active", true);

      // Fetch product details
      const { data: product } = await supabase
        .from("products")
        .select("name, description, pitch_15s, pitch_30s, pitch_2min, icp, differentials, organization_id")
        .eq("id", productId)
        .single();

      // Fetch objections
      const { data: objections } = await supabase
        .from("objections")
        .select("category, what_they_say, what_they_mean, suggested_response")
        .eq("product_id", productId);

      // Fetch Product Brain knowledge sources
      const { data: brainSources } = await supabase
        .from("product_knowledge_sources")
        .select("source_type, title, extracted_content, transcript, question, answer")
        .eq("product_id", productId)
        .eq("is_active", true)
        .eq("processing_status", "completed");

      // Build context from product details
      if (product) {
        if (!organizationId) organizationId = product.organization_id ?? null;
        knowledgeContext += `\n## PRODUTO: ${product.name}\n`;
        if (product.description) knowledgeContext += `Descrição: ${product.description}\n`;
        if (product.pitch_15s) knowledgeContext += `Pitch 15s: ${product.pitch_15s}\n`;
        if (product.pitch_30s) knowledgeContext += `Pitch 30s: ${product.pitch_30s}\n`;
        if (product.pitch_2min) knowledgeContext += `Pitch 2min: ${product.pitch_2min}\n`;
        if (product.icp) knowledgeContext += `ICP (Cliente Ideal): ${product.icp}\n`;
        if (product.differentials?.length) {
          knowledgeContext += `Diferenciais: ${product.differentials.join(", ")}\n`;
        }
      }

      // Add Product Brain sources (websites, videos, FAQs, files)
      if (brainSources?.length) {
        knowledgeContext += `\n## CÉREBRO DO PRODUTO\n`;
        
        const MAX_CONTENT_LENGTH = 8000; // Limit per source to avoid context overflow
        
        for (const source of brainSources) {
          switch (source.source_type) {
            case 'website':
              if (source.extracted_content) {
                const content = source.extracted_content.slice(0, MAX_CONTENT_LENGTH);
                knowledgeContext += `\n### ${source.title} (Website)\n${content}\n`;
              }
              break;
            case 'youtube':
              if (source.transcript) {
                const transcript = source.transcript.slice(0, MAX_CONTENT_LENGTH);
                knowledgeContext += `\n### ${source.title} (Vídeo)\n${transcript}\n`;
              }
              break;
            case 'faq':
              if (source.question && source.answer) {
                knowledgeContext += `\n### FAQ: ${source.question}\nResposta: ${source.answer}\n`;
              }
              break;
            case 'file':
              if (source.extracted_content) {
                const content = source.extracted_content.slice(0, MAX_CONTENT_LENGTH);
                knowledgeContext += `\n### ${source.title} (Documento)\n${content}\n`;
              }
              break;
            case 'training':
              if (source.extracted_content) {
                const content = source.extracted_content.slice(0, MAX_CONTENT_LENGTH);
                knowledgeContext += `\n### ${source.title} (Treinamento)\n${content}\n`;
              } else if (source.question && source.answer) {
                knowledgeContext += `\n### Treinamento: ${source.question}\nResposta: ${source.answer}\n`;
              }
              break;
          }
        }
      }

      // Add manual knowledge base entries
      if (knowledge?.length) {
        knowledgeContext += `\n## BASE DE CONHECIMENTO\n`;
        for (const item of knowledge) {
          knowledgeContext += `\n### ${item.title} (${item.category})\n${item.content}\n`;
        }
      }

      // Add objections and responses
      if (objections?.length) {
        knowledgeContext += `\n## OBJEÇÕES E RESPOSTAS\n`;
        for (const obj of objections) {
          knowledgeContext += `\n### Objeção: "${obj.what_they_say}"\n`;
          if (obj.what_they_mean) knowledgeContext += `O que significa: ${obj.what_they_mean}\n`;
          knowledgeContext += `Resposta sugerida: ${obj.suggested_response}\n`;
        }
      }
    }

    const systemPrompt = `Você é o COPILOTO DE VENDAS — estrategista que ajuda vendedores a responder clientes.

${productName ? `PRODUTO: ${productName}` : ""}

${knowledgeContext ? knowledgeContext : ""}

═══════════════════════════════════════
COMO USAR A BASE DE CONHECIMENTO
═══════════════════════════════════════

- Para DADOS DO PRODUTO (preços, funcionalidades, prazos, specs): use SOMENTE o que está no contexto acima. Se não tiver, diga: "Sobre esse detalhe específico do produto, sugiro confirmar com o gestor antes de responder ao cliente."
- Para ESTRATÉGIA DE VENDAS (como abordar, como reativar, como negociar, como contornar objeções): use seu conhecimento de vendas consultivas livremente, adaptando ao contexto do produto quando houver informação disponível
- Quando existir uma FAQ ou treinamento que responda à pergunta, USE como base
- NUNCA invente preços, custos ou dados técnicos do produto

═══════════════════════════════════════
COMO RESPONDER
═══════════════════════════════════════

Para TODA situação do vendedor, entregue exatamente neste formato:

**O QUE ELE QUIS DIZER:**
[1-2 frases explicando a real intenção ou objeção oculta do cliente]

**RESPOSTA ESTRATÉGICA:**
[Mensagem pronta para copiar e enviar. 2-4 linhas. Tom humano e profissional]

**PERGUNTA DE RETORNO:**
[1 pergunta para manter a conversa e avançar a venda]

═══════════════════════════════════════
REGRAS
═══════════════════════════════════════

- Resposta otimizada para WhatsApp (curta, direta)
- NÃO use emojis
- NÃO use asteriscos ou formatação markdown nas respostas prontas
- Use o nome do cliente quando souber
- Linguagem natural e profissional
- Foque em gerar ação, não explicar teoria

═══════════════════════════════════════
ANÁLISE DE PRINTS
═══════════════════════════════════════

Quando receber print de conversa:
1. Analise rapidamente o contexto
2. Entregue no mesmo formato das 3 partes
3. Seja cirúrgico e objetivo

═══════════════════════════════════════
O QUE NUNCA FAZER
═══════════════════════════════════════

- Dar aula ou explicar conceitos de vendas
- Fazer listas longas
- Usar emojis
- Enrolar com introduções
- Fugir do formato de 3 partes
- Inventar preços, custos ou dados técnicos do produto
- Recusar perguntas estratégicas de vendas alegando falta de informação`;

    // Resolve provedor via roteamento da organização (OpenAI direta ou Lovable Gateway)
    const cfg = await resolveAIConfig(supabase, organizationId, 'sales_copilot', 'google/gemini-2.5-flash');
    logAIConfig('sales-copilot', cfg);

    const doCall = async (useFallback = false) => {
      const callCfg = useFallback
        ? {
            endpoint: 'https://ai.gateway.lovable.dev/v1/chat/completions',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${Deno.env.get('LOVABLE_API_KEY') ?? ''}`,
            },
            model: 'google/gemini-2.5-flash',
          }
        : cfg;
      const payload = {
        messages: [{ role: 'system', content: systemPrompt }, ...messages],
        stream: true,
      };
      return await fetch(callCfg.endpoint, {
        method: 'POST',
        headers: callCfg.headers,
        body: JSON.stringify(useFallback ? { ...payload, model: callCfg.model } : prepareAIRequestBody(payload, callCfg as any)),
      });
    };

    let response = await doCall(false);

    // Não fazemos fallback automático para Lovable aqui: se a org escolheu OpenAI,
    // qualquer erro deve aparecer como erro OpenAI, sem consumir créditos Lovable.

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      console.error('AI gateway error:', response.status, errorText);
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: 'Limite de requisições excedido. Tente novamente em alguns segundos.' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }
      if (response.status === 402) {
        const msg = cfg.provider === 'openai'
          ? 'Sua conta OpenAI está sem créditos ou bloqueada. Verifique em platform.openai.com/billing.'
          : 'Créditos de IA esgotados. Adicione créditos na sua conta Lovable.';
        return new Response(JSON.stringify({ error: msg }), {
          status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      if (response.status === 401 || response.status === 403) {
        return new Response(
          JSON.stringify({ error: `Chave do provedor "${cfg.provider}" inválida ou sem permissão. Verifique em Integrações.` }),
          { status: response.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }
      return new Response(
        JSON.stringify({ error: `Erro do provedor ${cfg.provider}: ${errorText.slice(0, 200) || response.statusText}` }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, 'Content-Type': 'text/event-stream' },
    });
  } catch (error) {
    console.error("Sales copilot error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Erro desconhecido" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
