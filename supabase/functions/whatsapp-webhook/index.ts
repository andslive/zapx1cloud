import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

/**
 * WhatsApp Webhook Neutralized.
 * This function is legacy/generic and should not be used in production.
 * All WhatsApp incoming messages should go through uazapi-webhook.
 */
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  console.log("[whatsapp-webhook] Neutralized - Legacy request received");

  return new Response(
    JSON.stringify({
      status: "legacy",
      message: "This webhook is legacy and has been neutralized. Use uazapi-webhook for official traffic.",
    }),
    {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    }
  );
});

