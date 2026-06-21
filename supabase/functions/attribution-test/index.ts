import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Authenticate caller and require super_admin
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Não autenticado");
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: userData } = await userClient.auth.getUser();
    const user = userData?.user;
    if (!user) throw new Error("Não autenticado");

    const { data: profile } = await supabase
      .from("profiles").select("organization_id").eq("id", user.id).single();
    const orgId = profile?.organization_id;
    if (!orgId) throw new Error("Organização não encontrada");

    const { data: roles } = await supabase
      .from("user_roles").select("role").eq("user_id", user.id);
    const isAdmin = roles?.some((r: any) => ["super_admin", "admin"].includes(r.role));
    if (!isAdmin) throw new Error("Acesso negado");

    const testData = {
      source: "facebook_ads",
      fbclid: `TEST_FBCLID_${Date.now()}`,
      ctwa_clid: `TEST_CTWA_${Date.now()}`,
      campaign_id: "123456789",
      adset_id: "987654321",
      ad_id: "555666777",
      utm_source: "facebook",
      utm_medium: "cpc",
      utm_campaign: "teste-comprovante",
      utm_content: "criativo-01",
    };

    const phone = `5511${Math.floor(900000000 + Math.random() * 99999999)}`;

    const { data: lead, error: leadError } = await supabase
      .from("leads")
      .insert({
        organization_id: orgId,
        name: "Lead Teste Atribuição",
        phone,
        source: testData.source,
        lead_origin: "facebook_ads",
        lead_channel: "facebook",
        utm_source: testData.utm_source,
        utm_medium: testData.utm_medium,
        utm_campaign: testData.utm_campaign,
        utm_content: testData.utm_content,
        fbclid: testData.fbclid,
        ctwa_clid: testData.ctwa_clid,
        campaign_id: testData.campaign_id,
        adset_id: testData.adset_id,
        ad_id: testData.ad_id,
        metadata: { is_test: true, ...testData },
      })
      .select()
      .single();
    if (leadError) throw new Error(`leads: ${leadError.message}`);

    const { data: conv, error: convError } = await supabase
      .from("webchat_conversations")
      .insert({
        organization_id: orgId,
        lead_id: lead.id,
        channel: "whatsapp",
        status: "bot_active",
        visitor_phone: phone,
        visitor_name: lead.name,
        metadata: {
          is_test: true,
          fbclid: testData.fbclid,
          ctwa_clid: testData.ctwa_clid,
          ad_id: testData.ad_id,
          campaign_id: testData.campaign_id,
          adset_id: testData.adset_id,
        },
      })
      .select()
      .single();
    if (convError) throw new Error(`webchat_conversations: ${convError.message}`);

    const { data: tracking, error: trackingError } = await supabase
      .from("lead_tracking")
      .insert({
        lead_id: lead.id,
        source: testData.source,
        utm_source: testData.utm_source,
        utm_medium: testData.utm_medium,
        utm_campaign: testData.utm_campaign,
        utm_content: testData.utm_content,
        fbclid: testData.fbclid,
        referral_ctwa_clid: testData.ctwa_clid,
        campaign_id: testData.campaign_id,
        adset_id: testData.adset_id,
        ad_id: testData.ad_id,
        raw_payload: testData,
      })
      .select()
      .single();
    if (trackingError) throw new Error(`lead_tracking: ${trackingError.message}`);

    return new Response(
      JSON.stringify({
        success: true,
        lead_id: lead.id,
        conversation_id: conv.id,
        lead_data: lead,
        conversation_data: conv,
        lead_tracking: tracking,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e: any) {
    console.error("attribution-test error:", e);
    return new Response(
      JSON.stringify({ error: e?.message || String(e) }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
