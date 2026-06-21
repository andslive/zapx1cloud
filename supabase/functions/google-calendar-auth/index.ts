import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface AuthRequest {
  userId: string;
  organizationId: string;
  redirectUrl: string;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { userId, organizationId, redirectUrl } = await req.json() as AuthRequest;

    if (!userId || !organizationId || !redirectUrl) {
      throw new Error("Missing required parameters: userId, organizationId, redirectUrl");
    }

    console.log(`Starting Google Calendar OAuth for user ${userId}`);

    // Get OAuth credentials from integration_settings
    const { data: oauthConfig, error: configError } = await supabase
      .from("integration_settings")
      .select("settings")
      .eq("organization_id", organizationId)
      .eq("integration_type", "google_calendar_oauth")
      .single();

    if (configError || !oauthConfig?.settings) {
      console.error("OAuth config not found:", configError);
      throw new Error("Google Calendar não está configurado para esta organização. O administrador precisa configurar as credenciais OAuth primeiro.");
    }

    const settings = oauthConfig.settings as { clientId?: string; clientSecret?: string };
    
    if (!settings.clientId || !settings.clientSecret) {
      throw new Error("Credenciais OAuth incompletas. Configure Client ID e Client Secret.");
    }

    // Create a state token with user info (base64 encoded JSON)
    const stateData = {
      userId,
      organizationId,
      redirectUrl,
      timestamp: Date.now(),
    };
    const state = btoa(JSON.stringify(stateData));

    // Google OAuth scopes for calendar access
    const scopes = [
      "https://www.googleapis.com/auth/calendar.readonly",
      "https://www.googleapis.com/auth/calendar.events",
      "https://www.googleapis.com/auth/userinfo.email",
    ];

    // Build the callback URL (edge function URL)
    const callbackUrl = `${supabaseUrl}/functions/v1/google-calendar-callback`;

    // Build Google OAuth URL
    const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    authUrl.searchParams.set("client_id", settings.clientId);
    authUrl.searchParams.set("redirect_uri", callbackUrl);
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("scope", scopes.join(" "));
    authUrl.searchParams.set("access_type", "offline");
    authUrl.searchParams.set("prompt", "consent");
    authUrl.searchParams.set("state", state);

    console.log(`Generated OAuth URL for user ${userId}`);

    return new Response(
      JSON.stringify({ 
        authUrl: authUrl.toString(),
        message: "Redirect user to authUrl to start OAuth flow"
      }),
      { 
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200
      }
    );

  } catch (error) {
    console.error("Error in google-calendar-auth:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { 
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400
      }
    );
  }
});
