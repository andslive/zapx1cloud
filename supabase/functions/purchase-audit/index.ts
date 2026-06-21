
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function hashData(data: string): Promise<string> {
  const normalized = (data || "").trim().toLowerCase().replace(/\+/g, "");
  const msgUint8 = new TextEncoder().encode(normalized);
  const hashBuffer = await crypto.subtle.digest("SHA-256", msgUint8);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function sendFacebookConversion(
  pixelId: string,
  accessToken: string,
  eventName: string,
  userData: {
    phone?: string;
    email?: string;
    fn?: string;
    external_id?: string;
    fbc?: string;
  },
  customData: {
    value?: number;
    currency?: string;
    campaign_id?: string;
    adset_id?: string;
    ad_id?: string;
    ctwa_clid?: string;
  }
) {
  const url = `https://graph.facebook.com/v18.0/${pixelId}/events?access_token=${accessToken}`;

  const user_data: any = {};
  if (userData.phone) user_data.ph = [await hashData(userData.phone)];
  if (userData.email) user_data.em = [await hashData(userData.email)];
  if (userData.fn) user_data.fn = [await hashData(userData.fn)];
  if (userData.external_id) {
    user_data.external_id = [await hashData(userData.external_id)];
  }
  if (userData.fbc) {
    user_data.fbc = userData.fbc;
  }

  const custom_data: any = {};
  if (customData.value !== undefined) custom_data.value = customData.value;
  if (customData.currency) custom_data.currency = customData.currency;
  if (customData.campaign_id) custom_data.campaign_id = customData.campaign_id;
  if (customData.adset_id) custom_data.adset_id = customData.adset_id;
  if (customData.ad_id) custom_data.ad_id = customData.ad_id;
  if (customData.ctwa_clid) custom_data.ctwa_clid = customData.ctwa_clid;

  const payload: any = {
    data: [
      {
        event_name: eventName,
        event_time: Math.floor(Date.now() / 1000),
        event_id: `capi_manual_${crypto.randomUUID()}`,
        action_source: "system_generated",
        user_data,
        custom_data: {
          ...custom_data,
          value: parseFloat(custom_data.value) || 10.00
        },
      },
    ],
  };


  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const respText = await response.text();
  let respData = {};
  try {
    respData = JSON.parse(respText);
  } catch {
    respData = { raw: respText };
  }

  return { 
    success: response.ok, 
    payload, 
    response: respData,
    status: response.status 
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { conversation_id, event_name, lead_id, flow_id, force = false } = await req.json();

    if (!conversation_id || !event_name) {
      return new Response(JSON.stringify({ error: "Missing params" }), { 
        status: 400, 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      });
    }

    console.log(`[manual_pixel_reprocess_start] conv=${conversation_id} event=${event_name}`);

    // 1. Get Lead and Conversation data
    const { data: conv } = await supabase
      .from("webchat_conversations")
      .select("*, leads(*)")
      .eq("id", conversation_id)
      .single();

    if (!conv) throw new Error("Conversation not found");
    const lead = conv.leads;
    const orgId = conv.organization_id;

    // 2. Load Funnel to find the Pixel block
    const funnelId = flow_id || conv.current_flow_id;
    const { data: funnel } = await supabase
      .from("capture_funnels")
      .select("flow_blocks")
      .eq("id", funnelId)
      .single();

    if (!funnel) throw new Error("Funnel not found");

    const blocks = funnel.flow_blocks as any[];
    // Find pixel block with the same event_name
    const pixelBlock = blocks.find(b => 
      b.type === "pixel" && 
      (b.data?.pixel_event_type === event_name || b.data?.event_name === event_name)
    );

    if (!pixelBlock) throw new Error(`Pixel block for ${event_name} not found in funnel`);
    
    console.log(`[pixel_block_enter] block_id=${pixelBlock.id}`);

    // 3. Check for existing event (dedup)
    if (!force) {
      const { data: existing } = await supabase
        .from("pixel_event_logs")
        .select("id, created_at")
        .eq("conversation_id", conversation_id)
        .eq("block_id", pixelBlock.id)
        .eq("event_name", event_name)
        .maybeSingle();

      if (existing) {
        console.log(`[manual_pixel_reprocess_skipped_duplicate] existing_id=${existing.id}`);
        return new Response(JSON.stringify({ 
          success: true, 
          skipped: "duplicate", 
          existing_id: existing.id,
          created_at: existing.created_at
        }), { 
          headers: { ...corsHeaders, "Content-Type": "application/json" } 
        });
      }
    }

    // 4. Load attribution and integration
    const { data: integ } = await supabase
      .from("facebook_lead_integrations")
      .select("pixel_id, pixel_access_token")
      .eq("organization_id", orgId)
      .eq("is_active", true)
      .limit(1)
      .maybeSingle();

    if (!integ?.pixel_id || !integ?.pixel_access_token) {
      throw new Error("Facebook Pixel integration not found or inactive for this organization");
    }

    // Get variables from conv.flow_variables
    const flowVars = conv.flow_variables || {};
    const valueRaw = pixelBlock.data.pixel_item_value;
    
    // Simple variable replacement for value
    let valueStr = String(valueRaw || "");
    if (valueStr && valueStr.includes('{{')) {
        for (const [k, v] of Object.entries(flowVars)) {
            valueStr = valueStr.replace(new RegExp(`{{${k}}}`, 'g'), String(v));
        }
    }
    
    // Fallback: if value is still empty or "{{...}}", use lead metadata or default
    if (!valueStr || String(valueStr).includes('{{')) {
        const flowVal = flowVars["valorcomprovante"];
        const metaVal = lead.metadata?.valorcomprovante;
        valueStr = (flowVal && !String(flowVal).includes('{{')) ? String(flowVal) : 
                   (metaVal && !String(metaVal).includes('{{')) ? String(metaVal) : "10.00";
        console.log(`[pixel_value_fallback] chosen_value=${valueStr} (flow=${flowVal}, meta=${metaVal})`);
    }
    
    const finalValue = parseFloat(String(valueStr).replace(/[^\d.,]/g, "").replace(",", "."));



    
    const leadPhone = flowVars["telefone"] || flowVars["phone"] || lead.phone;
    const leadEmail = flowVars["email"] || lead.email;
    const leadName = flowVars["nome"] || flowVars["name"] || lead.name;
    const fbclid = flowVars["fbclid"] || lead.fbclid;
    const ctwa_clid = flowVars["ctwa_clid"] || lead.ctwa_clid;
    const campaign_id = flowVars["campaign_id"] || lead.campaign_id;
    const adset_id = flowVars["adset_id"] || lead.adset_id;
    const ad_id = flowVars["ad_id"] || lead.ad_id;
    
    const creationTime = lead.created_at ? new Date(lead.created_at).getTime() : Date.now();
    const fbc = fbclid ? `fb.1.${creationTime}.${fbclid}` : undefined;

    console.log(`[pixel_attribution_loaded] fbclid=${fbclid}, ctwa_clid=${ctwa_clid}`);

    // 5. Send to Meta
    const result = await sendFacebookConversion(
      integ.pixel_id,
      integ.pixel_access_token,
      event_name,
      {
        phone: leadPhone,
        email: leadEmail,
        fn: leadName,
        external_id: lead.id,
        fbc: fbc,
      },
      {
        value: isNaN(finalValue) ? 10.00 : finalValue,
        currency: pixelBlock.data.pixel_currency || "BRL",
        campaign_id,
        adset_id,
        ad_id,
        ctwa_clid,
      }
    );

    console.log(`[pixel_payload_final] ${JSON.stringify(result.payload)}`);
    console.log(`[pixel_meta_response] ${JSON.stringify(result.response)}`);

    // 6. Log to DB
    await supabase.from("pixel_event_logs").insert({
      conversation_id: conversation_id,
      lead_id: lead.id,
      block_id: pixelBlock.id,
      event_name: event_name,
      pixel_id: integ.pixel_id,
      payload: result.payload,
      response: result.response,
      success: result.success,
    });

    console.log(`[manual_pixel_reprocess_success] event_id=${result.payload.data[0].event_id}`);

    return new Response(JSON.stringify({
      success: result.success,
      event_id: result.payload.data[0].event_id,
      fbtrace_id: result.response.fbtrace_id,
      payload: result.payload,
      meta_response: result.response
    }), { 
      headers: { ...corsHeaders, "Content-Type": "application/json" } 
    });

  } catch (error: any) {
    console.error("[manual_pixel_reprocess_error]", error);
    return new Response(JSON.stringify({ error: error.message }), { 
      status: 500, 
      headers: { ...corsHeaders, "Content-Type": "application/json" } 
    });
  }
});
