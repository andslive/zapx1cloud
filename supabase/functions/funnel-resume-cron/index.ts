import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // BALANCED PER-CHIP DRAIN
    // Pull a wider window of expired locks (oldest first), then cap per chip
    // (connection_id / evolution_instance_id) so a single chip never receives
    // a burst of resumes while others stay idle.
    const FETCH_WINDOW = 60; // oldest candidates to inspect per run
    const MAX_PER_CHIP = 2;  // cap of resumes per chip per execution
    const HARD_CAP = 20;     // global safety cap per execution
    const REQUEST_DELAY_MS = 120;

    const { data: expiredConvs, error: fetchError } = await supabase
      .from("webchat_conversations")
      .select("id, organization_id, connection_id, evolution_instance_id, bot_locked_until")
      .eq("status", "bot_active")
      .lte("bot_locked_until", new Date().toISOString())
      .not("current_block_id", "is", null)
      .order("bot_locked_until", { ascending: true })
      .limit(FETCH_WINDOW);

    if (fetchError) throw fetchError;

    if (!expiredConvs || expiredConvs.length === 0) {
      return new Response(JSON.stringify({ processed: 0, backlog_window: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Bucket by chip and pick up to MAX_PER_CHIP oldest from each
    const perChip: Record<string, typeof expiredConvs> = {};
    for (const c of expiredConvs) {
      const chip = (c as any).connection_id || (c as any).evolution_instance_id || "__none__";
      if (!perChip[chip]) perChip[chip] = [] as any;
      if (perChip[chip].length < MAX_PER_CHIP) perChip[chip].push(c);
    }
    const selected: typeof expiredConvs = [];
    for (const chip of Object.keys(perChip)) {
      for (const c of perChip[chip]) {
        if (selected.length >= HARD_CAP) break;
        selected.push(c);
      }
      if (selected.length >= HARD_CAP) break;
    }

    console.log(
      `[funnel-resume-cron] window=${expiredConvs.length} chips=${Object.keys(perChip).length} selected=${selected.length}`,
    );
    let processed = 0;
    const perChipProcessed: Record<string, number> = {};

    for (const conv of selected) {
      try {
        const chip = (conv as any).connection_id || (conv as any).evolution_instance_id || "__none__";
        const response = await fetch(`${supabaseUrl}/functions/v1/uazapi-webhook`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${serviceKey}`,
            "apikey": serviceKey,
          },
          body: JSON.stringify({
            action: "resume_funnel",
            conversationId: conv.id,
          }),
        });

        if (!response.ok) {
          const errorText = await response.text().catch(() => "Unknown error");
          console.warn(`[funnel-resume-cron] Failed to resume conv ${conv.id}: ${response.status} ${errorText}`);
        } else {
          processed++;
          perChipProcessed[chip] = (perChipProcessed[chip] || 0) + 1;
        }

        await new Promise(resolve => setTimeout(resolve, REQUEST_DELAY_MS));
      } catch (err) {
        console.error(`[funnel-resume-cron] Error resuming conv ${conv.id}:`, err);
      }
    }

    return new Response(
      JSON.stringify({
        processed,
        selected: selected.length,
        backlog_window: expiredConvs.length,
        chips: Object.keys(perChip).length,
        per_chip_processed: perChipProcessed,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err: any) {
    console.error("[funnel-resume-cron] global error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
