import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { normalizePhoneBR } from "../_shared/phone.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface SendBody {
  organization_id?: string;
  instance_id?: string; 
  type: string;
  to: string; 
  payload: any;
}

async function uazFetch(url: string, token: string, path: string, body: any, method = "POST") {
  const fullUrl = `${url}${path}`;
  const maskedToken = token ? (token.length > 8 ? token.substring(0, 6) + "..." + token.substring(token.length - 4) : "****") : "null";
  
  const headers = { 
    "Content-Type": "application/json", 
    "token": token,
    "apikey": token
  };

  console.log(`[uazapi-send] REQUEST: ${method} ${fullUrl} | token: ${maskedToken} | body:`, JSON.stringify(body).slice(0, 1000));
  
  const startTime = Date.now();
  try {
    const res = await fetch(fullUrl, {
      method: method,
      headers: headers,
      body: body && method !== "GET" ? JSON.stringify(body) : undefined,
    });
    
    const duration = Date.now() - startTime;
    const text = await res.text();
    let parsed: any;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      parsed = text;
    }
    
    console.log(`[uazapi-send] RESPONSE: status=${res.status} | duration=${duration}ms | body:`, text.slice(0, 1000));
    
    // Create a masked version of headers for debug output
    const maskedHeaders = { ...headers, token: maskedToken, apikey: maskedToken };

    return { 
      ok: res.ok, 
      status: res.status, 
      body: parsed, 
      rawBody: text,
      headersSent: maskedHeaders,
      bodySent: body,
      endpoint: fullUrl,
      method
    };
  } catch (err: any) {
    console.error(`[uazapi-send] FETCH EXCEPTION for ${path}:`, err.message);
    return { ok: false, status: 500, body: { error: err.message }, endpoint: fullUrl, method };
  }
}



