import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendPlatformEmail } from "../_shared/platform-email-send.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface NotificationEmailRequest {
  adminNotificationId: string;
  recipients: Array<{ email: string; name: string }>;
  title: string;
  message: string;
  actionUrl?: string;
  type: string;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { adminNotificationId, recipients, title, message, actionUrl, type }: NotificationEmailRequest = await req.json();

    if (!recipients || recipients.length === 0) {
      return new Response(JSON.stringify({ error: "No recipients provided" }), { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } });
    }

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: platformSettings } = await supabase
      .from("platform_settings")
      .select("platform_name")
      .maybeSingle();
    const platformName = platformSettings?.platform_name || "X1ZAP";

    const actionBlock = actionUrl
      ? `<p style="margin:24px 0"><a href="${actionUrl}" style="background:#a3e635;color:#1f2937;padding:12px 24px;text-decoration:none;border-radius:8px;font-weight:600">Ver detalhes</a></p>`
      : "";

    let emailsSent = 0;
    let emailsFailed = 0;
    const errors: string[] = [];

    for (const recipient of recipients) {
      const result = await sendPlatformEmail({
        slug: "admin_notification",
        to: recipient.email,
        idempotencyKey: `admnotif-${adminNotificationId}-${recipient.email}`,
        variables: {
          platform_name: platformName,
          user_name: recipient.name || recipient.email.split("@")[0],
          title,
          message: message || "Você recebeu uma nova notificação do sistema.",
          action_block: actionBlock,
        },
      });
      if (result.ok) emailsSent++;
      else {
        emailsFailed++;
        errors.push(`${recipient.email}: ${result.error}`);
      }
    }

    await supabase.from("admin_notifications").update({ emails_sent: emailsSent, emails_failed: emailsFailed }).eq("id", adminNotificationId);

    return new Response(JSON.stringify({ success: true, emailsSent, emailsFailed, errors: errors.length > 0 ? errors : undefined }), { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } });
  } catch (error: any) {
    console.error("Error:", error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } });
  }
};

serve(handler);
