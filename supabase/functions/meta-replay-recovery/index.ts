// One-shot replay of recovered Purchase events to Meta CAPI.
// Reuses the deterministic recover::<conversation_id>::<message_id> event_id
// from purchase_audit (purchase_source='manual_recovery_audit').
//
// Strict guards per conversation:
//  - require existing manual_recovery_audit row
//  - require ZERO pixel_event_logs with event_name='Purchase'
//  - require ZERO pixel_event_logs whose payload.data[0].event_id equals the audit event_id
//  - require ZERO previous purchase_audit row with purchase_source='manual_meta_recovery'
//
// On success:
//  - POSTs Purchase to graph.facebook.com using the audit event_id
//  - inserts pixel_event_logs row
//  - inserts new purchase_audit row with purchase_source='manual_meta_recovery'
//
// Does NOT touch flow_variables, current_block_id, flow_completed, status, or
// send any message to the lead.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// Lote A approved conversations
const LOTE_A_CONVERSATIONS = [
  "77fe5960-68ab-4da8-ab96-4e0ef067946e", // PETRUCIUS GONDIM COELHO
  "e5d0a5bc-e716-4a46-abbc-a4a8af6004fd", // MARIA SANTOS DA SILVA
  "fccc360c-6ff5-4744-addd-2cc3e536101c", // Denise de Assunção Navarro
  "9c417418-2832-4887-9324-7ec1b6bd09fe", // Wilson Carneiro de Paula Pessoa
  "b167fb79-07b0-4d51-b5a2-9e8a6861dc34", // SHERIDAN VIEIRA DOS REIS
  "e93960f9-0627-4649-b976-a2edded15a47", // LUZINEIDE BATISTA SALES
  "3291c7f0-cd06-44bd-95f2-780d8f97d04e", // Simone Cleide Firmino de Araujo
  "2d7ae522-5830-4cef-9414-eb8216de6abd", // Voleide Maria Nogueira
];

const PIXEL_BLOCK_ID = "block_1780625391492_mtmzfrw4n";