async function humanLikeSendPipeline(supabase: any, url: string, token: string, jid: string, instance: any) {
    const phone = jid.split('@')[0];
    console.log(`[uazapi-send] [PIPELINE] starting for ${jid} on instance ${instance.name}`);
    
    const statusRes = await fetch(`${url}/instance/status`, { headers: { "token": token } });
    const statusData = await statusRes.json().catch(() => ({}));
    const isConnected = statusRes.ok && (statusData.status === "connected" || statusData.state === "open" || statusData.state === "CONNECTED");
    
    if (!isConnected) {
        console.warn(`[uazapi-send] [PIPELINE] socket idle/offline, waking up...`);
        await uazFetch(url, token, "/instance/connect", {});
        await new Promise(r => setTimeout(r, 5000));
    }

    await uazFetch(url, token, "/message/presence/subscribe", { number: phone }).catch(() => {});
    await uazFetch(url, token, "/chat/read", { number: jid, read: true }).catch(() => {});
    
    const typingDuration = Math.floor(Math.random() * 2000) + 2000;
    await uazFetch(url, token, "/message/presence", { number: phone, presence: "composing", delay: typingDuration }).catch(() => {});
    await new Promise(r => setTimeout(r, typingDuration));
    
    return true;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  console.log("UAZAPI_SEND_VERSION", "chat-send-uses-direct-uazapi-v7");

  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const url_params = new URL(req.url).searchParams;
    const isDirectDebug = url_params.get('action') === 'debug-direct-send';
    
    let body: SendBody;
    try {
      body = (await req.json()) as SendBody;
    } catch (e) {
      if (isDirectDebug) {
        // Permite GET para debug se necessário, mas idealmente POST
        return new Response(JSON.stringify({ error: "Invalid JSON body" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      throw e;
    }
    
    console.log("[uazapi-send] manual_send_payload_received:", JSON.stringify(body).slice(0, 500));

    let { organization_id, instance_id, type, to, payload } = body;

    // Se for debug direto, podemos inferir org se não enviada
    if (isDirectDebug && !organization_id) {
       const { data: firstOrg } = await supabase.from("profiles").select("organization_id").limit(1).maybeSingle();
       organization_id = firstOrg?.organization_id;
    }

    if (!type || !to || !payload) {
      if (isDirectDebug) {
        // Fallback para campos simplificados no debug-direct-send
        type = type || "text";
        to = to || (body as any).phone;
        payload = payload || { text: (body as any).text || "teste direto" };
      }
      
      if (!type || !to || !payload) {
        return new Response(JSON.stringify({ 
          success: false,
          error_code: "PAYLOAD_BUILD_FAILED",
          step_failed: "PAYLOAD_BUILD_FAILED",
          message: "Missing type/to/payload" 
        }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }

    if (!organization_id) {
      const auth = req.headers.get("Authorization");
      if (auth) {
        const token = auth.replace(/Bearer /i, "");
        const { data: { user } } = await supabase.auth.getUser(token);
        if (user) {
          const { data: profile } = await supabase.from("profiles").select("organization_id").eq("id", user.id).single();
          organization_id = profile?.organization_id || undefined;
        }
      }
    }

    if (!organization_id) {
      return new Response(JSON.stringify({ 
        success: false,
        error_code: "UAZAPI_SEND_FAILED",
        step_failed: "FETCH_EXCEPTION", // Or auth fail
        message: "organization_id required" 
      }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    let instance: any;
    if (instance_id) {
      const { data } = await supabase.from("evolution_instances").select("*").eq("id", instance_id).eq("organization_id", organization_id).single();
      instance = data;
    } 

    if (!instance) {
      return new Response(JSON.stringify({ 
        success: false,
        error_code: "UAZAPI_SEND_FAILED",
        step_failed: "INSTANCE_NOT_FOUND",
        message: "Esta conversa não possui conexão WhatsApp/UazAPI vinculada. Selecione uma conexão antes de enviar.",
        debug_version: "chat-send-uses-direct-uazapi-v7",
        debug: {
          instance_id: instance_id,
          phone: to,
          step_failed: "INSTANCE_NOT_FOUND",
          organization_id: organization_id
        }
      }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { data: platformCfg } = await supabase.from("platform_settings").select("uazapi_url, uazapi_admin_token").maybeSingle();
    const url = String(platformCfg?.uazapi_url || "").replace(/\/$/, "");
    const apiKey = instance.instance_token || String(platformCfg?.uazapi_admin_token || "");

    if (!url) {
      return new Response(JSON.stringify({ 
        success: false,
        error_code: "UAZAPI_SEND_FAILED",
        step_failed: "MISSING_UAZAPI_URL",
        message: "UazAPI not configured (missing URL)",
        debug_version: "chat-send-uses-direct-uazapi-v7",
        debug: { instance_id: instance.id, phone: to, step_failed: "MISSING_UAZAPI_URL" }
      }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (!apiKey) {
      return new Response(JSON.stringify({ 
        success: false,
        error_code: "UAZAPI_SEND_FAILED",
        step_failed: "MISSING_INSTANCE_TOKEN",
        message: "UazAPI not configured (missing API Key/Token)",
        debug_version: "chat-send-uses-direct-uazapi-v7",
        debug: { instance_id: instance.id, phone: to, step_failed: "MISSING_INSTANCE_TOKEN" }
      }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const rawPhone = to.replace(/\D/g, "");
    const phone = normalizePhoneBR(rawPhone) || rawPhone;
    const jid = to.includes("@") ? to : `${phone}@s.whatsapp.net`;

    if (!payload.skip_warmup && type !== "presence" && type !== "markRead") {
        try { await humanLikeSendPipeline(supabase, url, apiKey, jid, instance); } catch (e) { console.error(`[uazapi-send] Pipeline failed: ${e.message}`); }
    }

    let res: any;
    const sendDelay = typeof payload.delay === 'number' ? payload.delay : 0;
    const uazNumber = phone;

    try {
      switch (type) {
        case "text":
          // UazAPI format: try multiple combinations of number/to and instance/session
          res = await uazFetch(url, apiKey, "/message/text", {
            number: uazNumber,
            instance: instance.name, // Many UazAPI v2 versions require this
            text: String(payload.text || ""),
            delay: sendDelay, 
          });
          
          if (!res.ok) {
            console.log("[uazapi-send] Retrying with /send/text and instanceName");
            res = await uazFetch(url, apiKey, "/send/text", {
              number: uazNumber,
              instanceName: instance.name,
              text: String(payload.text || ""),
              delay: sendDelay,
            });
          }
          
          if (!res.ok) {
            console.log("[uazapi-send] Retrying with 'to' and 'instance'");
            res = await uazFetch(url, apiKey, "/send/text", {
              to: uazNumber,
              instance: instance.name,
              text: String(payload.text || ""),
            });
          }

          break;
        case "media":
          res = await uazFetch(url, apiKey, "/message/media", {
            number: uazNumber,
            instance: instance.name,
            type: payload.type || payload.mediatype || "image",
            file: payload.url ?? payload.media,
            caption: payload.caption || payload.text,
            delay: sendDelay,
          });

          if (!res.ok) {
            res = await uazFetch(url, apiKey, "/send/media", {
              number: uazNumber,
              instance: instance.name,
              type: payload.type || payload.mediatype || "image",
              file: payload.url ?? payload.media,
              text: payload.caption || payload.text,
              docName: payload.fileName || payload.name,
              delay: sendDelay,
            });
          }
          break;
        case "audio":
          res = await uazFetch(url, apiKey, "/message/media", {
            number: uazNumber,
            instance: instance.name,
            type: payload.ptt !== false ? "ptt" : "audio",
            file: payload.audio || payload.url,
            delay: sendDelay,
          });

          if (!res.ok) {
            res = await uazFetch(url, apiKey, "/send/media", {
              number: uazNumber,
              instance: instance.name,

              instance: instance.name,
              type: payload.ptt !== false ? "ptt" : "audio",
              file: payload.audio || payload.url,
              mimetype: payload.mimetype || "audio/ogg",
              delay: sendDelay,
            });
          }
          break;
        case "presence":
          res = await uazFetch(url, apiKey, "/message/presence", {
            number: uazNumber,
            instance: instance.name,
            presence: payload.state || payload.presence || "composing",
            delay: Math.min(payload.typing_duration || payload.delay || payload.duration_ms || 1500, 30000)
          });
          break;
        case "markRead":
          res = await uazFetch(url, apiKey, "/chat/read", { number: jid, instance: instance.name, read: true });
          break;

        case "pix_button": {
          // Official UazAPI endpoint: /send/pix-button
          // Documentation fields: number, pixType, pixKey, pixName
          
          let pixType = String(payload.pixType || payload.type || "").toUpperCase();
          // Normalization of types
          if (pixType === "TELEFONE" || pixType === "PHONE") pixType = "PHONE";
          if (pixType === "EMAIL") pixType = "EMAIL";
          if (pixType === "ALEATORIA" || pixType === "ALEATÓRIA" || pixType === "EVP") pixType = "EVP";
          if (pixType === "CPF") pixType = "CPF";
          if (pixType === "CNPJ") pixType = "CNPJ";

          const pixPayload = {
            number: uazNumber,
            pixKey: String(payload.pixKey || payload.key || ""),
            pixType: pixType,
            pixName: String(payload.pixName || payload.merchantName || payload.name || "Pix")
          };
          
          console.log("[uazapi-send] Sending pix_button with official payload:", JSON.stringify(pixPayload));
          
          res = await uazFetch(url, apiKey, "/send/pix-button", pixPayload);
          
          // Fallback logic
          // If the button doesn't appear or endpoint fails, we can send a text fallback
          // Some users report 200 OK but no button appearing (unsupported client or UazAPI version)
          if (!res.ok || (res.body && !res.body.id && !res.body.key)) {
             console.warn("[uazapi-send] PIX_BUTTON_FAILED_OR_NO_ID", { status: res.status, body: res.rawBody });
             
             if (!res.ok && (res.status === 404 || res.status === 405)) {
                console.log("[uazapi-send] Endpoint not found, trying /message/pix-button as fallback");
                res = await uazFetch(url, apiKey, "/message/pix-button", pixPayload);
             }
          }

          // If still failed or if user explicitly wants both (or if we want to be safe)
          if ((!res.ok || payload.force_text_fallback === true) && payload.allow_pix_text_fallback !== false) {
             const fallbackText = `💠 *Chave PIX:*\n${pixPayload.pixKey}\n\n*Beneficiário:*\n${pixPayload.pixName}\n\nToque e segure para copiar a chave.`;
             console.log("[uazapi-send] Sending PIX text fallback");
             const textRes = await uazFetch(url, apiKey, "/message/text", {
               number: uazNumber,
               text: fallbackText
             });
             // If the button failed, use the text response as the main result
             if (!res.ok) res = textRes;
          }
          break;
        }
        default:
          res = await uazFetch(url, apiKey, `/send/${type}`, { number: uazNumber, ...payload });
      }
    } catch (fetchErr: any) {
      return new Response(JSON.stringify({
        success: false,
        error_code: "UAZAPI_SEND_FAILED",
        step_failed: "FETCH_EXCEPTION",
        message: fetchErr.message,
        debug_version: "chat-send-uses-direct-uazapi-v7",
        debug: {
          instance_id: instance.id,
          phone: phone,
          step_failed: "FETCH_EXCEPTION",
          error_stack: fetchErr.stack
        }
      }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Tracker & Metrics
    if (res.ok && res.body?.id && type !== "presence" && type !== "markRead") {
        const messageId = res.body.id;
        // Run database updates without awaiting or with individual try-catches to avoid stopping the response
        supabase.from("whatsapp_message_retries").insert({
            organization_id: organization_id,
            instance_id: instance.id,
            message_id: messageId,
            remote_jid: jid,
            content: type === "text" ? payload.text : `[${type}]`,
            next_retry_at: new Date(Date.now() + 60000).toISOString(),
            ack_status: 0
        }).then(({error}) => error && console.error("Retry insert failed", error));
        
        supabase.from("evolution_instances").update({
            last_health_at: new Date().toISOString(),
            health_data: { ...instance.health_data, last_msg_id: messageId, last_msg_at: new Date().toISOString() }
        }).eq("id", instance.id).then(({error}) => error && console.error("Instance update failed", error));
    }

    const responseBody = {
      success: res.ok,
      message: res.ok ? "Mensagem enviada com sucesso" : "Falha real ao enviar pela UazAPI.",
      error_code: res.ok ? null : "UAZAPI_SEND_FAILED",
      debug_version: "chat-send-uses-direct-uazapi-v7",
      debug: {
        instance_id: instance.id,
        phone: phone,
        step_failed: res.ok ? null : "UAZAPI_HTTP_ERROR",
        resolved_connection: {
          id: instance.id,
          name: instance.name,
          phone: instance.phone_number,
          uazapi_url: url,
          has_instance_token: !!instance.instance_token,
          has_api_key: !!apiKey
        },
        endpoint_final: res.endpoint,
        payload_sent_to_uazapi: res.bodySent,
        uazapi_status: res.status,
        uazapi_response_text: res.rawBody,
        uazapi_response_json: res.body,
        method: res.method,
        crm_payload_received: body
      }
    };

    return new Response(JSON.stringify(responseBody), {
      status: res.ok ? 200 : (res.status >= 400 ? res.status : 502),
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err: any) {
    console.error("[uazapi-send] FATAL EXCEPTION:", err);
    return new Response(JSON.stringify({ 
      success: false, 
      message: "Falha fatal na Edge Function.",
      error_code: "UAZAPI_SEND_FAILED",
      step_failed: "FETCH_EXCEPTION",
      debug_version: "chat-send-uses-direct-uazapi-v7",
      debug: { 
        instance_id: (req as any).instance_id || "unknown",
        phone: (req as any).to || "unknown",
        step_failed: "FETCH_EXCEPTION",
        error_stack: err.stack,
        message: err.message
      }
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
