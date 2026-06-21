import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface RefreshRequest {
  userId: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { userId } = await req.json() as RefreshRequest;

    if (!userId) {
      throw new Error("Missing userId parameter");
    }

    console.log(`Refreshing token for user ${userId}`);

    // Get user's connection
    const { data: connection, error: connError } = await supabase
      .from("google_calendar_connections")
      .select("*, organization_id")
      .eq("user_id", userId)
      .eq("is_active", true)
      .single();

    if (connError || !connection) {
      throw new Error("No active Google Calendar connection found");
    }

    if (!connection.refresh_token) {
      throw new Error("No refresh token available. User needs to reconnect.");
    }

    // Get OAuth credentials
    const { data: oauthConfig, error: configError } = await supabase
      .from("integration_settings")
      .select("settings")
      .eq("organization_id", connection.organization_id)
      .eq("integration_type", "google_calendar_oauth")
      .single();

    if (configError || !oauthConfig?.settings) {
      throw new Error("OAuth configuration not found");
    }

    const settings = oauthConfig.settings as { clientId: string; clientSecret: string };

    // Refresh the token
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: settings.clientId,
        client_secret: settings.clientSecret,
        refresh_token: connection.refresh_token,
        grant_type: "refresh_token",
      }),
    });

    const tokenData = await tokenResponse.json();

    if (tokenData.error) {
      console.error("Token refresh error:", tokenData);
      
      // If refresh fails, deactivate connection
      await supabase
        .from("google_calendar_connections")
        .update({ is_active: false })
        .eq("user_id", userId);

      throw new Error(`Token refresh failed: ${tokenData.error_description || tokenData.error}`);
    }

    // Calculate new expiry
    const expiresAt = new Date(Date.now() + (tokenData.expires_in * 1000)).toISOString();

    // Update connection with new tokens
    const { error: updateError } = await supabase
      .from("google_calendar_connections")
      .update({
        access_token: tokenData.access_token,
        token_expires_at: expiresAt,
        // Google may return a new refresh token
        ...(tokenData.refresh_token && { refresh_token: tokenData.refresh_token }),
      })
      .eq("user_id", userId);

    if (updateError) throw updateError;

    console.log(`Token refreshed successfully for user ${userId}`);

    return new Response(
      JSON.stringify({ 
        success: true,
        expiresAt
      }),
      { 
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200
      }
    );

  } catch (err) {
    console.error("Error in google-calendar-refresh:", err);
    const errorMessage = err instanceof Error ? err.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { 
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400
      }
    );
  }
});
