// Sprint 2 — Supervisor multi-agente
// Avalia regras de roteamento e, em fallback, usa LLM para decidir qual especialista responde.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface RoutePayload {
  organization_id: string;
  lead_id?: string;
  conversation_id?: string;
  current_agent_id?: string;
  stage_id?: string;
  tag_ids?: string[];
  product_id?: string;
  channel?: string;
  event?: string;
  deal_value?: number;
  recent_messages?: Array<{ role: string; content: string }>;
}

async function llmFallback(
  context: RoutePayload,
  specialists: Array<{
    id: string;
    agent_id: string;
    role: string;
    display_name: string;
    description?: string;
  }>,
): Promise<{ specialist_id: string; reason: string } | null> {
  const apiKey = Deno.env.get("LOVABLE_API_KEY");
  if (!apiKey || specialists.length === 0) return null;

  const conversationSnippet = (context.recent_messages ?? [])
    .slice(-6)
    .map((m) => `${m.role}: ${m.content}`)
    .join("\n");

  const systemPrompt =
    `Você é um supervisor de IA que roteia conversas para o agente especialista mais adequado. ` +
    `Analise o contexto e escolha UM especialista da lista. Responda apenas via tool call.`;

  const userPrompt = `Contexto:
- Canal: ${context.channel ?? "desconhecido"}
- Evento: ${context.event ?? "nenhum"}
- Etapa do funil: ${context.stage_id ?? "n/a"}
- Valor do negócio: ${context.deal_value ?? "n/a"}

Últimas mensagens:
${conversationSnippet || "(sem histórico)"}

Especialistas disponíveis:
${
    specialists
      .map(
        (s, i) =>
          `${i + 1}. id=${s.id} | role=${s.role} | nome=${s.display_name}${
            s.description ? ` | ${s.description}` : ""
          }`,
      )
      .join("\n")
  }`;

  try {
    const resp = await fetch(
      "https://ai.gateway.lovable.dev/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          tools: [
            {
              type: "function",
              function: {
                name: "select_specialist",
                description: "Seleciona o especialista que deve responder.",
                parameters: {
                  type: "object",
                  properties: {
                    specialist_id: {
                      type: "string",
                      description: "id do especialista escolhido",
                    },
                    reason: {
                      type: "string",
                      description: "Motivo curto (1 frase) da escolha",
                    },
                  },
                  required: ["specialist_id", "reason"],
                  additionalProperties: false,
                },
              },
            },
          ],
          tool_choice: {
            type: "function",
            function: { name: "select_specialist" },
          },
        }),
      },
    );

    if (!resp.ok) {
      console.error("LLM fallback failed:", resp.status, await resp.text());
      return null;
    }

    const json = await resp.json();
    const toolCall = json?.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) return null;
    const args = JSON.parse(toolCall.function.arguments);
    if (!args.specialist_id) return null;
    // valida que está na lista
    if (!specialists.some((s) => s.id === args.specialist_id)) return null;
    return { specialist_id: args.specialist_id, reason: args.reason };
  } catch (e) {
    console.error("LLM fallback error:", e);
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const payload = (await req.json()) as RoutePayload;

    if (!payload.organization_id) {
      return new Response(
        JSON.stringify({ error: "organization_id required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // 1) tenta regras determinísticas
    const { data: ruleMatch, error: ruleErr } = await supabase.rpc(
      "evaluate_routing_rules",
      {
        p_organization_id: payload.organization_id,
        p_lead_id: payload.lead_id ?? null,
        p_stage_id: payload.stage_id ?? null,
        p_tag_ids: payload.tag_ids ?? null,
        p_product_id: payload.product_id ?? null,
        p_channel: payload.channel ?? null,
        p_event: payload.event ?? null,
        p_deal_value: payload.deal_value ?? null,
      },
    );

    if (ruleErr) console.error("rule eval error", ruleErr);

    let chosen: {
      specialist_id: string;
      agent_id: string;
      role: string;
      display_name: string;
      reason: string;
      rule_id?: string;
    } | null = null;

    if (Array.isArray(ruleMatch) && ruleMatch.length > 0) {
      const r = ruleMatch[0];
      chosen = {
        specialist_id: r.specialist_id,
        agent_id: r.agent_id,
        role: r.role,
        display_name: r.display_name,
        reason: "rule_match",
        rule_id: r.rule_id,
      };

      // incrementa contador da regra
      await supabase
        .from("agent_routing_rules")
        .update({
          match_count: (await supabase
            .from("agent_routing_rules")
            .select("match_count")
            .eq("id", r.rule_id)
            .single()).data?.match_count + 1 || 1,
          last_matched_at: new Date().toISOString(),
        })
        .eq("id", r.rule_id);
    } else {
      // 2) fallback LLM
      const { data: specialists } = await supabase
        .from("agent_specialists")
        .select("id, agent_id, role, display_name, description")
        .eq("organization_id", payload.organization_id)
        .eq("is_active", true)
        .order("priority", { ascending: true });

      if (specialists && specialists.length > 0) {
        const llmChoice = await llmFallback(payload, specialists);
        if (llmChoice) {
          const sp = specialists.find((s) => s.id === llmChoice.specialist_id)!;
          chosen = {
            specialist_id: sp.id,
            agent_id: sp.agent_id,
            role: sp.role,
            display_name: sp.display_name,
            reason: `llm_supervisor: ${llmChoice.reason}`,
          };
        }
      }
    }

    // 3) audita se houve mudança
    if (chosen && payload.current_agent_id !== chosen.agent_id) {
      await supabase.from("agent_handoff_history").insert({
        organization_id: payload.organization_id,
        conversation_id: payload.conversation_id ?? null,
        lead_id: payload.lead_id ?? null,
        from_agent_id: payload.current_agent_id ?? null,
        to_agent_id: chosen.agent_id,
        to_specialist_id: chosen.specialist_id,
        reason: chosen.reason.startsWith("rule_match")
          ? "rule_match"
          : "llm_supervisor",
        rule_id: chosen.rule_id ?? null,
        context: {
          stage_id: payload.stage_id,
          tag_ids: payload.tag_ids,
          product_id: payload.product_id,
          channel: payload.channel,
          event: payload.event,
          deal_value: payload.deal_value,
          reason_detail: chosen.reason,
        },
      });
    }

    return new Response(
      JSON.stringify({ ok: true, chosen }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("agent-supervisor error", e);
    return new Response(
      JSON.stringify({
        ok: false,
        error: e instanceof Error ? e.message : "unknown",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
