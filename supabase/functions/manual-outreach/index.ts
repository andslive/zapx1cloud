import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { splitIntoBubbles } from "../_shared/humanizer.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const {
      lead_ids,
      agent_id,
      organization_id,
      objective,
      extra_context,
      event_context,
      mode = 'direct',
      force_when_human = false,
      instance_id,
    }: {
      lead_ids: string[];
      agent_id: string;
      organization_id: string;
      objective?: string;
      extra_context?: string;
      event_context?: Record<string, unknown>;
      mode?: 'direct' | 'conversational';
      force_when_human?: boolean;
      instance_id?: string;
    } = await req.json();

    if (!lead_ids?.length || !agent_id) {
      return new Response(JSON.stringify({ error: "Missing lead_ids or agent_id" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get agent
    const { data: agent } = await supabase
      .from("product_agents")
      .select("*")
      .eq("id", agent_id)
      .single();

    if (!agent) throw new Error("Agent not found");

    // Get knowledge
    const { data: knowledgeSources } = await supabase
      .from("ai_knowledge_base")
      .select("title, content, category")
      .eq("product_id", agent.product_id)
      .eq("is_active", true)
      .limit(10);

    const knowledgeContext = (knowledgeSources || [])
      .map((k: any) => `[${k.category}] ${k.title}: ${k.content}`)
      .join("\n\n");

    const results: any[] = [];

    for (const leadId of lead_ids) {
      try {
        // Get lead
        const { data: lead } = await supabase
          .from("leads")
          .select("name, email, phone, metadata, temperature, deal_value")
          .eq("id", leadId)
          .single();

        let leadPhone = lead?.phone?.replace(/\D/g, "");
        if (!leadPhone) {
          results.push({ leadId, skipped: true, reason: "No phone" });
          continue;
        }
        if (!leadPhone.startsWith("55")) leadPhone = "55" + leadPhone;

        // Dedupe: skip if there's already an active outreach for this (lead, agent)
        // OR if the same agent already messaged this lead in the last 24h.
        const { data: existingOutreach } = await supabase
          .from("ai_outreach_queue")
          .select("id, last_outreach_at, status")
          .eq("lead_id", leadId)
          .eq("agent_id", agent_id)
          .in("status", ["pending", "sent"])
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (existingOutreach && !force_when_human) {
          const lastAt = existingOutreach.last_outreach_at ? new Date(existingOutreach.last_outreach_at).getTime() : 0;
          const hoursSince = (Date.now() - lastAt) / 3600000;
          if (hoursSince < 24) {
            console.log(`[ManualOutreach] Dedupe: lead ${leadId} já tem outreach do agente ${agent_id} há ${hoursSince.toFixed(1)}h — pulando.`);
            results.push({ leadId, skipped: true, reason: "Outreach ativo recente para este agente" });
            continue;
          }
        }

        // Reuse existing conversation for this lead+phone if present
        const { data: existingConv } = await supabase
          .from("webchat_conversations")
          .select("id, status")
          .eq("lead_id", leadId)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        // If conversation is already with a human, do NOT send AI outreach
        // (a menos que o caller force — usado em automações pós-venda críticas)
        if (existingConv && !force_when_human && (existingConv.status === "human_active" || existingConv.status === "waiting_human")) {
          results.push({ leadId, skipped: true, reason: `Conversation in ${existingConv.status}` });
          continue;
        }

        // Build lead context from metadata
        const leadMetadata = (lead?.metadata || {}) as Record<string, any>;
        const customFields = leadMetadata.custom_fields || {};
        const formResponses = Object.entries(customFields)
          .map(([key, val]) => `- ${key}: ${val}`)
          .join("\n");

        // Generate AI message
        const eventCtxLines = event_context
          ? Object.entries(event_context)
              .map(([k, v]) => `- ${k}: ${v}`)
              .join("\n")
          : "";

        const modeRules = mode === 'conversational'
          ? `MODO: CONVERSA INTENCIONAL
- Gere APENAS uma abertura curta (1–2 linhas, no máx. 25 palavras).
- Faça UMA pergunta provocativa referenciando o evento (ex.: "Vi que você gerou um Pix, conseguiu finalizar?").
- NÃO entregue Pix, link, código, instruções ou dados do evento agora — só pergunte.
- Aguarde a resposta do lead antes de oferecer qualquer detalhe.`
          : `MODO: MENSAGEM DIRETA
- Gere uma mensagem completa, mas em no máx. 2 parágrafos curtos.
- Se houver Pix/link, coloque cada um em linha própria, sem texto extra junto.
- Sem despedidas longas. Termine com UMA pergunta ou CTA claro.`;

        const systemPrompt = `Você é ${agent.name}, um agente de ${agent.agent_type} da empresa.
MISSÃO: ${agent.primary_objective}
TOM DE VOZ: ${agent.tone_style || "Consultivo"}
ESTILO DE MENSAGEM: ${agent.message_style || "Curta e objetiva"}
${agent.can_do?.length ? `O QUE VOCÊ PODE FAZER:\n${agent.can_do.map((c: string) => `- ${c}`).join("\n")}` : ""}
${agent.cannot_do?.length ? `O QUE VOCÊ NÃO PODE FAZER:\n${agent.cannot_do.map((c: string) => `- ${c}`).join("\n")}` : ""}
${knowledgeContext ? `CONHECIMENTO DO PRODUTO:\n${knowledgeContext}` : ""}
${objective ? `OBJETIVO DESTA ABORDAGEM: ${objective}` : ""}
${extra_context ? `CONTEXTO ADICIONAL: ${extra_context}` : ""}
${eventCtxLines ? `CONTEXTO DO EVENTO:\n${eventCtxLines}` : ""}
${modeRules}
REGRAS GERAIS:
- Gere APENAS a mensagem, sem explicações ou prefixos.
- Seja natural e humano, NÃO pareça um bot. Sem clichês ("espero que esteja bem", etc.).
- Personalize com as informações do lead.
- WhatsApp: sem markdown, sem HTML.`;

        const userPrompt = `Gere a mensagem de primeira abordagem via WhatsApp para este lead:
Nome: ${lead?.name || "Lead"}
Email: ${lead?.email || "Não informado"}
Telefone: ${leadPhone}
Temperatura: ${lead?.temperature || "indefinida"}
${formResponses ? `\nRespostas do Formulário:\n${formResponses}` : ""}`;

        const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${lovableApiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash",
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: userPrompt },
            ],
          }),
        });

        if (!aiResponse.ok) {
          results.push({ leadId, error: `AI failed: ${aiResponse.status}` });
          continue;
        }

        const aiData = await aiResponse.json();
        const generatedMessage = aiData.choices?.[0]?.message?.content?.trim();
        if (!generatedMessage) {
          results.push({ leadId, error: "AI returned empty message" });
          continue;
        }

        console.log(`[ManualOutreach] (${mode}) -> ${lead?.name} (${leadPhone}): ${generatedMessage.slice(0, 80)}...`);

        // Quebra em até 2 bolhas curtas (regra padrão WhatsApp do projeto)
        const bubbles = mode === 'conversational'
          ? [generatedMessage] // já forçamos curto no prompt
          : splitIntoBubbles(generatedMessage, { maxChunks: 2, targetCharsPerChunk: 280 });

        let sent = false;
        for (let i = 0; i < bubbles.length; i++) {
          try {
            const { data: sendData, error: sendErr } = await supabase.functions.invoke('whatsapp-send', {
              body: {
                organization_id,
                instance_id,
                type: 'text',
                to: leadPhone,
                payload: { text: bubbles[i] },
              },
            });
            const okThis = !sendErr && (sendData as any)?.ok !== false;
            if (!okThis) {
              console.error(`[ManualOutreach] Evolution send failed for ${leadPhone}:`, sendErr || sendData);
              if (i === 0) sent = false;
              break;
            }
            sent = true;
            if (i < bubbles.length - 1) await new Promise((r) => setTimeout(r, 800));
          } catch (e) {
            console.error(`[ManualOutreach] Evolution send exception for ${leadPhone}:`, e);
            break;
          }
        }

        if (!sent) {
          results.push({ leadId, error: "WhatsApp send failed (sem instância conectada?)" });
          continue;
        }

        // Reuse existing conversation if any; otherwise create new
        const convMetadata: Record<string, unknown> = {
          ai_outreach: true,
          manual_trigger: true,
          outreach_mode: mode,
        };
        if (mode === 'conversational' && event_context && Object.keys(event_context).length > 0) {
          convMetadata.pending_payment_data = event_context;
          convMetadata.pending_payment_objective = objective || null;
        }

        let conversation = existingConv ? { id: existingConv.id } : null;
        if (!conversation) {
          const { data: newConv } = await supabase
            .from("webchat_conversations")
            .insert({
              organization_id,
              visitor_name: lead?.name || "Lead",
              visitor_email: lead?.email,
              visitor_phone: leadPhone,
              channel: "whatsapp",
              status: "bot_active",
              lead_id: leadId,
              current_agent_id: agent_id,
              metadata: convMetadata,
            })
            .select()
            .single();
          conversation = newConv;
        } else if (mode === 'conversational' && convMetadata.pending_payment_data) {
          // Mescla payload pendente em conversa já existente
          const { data: convRow } = await supabase
            .from('webchat_conversations')
            .select('metadata')
            .eq('id', existingConv!.id)
            .maybeSingle();
          const merged = { ...((convRow?.metadata as any) || {}), ...convMetadata };
          await supabase
            .from('webchat_conversations')
            .update({ metadata: merged, current_agent_id: agent_id })
            .eq('id', existingConv!.id);
        }

        if (conversation) {
          for (const part of bubbles) {
            await supabase.from("webchat_messages").insert({
              conversation_id: conversation.id,
              content: part,
              sender_type: "bot",
              direction: "outbound",
              metadata: { outreach_mode: mode },
            });
          }
        }

        // Update existing outreach OR create a new one (respects unique partial index)
        if (existingOutreach) {
          await supabase.from("ai_outreach_queue").update({
            objective: objective || "Abordagem manual retroativa",
            extra_context: extra_context ?? undefined,
            last_outreach_at: new Date().toISOString(),
            next_followup_at: new Date(Date.now() + 24 * 3600000).toISOString(),
            status: "sent",
            conversation_id: conversation?.id ?? null,
          }).eq("id", existingOutreach.id);
        } else {
          await supabase.from("ai_outreach_queue").insert({
            organization_id,
            lead_id: leadId,
            conversation_id: conversation?.id,
            product_id: agent.product_id,
            agent_id,
            objective: objective || "Abordagem manual retroativa",
            extra_context: extra_context ?? null,
            lead_data: { name: lead?.name, email: lead?.email, phone: leadPhone },
            status: "sent",
            followup_enabled: true,
            followup_interval_hours: 24,
            max_followups: 2,
            followup_steps: [{ delay_hours: 24 }, { delay_hours: 48 }],
            business_hours_start: "09:00",
            business_hours_end: "18:00",
            business_days: [1, 2, 3, 4, 5],
            followups_sent: 0,
            last_outreach_at: new Date().toISOString(),
            next_followup_at: new Date(Date.now() + 24 * 3600000).toISOString(),
          });
        }

        results.push({ leadId, name: lead?.name, sent: true, conversationId: conversation?.id });
      } catch (err) {
        results.push({ leadId, error: String(err) });
      }
    }

    return new Response(JSON.stringify({ results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