async function hashData(data: string): Promise<string> {
  const normalized = (data || "").trim().toLowerCase().replace(/\+/g, "");
  const buf = new TextEncoder().encode(normalized);
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function sendPurchase(
  pixelId: string,
  accessToken: string,
  eventId: string,
  userData: Record<string, any>,
  customData: Record<string, any>,
  actionSource: string,
  dryRun: boolean,
) {
  const user_data: any = {};
  if (userData.phone) user_data.ph = [await hashData(userData.phone)];
  if (userData.email) user_data.em = [await hashData(userData.email)];
  if (userData.fn) user_data.fn = [await hashData(userData.fn)];
  if (userData.external_id) {
    user_data.external_id = [await hashData(userData.external_id)];
  }
  if (userData.fbc) user_data.fbc = userData.fbc;
  if (userData.fbp) user_data.fbp = userData.fbp;
  if (userData.client_ip_address) user_data.client_ip_address = userData.client_ip_address;
  if (userData.client_user_agent) user_data.client_user_agent = userData.client_user_agent;

  const payload = {
    data: [
      {
        event_name: "Purchase",
        event_time: Math.floor(Date.now() / 1000),
        event_id: eventId,
        action_source: actionSource,
        user_data,
        custom_data: customData,
      },
    ],
  };

  if (dryRun) {
    return { success: true, dryRun: true, payload, response: { dryRun: true } };
  }

  const url =
    `https://graph.facebook.com/v18.0/${pixelId}/events?access_token=${accessToken}`;
  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const txt = await resp.text();
    let body: any;
    try { body = JSON.parse(txt); } catch { body = { raw: txt }; }
    return { success: resp.ok, payload, response: body };
  } catch (e) {
    return { success: false, payload, response: { error: String(e) } };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const body = await req.json().catch(() => ({}));
  const dryRun = body.dry_run === true;
  const conversationIds: string[] =
    Array.isArray(body.conversation_ids) && body.conversation_ids.length > 0
      ? body.conversation_ids
      : LOTE_A_CONVERSATIONS;

  const report: any[] = [];
  let sent = 0;
  let aborted = 0;

  for (const conversationId of conversationIds) {
    const row: any = { conversation_id: conversationId };
    try {
      // 1. Load the manual_recovery_audit row
      const { data: audit, error: aErr } = await supabase
        .from("purchase_audit")
        .select("*")
        .eq("conversation_id", conversationId)
        .eq("purchase_source", "manual_recovery_audit")
        .like("event_id", "recover::%")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (aErr || !audit) {
        row.status = "aborted";
        row.reason = "no_manual_recovery_audit";
        aborted++;
        report.push(row);
        continue;
      }
      row.lead_name = audit.customer_name;
      row.value = audit.purchase_value;
      row.event_id = audit.event_id;
      row.lead_id = audit.lead_id;

      // 2. Block if there is ANY Purchase pixel_event_log for this conversation
      const { count: purchaseCount } = await supabase
        .from("pixel_event_logs")
        .select("*", { count: "exact", head: true })
        .eq("conversation_id", conversationId)
        .eq("event_name", "Purchase");
      if ((purchaseCount ?? 0) > 0) {
        row.status = "aborted";
        row.reason = "existing_purchase_pixel_log";
        aborted++;
        report.push(row);
        continue;
      }

      // 3. Block if any pixel_event_log already uses this event_id
      const { data: sameEvent } = await supabase
        .from("pixel_event_logs")
        .select("id")
        .eq("payload->data->0->>event_id", audit.event_id)
        .limit(1);
      if (sameEvent && sameEvent.length > 0) {
        row.status = "aborted";
        row.reason = "event_id_already_logged";
        aborted++;
        report.push(row);
        continue;
      }

      // 4. Block if a manual_meta_recovery audit already exists
      const { data: priorMeta } = await supabase
        .from("purchase_audit")
        .select("id")
        .eq("conversation_id", conversationId)
        .eq("purchase_source", "manual_meta_recovery")
        .limit(1);
      if (priorMeta && priorMeta.length > 0) {
        row.status = "aborted";
        row.reason = "manual_meta_recovery_already_done";
        aborted++;
        report.push(row);
        continue;
      }

      // 5. Resolve attribution
      const [{ data: lead }, { data: lt }, { data: integ }, { data: conv }] =
        await Promise.all([
          supabase
            .from("leads")
            .select(
              "id, phone, email, name, fbclid, ctwa_clid, campaign_id, campaign_name, adset_id, adset_name, ad_id, ad_name, ad_headline, ad_source_url, entry_point_conversion_source, ctwa_detected, created_at",
            )
            .eq("id", audit.lead_id)
            .maybeSingle(),
          supabase
            .from("lead_tracking")
            .select(
              "fbclid, ctwa_clid, campaign_id, campaign_name, adset_id, adset_name, ad_id, ad_name, ad_source_id, ad_source_type, ad_source_url, ad_headline, entry_point_conversion_source, entry_point_conversion_app, created_at",
            )
            .eq("lead_id", audit.lead_id)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle(),
          supabase
            .from("facebook_lead_integrations")
            .select("pixel_id, pixel_access_token, page_id")
            .eq("is_active", true)
            .eq("pixel_id", "3339769916196814")
            .maybeSingle(),
          supabase
            .from("webchat_conversations")
            .select("ctwa_data, flow_variables, organization_id")
            .eq("id", conversationId)
            .maybeSingle(),
        ]);

      if (!integ?.pixel_id || !integ?.pixel_access_token) {
        row.status = "aborted";
        row.reason = "no_facebook_integration";
        aborted++;
        report.push(row);
        continue;
      }

      const fv = (conv?.flow_variables as any) || {};
      const ctwa = (conv?.ctwa_data as any) || {};
      const pick = (...xs: any[]) =>
        xs.find((v) =>
          v !== undefined && v !== null && String(v).trim() !== "" &&
          String(v) !== "undefined" && String(v) !== "null"
        );

      const fbclid = pick(fv.fbclid, ctwa.fbclid, lt?.fbclid, lead?.fbclid);
      const ctwa_clid = pick(fv.ctwa_clid, ctwa.ctwa_clid, lt?.ctwa_clid, lead?.ctwa_clid);
      const leadCreatedAt = fv.lead_created_at || lead?.created_at;
      const creationTime = leadCreatedAt
        ? new Date(leadCreatedAt).getTime()
        : Date.now();
      const fbc = fbclid ? `fb.1.${creationTime}.${fbclid}` : undefined;
      const isCtwa = !!(ctwa_clid || ctwa.ctwa_payload ||
        pick(lt?.entry_point_conversion_source, lead?.entry_point_conversion_source) === "ctwa_ad" ||
        lead?.ctwa_detected);
      const action_source = isCtwa ? "chat" : "system_generated";

      const customData: any = {
        value: Number(audit.purchase_value),
        currency: audit.currency || "BRL",
      };
      const optionalCD = {
        campaign_id: pick(fv.campaign_id, lt?.campaign_id, lead?.campaign_id),
        campaign_name: pick(fv.campaign_name, lt?.campaign_name, lead?.campaign_name),
        adset_id: pick(fv.adset_id, lt?.adset_id, lead?.adset_id),
        adset_name: pick(fv.adset_name, lt?.adset_name, lead?.adset_name),
        ad_id: pick(fv.ad_id, lt?.ad_id, lead?.ad_id),
        ad_name: pick(fv.ad_name, lt?.ad_name, lead?.ad_name),
        ctwa_clid,
        ad_source_id: pick(ctwa.ad_source_id, lt?.ad_source_id),
        ad_source_type: pick(ctwa.ad_source_type, lt?.ad_source_type),
        ad_source_url: pick(ctwa.ad_source_url, lt?.ad_source_url, lead?.ad_source_url),
        ad_headline: pick(ctwa.ad_headline, lt?.ad_headline, lead?.ad_headline),
        entry_point_conversion_source: pick(ctwa.entry_point_conversion_source, lt?.entry_point_conversion_source, lead?.entry_point_conversion_source),
        entry_point_conversion_app: pick(ctwa.entry_point_conversion_app, lt?.entry_point_conversion_app),
      };
      for (const [k, v] of Object.entries(optionalCD)) {
        if (v !== undefined && v !== null && String(v) !== "") {
          customData[k] = v;
        }
      }

      const userData = {
        phone: audit.phone || lead?.phone,
        email: lead?.email,
        fn: audit.customer_name || lead?.name,
        external_id: audit.lead_id,
        fbc,
        fbp: pick(fv.fbp, ctwa.fbp),
        client_ip_address: pick(fv.client_ip_address, fv.ip),
        client_user_agent: pick(fv.client_user_agent, fv.user_agent),
      };

      // 6. Send to Meta CAPI
      const result = await sendPurchase(
        integ.pixel_id,
        integ.pixel_access_token,
        audit.event_id,
        userData,
        customData,
        action_source,
        dryRun,
      );

      // 7. Persist pixel_event_logs + new purchase_audit row
      if (!dryRun) {
        const { error: pelErr } = await supabase.from("pixel_event_logs").insert({
          conversation_id: conversationId,
          lead_id: audit.lead_id,
          block_id: PIXEL_BLOCK_ID,
          event_name: "Purchase",
          pixel_id: integ.pixel_id,
          payload: result.payload,
          response: result.response,
          success: result.success,
        });
        if (pelErr) {
          row.pixel_log_insert_error = pelErr.message;
        }

        await supabase.from("purchase_audit").insert({
          lead_id: audit.lead_id,
          conversation_id: conversationId,
          connection_id: audit.connection_id,
          phone: audit.phone,
          customer_name: audit.customer_name,
          purchase_value: audit.purchase_value,
          currency: audit.currency || "BRL",
          campaign_id: customData.campaign_id,
          campaign_name: customData.campaign_name,
          adset_id: customData.adset_id,
          adset_name: customData.adset_name,
          ad_id: customData.ad_id,
          ad_name: customData.ad_name,
          ctwa_clid: customData.ctwa_clid,
          ad_source_id: customData.ad_source_id,
          ad_source_type: customData.ad_source_type,
          entry_point_conversion_source: customData.entry_point_conversion_source,
          action_source,
          pixel_id: integ.pixel_id,
          event_id: audit.event_id,
          fbtrace_id: result.response?.fbtrace_id,
          meta_status: result.success ? "success" : "failed",
          purchase_status: result.success ? "success" : "failed",
          purchase_source: "manual_meta_recovery",
          pixel_block_id: PIXEL_BLOCK_ID,
          raw_payload: result.payload,
          raw_response: result.response,
          error_details: result.success ? null : result.response,
        });
      }

      row.action_source = action_source;
      row.meta_success = result.success;
      row.fbtrace_id = result.response?.fbtrace_id || null;
      row.status = result.success ? "sent" : "meta_error";
      if (!result.success) {
        row.reason = JSON.stringify(result.response).slice(0, 400);
        aborted++;
      } else {
        sent++;
      }
    } catch (e) {
      row.status = "aborted";
      row.reason = `exception: ${String(e).slice(0, 200)}`;
      aborted++;
    }
    report.push(row);
  }

  return new Response(
    JSON.stringify({
      dry_run: dryRun,
      total: conversationIds.length,
      sent,
      aborted,
      report,
    }, null, 2),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
