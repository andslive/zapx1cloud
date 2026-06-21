import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (req) => {
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const url = new URL(req.url);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const error = url.searchParams.get("error");

    // Parse state to get user info
    let stateData: { userId: string; organizationId: string; redirectUrl: string; timestamp: number };
    
    try {
      stateData = JSON.parse(atob(state || ""));
    } catch {
      throw new Error("Invalid state parameter");
    }

    const { userId, organizationId, redirectUrl } = stateData;

    // Handle OAuth errors
    if (error) {
      console.error("OAuth error:", error);
      const errorRedirect = new URL(redirectUrl);
      errorRedirect.searchParams.set("google_calendar_error", error);
      return Response.redirect(errorRedirect.toString(), 302);
    }

    if (!code) {
      throw new Error("No authorization code received");
    }

    console.log(`Processing OAuth callback for user ${userId}`);

    // Get OAuth credentials from integration_settings
    const { data: oauthConfig, error: configError } = await supabase
      .from("integration_settings")
      .select("settings")
      .eq("organization_id", organizationId)
      .eq("integration_type", "google_calendar_oauth")
      .single();

    if (configError || !oauthConfig?.settings) {
      throw new Error("OAuth configuration not found");
    }

    const settings = oauthConfig.settings as { clientId: string; clientSecret: string };
    const callbackUrl = `${supabaseUrl}/functions/v1/google-calendar-callback`;

    // Exchange code for tokens
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: settings.clientId,
        client_secret: settings.clientSecret,
        code,
        grant_type: "authorization_code",
        redirect_uri: callbackUrl,
      }),
    });

    const tokenData = await tokenResponse.json();

    if (tokenData.error) {
      console.error("Token exchange error:", tokenData);
      // Persist last error for the admin to see in the integrations panel
      try {
        const merged = {
          ...(oauthConfig.settings as Record<string, unknown>),
          last_oauth_error: `${tokenData.error}: ${tokenData.error_description || ''}`.trim(),
          last_oauth_error_at: new Date().toISOString(),
        };
        await supabase
          .from("integration_settings")
          .update({ settings: merged })
          .eq("organization_id", organizationId)
          .eq("integration_type", "google_calendar_oauth");
      } catch (persistErr) {
        console.error("Failed to persist last_oauth_error:", persistErr);
      }
      throw new Error(`Token exchange failed: ${tokenData.error_description || tokenData.error}`);
    }

    console.log(`Token exchange successful for user ${userId}`);

    // Get user email from Google
    const userInfoResponse = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const userInfo = await userInfoResponse.json();

    // Calculate token expiry
    const expiresAt = new Date(Date.now() + (tokenData.expires_in * 1000)).toISOString();

    // Check if connection already exists
    const { data: existingConnection } = await supabase
      .from("google_calendar_connections")
      .select("id")
      .eq("user_id", userId)
      .single();

    const connectionData = {
      user_id: userId,
      organization_id: organizationId,
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      token_expires_at: expiresAt,
      google_email: userInfo.email,
      is_active: true,
      sync_enabled: true,
      sync_direction: "both",
      last_sync_at: null,
      connected_at: new Date().toISOString(),
    };

    if (existingConnection) {
      // Update existing connection
      const { error: updateError } = await supabase
        .from("google_calendar_connections")
        .update(connectionData)
        .eq("id", existingConnection.id);

      if (updateError) throw updateError;
      console.log(`Updated existing connection for user ${userId}`);
    } else {
      // Insert new connection
      const { error: insertError } = await supabase
        .from("google_calendar_connections")
        .insert(connectionData);

      if (insertError) throw insertError;
      console.log(`Created new connection for user ${userId}`);
    }

    // Redirect back to app with success
    const successRedirect = new URL(redirectUrl);
    successRedirect.searchParams.set("google_calendar_connected", "true");
    
    return Response.redirect(successRedirect.toString(), 302);

  } catch (err) {
    console.error("Error in google-calendar-callback:", err);
    const errorMessage = err instanceof Error ? err.message : "Unknown error";
    
    // Try to redirect with error, fallback to error response
    try {
      const url = new URL(req.url);
      const state = url.searchParams.get("state");
      if (state) {
        const stateData = JSON.parse(atob(state));
        const errorRedirect = new URL(stateData.redirectUrl);
        errorRedirect.searchParams.set("google_calendar_error", errorMessage);
        return Response.redirect(errorRedirect.toString(), 302);
      }
    } catch {
      // Can't redirect, return error response
    }

    return new Response(
      `<html><body><h1>Erro na conexão</h1><p>${errorMessage}</p><a href="/">Voltar</a></body></html>`,
      { 
        headers: { "Content-Type": "text/html" },
        status: 400
      }
    );
  }
});
