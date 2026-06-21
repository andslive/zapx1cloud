import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

/**
 * Evolution Send Neutralized.
 * This function is legacy and should not be used in production.
 * All WhatsApp messages should be sent through uazapi-send via whatsapp-send.
 */
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  console.log("[evolution-send] Neutralized - Legacy send attempt blocked");

  return new Response(
    JSON.stringify({
      status: "legacy",
      message: "Evolution provider is legacy and has been neutralized. No message sent.",
    }),
    {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    }
  );
});

