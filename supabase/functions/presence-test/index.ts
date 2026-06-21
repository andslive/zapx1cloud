// Edge Function: presence-test
// Dispara presence ("digitando..." ou "gravando áudio...") por X segundos
// SEM enviar nenhuma mensagem. Usado pelo Admin para validar se o WhatsApp
// do número testado mostra o status real.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { startTyping } from "../_shared/presence.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const auth = req.headers.get("Authorization");
    if (!auth) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { data: { user } } = await supabase.auth.getUser(auth.replace("Bearer ", ""));
    if (!user) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { data: profile } = await supabase
      .from("profiles").select("organization_id").eq("id", user.id).single();
    const organization_id = profile?.organization_id;
    if (!organization_id) {
      return new Response(JSON.stringify({ error: "no organization" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const instance_id = String(body.instance_id || "");
    const phoneRaw = String(body.phone || "");
    const isAudio = body.isAudio === true || body.state === "recording";
    const durationMs = Math.max(1000, Math.min(20000, Number(body.duration_ms) || 6000));

    if (!instance_id || !phoneRaw) {
      return new Response(JSON.stringify({ error: "instance_id and phone required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Confirma que a instância pertence à org
    const { data: inst } = await supabase
      .from("evolution_instances")
      .select("id, organization_id")
      .eq("id", instance_id)
      .eq("organization_id", organization_id)
      .maybeSingle();
    if (!inst) {
      return new Response(JSON.stringify({ error: "instance not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const phone = phoneRaw.replace(/\D/g, "");
    const handle = await startTyping(supabase, {
      organization_id,
      instance_id,
      phone,
      isAudio,
      durationMs,
    });
    await new Promise((r) => setTimeout(r, durationMs));
    await handle.stop();

    return new Response(
      JSON.stringify({ ok: true, state: isAudio ? "recording" : "composing", duration_ms: durationMs }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err: any) {
    console.error("[presence-test] error:", err);
    return new Response(JSON.stringify({ error: err?.message || String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
