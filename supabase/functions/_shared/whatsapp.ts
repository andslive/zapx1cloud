import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export interface SendWhatsAppParams {
  supabase: SupabaseClient;
  organization_id: string;
  instance_id?: string;
  phone: string;
  text: string;
  source: string;
  payload?: any;
}

/**
 * Unified service to send WhatsApp messages.
 * Used by funnels, manual chat, and outreach actions.
 */
export async function sendUazapiTextMessage(params: SendWhatsAppParams) {
  const { supabase, organization_id, instance_id, phone, text, source, payload = {} } = params;

  console.log(`[whatsapp-service] [${source}] manual_send_start to ${phone} org=${organization_id}`);

  // 1. Resolve instance
  let resolvedInstanceId = instance_id;
  if (!resolvedInstanceId) {
    const { data: inst } = await supabase
      .from("evolution_instances")
      .select("id")
      .eq("organization_id", organization_id)
      .or("status.eq.connected,status.eq.online")
      .order("is_default", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    resolvedInstanceId = inst?.id;
  }

  if (!resolvedInstanceId) {
    console.error(`[whatsapp-service] [${source}] manual_send_failed: MISSING_CONNECTION`);
    return {
      success: false,
      error_code: "MISSING_CONNECTION",
      message: "Nenhuma instância WhatsApp conectada encontrada."
    };
  }

  // 2. Prepare payload (Internal envelope for whatsapp-send proxy)
  const evoPayload = {
    organization_id,
    instance_id: resolvedInstanceId,
    type: "text",
    to: phone,
    payload: {
      ...payload,
      text: text,
      skip_warmup: payload.skip_warmup ?? true
    }
  };

  console.log(`[whatsapp-service] [${source}] manual_send_before_whatsapp_send payload:`, JSON.stringify(evoPayload).slice(0, 500));

  // 3. Invoke proxy
  const { data: sendData, error: sendErr } = await supabase.functions.invoke("whatsapp-send", {
    body: evoPayload
  });

  console.log(`[whatsapp-service] [${source}] manual_send_whatsapp_response:`, { success: !sendErr && sendData?.ok, status: sendData?.status });

  if (sendErr || !sendData || sendData.ok === false || sendData.status === "error") {
    const errorMsg = sendErr?.message || sendData?.error || sendData?.body?.message || "Erro desconhecido na UazAPI";
    console.error(`[whatsapp-service] [${source}] manual_send_failed:`, errorMsg, sendData);
    
    // Bubble up the debug info from uazapi-send/whatsapp-send
    return {
      success: false,
      error_code: sendData?.error_code || "UAZAPI_SEND_FAILED",
      message: errorMsg,
      debug_version: "2026-06-07-debug-v3",
      called_function: "uazapi-send",
      endpoint_final: sendData?.debug?.endpoint_final,
      uazapi_status: sendData?.debug?.uazapi_status || sendData?.status,
      uazapi_response_text: sendData?.debug?.uazapi_response_text,
      uazapi_response_json: sendData?.debug?.uazapi_response_json || sendData?.body,
      payload_sent_to_uazapi: sendData?.debug?.body_final_enviado_para_uazapi,
      instance_resolution: {
        input_instance_id: instance_id,
        resolved_instance_id: resolvedInstanceId,
        uazapi_url: sendData?.debug?.endpoint_final,
        has_token: !!sendData?.debug?.headers_sent?.token
      },
      debug: {
        ...sendData?.debug,
        instance_id: resolvedInstanceId,
        phone: phone,
        uazapi_status: sendData?.status,
        uazapi_body: sendData?.body
      }
    };
  }

  const externalId = sendData.body?.id || sendData.body?.key?.id || sendData.body?.messageId;
  
  console.log(`[whatsapp-service] [${source}] manual_send_success messageId=${externalId}`);

  return {
    success: true,
    external_id: externalId,
    data: sendData
  };
}

// Keep backward compatibility if needed
export const sendWhatsAppText = sendUazapiTextMessage;

