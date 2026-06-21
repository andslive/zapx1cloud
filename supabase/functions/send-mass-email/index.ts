import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface MassEmailRequest {
  campaignId: string;
}

function renderTemplate(tpl: string, vars: Record<string, any>): string {
  return tpl.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, key) => {
    const v = vars[key];
    return v === undefined || v === null ? "" : String(v);
  });
}

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const jwt = authHeader.replace("Bearer ", "");
    const authClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!
    );
    const { data: claims, error: claimsErr } = await authClient.auth.getClaims(jwt);
    if (claimsErr || !claims?.claims?.sub) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const callerId = claims.claims.sub as string;

    const { campaignId }: MassEmailRequest = await req.json();

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data: roleRows } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", callerId);
    const isPrivileged = (roleRows ?? []).some((r: any) =>
      ["super_admin", "admin"].includes(r.role)
    );
    if (!isPrivileged) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: campaign, error: campaignError } = await supabase
      .from("mass_email_campaigns")
      .select("*")
      .eq("id", campaignId)
      .single();

    if (campaignError || !campaign) {
      throw new Error("Campaign not found");
    }

    const { data: recipients } = await supabase
      .from("mass_email_recipients")
      .select("*")
      .eq("campaign_id", campaignId)
      .eq("status", "pending");

    if (!recipients || recipients.length === 0) {
      return new Response(
        JSON.stringify({ message: "No pending recipients" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let sentCount = 0;
    let failedCount = 0;

    // Envia em batches via Lovable Emails (já tem fila + rate-limit)
    const batchSize = 25;
    for (let i = 0; i < recipients.length; i += batchSize) {
      const batch = recipients.slice(i, i + batchSize);
      await Promise.all(
        batch.map(async (recipient: any) => {
          try {
            const personalizedContent = renderTemplate(campaign.html_content, {
              userName: recipient.email.split("@")[0],
              email: recipient.email,
            });
            const personalizedSubject = renderTemplate(campaign.subject, {
              userName: recipient.email.split("@")[0],
              email: recipient.email,
            });

            const resp = await fetch(`${supabaseUrl}/functions/v1/send-transactional-email`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${supabaseServiceKey}`,
                apikey: supabaseServiceKey,
              },
              body: JSON.stringify({
                templateName: "platform-generic",
                recipientEmail: recipient.email,
                idempotencyKey: `campaign-${campaignId}-${recipient.id}`,
                templateData: {
                  __subject: personalizedSubject,
                  __html: personalizedContent,
                  __preview: personalizedSubject,
                },
              }),
            });

            if (resp.ok) {
              sentCount++;
              await supabase
                .from("mass_email_recipients")
                .update({ status: "sent", sent_at: new Date().toISOString() })
                .eq("id", recipient.id);
            } else {
              failedCount++;
              const txt = await resp.text();
              await supabase
                .from("mass_email_recipients")
                .update({ status: "failed", error_message: txt.slice(0, 500) })
                .eq("id", recipient.id);
            }
          } catch (error) {
            failedCount++;
            await supabase
              .from("mass_email_recipients")
              .update({ status: "failed", error_message: (error as Error).message })
              .eq("id", recipient.id);
          }
        })
      );
    }

    const newStats = {
      total: campaign.stats?.total ?? recipients.length,
      sent: (campaign.stats?.sent || 0) + sentCount,
      failed: (campaign.stats?.failed || 0) + failedCount,
    };

    await supabase
      .from("mass_email_campaigns")
      .update({ status: "sent", sent_at: new Date().toISOString(), stats: newStats })
      .eq("id", campaignId);

    return new Response(
      JSON.stringify({ success: true, sent: sentCount, failed: failedCount }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("Error in send-mass-email:", error);
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
