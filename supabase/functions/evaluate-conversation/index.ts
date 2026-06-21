// Sprint 3 — LLM-as-Judge: avalia uma conversa e persiste métricas
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const JUDGE_MODEL = "google/gemini-2.5-flash";

interface EvalRequest {
  conversation_id?: string;
  organization_id?: string;
  // Modo batch: avalia conversas das últimas N horas
  batch_hours?: number;
  max_conversations?: number;
}

async function judgeConversation(
  apiKey: string,
  agentName: string | null,
  transcript: string,
): Promise<any | null> {
  const systemPrompt =
    `Você é um avaliador especialista de conversas de vendas. ` +
    `Analise a conversa e pontue de 0 a 100 cada dimensão. ` +
    `Seja crítico e objetivo. Responda APENAS via tool call.`;

  const userPrompt = `${
    agentName ? `Agente: ${agentName}\n\n` : ""
  }Conversa:\n${transcript.slice(0, 12000)}`;

  const resp = await fetch(
    "https://ai.gateway.lovable.dev/v1/chat/completions",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: JUDGE_MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "evaluate_conversation",
              description: "Pontua a conversa em múltiplas dimensões.",
              parameters: {
                type: "object",
                properties: {
                  score_overall: { type: "number", description: "0-100" },
                  score_clarity: { type: "number" },
                  score_tone: { type: "number" },
                  score_objectivity: { type: "number" },
                  score_accuracy: { type: "number" },
                  score_conversion_potential: { type: "number" },
                  detected_objections: {
                    type: "array",
                    items: { type: "string" },
                  },
                  detected_intents: {
                    type: "array",
                    items: { type: "string" },
                  },
                  detected_issues: {
                    type: "array",
                    items: { type: "string" },
                  },
                  summary: { type: "string" },
                  improvement_suggestions: { type: "string" },
                },
                required: [
                  "score_overall",
                  "score_clarity",
                  "score_tone",
                  "score_objectivity",
                  "score_accuracy",
                  "score_conversion_potential",
                  "summary",
                  "improvement_suggestions",
                ],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: {
          type: "function",
          function: { name: "evaluate_conversation" },
        },
      }),
    },
  );

  if (!resp.ok) {
    console.error("judge error", resp.status, await resp.text());
    return null;
  }

  const json = await resp.json();
  const tc = json?.choices?.[0]?.message?.tool_calls?.[0];
  if (!tc) return null;
  try {
    return JSON.parse(tc.function.arguments);
  } catch {
    return null;
  }
}

async function evaluateOne(
  supabase: any,
  apiKey: string,
  conversationId: string,
): Promise<{ ok: boolean; reason?: string; eval_id?: string }> {
  const { data: conv, error: cErr } = await supabase
    .from("webchat_conversations")
    .select("id, organization_id, lead_id, current_agent_id")
    .eq("id", conversationId)
    .maybeSingle();

  if (cErr || !conv) return { ok: false, reason: "conv not found" };

  const { data: messages, error: mErr } = await supabase
    .from("webchat_messages")
    .select("direction, content, created_at, metadata")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true })
    .limit(60);

  if (mErr || !messages || messages.length < 4) {
    return { ok: false, reason: "not enough messages" };
  }

  const transcript = messages
    .map(
      (m: any) =>
        `[${m.direction === "inbound" ? "CLIENTE" : "AGENTE"}] ${
          (m.content ?? "").slice(0, 500)
        }`,
    )
    .join("\n");

  // Buscar nome do agente (opcional)
  let agentName: string | null = null;
  if (conv.current_agent_id) {
    const { data: agent } = await supabase
      .from("product_agents")
      .select("name")
      .eq("id", conv.current_agent_id)
      .maybeSingle();
    agentName = agent?.name ?? null;
  }

  const evaluation = await judgeConversation(apiKey, agentName, transcript);
  if (!evaluation) return { ok: false, reason: "judge failed" };

  const { data: inserted, error: iErr } = await supabase
    .from("ai_quality_evaluations")
    .insert({
      organization_id: conv.organization_id,
      conversation_id: conv.id,
      agent_id: conv.current_agent_id,
      lead_id: conv.lead_id,
      evaluated_messages_count: messages.length,
      score_overall: evaluation.score_overall,
      score_clarity: evaluation.score_clarity,
      score_tone: evaluation.score_tone,
      score_objectivity: evaluation.score_objectivity,
      score_accuracy: evaluation.score_accuracy,
      score_conversion_potential: evaluation.score_conversion_potential,
      detected_objections: evaluation.detected_objections ?? [],
      detected_intents: evaluation.detected_intents ?? [],
      detected_issues: evaluation.detected_issues ?? [],
      summary: evaluation.summary,
      improvement_suggestions: evaluation.improvement_suggestions,
      judge_model: JUDGE_MODEL,
    })
    .select("id")
    .single();

  if (iErr) return { ok: false, reason: iErr.message };

  // Se a conversa estava num experimento, propaga score na variante
  try {
    const lastWithVariant = [...messages]
      .reverse()
      .find((m: any) => m.metadata?.variant_id);
    const variantId = lastWithVariant?.metadata?.variant_id;
    if (variantId) {
      await supabase.rpc("record_variant_score", {
        p_variant_id: variantId,
        p_score: evaluation.score_overall,
      });
    }
  } catch (e) {
    console.warn("variant score propagation failed", e);
  }

  return { ok: true, eval_id: inserted.id };
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
    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) throw new Error("LOVABLE_API_KEY missing");

    const body = (await req.json().catch(() => ({}))) as EvalRequest;

    // Modo single
    if (body.conversation_id) {
      const r = await evaluateOne(supabase, apiKey, body.conversation_id);
      return new Response(JSON.stringify(r), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: r.ok ? 200 : 400,
      });
    }

    // Modo batch (cron)
    const hours = body.batch_hours ?? 24;
    const max = Math.min(body.max_conversations ?? 50, 200);

    let q = supabase
      .from("webchat_conversations")
      .select("id, organization_id, updated_at")
      .gte(
        "updated_at",
        new Date(Date.now() - hours * 3600 * 1000).toISOString(),
      )
      .order("updated_at", { ascending: false })
      .limit(max);

    if (body.organization_id) q = q.eq("organization_id", body.organization_id);

    const { data: convs, error: qErr } = await q;
    if (qErr) throw qErr;

    const results: any[] = [];
    for (const c of convs ?? []) {
      // pula se já foi avaliada nas últimas N horas
      const { data: existing } = await supabase
        .from("ai_quality_evaluations")
        .select("id")
        .eq("conversation_id", c.id)
        .gte(
          "created_at",
          new Date(Date.now() - hours * 3600 * 1000).toISOString(),
        )
        .limit(1);
      if (existing && existing.length > 0) continue;

      const r = await evaluateOne(supabase, apiKey, c.id);
      results.push({ conversation_id: c.id, ...r });
    }

    return new Response(
      JSON.stringify({
        ok: true,
        evaluated: results.filter((r) => r.ok).length,
        skipped: (convs?.length ?? 0) - results.length,
        failed: results.filter((r) => !r.ok).length,
        details: results,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("evaluate-conversation error", e);
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
