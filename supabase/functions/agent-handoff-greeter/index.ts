// Edge function that fires the "incoming" greeting from the new agent after a handoff.
// Called by webchat-bot via background task (EdgeRuntime.waitUntil) so it runs even
// if the lead does not respond. It honors `handoff_delay_seconds` and renders the
// configured `handoff_incoming_message` template with conversation variables.

// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface GreeterRequest {
  conversation_id: string;
  to_agent_id: string;
  from_agent_name?: string | null;
  product_id?: string | null;
  // Optional pre-computed summary; if absent and agent has handoff_include_summary, we generate one.
  summary?: string | null;
  // Optional delay override (seconds). If omitted, uses agent's handoff_delay_seconds.
  delay_seconds?: number;
}

function renderTemplate(
  template: string,
  vars: Record<string, string | null | undefined>,
): string {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_m, key) => {
    const v = vars[key];
    return v == null ? "" : String(v);
  }).replace(/\s{2,}/g, " ").trim();
}

async function generateSummary(
  conversationId: string,
  supabase: any,
  apiKey: string,
): Promise<string> {
  try {
    const { data: msgs } = await supabase
      .from("webchat_messages")
      .select("direction, content, created_at")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: false })
      .limit(20);

    const history = (msgs || [])
      .reverse()
      .map((m: any) => `${m.direction === "inbound" ? "Lead" : "Agente"}: ${m.content}`)
      .join("\n")
      .slice(0, 4000);

    if (!history.trim()) return "";

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-lite",
        messages: [
          {
            role: "system",
            content:
              "Resuma em UMA frase curta (máx 15 palavras) o assunto principal da conversa abaixo. Responda apenas o tema, sem rodeios. Ex: 'sobre o plano premium', 'sobre agendar uma reunião'.",
          },
          { role: "user", content: history },
        ],
        max_tokens: 60,
        temperature: 0.3,
      }),
    });

    if (!res.ok) return "";
    const j = await res.json();
    return (j?.choices?.[0]?.message?.content || "").trim().replace(/^["']|["']$/g, "");
  } catch (e) {
    console.warn("[handoff-greeter] summary failed:", e);
    return "";
  }
}

async function deliverViaChannel(
  supabase: any,
  conv: any,
  text: string,
): Promise<void> {
  // 1) Always persist as bot message — this is what the WebChat/Inbox UI displays.
  await supabase.from("webchat_messages").insert({
    conversation_id: conv.id,
    direction: "outbound",
    sender_type: "bot",
    content: text,
    message_type: "text",
    metadata: { auto_handoff_intro: true },
  });

  const channel = (conv.channel || "chat").toLowerCase();

  // 2) For chat/widget/inbox: persisting is enough — the realtime subscription
  //    in the client will render the message. No extra outbound call needed.
  if (channel === "chat" || channel === "widget" || channel === "inbox") {
    return;
  }

  // 3) For WhatsApp: deliver through whatsapp-send (works for Evolution Go).
  //    For other providers we rely on existing inbound→bot pipelines; the
  //    saved message still appears in the unified Inbox.
  if (channel === "whatsapp" && conv.visitor_phone) {
    try {
      await supabase.functions.invoke("whatsapp-send", {
        body: {
          organization_id: conv.organization_id,
          number: conv.visitor_phone,
          text,
        },
      });
    } catch (e) {
      console.warn("[handoff-greeter] whatsapp-send failed (non-fatal):", e);
    }
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = (await req.json()) as GreeterRequest;
    if (!body?.conversation_id || !body?.to_agent_id) {
      return new Response(JSON.stringify({ error: "missing conversation_id or to_agent_id" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Load the new (incoming) agent
    const { data: agent } = await supabase
      .from("product_agents")
      .select(
        "id, name, agent_type, handoff_incoming_message, handoff_delay_seconds, handoff_include_summary, message_delay_seconds, product_id",
      )
      .eq("id", body.to_agent_id)
      .maybeSingle();

    if (!agent) {
      return new Response(JSON.stringify({ error: "agent not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Use template configurado, ou um padrão amigável se vazio.
    // Garante que o novo agente SEMPRE se apresenta após handoff,
    // evitando que a primeira fala dele seja uma resposta robótica.
    const DEFAULT_TEMPLATE =
      "Oi {{nome}}, aqui é a {{agent_name}} do time. Vou continuar daqui — me conta um pouco mais do que você está pensando? 😊";
    const template = (agent.handoff_incoming_message || "").trim() || DEFAULT_TEMPLATE;

    const delaySec =
      typeof body.delay_seconds === "number"
        ? body.delay_seconds
        : (agent.handoff_delay_seconds ?? 4);

    // Wait the configured delay (capped at 60s to stay within edge runtime budget)
    const wait = Math.max(0, Math.min(60, delaySec));
    if (wait > 0) await new Promise((r) => setTimeout(r, wait * 1000));

    // Re-load conversation (it may have changed during the wait)
    const { data: conv } = await supabase
      .from("webchat_conversations")
      .select("id, organization_id, channel, visitor_phone, lead_id, current_agent_id")
      .eq("id", body.conversation_id)
      .maybeSingle();

    if (!conv) {
      return new Response(JSON.stringify({ error: "conversation not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Safety: only send if this agent is still the active one
    if (conv.current_agent_id && conv.current_agent_id !== body.to_agent_id) {
      console.log("[handoff-greeter] aborting — current_agent_id changed");
      return new Response(JSON.stringify({ ok: true, skipped: "agent_changed" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Resolve variables
    let leadName = "";
    let productName = "";
    if (conv.lead_id) {
      const { data: lead } = await supabase
        .from("leads")
        .select("name, full_name")
        .eq("id", conv.lead_id)
        .maybeSingle();
      leadName = (lead?.full_name || lead?.name || "").split(" ")[0] || "";
    }
    if (agent.product_id) {
      const { data: prod } = await supabase
        .from("products")
        .select("name")
        .eq("id", agent.product_id)
        .maybeSingle();
      productName = prod?.name || "";
    }

    // Summary (optional)
    let summary = body.summary || "";
    if (!summary && agent.handoff_include_summary !== false) {
      const apiKey = Deno.env.get("LOVABLE_API_KEY");
      if (apiKey) summary = await generateSummary(conv.id, supabase, apiKey);
    }

    const text = renderTemplate(template, {
      nome: leadName,
      produto: productName,
      agente_anterior: body.from_agent_name || "",
      agent_name: agent.name || "",
      resumo: summary,
    });

    if (!text) {
      return new Response(JSON.stringify({ ok: true, skipped: "empty_after_render" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    await deliverViaChannel(supabase, conv, text);

    console.log("[handoff-greeter] delivered →", agent.name, "in conv", conv.id);

    return new Response(JSON.stringify({ ok: true, delivered: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("[handoff-greeter] error:", e);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
