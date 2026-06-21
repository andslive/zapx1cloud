import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/**
 * WhatsApp Send Proxy.
 * Acts as a compatible gateway for the frontend/CRM, 
 * routing all outgoing messages to uazapi-send.
 */
Deno.serve(async (req) => {

  console.log("WHATSAPP_SEND_VERSION", "2026-06-07-debug-v3");
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    
    // Proxy directly to uazapi-send
    const res = await fetch(`${supabaseUrl}/functions/v1/uazapi-send`, {
      method: "POST",
      headers: {
        ...Object.fromEntries(req.headers.entries()),
        Authorization: req.headers.get("Authorization") || `Bearer ${serviceKey}`,
      },
      body: await req.text(),
    });

    const body = await res.text();
    return new Response(body, {
      status: res.status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("[whatsapp-send] proxy exception:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});