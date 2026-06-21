// Cleanup cron: limpa __pending_receipt_media órfão (>30 min) das conversas
// que NÃO estão atualmente em um bloco ai_receipt. Não dispara Purchase/Pixel,
// não avança funil. Apenas remove a flag e audita em ai_receipt_audits.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const summary = {
    scanned: 0,
    cleaned: 0,
    skipped_in_ai_receipt: 0,
    skipped_too_recent: 0,
    errors: 0,
  };

  try {
    const { data: convs, error } = await supabase
      .from("webchat_conversations")
      .select(
        "id, organization_id, lead_id, current_flow_id, current_block_id, status, flow_variables",
      )
      .filter("flow_variables", "cs", '{"__pending_receipt_media": {}}')
      .neq("status", "closed")
      .limit(500);

    if (error) {
      console.error("[PENDING_RECEIPT_MEDIA_QUERY_FAILED]", error);
      return new Response(
        JSON.stringify({ ok: false, error: error.message, summary }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 },
      );
    }

    summary.scanned = convs?.length || 0;
    const nowMs = Date.now();

    // Pré-carrega blocos ai_receipt por funil para validar current_block
    const funnelIds = Array.from(
      new Set((convs || []).map((c: any) => c.current_flow_id).filter(Boolean)),
    );
    const aiReceiptBlockIdsByFunnel: Record<string, Set<string>> = {};
    if (funnelIds.length > 0) {
      const { data: funnels } = await supabase
        .from("capture_funnels")
        .select("id, flow_blocks")
        .in("id", funnelIds);
      for (const f of funnels || []) {
        const set = new Set<string>();
        try {
          for (const b of (f as any).flow_blocks || []) {
            if (String(b?.type || "").toLowerCase() === "ai_receipt" && b?.id) {
              set.add(String(b.id));
            }
          }
        } catch (_) { /* skip */ }
        aiReceiptBlockIdsByFunnel[(f as any).id] = set;
      }
    }

    for (const c of convs || []) {
      try {
        const fv: any = (c as any).flow_variables || {};
        const pending = fv?.__pending_receipt_media;
        if (!pending || typeof pending !== "object") continue;
        const recvAt = new Date(pending.received_at || 0).getTime();
        const ageMin = (nowMs - recvAt) / 60000;
        if (!Number.isFinite(ageMin) || ageMin < 30) {
          summary.skipped_too_recent++;
          continue;
        }
        // Se conversa ainda está em um bloco ai_receipt, preserva o buffer
        const set = aiReceiptBlockIdsByFunnel[(c as any).current_flow_id] || new Set<string>();
        if ((c as any).current_block_id && set.has(String((c as any).current_block_id))) {
          summary.skipped_in_ai_receipt++;
          continue;
        }

        const prevMedia = { ...pending };
        delete fv.__pending_receipt_media;

        const { error: upErr } = await supabase
          .from("webchat_conversations")
          .update({ flow_variables: fv })
          .eq("id", (c as any).id);
        if (upErr) {
          summary.errors++;
          console.warn("[PENDING_RECEIPT_MEDIA_UPDATE_FAILED]", { id: (c as any).id, err: upErr.message });
          continue;
        }

        console.log("[PENDING_RECEIPT_MEDIA_EXPIRED_CLEANUP]", JSON.stringify({
          conversation_id: (c as any).id,
          lead_id: (c as any).lead_id,
          current_block_id: (c as any).current_block_id,
          age_min: Math.round(ageMin),
          mime: prevMedia?.mime,
          message_id: prevMedia?.message_id,
        }));

        try {
          await supabase.from("ai_receipt_audits").insert({
            conversation_id: (c as any).id,
            lead_id: (c as any).lead_id,
            organization_id: (c as any).organization_id,
            funnel_id: (c as any).current_flow_id,
            block_id: (c as any).current_block_id,
            message_id: prevMedia?.message_id || null,
            source: "cleanup_cron",
            decision: "PENDING_RECEIPT_MEDIA_EXPIRED_CLEANUP",
            route: "none",
            identified: false,
            metadata: {
              age_min: Math.round(ageMin),
              mime: prevMedia?.mime,
              type: prevMedia?.type,
              url_present: !!prevMedia?.url,
              previous_pending: prevMedia,
            },
          });
        } catch (_) { /* best-effort */ }

        summary.cleaned++;
      } catch (innerErr) {
        summary.errors++;
        console.warn("[PENDING_RECEIPT_MEDIA_INNER_FAILED]", String(innerErr));
      }
    }

    return new Response(JSON.stringify({ ok: true, summary }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[PENDING_RECEIPT_MEDIA_CRON_FATAL]", e);
    return new Response(
      JSON.stringify({ ok: false, error: String(e), summary }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 },
    );
  }
});
