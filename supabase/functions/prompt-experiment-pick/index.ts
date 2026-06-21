// Sprint 3 — Sortear variante de prompt num experimento ativo
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface PickRequest {
  organization_id: string;
  agent_id?: string;
  seed: string; // tipicamente lead_id ou conversation_id
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

    const { organization_id, agent_id, seed } =
      (await req.json()) as PickRequest;

    if (!organization_id || !seed) {
      return new Response(
        JSON.stringify({ error: "organization_id and seed required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Acha experimento ativo aplicável
    let q = supabase
      .from("ai_prompt_experiments")
      .select("id, name, agent_id, primary_metric")
      .eq("organization_id", organization_id)
      .eq("status", "running")
      .order("created_at", { ascending: false })
      .limit(1);

    if (agent_id) q = q.or(`agent_id.eq.${agent_id},agent_id.is.null`);
    else q = q.is("agent_id", null);

    const { data: exp } = await q;

    if (!exp || exp.length === 0) {
      return new Response(
        JSON.stringify({ ok: true, variant: null }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const experiment = exp[0];
    const { data: variants, error: vErr } = await supabase.rpc(
      "pick_prompt_variant",
      { p_experiment_id: experiment.id, p_seed: seed },
    );

    if (vErr || !variants || variants.length === 0) {
      return new Response(
        JSON.stringify({ ok: true, variant: null }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const variant = variants[0];

    // registra impressão
    await supabase.rpc("record_variant_impression", {
      p_variant_id: variant.variant_id,
    });

    return new Response(
      JSON.stringify({
        ok: true,
        experiment_id: experiment.id,
        experiment_name: experiment.name,
        variant: {
          id: variant.variant_id,
          label: variant.label,
          prompt_override: variant.prompt_override,
          prompt_mode: variant.prompt_mode,
        },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("prompt-experiment-pick error", e);
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
