/**
 * UazAPI Webhook - OFFICIAL ENTRANCE
 * This is the primary handler for all incoming WhatsApp messages and events.
 * It normalizes payloads from UazAPI and processes them into the CRM.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { encodeBase64 } from "https://deno.land/std@0.207.0/encoding/base64.ts";
import { normalizePhoneBR, phoneVariantsBR } from "../_shared/phone.ts";
import { startTyping } from "../_shared/presence.ts";
import { resolveAIProvider } from "../_shared/ai-credentials.ts";
import { format } from "https://deno.land/std@0.207.0/datetime/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

/** Normaliza texto para comparação de gatilhos. */
function normalizeForMatch(text: any): string {
  const str = typeof text === "string"
    ? text
    : (typeof text === "object" && text !== null
      ? JSON.stringify(text)
      : String(text || ""));

  return str
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\s+/g, "")
    .trim();
}

/** Hash normalizado de uma resposta para dedup curto-prazo. */
function normalizeResponseHash(text: any): string {
  const str = typeof text === "string"
    ? text
    : (typeof text === "object" && text !== null
      ? JSON.stringify(text)
      : String(text || ""));

  return str
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Debug insert for testing attribution propagation. */
async function debugInsertTracking(supabase: any, payload: any) {
  const { lead_id, phone, source, raw_payload } = payload;
  const tracking = {
    lead_id,
    phone,
    source,
    raw_payload,
    created_at: new Date().toISOString()
  };
  
  const { data, error } = await supabase.from("lead_tracking").insert(tracking).select().single();
  
  if (error) {
    console.error("[uazapi-webhook] debug insert error:", error);
    return { success: false, error };
  }
  
  const { count } = await supabase.from("lead_tracking").select("*", { count: 'exact', head: true });
  
  return { success: true, lead_tracking_id: data.id, count_after: count };
}

/** Log for Webhook Health and Audit - Optimized with UPSERT and 60s throttle */
async function logWebhookHealth(supabase: any, data: {
  phone?: string;
  connection_id?: string;
  message_id?: string;
  message_type?: string;
  webhook_received?: boolean;
  processed?: boolean;
  flow_started?: boolean;
  pixel_sent?: boolean;
  error?: string;
  raw_payload?: any;
}) {
  if (!data.connection_id) return null;

  try {
    // Optimization: UPSERT by connection_id to avoid row explosion
    // Also skip raw_payload unless there is an error to save I/O
    const cleanData = {
      ...data,
      raw_payload: data.error ? data.raw_payload : { summary: "payload_hidden_for_performance" },
      updated_at: new Date().toISOString()
    };

    const { data: upserted, error } = await supabase.from("webhook_health").upsert({
      connection_id: data.connection_id,
      ...cleanData
    }, { onConflict: 'connection_id' }).select("id").single();
    
    if (error) {
      console.error("[webhook-health] upsert error:", error);
      return null;
    }
    return upserted.id;
  } catch (e) {
    console.error("[webhook-health] exception:", e);
    return null;
  }
}

async function updateWebhookHealth(supabase: any, id: string, updates: Partial<{
  processed: boolean;
  flow_started: boolean;
  pixel_sent: boolean;
  error: string;
}>) {
  if (!id) return;
  try {
    await supabase.from("webhook_health").update(updates).eq("id", id);
  } catch (e) {
    console.error("[webhook-health] update exception:", e);
  }
}




/** Verifica se é uma URL de mídia do WhatsApp (encriptada). */
const isWhatsappEncryptedUrl = (u?: string | null) =>
  !!u && /(mmg\.whatsapp\.net|media\.fmaa|whatsapp\.net)/i.test(u);

/**
 * Refreshes a Supabase Storage URL by generating a new Signed URL.
 * This ensures the URL is valid and contains a fresh token.
 */
async function refreshStorageUrl(supabase: any, originalUrl: string): Promise<string> {
  if (!originalUrl || !originalUrl.includes(".supabase.co/storage/v1/object/")) {
    return originalUrl;
  }

  try {
    const urlObj = new URL(originalUrl);
    // Path format: /storage/v1/object/(public|authenticated|sign)/bucket/path/to/file
    const parts = urlObj.pathname.split("/storage/v1/object/")[1]?.split("/");
    if (!parts || parts.length < 2) return originalUrl;

    // The first part is 'public', 'authenticated', or 'sign'
    const bucket = parts[1];
    const filePath = decodeURIComponent(parts.slice(2).join("/"));

    if (!bucket || !filePath) return originalUrl;

    console.log(`[uazapi-webhook] [REFRESH] Refreshing URL for bucket=${bucket} path=${filePath}`);
    
    // Generate a fresh signed URL (valid for 1 hour)
    const { data, error } = await supabase.storage.from(bucket).createSignedUrl(filePath, 3600);
    
    if (error) {
      console.warn(`[uazapi-webhook] [REFRESH] Failed to create signed URL for ${filePath}:`, error.message);
      return originalUrl;
    }
    
    console.log(`[uazapi-webhook] [REFRESH] New Signed URL generated successfully`);
    return data.signedUrl;
  } catch (e) {
    console.error("[uazapi-webhook] [REFRESH] Error refreshing storage URL:", e);
    return originalUrl;
  }
}

/**
 * Validates a URL by performing a HEAD request.
 */
async function validateUrl(url: string): Promise<{ ok: boolean; status: number; size?: number; contentType?: string }> {
  try {
    const res = await fetch(url, { method: 'HEAD' });
    const size = parseInt(res.headers.get('content-length') || '0');
    const contentType = res.headers.get('content-type') || undefined;
    return { 
      ok: res.ok, 
      status: res.status,
      size: size > 0 ? size : undefined,
      contentType
    };
  } catch (e) {
    return { ok: false, status: 0 };
  }
}


/** Tenta gravar message_id em processed_messages. Retorna true se for duplicado. */
async function isDuplicateInboundMessage(
  supabase: any,
  instanceId: string | null,
  remoteJid: string | null,
  messageId: string | null,
): Promise<boolean> {
  if (!messageId) return false;
  const { error } = await supabase.from("processed_messages").insert({
    instance_id: instanceId,
    remote_jid: remoteJid,
    message_id: messageId,
  });
  if (!error) return false;
  // 23505 = unique violation → já processado
  if ((error as any).code === "23505") return true;
  // Em outros erros, deixa passar (fail-open) para não travar o webhook.
  console.warn(
    "[anti-spam] processed_messages insert non-unique error:",
    (error as any).message,
  );
  return false;
}

/** Tenta adquirir lock por conversa de forma ATÔMICA via RPC. Retorna true se conseguiu. */
async function acquireConversationLock(
  supabase: any,
  conversationId: string,
  ttlMs = 30_000,
): Promise<boolean> {
  const { data, error } = await supabase.rpc("try_acquire_conversation_lock", {
    p_conv: conversationId,
    p_ttl_ms: ttlMs,
  });
  if (error) {
    console.warn("[anti-spam] lock acquire rpc error:", error.message);
    return true; // fail-open: prefere responder a travar tudo
  }
  return data === true;
}

async function releaseConversationLock(
  supabase: any,
  conversationId: string,
): Promise<void> {
  try {
    await supabase
      .from("conversation_processing_locks")
      .delete()
      .eq("conversation_id", conversationId);
  } catch (_) { /* best-effort */ }
}

/** Verifica se já enviamos uma resposta com mesmo hash nos últimos windowMs. */
async function isDuplicateResponse(
  supabase: any,
  conversationId: string,
  text: string,
  windowMs: number,
): Promise<boolean> {
  if (!text || !conversationId || windowMs <= 0) return false;
  const hash = normalizeResponseHash(text);
  if (!hash) return false;
  const since = new Date(Date.now() - windowMs).toISOString();
  const { data } = await supabase
    .from("sent_responses")
    .select("id")
    .eq("conversation_id", conversationId)
    .eq("response_hash", hash)
    .gte("created_at", since)
    .limit(1)
    .maybeSingle();
  return !!data?.id;
}

async function recordSentResponse(
  supabase: any,
  conversationId: string,
  text: string,
): Promise<void> {
  try {
    const hash = normalizeResponseHash(text);
    if (!hash) return;
    await supabase.from("sent_responses").insert({
      conversation_id: conversationId,
      response_hash: hash,
      response_text: (text || "").slice(0, 2000),
    });
  } catch (_) { /* best-effort */ }
}

/** 
 * Admin Notification Logic for Connection Status Changes
 */
async function handleAdminStatusAlert(supabase: any, instanceId: string, newState: string) {
  try {
    const { data: instance, error: instError } = await supabase
      .from("evolution_instances")
      .select("id, name, status, phone_number, organization_id")
      .eq("instance_id", instanceId)
      .maybeSingle();

    if (instError || !instance) return;

    const oldStatus = instance.status;
    const orgId = instance.organization_id;

    // Only proceed if status actually changed
    if (oldStatus === newState) return;

    // Update instance status in DB
    const now = new Date().toISOString();
    await supabase.from("evolution_instances").update({ 
      status: newState,
      last_real_whatsapp_ping: now,
      last_real_whatsapp_state: newState 
    }).eq("id", instance.id);

    // Get organization settings for notifications
    const { data: org, error: orgError } = await supabase
      .from("organizations")
      .select("admin_status_notify_phone")
      .eq("id", orgId)
      .single();

    if (orgError || !org?.admin_status_notify_phone) return;

    const notifyPhone = org.admin_status_notify_phone;
    const criticalStatuses = ["offline", "disconnected", "error", "waiting_qr", "logged_out", "close", "restricted", "ghost", "ack_stale"];
    const isCritical = criticalStatuses.includes(newState.toLowerCase());

    // Update instance status in DB immediately to drop API Principal if needed
    if (isCritical && newState.toLowerCase() !== "ghost") {
       await supabase.from("evolution_instances").update({ status: "disconnected" }).eq("id", instance.id);
    }


    // Rate limit check: max 1 alert per 30 mins for same instance + status
    const cooldownMins = 30;
    const cooldownAgo = new Date(Date.now() - cooldownMins * 60 * 1000).toISOString();

    const { data: recentAlert } = await supabase
      .from("admin_status_alerts")
      .select("id")
      .eq("connection_id", instance.id)
      .eq("new_status", newState)
      .gte("created_at", cooldownAgo)

      .limit(1)
      .maybeSingle();

    if (recentAlert) {
      await supabase.from("admin_status_alerts").insert({
        organization_id: orgId,
        connection_id: instance.id,
        connection_name: instance.name,
        connection_phone: instance.phone_number,
        old_status: oldStatus,
        new_status: newState,
        notify_phone: notifyPhone,
        message: "Status change detected but skipped due to rate limit.",
        status: "skipped_rate_limit"
      });
      return;
    }

    const timestamp = format(new Date(), "dd/MM/yyyy HH:mm");
    const emoji = isCritical ? "⚠️" : "ℹ️";
    const title = isCritical ? "ALERTA CRM - Conexão Caiu" : "INFO CRM - Status de Conexão";
    
    const message = `${emoji} ${title}\n\nConexão: ${instance.name}\nNúmero: +${instance.phone_number || "Desconhecido"}\nStatus anterior: ${oldStatus}\nStatus atual: ${newState}\nHorário: ${timestamp}\n\nAção sugerida: Verifique a instância na tela Conexões.`;

    // Create alert record as pending
    const { data: alert, error: alertError } = await supabase
      .from("admin_status_alerts")
      .insert({
        organization_id: orgId,
        connection_id: instance.id,
        connection_name: instance.name,
        connection_phone: instance.phone_number,
        old_status: oldStatus,
        new_status: newState,
        notify_phone: notifyPhone,
        message: message,
        status: "pending"
      })
      .select()
      .single();

    if (alertError) throw alertError;

    // Trigger processing of pending alerts (best effort)
    // We don't await this to keep the webhook response fast
    supabase.functions.invoke("whatsapp-proxy", {
      body: { action: "process_pending_alerts", organization_id: orgId }
    }).catch(console.error);

  } catch (err) {
    console.error("[admin-alert] Error handling status change:", err);
  }
}


/**
 * Adapter that normalizes incoming webhook payloads from BOTH:
 *  - UazAPI v2 (Node.js): events like MESSAGES_UPSERT, CONNECTION_UPDATE, ...
 *  - UazAPI: events like Message, SendMessage, Connected, QRCode, ...
 *
 * Returns a normalized shape that the rest of the handler understands:
 *   { kind: 'message' | 'connection' | 'qrcode' | 'unknown',
 *     instance: <name or uuid>, ...event-specific fields }
 */
type MediaInfo = {
  type: "audio" | "image" | "video" | "document" | "sticker";
  mime?: string;
  caption?: string;
  // One of the following will be present (provider-dependent)
  url?: string;
  base64?: string;
  // For UazAPI v2 we may need to call /chat/getBase64FromMediaMessage with the messageId.
  needsDownload?: boolean;
  // Raw whatsmeow message object (audioMessage / imageMessage) — required for
  // UazAPI's /message/downloadimage endpoint, which expects mediaKey,
  // directPath, fileEncSHA256, fileSHA256, fileLength, mimetype and url.
  rawMessage?: any;
};

type Normalized =
  | {
    kind: "message";
    instance: string;
    fromMe: boolean;
    senderType?: string;
    direction?: string;
    remoteJid: string;
    lidJid?: string;
    pushName: string;
    messageId: string;
    content: string;
    media?: MediaInfo;
    contextInfo?: any;
    createdAt?: number; // Unix timestamp in seconds
    referral?: any;
  }
  | {
    kind: "message_delete";
    instance: string;
    messageId: string;
    remoteJid: string;
  }
  | {
    kind: "connection";
    instance: string;
    state: "open" | "connecting" | "close" | "refused" | "disconnected" | "error" | "logged_out" | "waiting_qr";
    phone?: string;
  }
  | { kind: "qrcode"; instance: string; qr: string }
  | { kind: "unknown"; instance: string; event: string };

function normalizeInstanceName(value?: string | null) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '')
    // Handle common typos like chipp221 -> chip221
    .replace(/^chi+p+/i, 'chip');
}

function extractString(val: any): string {
  if (val == null) return "";
  if (typeof val === "string") return val.trim();
  if (typeof val === "object") {
    // Candidates for ID in various UazAPI/Uazapi/whatsmeow structures.
    // We prioritize JID/Phone fields over internal IDs like 'id'.
    const id = val.wa_chatid || val.wa_chatId || val.chatid || val.chatId ||
      val.remoteJid || val.remoteJID || val.jid || val.JID ||
      val.sender_pn || val.sender || val.Sender ||
      val.number || val.phone || val.id || val.user || val.Chat || "";

    if (typeof id === "string") return id.trim();
    if (typeof id === "object") return extractString(id);
  }
  return String(val).trim();
}

function extractInstance(payload: any): string {
  // Try every known location across UazAPI v2, UazAPI and Uazapi payload shapes
  const candidates = [
    payload?.instance,
    payload?.instanceName,
    payload?.Instance,
    payload?.instance_name,
    payload?.instanceId,
    payload?.instance_id,
    payload?.session,
    payload?.SessionID,
    payload?.session_id,
    typeof payload?.instance === "object"
      ? (payload?.instance?.instanceName || payload?.instance?.name ||
        payload?.instance?.id)
      : null,
    payload?.data?.instance,
    payload?.data?.Instance,
    payload?.data?.instanceName,
    payload?.data?.instance_name,
    payload?.data?.instanceId,
    payload?.data?.instance_id,
    payload?.data?.session,
    typeof payload?.data?.instance === "object"
      ? (payload?.data?.instance?.name || payload?.data?.instance?.instanceName)
      : null,
    payload?.sender?.instance,
  ];
  for (const c of candidates) {
    const s = extractString(c);
    if (s) return normalizeInstanceName(s);
  }
  return "";
}

function normalizeQrString(value: any): string | null {
  const raw = extractString(value);
  if (raw.length <= 20) return null;

  // UazAPI sometimes sends a display PNG and the real WhatsApp pairing
  // payload joined by "|". Encoding the whole string produces an invalid QR.
  const pipeIndex = raw.indexOf("|");
  if (pipeIndex >= 0) {
    const afterPipe = raw.slice(pipeIndex + 1).trim();
    if (afterPipe.length > 20) return afterPipe;
    const beforePipe = raw.slice(0, pipeIndex).trim();
    if (beforePipe.length > 20) return beforePipe;
  }

  return raw;
}

function extractReferral(payload: any): any | null {
  if (!payload) return null;
  const findIn = (obj: any): any | null => {
    if (!obj || typeof obj !== "object") return null;
    if (obj.referral) return obj.referral;
    for (const key in obj) {
      if (key === "raw_payload" || key === "data") continue; // Avoid cycles if any
      const found = findIn(obj[key]);
      if (found) return found;
    }
    return null;
  };
  return findIn(payload);
}

function extractCTWA(payload: any): { isCtwa: boolean; ctwaData: any; rawContext: any } {
  const result = {
    isCtwa: false,
    ctwaData: {} as any,
    rawContext: null as any
  };

  if (!payload || typeof payload !== "object") return result;

  // Multi-path search for contextInfo/referral
  const searchPaths = [
    payload?.message?.contextInfo,
    payload?.message?.content?.contextInfo,
    payload?.data?.message?.contextInfo,
    payload?.data?.message?.content?.contextInfo,
    payload?.event?.Message?.contextInfo,
    payload?.event?.Message?.content?.contextInfo,
    payload?.contextInfo,
    payload?.data?.contextInfo
  ];

  let context: any = null;
  for (const p of searchPaths) {
    if (p && typeof p === "object") {
      // Check if it's a valid contextInfo (has any of the target keys)
      if (p.externalAdReply || p.ctwaPayload || p.conversionData || p.entryPointConversionSource) {
        context = p;
        break;
      }
    }
  }

  const referral = extractReferral(payload);
  const ad = context?.externalAdReply;

  // Rule: Detection is positive if ANY of these exist
  const isCtwa = !!(
    context?.ctwaPayload || 
    context?.conversionData || 
    context?.entryPointConversionSource || 
    ad || 
    referral?.ctwa_clid
  );

  if (isCtwa) {
    result.isCtwa = true;
    result.rawContext = context;

    // Map contextInfo fields
    if (context?.ctwaPayload) result.ctwaData.ctwa_payload = String(context.ctwaPayload);
    if (context?.ctwaSignals) result.ctwaData.ctwa_signals = String(context.ctwaSignals);
    if (context?.conversionData) result.ctwaData.conversion_data = String(context.conversionData);
    if (context?.conversionSource) result.ctwaData.conversion_source = String(context.conversionSource);
    if (context?.conversionDelaySeconds != null) result.ctwaData.conversion_delay_seconds = Number(context.conversionDelaySeconds);
    if (context?.entryPointConversionSource) result.ctwaData.entry_point_conversion_source = String(context.entryPointConversionSource);
    if (context?.entryPointConversionApp) result.ctwaData.entry_point_conversion_app = String(context.entryPointConversionApp);
    if (context?.entryPointConversionDelaySeconds != null) result.ctwaData.entry_point_conversion_delay_seconds = Number(context.entryPointConversionDelaySeconds);

    if (ad) {
      // ctwaClid lives inside externalAdReply (camelCase) — primary source for Meta attribution
      if (ad.ctwaClid) result.ctwaData.ctwa_clid = String(ad.ctwaClid);
      if (ad.sourceID) result.ctwaData.ad_source_id = String(ad.sourceID);
      if (ad.sourceType) result.ctwaData.ad_source_type = String(ad.sourceType);
      if (ad.title) result.ctwaData.ad_headline = String(ad.title);
      if (ad.body) result.ctwaData.ad_body = String(ad.body);
      if (ad.sourceApp) result.ctwaData.ad_source_app = String(ad.sourceApp);
      if (ad.sourceURL) result.ctwaData.ad_source_url = String(ad.sourceURL);
      if (ad.mediaType) result.ctwaData.ad_media_type = String(ad.mediaType);
      if (ad.mediaURL) result.ctwaData.ad_media_url = String(ad.mediaURL);
    }

    // Fallback: top-level referral (provider sometimes flattens)
    if (!result.ctwaData.ctwa_clid && referral?.ctwa_clid) result.ctwaData.ctwa_clid = String(referral.ctwa_clid);
  }

  return result;
}


function normalizePayload(payload: any): Normalized | null {

  if (payload.__is_resume) {
    return {
      kind: "message",
      instance: payload.instance || extractInstance(payload),
      fromMe: false,
      remoteJid: payload.remoteJid || "",
      pushName: "Resume",
      messageId: "resume-" + Date.now(),
      content: "",
    };
  }
  const eventRaw = payload.event || payload.EventType || payload.type ||
    payload.Event || "";
  const event = typeof eventRaw === "string" ? eventRaw : "";
  const instance: string = extractInstance(payload);

  if (!instance) return null;
  const data = payload.data || payload;
  const referral = extractReferral(payload);


  // Helper: extract media info from a whatsmeow-style message object.
  // Audio is the most common multimodal input we get from leads.
  function extractMedia(message: any): MediaInfo | undefined {
    if (!message) return undefined;

    // Handle nested 'content' (common in Uazapi/UazAPI)
    if (
      message.content && typeof message.content === "object" &&
      !message.imageMessage && !message.audioMessage
    ) {
      const fromContent = extractMedia(message.content);
      if (fromContent) return fromContent;
    }

    const audio = message.audioMessage;
    const image = message.imageMessage;
    const video = message.videoMessage;
    const doc = message.documentMessage;

    const pickUrl = (m: any): string | undefined =>
      m?.url || m?.URL || m?.directPath || m?.DirectPath || undefined;
    // Some UazAPI payloads embed the base64 directly; capture both naming styles.
    const pickBase64 = (m: any): string | undefined =>
      typeof m?.base64 === "string"
        ? m.base64
        : typeof m?.Base64 === "string"
        ? m.Base64
        : typeof m?.media === "string"
        ? m.media
        : typeof m?.Media === "string"
        ? m.Media
        : undefined;

    if (audio) {
      const b64 = pickBase64(audio);
      const url = pickUrl(audio);
      return {
        type: "audio",
        mime: audio.mimetype || audio.Mimetype || "audio/ogg",
        url,
        base64: b64,
        needsDownload: !b64 && !url,
        rawMessage: audio,
      };
    }
    if (image) {
      const b64 = pickBase64(image);
      const url = pickUrl(image);
      return {
        type: "image",
        mime: image.mimetype || image.Mimetype || "image/jpeg",
        caption: image.caption || image.Caption || "",
        url,
        base64: b64,
        needsDownload: !b64 && !url,
        rawMessage: image,
      };
    }
    if (video) {
      const b64 = pickBase64(video);
      const url = pickUrl(video);
      return {
        type: "video",
        mime: video.mimetype || video.Mimetype || "video/mp4",
        caption: video.caption || video.Caption || "",
        url,
        base64: b64,
        needsDownload: !b64 && !url,
        rawMessage: video,
      };
    }
    if (doc) {
      const b64 = pickBase64(doc);
      const url = pickUrl(doc);
      return {
        type: "document",
        mime: doc.mimetype || doc.Mimetype || "application/octet-stream",
        caption: doc.fileName || doc.FileName || doc.title || doc.Title || "",
        url,
        base64: b64,
        needsDownload: !b64 && !url,
        rawMessage: doc,
      };
    }
    const sticker = message.stickerMessage;
    if (sticker) {
      const b64 = pickBase64(sticker);
      const url = pickUrl(sticker);
      return {
        type: "sticker",
        mime: sticker.mimetype || sticker.Mimetype || "image/webp",
        url,
        base64: b64,
        needsDownload: !b64 && !url,
        rawMessage: sticker,
      };
    }

    // Flat whatsmeow media object (Uazapi / UazAPI can sometimes deliver this)
    const flatUrl = pickUrl(message);
    const flatMime = message.mimetype || message.Mimetype;
    if (flatUrl && flatMime) {
      const type = flatMime.startsWith("audio/")
        ? "audio"
        : flatMime.startsWith("image/")
        ? "image"
        : flatMime.startsWith("video/")
        ? "video"
        : flatMime.startsWith("application/")
        ? "document"
        : flatMime.includes("webp")
        ? "sticker"
        : "document";
      return {
        type: type as any,
        mime: flatMime,
        caption: message.caption || message.Caption || "",
        url: flatUrl,
        base64: pickBase64(message),
        // If we have a URL from a known provider (Uazapi/UazAPI), we might still need to download it
        // via our proxy to include authentication headers.
        needsDownload: !pickBase64(message),
        rawMessage: message,
      };
    }

    return undefined;
  }

  // ---- v2 events (UazAPI v2 / Uazapi) ----
  // Some providers like Uazapi might omit the "event" field in some payloads or use "EventType".
  // If we have data.key and data.message, it's definitely a message.
  if (
    event === "messages.upsert" ||
    event === "MESSAGES_UPSERT" ||
    event === "messages" ||
    event === "Message" ||
    event === "message" ||
    (!event && data.key && data.message)
  ) {
    // Uazapi Go often nests the whatsmeow message inside payload.message
    // Some versions of Uazapi also flatten the payload.
    // ADDED: Check if data.content is a JSON string of a media message
    let actualData = data;
    if (
      typeof data.content === "string" && data.content.trim().startsWith("{")
    ) {
      try {
        const parsed = JSON.parse(data.content);
        if (
          parsed.URL || parsed.url || parsed.directPath ||
          parsed.imageMessage || parsed.audioMessage
        ) {
          actualData = { ...data, ...parsed };
        }
      } catch (_) { /* ignore */ }
    }

    const messages = Array.isArray(actualData.messages)
      ? actualData.messages
      : (actualData.message && typeof actualData.message === "object" &&
          actualData.message.key
        ? [actualData.message]
        : [actualData]);

    const msg = messages[0];
    if (!msg) return null;

    const key = msg.key || {};
    const contextInfo = msg.message?.contextInfo || data.contextInfo ||
      msg.contextInfo;
    const media = extractMedia(msg.message || msg);

    // Fallback candidates for remoteJid: Uazapi sometimes uses 'chat' or 'sender'
    const remoteJid = extractString(
      msg.chatid ||
        msg.sender_pn ||
        msg.remoteJid ||
        msg.jid ||
        data.wa_chatid ||
        data.chatid ||
        data.chat?.wa_chatid ||
        data.chat?.chatid ||
        key.remoteJid ||
        data.remoteJid ||
        data.chat ||
        data.sender ||
        data.from ||
        data.JID ||
        data.jid ||
        data.event?.Chat ||
        data.event?.Sender ||
        data.event?.remoteJid ||
        msg.remoteJid ||
        msg.chat ||
        msg.sender ||
        msg.JID ||
        msg.jid ||
        "",
    );

    // Fallback candidates for pushName
    const pushName = extractString(
      msg.pushName ||
        msg.message?.senderName ||
        msg.message?.pushName ||
        data.chat?.name ||
        data.pushName ||
        data.name ||
        data.senderName ||
        "",
    );

    // Fallback candidates for messageId
    const messageId = extractString(
      key.id ||
        msg.message?.id ||
        msg.message?.messageid ||
        msg.message?.messageId ||
        data.messageId ||
        data.id ||
        msg.id ||
        msg.messageid ||
        "",
    );

    // Fallback for content: Uazapi sometimes flattens the message text or nests it differently
    const rawContent = msg.message?.conversation ||
      msg.message?.extendedTextMessage?.text ||
      msg.message?.content ||
      msg.message?.text ||
      msg.message?.body ||
      msg.message?.imageMessage?.caption ||
      msg.message?.videoMessage?.caption ||
      msg.message?.documentMessage?.caption ||
      (typeof msg.message === "string" ? msg.message : null) ||
      (typeof data.message === "string" ? data.message : null) ||
      data.content ||
      data.text ||
      data.body ||
      msg.body ||
      msg.text ||
      msg.content ||
      (typeof data.content === "object" && data.content?.text
        ? data.content.text
        : null) ||
      "";

    // If rawContent is (or looks like) a wrapped object {text, contextInfo, ...}, unwrap to text
    const unwrapText = (val: any): string => {
      if (val == null) return "";
      if (typeof val === "string") {
        const t = val.trim();
        if (t.startsWith("{") && t.includes('"text"')) {
          try {
            const parsed = JSON.parse(t);
            if (
              parsed && typeof parsed === "object" &&
              typeof parsed.text === "string"
            ) {
              return parsed.text;
            }
          } catch (_) { /* not JSON, keep raw */ }
        }
        return val;
      }
      if (typeof val === "object") {
        if (typeof val.text === "string") return val.text;
        if (typeof val.body === "string") return val.body;
        if (typeof val.caption === "string") return val.caption;
        return JSON.stringify(val);
      }
      return String(val);
    };
    const content = unwrapText(rawContent);

    // Fallback labels for media if no text content
    const mediaContent = content || (
      media?.type === "audio"
        ? "[áudio]"
        : media?.type === "image"
        ? "[imagem]"
        : media?.type === "video"
        ? "[vídeo]"
        : media?.type === "document"
        ? "[documento]"
        : ""
    );

    return {
      kind: "message",
      instance,
      fromMe: key.fromMe === true ||
        data.fromMe === true ||
        msg.fromMe === true ||
        msg.IsFromMe === true ||
        data.isFromMe === true ||
        data.IsFromMe === true ||
        (data.event && data.event.IsFromMe === true) ||
        (msg.key && msg.key.fromMe === true) ||
        (data.message && data.message.fromMe === true) ||
        (msg.message && msg.message.fromMe === true) ||
        data.is_from_me === true ||
        data.from_me === true ||
        data.Direction === "outbound" ||
        data.direction === "outbound" ||
        data.sender_type === "bot",
      senderType: data.sender_type || (key.fromMe ? "bot" : "visitor"),
      direction: data.direction || data.Direction ||
        (key.fromMe ? "outbound" : "inbound"),
      remoteJid,
      pushName,
      messageId,
      content: mediaContent,
      media,
      contextInfo,
      createdAt: Number(
        msg.messageTimestamp || data.messageTimestamp || data.timestamp ||
          Math.floor(Date.now() / 1000),
      ),
      referral,
    };
  }

  // ---- Message Status (ACK) events ----
  if (
    event === "messages.update" || event === "MESSAGES_UPDATE" ||
    event === "MessageStatus" || event === "message_status"
  ) {
    const statusData = data.status || data;
    const messageId = extractString(statusData.id || statusData.messageId || statusData.key?.id || "");
    const status = statusData.status || statusData.state || "";
    const ack = typeof status === "number" ? status : (
      status === "delivered" ? 3 : (status === "read" ? 4 : (status === "sent" ? 2 : 0))
    );

    if (messageId && ack > 0) {
      return {
        kind: "ack" as any,
        instance,
        messageId,
        ack,
        remoteJid: extractString(statusData.remoteJid || statusData.key?.remoteJid || statusData.participant || ""),
      } as any;
    }
  }

  if (
    event === "messages.delete" || event === "MESSAGES_DELETE" ||

    event === "MessageRevoke"
  ) {
    const messageId = extractString(
      data.id || data.key?.id || data.messageId || "",
    );
    const remoteJid = extractString(
      data.remoteJid || data.key?.remoteJid || data.chat || "",
    );
    if (messageId) {
      return { kind: "message_delete", instance, messageId, remoteJid };
    }
  }

  if (
    event === "connection.update" || event === "CONNECTION_UPDATE" ||
    event === "connection" || event === "INSTANCE_UPDATE" ||
    event === "Connected" || event === "Disconnected" || event === "LoggedOut"
  ) {
    let state = data.state || data.status || data.connectionStatus || "";
    
    // Explicit events from Uazapi
    if (event === "Connected") state = "open";
    if (event === "Disconnected") state = "close";
    if (event === "LoggedOut") state = "logged_out";

    const isOpen = state === "open" || state === "connected" ||
      state === "CONNECTED" || state === "OPEN" || state === "online";
    const isConnecting = state === "connecting" || state === "CONNECTING";
    
    const finalState = isOpen ? "open" : isConnecting ? "connecting" : (state || "close");

    return {
      kind: "connection",
      instance,
      state: finalState as any,
      phone: data.wuid || data.number || data.phoneNumber || data.jid,
    };
  }

  if (
    event === "qrcode.updated" || event === "QRCODE_UPDATED" ||
    event === "qrcode" || event === "QRCODE"
  ) {
    const qrRaw = data.qrcode?.base64 || data.qrcode?.code || data.base64 ||
      data.code || data.qrcode || data.qr;
    return { kind: "qrcode", instance, qr: normalizeQrString(qrRaw) || "" };
  }

  // ---- UazAPI events ----
  // Message / SendMessage payloads carry whatsmeow Info + Message structures.
  if (event === "Message" || event === "SendMessage") {
    const info = data.Info || data.info || {};
    const message = data.Message || data.message || {};
    const sender: string = info.Sender || info.sender || info.RemoteJid || "";
    const rawRemoteJid: string = info.Chat || info.RemoteJid || sender || "";
    const fromMe: boolean =
      !!(info.IsFromMe ?? info.isFromMe ?? event === "SendMessage");

    // Resolver JID @lid → JID @s.whatsapp.net (telefone real) quando whatsmeow envia o "Alt".
    // Em fromMe, o destino real (telefone) vem em RecipientAlt/RecipientPn/ChatAlt.
    // Em inbound, o sender real vem em SenderAlt/SenderPn.
    const altJidCandidates = fromMe
      ? [
        info.RecipientAlt,
        info.RecipientPn,
        info.ChatAlt,
        info.recipientAlt,
        info.recipientPn,
        info.chatAlt,
      ]
      : [info.SenderAlt, info.SenderPn, info.senderAlt, info.senderPn];
    const altPhoneJid = altJidCandidates.find(
      (j: any) => typeof j === "string" && j.includes("@s.whatsapp.net"),
    ) as string | undefined;

    // Preferimos o JID telefônico real; mantemos o LID como referência separada.
    const remoteJid = altPhoneJid || rawRemoteJid;
    const lidJid = rawRemoteJid.includes("@lid")
      ? rawRemoteJid
      : (altJidCandidates.find((j: any) =>
        typeof j === "string" && j.includes("@lid")
      ) as string | undefined);

    const content = message.conversation ||
      message.extendedTextMessage?.text ||
      message.imageMessage?.caption ||
      message.videoMessage?.caption ||
      (message.audioMessage ? "[áudio]" : "") ||
      (message.imageMessage ? "[imagem]" : "") ||
      (message.videoMessage ? "[vídeo]" : "") ||
      (message.documentMessage ? "[documento]" : "") ||
      "";

    const media = extractMedia(message);
    const contextInfo = message.contextInfo || data.contextInfo;

    return {
      kind: "message",
      instance,
      fromMe,
      remoteJid,
      lidJid,
      pushName: info.PushName || info.pushName || "",
      messageId: info.ID || info.id || "",
      content,
      media,
      contextInfo,
      referral,
    };


  }

  if (event === "Connected" || event === "PairSuccess") {
    return {
      kind: "connection",
      instance,
      state: "open",
      phone: data.JID || data.jid,
    };
  }
  if (event === "LoggedOut" || event === "Disconnected") {
    return { kind: "connection", instance, state: "close" };
  }
  if (event === "QRCode" || event === "QR" || event === "QRCodeUpdated") {
    // UazAPI can deliver the QR in many shapes. Walk the payload and pick
    // the first usable string. Accept BOTH a base64 PNG (data:image/...) and
    // the raw whatsmeow pairing string (e.g. "2@xyz,abc==,def==,1") — the
    // frontend renders raw strings via api.qrserver.com and base64 directly.
    const candidates = [
      data.QRCode,
      data.qrcode,
      data.qr,
      data.Qr,
      data.code,
      data.Code,
      data.base64,
      data.Base64,
      data?.qrcode?.base64,
      data?.qrcode?.code,
      data?.QRCode?.Base64,
      data?.QRCode?.Code,
      data?.data?.qrcode,
      data?.data?.base64,
      data?.data?.code,
      payload.QRCode,
      payload.qrcode,
      payload.qr,
      payload.code,
      payload.base64,
    ];
    let qr = "";
    for (const c of candidates) {
      const normalizedQr = normalizeQrString(c);
      if (normalizedQr) {
        qr = normalizedQr;
        break;
      }
    }
    if (!qr) {
      try {
        console.warn(
          "[uazapi-webhook] QRCode event sem QR extraível — payload:",
          JSON.stringify(payload).slice(0, 2000),
        );
      } catch { /* ignore */ }
    }
    return { kind: "qrcode", instance, qr };
  }

  return { kind: "unknown", instance, event };
}

// ---------- Multimodal helpers ----------------------------------------------
// Helper: convert array-of-ints (whatsmeow JSON) OR base64 string to base64.
function toBase64(value: any): string | undefined {
  if (value == null) return undefined;
  if (typeof value === "string") {
    // Accept raw base64 and data URLs returned by some UazAPI builds.
    return value.includes(",") ? value.split(",", 2)[1] : value;
  }
  if (Array.isArray(value)) {
    return bytesToBase64(new Uint8Array(value));
  }
  if (value instanceof Uint8Array) {
    return bytesToBase64(value);
  }
  if (Array.isArray(value?.data)) {
    return bytesToBase64(new Uint8Array(value.data));
  }
  return undefined;
}

// Magic-byte sniffer: returns true if the buffer looks like a valid decrypted
// audio/image format (OggS, JPEG, PNG, WebP, MP3, etc.). Used to refuse
// passing still-encrypted WhatsApp blobs to OpenAI.
function looksDecrypted(b64: string): boolean {
  if (!b64 || b64.length < 16) return false;
  try {
    const head = atob(b64.slice(0, 32));
    const bytes = new Uint8Array(head.length);
    for (let i = 0; i < head.length; i++) bytes[i] = head.charCodeAt(i);
    const ascii = (i: number, n: number) =>
      String.fromCharCode(...Array.from(bytes.subarray(i, i + n)));
    // Images
    if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
      return true; // JPEG
    }
    if (
      bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e &&
      bytes[3] === 0x47
    ) return true; // PNG
    if (ascii(0, 6) === "GIF87a" || ascii(0, 6) === "GIF89a") return true;
    if (ascii(0, 4) === "RIFF" && ascii(8, 4) === "WEBP") return true;
    // Audio
    if (ascii(0, 4) === "OggS") return true;
    if (ascii(0, 4) === "RIFF" && ascii(8, 4) === "WAVE") return true;
    if (ascii(0, 4) === "fLaC") return true;
    if (ascii(0, 3) === "ID3") return true;
    if (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0) return true; // MP3 sync
    if (ascii(4, 4) === "ftyp") return true; // M4A/MP4
    if (
      bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf &&
      bytes[3] === 0xa3
    ) return true; // WebM
    // Documents
    if (
      bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 &&
      bytes[3] === 0x46
    ) return true; // PDF
    return false;
  } catch {
    return false;
  }
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

function bytesFromAny(value: any): Uint8Array | null {
  if (value == null) return null;
  if (value instanceof Uint8Array) return value;
  if (Array.isArray(value)) {
    return new Uint8Array(value.map((n) => Number(n) & 0xff));
  }
  if (Array.isArray(value?.data)) {
    return new Uint8Array(value.data.map((n: any) => Number(n) & 0xff));
  }
  if (typeof value === "string" && value.trim()) {
    try {
      const normalized = value.trim().replace(/-/g, "+").replace(/_/g, "/");
      const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
      const bin = atob(padded.includes(",") ? padded.split(",", 2)[1] : padded);
      const out = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
      return out;
    } catch {
      return null;
    }
  }
  return null;
}

function pickRaw(rawMessage: any, ...names: string[]): any {
  for (const name of names) {
    const v = rawMessage?.[name] ??
      rawMessage?.[name.charAt(0).toUpperCase() + name.slice(1)] ??
      rawMessage?.[name.toUpperCase()];
    if (v !== undefined && v !== null && v !== "") return v;
  }
  return undefined;
}

async function decryptWhatsAppMedia(
  rawMessage: any,
  mediaType?: string,
): Promise<{ base64: string; mime?: string } | null> {
  if (!rawMessage) return null;

  const mediaKey = bytesFromAny(pickRaw(rawMessage, "mediaKey"));
  const directPath = String(pickRaw(rawMessage, "directPath") || "").trim();
  const url = String(pickRaw(rawMessage, "url") || "").trim();
  const mediaUrl = url ||
    (directPath
      ? `https://mmg.whatsapp.net${
        directPath.startsWith("/") ? directPath : `/${directPath}`
      }`
      : "");
  if (!mediaKey || !mediaUrl) {
    console.warn(
      `[uazapi-webhook] local media decrypt skipped: mediaKey=${!!mediaKey} mediaUrl=${!!mediaUrl} rawKeys=${
        Object.keys(rawMessage || {}).slice(0, 20).join(",")
      }`,
    );
    return null;
  }

  const encryptedResp = await fetch(mediaUrl);
  if (!encryptedResp.ok) {
    console.warn(
      `[uazapi-webhook] local media fetch failed: ${encryptedResp.status}`,
    );
    return null;
  }
  const encrypted = new Uint8Array(await encryptedResp.arrayBuffer());
  if (encrypted.byteLength <= 16) return null;

  const infoByType: Record<string, string> = {
    image: "WhatsApp Image Keys",
    audio: "WhatsApp Audio Keys",
    video: "WhatsApp Video Keys",
    document: "WhatsApp Document Keys",
    sticker: "WhatsApp Image Keys",
  };
  const infos = Array.from(
    new Set([
      mediaType ? infoByType[mediaType] : null,
      "WhatsApp Image Keys",
      "WhatsApp Audio Keys",
      "WhatsApp Video Keys",
      "WhatsApp Document Keys",
    ].filter(Boolean) as string[]),
  );

  for (const info of infos) {
    try {
      const keyMaterial = await crypto.subtle.importKey(
        "raw",
        mediaKey,
        "HKDF",
        false,
        ["deriveBits"],
      );
      const expanded = new Uint8Array(
        await crypto.subtle.deriveBits(
          {
            name: "HKDF",
            hash: "SHA-256",
            salt: new Uint8Array(32),
            info: new TextEncoder().encode(info),
          },
          keyMaterial,
          112 * 8,
        ),
      );
      const iv = expanded.slice(0, 16);
      const cipherKey = expanded.slice(16, 48);
      const macKey = expanded.slice(48, 80);
      const ciphertext = encrypted.slice(0, encrypted.byteLength - 10);
      const mac = encrypted.slice(encrypted.byteLength - 10);
      const hmacKey = await crypto.subtle.importKey(
        "raw",
        macKey,
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"],
      );
      const checkPayload = new Uint8Array(
        iv.byteLength + ciphertext.byteLength,
      );
      checkPayload.set(iv, 0);
      checkPayload.set(ciphertext, iv.byteLength);
      const digest = new Uint8Array(
        await crypto.subtle.sign("HMAC", hmacKey, checkPayload),
      );
      const macOk = mac.every((b, i) => b === digest[i]);
      if (!macOk) continue;

      const aesKey = await crypto.subtle.importKey(
        "raw",
        cipherKey,
        { name: "AES-CBC" },
        false,
        ["decrypt"],
      );
      const clear = new Uint8Array(
        await crypto.subtle.decrypt(
          { name: "AES-CBC", iv },
          aesKey,
          ciphertext,
        ),
      );
      const b64 = bytesToBase64(clear);
      if (looksDecrypted(b64)) {
        const mime = pickRaw(rawMessage, "mimetype") || undefined;
        console.log(
          `[uazapi-webhook] ✅ media decrypted locally (${info}, ${b64.length} chars b64, mime=${mime})`,
        );
        return { base64: b64, mime };
      }
    } catch (e) {
      console.warn(
        `[uazapi-webhook] local decrypt attempt failed (${info}):`,
        (e as any)?.message || String(e),
      );
    }
  }

  console.warn(
    "[uazapi-webhook] local media decrypt failed for all key derivations",
  );
  return null;
}

// Try to download decrypted media bytes from UazAPI.
// WhatsApp media is end-to-end encrypted: providers MUST decrypt using the
// per-message mediaKey. We try, in order:
//   1. /chat/getBase64FromMediaMessage (UazAPI canonical, decrypts)
//   2. /chat/getBase64                 (alias on some installs)
//   3. /message/downloadMedia          (newer UazAPI alias)
//   4. /message/downloadAudio | /message/downloadImage  (typed endpoints)
//   5. /message/downloadimage          (legacy lowercase used previously)
// After download, we validate the magic bytes — if the blob still looks
// encrypted (e.g. starts with `e0eeb612...`), we reject and try the next.
async function downloadMediaBase64(
  evoUrl: string,
  apikeys: string[],
  rawMessage: any,
  fallbackMessageId?: string,
  mediaType?: "audio" | "image" | "video" | "document" | "sticker",
  remoteJid?: string,
  instanceNameOrId?: string,
  instanceUuid?: string,
): Promise<{ base64: string; mime?: string } | null> {
  const keys = Array.from(
    new Set(apikeys.map((k) => String(k || "").trim()).filter(Boolean)),
  );
  const local = await decryptWhatsAppMedia(rawMessage, mediaType);
  if (local) return local;
  if (!evoUrl || keys.length === 0) return null;

  type Attempt = { path: string; body: any; headers?: Record<string, string> };
  const attempts: Attempt[] = [];

  // 0. If we have a direct URL, try it first with authentication headers.
  const directUrl = String(pickRaw(rawMessage, "url") || "").trim();
  if (directUrl && directUrl.startsWith("http")) {
    attempts.push({ path: directUrl, body: null });
  }

  // Build the payload UazAPI expects (DownloadImageStruct).
  const fields = [
    "mediaKey",
    "directPath",
    "fileEncSHA256",
    "fileSHA256",
    "fileLength",
    "mimetype",
    "url",
  ];
  const mediaPayload: Record<string, any> = {};
  if (rawMessage) {
    for (const f of fields) {
      const v = rawMessage[f] ??
        rawMessage[f.charAt(0).toUpperCase() + f.slice(1)];
      if (v !== undefined && v !== null) mediaPayload[f] = v;
    }
  }

  // Build the standard whatsmeow message envelope used by /chat/getBase64FromMediaMessage.
  const messageKey = fallbackMessageId
    ? { id: fallbackMessageId, remoteJid: remoteJid || "", fromMe: false }
    : null;
  const messageEnvelope = rawMessage
    ? {
      key: messageKey,
      message: mediaType === "audio"
        ? { audioMessage: rawMessage }
        : mediaType === "image"
        ? { imageMessage: rawMessage }
        : mediaType === "document"
        ? { documentMessage: rawMessage }
        : { mediaMessage: rawMessage },
    }
    : (messageKey ? { key: messageKey } : null);

  const instanceCandidates = Array.from(
    new Set([instanceNameOrId, instanceUuid].filter(Boolean).map(String)),
  );

  // 1+2: canonical decrypting endpoints (need full message envelope)
  if (messageEnvelope) {
    for (const inst of instanceCandidates) {
      const encoded = encodeURIComponent(inst);
      attempts.push({
        path: `/chat/getBase64FromMediaMessage/${encoded}`,
        body: { message: messageEnvelope, convertToMp4: false },
      });
      if (fallbackMessageId) {
        attempts.push({
          path: `/chat/getBase64FromMediaMessage/${encoded}`,
          body: { message: { key: messageKey }, convertToMp4: false },
        });
      }
    }
    attempts.push({
      path: "/chat/getBase64FromMediaMessage",
      body: { message: messageEnvelope, convertToMp4: false },
    });
    if (fallbackMessageId) {
      attempts.push({
        path: "/chat/getBase64FromMediaMessage",
        body: { message: { key: messageKey }, convertToMp4: false },
      });
    }
    attempts.push({
      path: "/chat/getBase64",
      body: { message: messageEnvelope },
    });
  }

  // 3: newer UazAPI alias accepting the raw media object
  if (Object.keys(mediaPayload).length > 0) {
    attempts.push({ path: "/message/downloadMedia", body: mediaPayload });
    // 4: typed endpoints (preferred for audio/image specifically)
    if (mediaType === "audio") {
      attempts.push({ path: "/message/downloadAudio", body: mediaPayload });
    } else if (mediaType === "image") {
      attempts.push({ path: "/message/downloadImage", body: mediaPayload });
    } else if (mediaType === "document") {
      attempts.push({ path: "/message/downloadDocument", body: mediaPayload });
    }
    // 5: legacy lowercase (was used before — kept as last resort)
    attempts.push({ path: "/message/downloadimage", body: mediaPayload });
    // 6: Uazapi specifics
    attempts.push({ path: "/message/download", body: mediaPayload });
    attempts.push({ path: "/chat/download", body: mediaPayload });
    for (const inst of instanceCandidates) {
      const encoded = encodeURIComponent(inst);
      attempts.push({
        path: `/message/download/${encoded}`,
        body: mediaPayload,
      });
    }
  }

  for (const a of attempts) {
    for (const apikey of keys) {
      try {
        const isDirectUrl = a.path.startsWith("http");
        const fetchUrl = isDirectUrl ? a.path : `${evoUrl}${a.path}`;

        const res = await fetch(fetchUrl, {
          method: isDirectUrl ? "GET" : "POST",
          headers: {
            "Content-Type": "application/json",
            apikey,
            "token": apikey,
            "Authorization": `Bearer ${apikey}`,
            "instanceId": instanceUuid || instanceNameOrId || "",
            "instanceName": instanceNameOrId || "",
            ...(instanceUuid ? { "instance-id": instanceUuid } : {}),
            ...(instanceNameOrId ? { "instance": instanceNameOrId } : {}),
            ...(a.headers || {}),
          },
          body: isDirectUrl ? undefined : JSON.stringify(a.body),
        });
        if (!res.ok) {
          const t = await res.text().catch(() => "");
          if (!isDirectUrl) {
            console.warn(
              `[uazapi-webhook] ${a.path} failed: ${res.status} ${
                t.slice(0, 200)
              } (instance: ${instanceNameOrId})`,
            );
          }
          continue;
        }
        const contentType = res.headers.get("content-type") || "";
        let b64 = "";
        let mime = "";

        if (contentType.includes("application/json")) {
          const data = await res.json().catch(() => null);
          const candidate = data?.data?.base64 || data?.data?.image ||
            data?.data?.file || data?.data?.media ||
            data?.base64 || data?.Base64 || data?.image || data?.file ||
            data?.body || data?.media ||
            (typeof data === "string" ? data : null);
          b64 = toBase64(candidate) || "";
          mime = data?.mimetype || data?.Mimetype || data?.mime ||
            (rawMessage?.mimetype) || undefined;
        } else {
          const buf = await res.arrayBuffer();
          const bytes = new Uint8Array(buf);
          if (bytes.length > 50) {
            b64 = encodeBase64(bytes);
            mime = contentType || (rawMessage?.mimetype) || undefined;
          }
        }

        if (!b64 || b64.length < 50) {
          console.warn(
            `[uazapi-webhook] ${a.path}: no usable base64 (content-type=${contentType})`,
          );
          continue;
        }

        // VALIDATE: are the bytes actually decrypted?
        if (!looksDecrypted(b64)) {
          console.warn(
            `[uazapi-webhook] ${a.path}: bytes look ENCRYPTED; trying next endpoint`,
          );
          continue;
        }

        console.log(
          `[uazapi-webhook] ✅ media downloaded via ${a.path} (${b64.length} chars b64, mime=${mime})`,
        );
        return { base64: b64, mime };
      } catch (e) {
        console.warn(
          `[uazapi-webhook] ${a.path} exception:`,
          (e as any)?.message,
        );
      }
    }
  }

  console.error("[uazapi-webhook] all media download attempts failed");
  return null;
}

// Decode base64 → Uint8Array (chunked, safe for large media).
function base64ToUint8(b64: string): Uint8Array {
  const cleaned = b64.includes(",") ? b64.split(",", 2)[1] : b64;
  const bin = atob(cleaned);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// Map a mime type to a sensible file extension for storage paths.
function extFromMime(mime?: string, fallback = "bin"): string {
  if (!mime) return fallback;
  const m = mime.toLowerCase();
  if (m.includes("jpeg") || m.includes("jpg")) return "jpg";
  if (m.includes("png")) return "png";
  if (m.includes("webp")) return "webp";
  if (m.includes("gif")) return "gif";
  if (m.includes("ogg")) return "ogg";
  if (m.includes("mpeg") || m.includes("mp3")) return "mp3";
  if (m.includes("wav")) return "wav";
  if (m.includes("m4a") || m.includes("mp4a")) return "m4a";
  if (m.includes("mp4")) return "mp4";
  if (m.includes("webm")) return "webm";
  if (m.includes("pdf")) return "pdf";
  if (m.includes("msword")) return "doc";
  if (m.includes("officedocument.wordprocessingml")) return "docx";
  if (m.includes("ms-excel")) return "xls";
  if (m.includes("officedocument.spreadsheetml")) return "xlsx";
  if (m.includes("zip")) return "zip";
  return fallback;
}

// Upload decrypted inbound media bytes to the public `chat-media` bucket
// and return the public URL. The webhook is reentrant — same messageId always
// maps to the same path so duplicates upsert harmlessly.
async function uploadInboundMediaToStorage(
  supabase: any,
  organizationId: string,
  conversationId: string,
  messageId: string | undefined,
  bytes: Uint8Array,
  mime: string,
  filename?: string | null,
): Promise<string | null> {
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const safeName = (filename || "").replace(/[^\w.\-]+/g, "_").slice(0, 80);
    const ext = extFromMime(
      mime,
      safeName.includes(".") ? safeName.split(".").pop()! : "bin",
    );
    const baseId = (messageId || crypto.randomUUID()).replace(
      /[^a-zA-Z0-9_-]+/g,
      "_",
    );
    const finalName = safeName ? `${baseId}-${safeName}` : `${baseId}.${ext}`;
    const path =
      `whatsapp-inbound/${organizationId}/${conversationId}/${finalName}`;
    const ab = new ArrayBuffer(bytes.byteLength);
    new Uint8Array(ab).set(bytes);
    const { error } = await supabase.storage
      .from("chat-media")
      .upload(path, ab, {
        contentType: mime || "application/octet-stream",
        upsert: true,
      });
    if (error) {
      console.warn("[uazapi-webhook] storage upload failed:", error.message);
      return null;
    }
    const publicUrl =
      `${supabaseUrl}/storage/v1/object/public/chat-media/${path}`;
    console.log(
      `[uazapi-webhook] ✅ media uploaded to storage (${bytes.byteLength}B, ${mime}) → ${path}`,
    );
    return publicUrl;
  } catch (e: any) {
    console.warn(
      "[uazapi-webhook] storage upload exception:",
      e?.message || String(e),
    );
    return null;
  }
}

// Calls the process-media-message edge function (Whisper for audio, GPT-4o-mini for images).
// Returns the textual representation that should become the message content.
async function processMediaToText(
  supabaseUrl: string,
  serviceKey: string,
  payload: {
    kind: "audio" | "image" | "document";
    base64?: string;
    url?: string;
    mime?: string;
    caption?: string;
    filename?: string;
    organization_id?: string;
  },
): Promise<string | null> {
  const MAX_ATTEMPTS = 3;
  const BACKOFF_MS = [0, 1500, 4000];
  const TIMEOUT_MS = 45_000;

  const sizeHint =
    typeof payload.base64 === "string" ? Math.floor(payload.base64.length * 0.75) : undefined;
  const ctx = {
    kind: payload.kind,
    mime: payload.mime || null,
    filename: (payload as any).filename || null,
    size: sizeHint,
    has_url: !!payload.url,
    has_base64: !!payload.base64,
  };

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    if (BACKOFF_MS[attempt - 1] > 0) {
      await new Promise((r) => setTimeout(r, BACKOFF_MS[attempt - 1]));
    }
    try {
      const res = await fetch(
        `${supabaseUrl}/functions/v1/process-media-message`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${serviceKey}`,
          },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(TIMEOUT_MS),
        },
      );
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) {
        console.warn(
          `[uazapi-webhook] process-media-message FAIL attempt=${attempt}/${MAX_ATTEMPTS}`,
          JSON.stringify({
            http_status: res.status,
            body_preview: JSON.stringify(data)?.slice(0, 300) || null,
            ...ctx,
          }),
        );
        continue;
      }
      const text = String(data.text || "").trim();
      if (!text) {
        console.warn(
          `[uazapi-webhook] process-media-message EMPTY_TEXT attempt=${attempt}/${MAX_ATTEMPTS}`,
          JSON.stringify(ctx),
        );
        continue;
      }
      if (attempt > 1) {
        console.log(
          `[uazapi-webhook] process-media-message OK_ON_RETRY attempt=${attempt}/${MAX_ATTEMPTS}`,
          JSON.stringify({ ...ctx, text_len: text.length }),
        );
      }
      return text;
    } catch (e: any) {
      console.warn(
        `[uazapi-webhook] process-media-message EXCEPTION attempt=${attempt}/${MAX_ATTEMPTS}`,
        JSON.stringify({
          exception_name: e?.name || null,
          exception_message: e?.message || String(e),
          ...ctx,
        }),
      );
    }
  }

  console.error(
    `[uazapi-webhook] process-media-message GIVE_UP after ${MAX_ATTEMPTS} attempts — falling back to placeholder`,
    JSON.stringify(ctx),
  );
  return null;
}

async function classifyAnswer(
  promptTemplate: string,
  resolvedText: string,
  imageUrl: string,
  organization_id: string,
  replaceVars: (txt: any) => any,
): Promise<"sim" | "nao"> {
  try {
    const finalPrompt = replaceVars(promptTemplate)
      .replace(/{{variavel}}/g, resolvedText)
      .replace(/{{variable}}/g, resolvedText)
      .replace(/{{input}}/g, resolvedText);

    console.log("[uazapi-webhook] pergunta_ai_prompt_final:", finalPrompt);

    // Resolve the AI provider
    let aiApiKey = Deno.env.get("LOVABLE_API_KEY") || "";
    let aiUrl = "https://ai.gateway.lovable.dev/v1/chat/completions";
    let aiModel = "openai/gpt-4o-mini";

    try {
      // FIX: "chat" is not a valid capability in ai-credentials.ts, using "agent_chat"
      const resolved = await resolveAIProvider(organization_id, "agent_chat");
      aiApiKey = resolved.apiKey;
      const isOpenAI = aiApiKey.startsWith("sk-");
      aiUrl = isOpenAI ? "https://api.openai.com/v1/chat/completions" : aiUrl;
      aiModel = resolved.model || aiModel;
    } catch (e) {
      console.warn(
        "[uazapi-webhook] classifyAnswer: resolveAIProvider failed",
        e,
      );
      console.log(
        "[uazapi-webhook] pergunta_ai_error:",
        e.message || String(e),
      );
    }

    const messages: any[] = [];
    if (imageUrl) {
      messages.push({
        role: "user",
        content: [
          { type: "text", text: finalPrompt },
          { type: "image_url", image_url: { url: imageUrl } },
        ],
      });
      if (!aiModel.includes("gpt-4o") && !aiModel.includes("vision")) {
        aiModel = "openai/gpt-4o-mini";
      }
    } else {
      messages.push({ role: "user", content: finalPrompt });
    }

    const isGPT5 = aiModel.startsWith("gpt-5") || aiModel.includes("/gpt-5");

    const requestBody: any = {
      model: aiModel,
      messages: messages,
    };

    if (!isGPT5) {
      requestBody.temperature = 0;
    }

    console.log("[uazapi-webhook] pergunta_ai_openai_request:", {
      provider: aiUrl.includes("openai.com") ? "openai" : "lovable",
      model: aiModel,
      temperature: isGPT5 ? undefined : 0,
      max_tokens: null, // Not explicitly set
    });

    console.log(
      "[uazapi-webhook] pergunta_ai_openai_request_final:",
      JSON.stringify(requestBody, null, 2),
    );

    const aiResp = await fetch(aiUrl, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${aiApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    });

    if (aiResp.ok) {
      const aiData = await aiResp.json();
      const rawResult = (aiData.choices[0].message.content || "").trim();
      console.log(
        "[uazapi-webhook] pergunta_ai_openai_raw_response:",
        rawResult,
      );

      const normalizedResult = rawResult.toLowerCase();

      const positivePatterns = ["#sim", "sim", "yes", "positive", "positivo"];
      const negativePatterns = [
        "#não",
        "#nao",
        "não",
        "nao",
        "no",
        "negative",
        "negativo",
      ];

      let classification: "sim" | "nao" = "nao";
      if (
        positivePatterns.some((p) =>
          normalizedResult === p || normalizedResult.startsWith(p + " ")
        )
      ) {
        classification = "sim";
      }

      console.log(
        "[uazapi-webhook] pergunta_ai_normalized_response:",
        classification === "sim" ? "#sim" : "#não",
      );
      return classification;
    } else {
      const errorText = await aiResp.text();
      console.error("[uazapi-webhook] classifyAnswer AI error:", errorText);
      console.log(
        "[uazapi-webhook] pergunta_ai_error:",
        `AI request failed: ${aiResp.status} ${errorText}`,
      );
      return "nao";
    }
  } catch (e) {
    console.error("[uazapi-webhook] classifyAnswer error:", e);
    console.log("[uazapi-webhook] pergunta_ai_error:", e.message || String(e));
    return "nao";
  }
}

// ============================================================================
// Facebook Pixel Conversions API Helpers
// ============================================================================

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
    fbp?: string;
    client_ip_address?: string;
    client_user_agent?: string;
  },
  customData: {
    value?: number;
    currency?: string;
    campaign_id?: string;
    campaign_name?: string;
    adset_id?: string;
    adset_name?: string;
    ad_id?: string;
    ad_name?: string;
    ctwa_clid?: string;
    ad_source_id?: string;
    ad_source_type?: string;
    ad_source_url?: string;
    ad_headline?: string;
    entry_point_conversion_source?: string;
    entry_point_conversion_app?: string;
  },
  options?: {
    testEventCode?: string;
    actionSource?: string;
    eventId?: string;
  },
) {
  const url =
    `https://graph.facebook.com/v18.0/${pixelId}/events?access_token=${accessToken}`;

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

  const custom_data: any = {};
  if (customData.value !== undefined) custom_data.value = customData.value;
  if (customData.currency) custom_data.currency = customData.currency;
  if (customData.campaign_id) custom_data.campaign_id = customData.campaign_id;
  if (customData.campaign_name) custom_data.campaign_name = customData.campaign_name;
  if (customData.adset_id) custom_data.adset_id = customData.adset_id;
  if (customData.adset_name) custom_data.adset_name = customData.adset_name;
  if (customData.ad_id) custom_data.ad_id = customData.ad_id;
  if (customData.ad_name) custom_data.ad_name = customData.ad_name;
  if (customData.ctwa_clid) custom_data.ctwa_clid = customData.ctwa_clid;
  if (customData.ad_source_id) custom_data.ad_source_id = customData.ad_source_id;
  if (customData.ad_source_type) custom_data.ad_source_type = customData.ad_source_type;
  if (customData.ad_source_url) custom_data.ad_source_url = customData.ad_source_url;
  if (customData.ad_headline) custom_data.ad_headline = customData.ad_headline;
  if (customData.entry_point_conversion_source) custom_data.entry_point_conversion_source = customData.entry_point_conversion_source;
  if (customData.entry_point_conversion_app) custom_data.entry_point_conversion_app = customData.entry_point_conversion_app;

  const event_id = options?.eventId || `capi_${crypto.randomUUID()}`;
  const action_source = options?.actionSource || "system_generated";

  const payload: any = {
    data: [
      {
        event_name: eventName,
        event_time: Math.floor(Date.now() / 1000),
        event_id,
        action_source,
        user_data,
        custom_data,
      },
    ],
  };

  if (options?.testEventCode) {
    payload.test_event_code = options.testEventCode;
  }

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const respText = await response.text();
    let respData: any = {};
    try {
      respData = JSON.parse(respText);
    } catch {
      respData = { raw: respText };
    }

    if (!response.ok) {
      console.error("[facebook-pixel] API error:", respText);
      return { success: false, payload, response: respData };
    }
    console.log("[facebook-pixel] Event sent:", eventName, "action_source:", action_source, "ctwa_clid:", customData.ctwa_clid ? "yes" : "no");
    return { success: true, payload, response: respData };
  } catch (e) {
    console.error("[facebook-pixel] fetch exception:", e);
    return { success: false, payload, error: String(e) };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const url = new URL(req.url);
    const queryAction = url.searchParams.get("action");
    const payload = await req.json().catch(() => ({}));
    const action = queryAction || payload.action;

    let healthId: string | null = null;
    let norm: Normalized | null = null;

    // 1. RAW WEBHOOK LOG FIRST (PERSISTÊNCIA BRUTA)
    console.log('[UAZAPI_INBOUND_RAW_PAYLOAD]', JSON.stringify(payload).slice(0, 5000));
    let logRecordId: string | null = null;
    try {
      const rawEventType = payload.event || payload.type || payload.Event || payload.EventType || "unknown";
      const rawInstanceName = extractInstance(payload);
      const rawMessageId = payload.data?.key?.id || payload.messageId || payload.id;
      const rawPhone = payload.data?.key?.remoteJid || payload.remoteJid || payload.phone || payload.chatid;

      const { data: logData, error: logError } = await supabase.from("webhook_logs").insert({
        request_id: crypto.randomUUID(),
        event_type: typeof rawEventType === 'string' ? rawEventType : JSON.stringify(rawEventType),
        instance_name: String(rawInstanceName || ""),
        // raw_payload: payload, // Skip full payload initially for I/O efficiency
        raw_payload: { summary: "received" },
        phone: rawPhone ? String(rawPhone).split("@")[0] : null,
        messageid: rawMessageId ? String(rawMessageId) : null,
        processing_status: 'received',
        organization_id: payload.organization_id || null
      }).select("id").single();


      if (logError) {
        console.error("[uazapi-webhook] CRITICAL: Failed to save raw webhook log:", logError);
      } else {
        logRecordId = logData.id;
      }
    } catch (e) {
      console.error("[uazapi-webhook] Exception saving raw log:", e);
    }

    healthId = await logWebhookHealth(supabase, {
      raw_payload: payload,
      webhook_received: true,
      connection_id: extractInstance(payload),
      message_id: payload.data?.key?.id || payload.messageId || payload.id,
      message_type: payload.event || payload.type
    });

    // ACTION: resume_funnel (manual or cron)
    if (action === "resume_funnel" && payload.conversationId) {
      const conversationId = payload.conversationId;
      console.log("[uazapi-webhook] action: resume_funnel for", conversationId);

      // TRIGGER: do NOT clear lock here! The funnel engine will clear it after re-verifying if a message arrived.
      // This prevents updating updated_at prematurely and causing race conditions with inbound messages.

      // Trigger funnel engine by spoofing a dummy normalized payload
      let { data: conv } = await supabase
        .from("webchat_conversations")
        .select(
          "visitor_phone_normalized, evolution_instance_id, organization_id, visitor_name, current_flow_id, current_block_id, status, flow_source, flow_completed, flow_variables, lead_id",
        )
        .eq("id", conversationId)
        .single();

      if (!conv) return new Response("Conv not found", { status: 404 });

      // ============================================================
      // GHOST GUARD: detect impossible-to-resume conversations and
      // release bot_locked_until + waiting_input WITHOUT sending any
      // message, advancing any block, firing any pixel or touching
      // the conversation history. Pure slot release.
      // ============================================================
      const ghostReleaseSlot = async (reason: string) => {
        try {
          const cleanedVars = { ...((conv as any).flow_variables || {}) };
          delete cleanedVars["__waiting_input"];
          delete cleanedVars["waiting_for_input"];
          await supabase
            .from("webchat_conversations")
            .update({
              bot_locked_until: null,
              flow_variables: cleanedVars,
            })
            .eq("id", conversationId);
          console.log(
            "[uazapi-webhook] ghost_cleanup_invalid_resume_state",
            JSON.stringify({
              conversation_id: conversationId,
              lead_id: (conv as any).lead_id,
              reason,
              chip: (conv as any).evolution_instance_id,
              current_flow_id: (conv as any).current_flow_id,
              current_block_id: (conv as any).current_block_id,
            }),
          );
        } catch (e) {
          console.warn(
            "[uazapi-webhook] ghost_cleanup_invalid_resume_state_failed:",
            (e as any)?.message || e,
          );
        }
      };

      let ghostReason: string | null = null;
      if (!(conv as any).evolution_instance_id) ghostReason = "instance_missing";
      else if (!(conv as any).current_flow_id) ghostReason = "flow_id_missing";
      else if (!(conv as any).current_block_id) ghostReason = "block_id_missing";
      else if ((conv as any).status !== "bot_active") ghostReason = `status_${(conv as any).status}`;
      else if ((conv as any).flow_source !== "funnel") ghostReason = "flow_source_not_funnel";
      else if ((conv as any).flow_completed === true) ghostReason = "flow_already_completed";
      else {
        const { data: flowRow } = await supabase
          .from("capture_funnels")
          .select("id, status, flow_blocks")
          .eq("id", (conv as any).current_flow_id)
          .maybeSingle();
        if (!flowRow) ghostReason = "flow_record_missing";
        else if ((flowRow as any).status !== "active") ghostReason = `flow_status_${(flowRow as any).status}`;
        else {
          const flowBlocks = ((flowRow as any).flow_blocks || []) as any[];
          const blockExists = Array.isArray(flowBlocks) &&
            flowBlocks.some((b: any) => b?.id === (conv as any).current_block_id);
          if (!blockExists) ghostReason = "block_missing_in_flow";
        }
      }

      if (ghostReason) {
        await ghostReleaseSlot(ghostReason);
        return new Response(
          JSON.stringify({
            ok: true,
            skipped: "ghost_cleanup_invalid_resume_state",
            reason: ghostReason,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      (payload as any).__is_resume = true;
      (payload as any).__conv_override = conv;
      (payload as any).instance = (conv as any).evolution_instance_id;
      (payload as any).remoteJid = (conv as any).visitor_phone_normalized;
    }

    norm = normalizePayload(payload);
    console.log("[uazapi-webhook] normalized:", JSON.stringify(norm));

    // [WEBHOOK_HEALTH_TRACKING] Update last_webhook_event_at for the instance
    if (norm?.instance) {
      const { error: healthErr } = await supabase.from("evolution_instances")
        .update({ 
          last_webhook_event_at: new Date().toISOString(),
          webhook_status: 'ok' // If we are receiving events, it's OK
        })
        .or(`instance_id.eq.${norm.instance},name.eq.${norm.instance}`);
      
      if (healthErr) console.warn("[uazapi-webhook] Failed to update webhook health:", healthErr.message);
    }


    // DEBUG ACTION: Controlled insert test
    if (action === "debug-insert-tracking") {
      const result = await debugInsertTracking(supabase, payload);
      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const rawEvent = payload.event || payload.type || payload.Event ||
      payload.EventType;
    const rawInstance = extractInstance(payload);
    console.log(
      "[uazapi-webhook] raw event:",
      rawEvent,
      "instance:",
      rawInstance || "<MISSING>",
    );

    if (
      rawEvent === "messages" || rawEvent === "MESSAGES_UPSERT" || !rawEvent
    ) {
      try {
        console.log(
          "[uazapi-webhook] incoming payload dump:",
          JSON.stringify(payload).slice(0, 4000),
        );
      } catch (e) {
        console.warn("[uazapi-webhook] payload dump error:", e);
      }

      // 3. PROCESSAR EVENTOS DE ACK
      if (norm && (norm as any).kind === "ack") {
        const ackEvent = norm as any;
        console.log(`[uazapi-webhook] processing ack for message ${ackEvent.messageId}: ${ackEvent.ack}`);
        
        // Atualizar status na tabela processed_messages
        await supabase.from("processed_messages")
          .update({ 
            ack: ackEvent.ack, 
            ack_at: new Date().toISOString() 
          })
          .eq("message_id", ackEvent.messageId);

        // Remover do controle de retentativas se entregue ou lido
        if (ackEvent.ack >= 3) {
          await supabase.from("whatsapp_message_retries")
            .delete()
            .eq("message_id", ackEvent.messageId);
            
          // Atualizar status na webchat_messages para refletir no UI
          await supabase.from("webchat_messages")
            .update({ 
              status: ackEvent.ack === 4 ? "read" : "delivered",
              delivered_at: ackEvent.ack >= 3 ? new Date().toISOString() : null,
              read_at: ackEvent.ack === 4 ? new Date().toISOString() : null
            })
            .or(`metadata->>evolution_message_id.eq."${ackEvent.messageId}",metadata->>external_id.eq."${ackEvent.messageId}"`);
        }
        
        return new Response(JSON.stringify({ ok: true, task: "ack_processed" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    
    // 2. ATUALIZAR STATUS DO LOG (LEAD RESOLVED/RECEIVED)
    if (logRecordId) {
      try {
        const updateData: any = { 
          processing_status: 'processed',
          raw_payload: { summary: "processed_successfully" } // Keep it small on success
        };
        if (norm && norm.kind === "message") {
          updateData.phone = norm.remoteJid.split("@")[0];
          updateData.messageid = norm.messageId;
          updateData.from_me = norm.fromMe;
          updateData.message_type = norm.media?.type || "text";
          updateData.chatid = norm.remoteJid;
        }
        await supabase.from("webhook_logs").update(updateData).eq("id", logRecordId);
      } catch (e) {
        console.warn("[uazapi-webhook] failed to update log status:", e);
      }
    }

    if (norm && healthId) {
      await updateWebhookHealth(supabase, healthId, {
        phone: norm.kind === "message" ? norm.remoteJid : undefined,
        message_id: norm.kind === "message" ? norm.messageId : undefined,
        message_type: norm.kind
      });
    }


    if (!norm && !(payload as any).__is_resume) {


      
      // Log full payload (truncated) so we can identify where the instance name lives
      try {
        const dump = JSON.stringify(payload).slice(0, 4000);
        console.warn("[uazapi-webhook] missing instance — payload dump:", dump);
      } catch {
        console.warn(
          "[uazapi-webhook] missing instance — payload not serializable",
        );
      }
      // Return 200 so UazAPI does not retry indefinitely
      return new Response(
        JSON.stringify({ ok: true, ignored: "missing_instance" }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }


    // Lookup instance by either instance_id (UUID) OR name OR metadata.instance_name
    // The Go server may send the instance NAME in webhook payloads even though
    // we registered the webhook with the UUID.
    // Use case-insensitive match for name and exact match for instance_id/id
    let query = `instance_id.eq.${norm.instance},name.ilike.${norm.instance}`;
    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (uuidRegex.test(norm.instance)) {
      query += `,id.eq.${norm.instance}`;
    }
    const { data: instances } = await supabase
      .from("evolution_instances")
      .select("*")
      .or(query)
      .order("is_active", { ascending: false })
      .order("status", { ascending: true })
      .order("created_at", { ascending: false });

    console.log("[uazapi-webhook] candidates found:", instances?.length || 0, "for", norm.instance);

    // Filtragem rigorosa por prioridade
    let instance = instances?.find(i => i.is_active && i.status === 'connected') 
                || instances?.find(i => i.is_active)
                || instances?.[0];

    if (instance && !instance.is_active) {
      const activePartner = instances?.find(i => i.is_active && i.phone_number === instance.phone_number);
      if (activePartner) {
        console.log(`[INSTANCE_RESOLUTION_SELECTED_ACTIVE] Redirecting from archived ${instance.name} to active ${activePartner.name}`);
        instance = activePartner;
      }
    }

    if (!instance) {
      console.log(
        `[uazapi-webhook] instance not found by instance_id or name: ${norm.instance}. Trying secondary lookups...`,
      );
      // Last-resort: try metadata.instance_name / metadata.instance_uuid
      const { data: byMeta } = await supabase
        .from("evolution_instances")
        .select("*")
        .or(
          `metadata->>instance_name.eq.${norm.instance},metadata->>instance_uuid.eq.${norm.instance}`,
        )
        .order("is_active", { ascending: false });
      instance = byMeta?.find(i => i.is_active && i.status === 'connected') 
              || byMeta?.find(i => i.is_active)
              || byMeta?.[0];
    }

    if (!instance || (!instance.is_active && !uuidRegex.test(norm.instance))) {
       if (instance && !instance.is_active) {
         console.warn("[INSTANCE_RESOLUTION_SKIPPED_ARCHIVED] Instance is archived:", instance.name);
       }
      console.warn("[uazapi-webhook] unknown or archived instance:", norm.instance);
      console.warn("[INBOUND_INSTANCE_RESOLUTION] FAILED for instance:", norm.instance);
      return new Response(JSON.stringify({ ok: true, ignored: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("[INBOUND_INSTANCE_RESOLUTION] SUCCESS", {
      instance_id: instance.id,
      name: instance.name,
      org_id: instance.organization_id,
      is_active: instance.is_active
    });

    console.log(
      `[uazapi-webhook] instance found: ${instance.name} (ID: ${instance.id}, Status: ${instance.status})`,
    );

    // Safeguard: If we receive any event for this instance, and it's not marked as connected,
    // we should consider it connected if the event is a message or a successful connection.
    if (
      instance.status !== "connected" &&
      (norm.kind === "message" ||
        (norm.kind === "connection" && norm.state === "open"))
    ) {
      console.log(
        `[uazapi-webhook] auto-correcting status for instance ${instance.name} to connected (event: ${norm.kind})`,
      );
      const phone = norm.kind === "connection"
        ? norm.phone
        : (payload.owner || payload.instance_phone);
      const updates: any = {
        status: "connected",
        qr_code: null,
        last_connected_at: new Date().toISOString(),
      };
      if (phone) updates.phone_number = String(phone).replace(/\D/g, "");

      await supabase.from("evolution_instances").update(updates).eq(
        "id",
        instance.id,
      );
      instance.status = "connected";
      if (phone) instance.phone_number = updates.phone_number;
    }

    // ---- MESSAGE DELETE (Sync from WhatsApp) ----
    if (norm.kind === "message_delete") {
      console.log(
        `[uazapi-webhook] Deleting message ${norm.messageId} from ${norm.remoteJid}`,
      );
      // Mark as deleted in our DB if found via evolution_message_id
      await supabase
        .from("webchat_messages")
        .update({ is_deleted: true })
        .filter("metadata->>evolution_message_id", "eq", norm.messageId);

      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (norm.kind === "connection") {
      await handleAdminStatusAlert(supabase, norm.instance, norm.state);
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ---- QR CODE ----
    if (norm.kind === "qrcode") {
      if (norm.qr) {
        await supabase
          .from("evolution_instances")
          .update({
            qr_code: norm.qr,
            qr_code_updated_at: new Date().toISOString(),
            status: "qr_pending",
          })
          .eq("id", instance.id);
      }
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ---- MESSAGE ----
    if (norm.kind === "message") {
      const remoteJid = String(norm.remoteJid || "");

      // 1) Get or create conversation
      // We look up conversation early to check for smart pause lock
      // Use phone-based lookup instead of non-existent external_id
      const remotePhoneRawCheck = remoteJid.split("@")[0].split(":")[0];
      const remotePhoneDigitsCheck = remotePhoneRawCheck.replace(/\D/g, "");
      const isActuallyPhoneCheck = !remoteJid.includes("@lid") &&
        remotePhoneDigitsCheck.length >= 8 && /^\d+$/.test(remotePhoneRawCheck);
      const phoneCanonicalCheck = isActuallyPhoneCheck
        ? (normalizePhoneBR(remotePhoneDigitsCheck) || remotePhoneDigitsCheck)
        : remotePhoneRawCheck;

      const { data: convCheck } = await supabase
        .from("webchat_conversations")
        .select("id, status, bot_locked_until, flow_source, current_block_id")
        .eq("organization_id", instance.organization_id)
        .eq("visitor_phone_normalized", phoneCanonicalCheck)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (
        convCheck?.bot_locked_until && !norm.fromMe &&
        !(payload as any).__is_resume
      ) {
        // Se for um funil, deixamos o motor do funil decidir se bloqueia ou não (ex: timeout de pergunta permite interrupção)
        if (convCheck.flow_source !== "funnel") {
          const lockUntil = new Date(convCheck.bot_locked_until);
          if (lockUntil > new Date()) {
            console.log(
              "[uazapi-webhook] ignoring inbound due to smart pause lock until",
              convCheck.bot_locked_until,
            );
            return new Response(
              JSON.stringify({ ok: true, ignored: "smart_pause" }),
              {
                headers: { ...corsHeaders, "Content-Type": "application/json" },
              },
            );
          }
        }
      }

      const remoteIsLid = remoteJid.includes("@lid");
      const lidJid = norm.lidJid || (remoteIsLid ? remoteJid : undefined);
      const lidId = lidJid ? lidJid.split("@")[0].split(":")[0] : undefined;
      // Se só temos @lid (sem telefone real resolvido), usamos o LID como identificador.
      // Modificamos para aceitar strings longas (JID/LID) como identificador principal se não for um telefone óbvio.
      const remotePhoneRaw = remoteJid.split("@")[0].split(":")[0];
      const remotePhoneDigits = remotePhoneRaw.replace(/\D/g, "");

      // Se a string original tiver letras ou for muito diferente de um telefone, preservamos ela toda.
      // O identificador "phone" no lead agora pode ser um JID/LID completo.
      const isActuallyPhone = !remoteIsLid && remotePhoneDigits.length >= 8 &&
        /^\d+$/.test(remotePhoneRaw);

      const remotePhone = isActuallyPhone ? remotePhoneDigits : remotePhoneRaw;
      const instancePhone = (instance.phone_number || "").replace(/\D/g, "");
      const remotePhoneCandidates = isActuallyPhone
        ? phoneVariantsBR(remotePhone)
        : [remotePhone];
      const remotePhoneCanonical = isActuallyPhone
        ? (normalizePhoneBR(remotePhone) || remotePhone)
        : remotePhone;

      // fromMe = mensagem partiu do APARELHO conectado.
      const isFromDevice = norm.fromMe ||
        (!!instancePhone && remotePhone === instancePhone);

      if (healthId) {
        await updateWebhookHealth(supabase, healthId, {
          processed: true
        });
      }

      console.log(
        "[uazapi-webhook] decision:",

        JSON.stringify({
          event: rawEvent,
          instanceName: instance.name,
          instanceId: instance.instance_id,
          IsFromMe: norm.fromMe,
          Sender: remoteJid,
          lidJid,
          instance_phone_db: instancePhone,
          remotePhone,
          decision: isFromDevice ? "device_outbound" : "insert_inbound",
          contentPreview: (typeof norm.content === "string" ? norm.content : "")
            .slice(0, 80),
        }),
      );

      if (remoteJid.endsWith("@g.us")) {
        console.log("[uazapi-webhook] skipped: group");
        return new Response(JSON.stringify({ ok: true, skipped: "group" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Mensagem vinda do APARELHO conectado → outbound externo (dono digitou no celular)
      if (isFromDevice) {
        try {
          // Eventos de eco sem destinatário claro
          if (!remotePhone && !lidId) {
            console.log(
              "[uazapi-webhook] external_outbound: skip self_echo_no_target",
            );
            return new Response(
              JSON.stringify({ ok: true, skipped: "self_echo_no_target" }),
              {
                headers: { ...corsHeaders, "Content-Type": "application/json" },
              },
            );
          }
          if (remotePhone && remotePhone === instancePhone) {
            console.log(
              "[uazapi-webhook] external_outbound: skip self_echo (same phone)",
            );
            return new Response(
              JSON.stringify({ ok: true, skipped: "self_echo_no_target" }),
              {
                headers: { ...corsHeaders, "Content-Type": "application/json" },
              },
            );
          }

          // Dedupe 1: external_id idêntico (mensagem já gravada anteriormente por nós)
          if (norm.messageId) {
            const { data: existingMsg } = await supabase
              .from("webchat_messages")
              .select("id")
              .eq("metadata->>external_id", norm.messageId)
              .limit(1)
              .maybeSingle();
            if (existingMsg?.id) {
              console.log(
                "[uazapi-webhook] external_outbound: dedupe_external_id_match",
                norm.messageId,
              );
              return new Response(
                JSON.stringify({ ok: true, skipped: "outbound_echo" }),
                {
                  headers: {
                    ...corsHeaders,
                    "Content-Type": "application/json",
                  },
                },
              );
            }
          }

          // Localiza conversa: por telefone real OU por LID já registrado em metadata.
          const targetPhone = remotePhoneCanonical;
          let convOut: { id: string; status?: string } | null = null;

          if (remotePhoneCanonical) {
            const { data: existingConvOut } = await supabase
              .from("webchat_conversations")
              .select("id, status")
              .eq("organization_id", instance.organization_id)
              .eq("channel", "whatsapp")
              .eq("visitor_phone_normalized", remotePhoneCanonical)
              .order("status", { ascending: true })
              .order("last_message_at", { ascending: false, nullsFirst: false })
              .limit(1)
              .maybeSingle();
            convOut = existingConvOut as any;
          }

          // Fallback: só temos LID — tenta achar conversa que já tenha esse LID guardado.
          if (!convOut?.id && lidId) {
            const { data: convByLid } = await supabase
              .from("webchat_conversations")
              .select("id, status")
              .eq("organization_id", instance.organization_id)
              .eq("channel", "whatsapp")
              .eq("metadata->>wa_lid", lidId)
              .order("last_message_at", { ascending: false, nullsFirst: false })
              .limit(1)
              .maybeSingle();
            convOut = convByLid as any;
          }

          // Dedupe 2 (após localizar conv): mesmo conteúdo outbound nos últimos 60s nesta conv
          if (convOut?.id && norm.content) {
            const since = new Date(Date.now() - 60_000).toISOString();
            const { data: recentSameContent } = await supabase
              .from("webchat_messages")
              .select("id")
              .eq("conversation_id", convOut.id)
              .eq("direction", "outbound")
              .eq("content", norm.content)
              .gte("created_at", since)
              .limit(1)
              .maybeSingle();
            if (recentSameContent?.id) {
              console.log(
                "[uazapi-webhook] external_outbound: dedupe_recent_content_match",
              );
              return new Response(
                JSON.stringify({ ok: true, skipped: "outbound_echo_content" }),
                {
                  headers: {
                    ...corsHeaders,
                    "Content-Type": "application/json",
                  },
                },
              );
            }
          }

          if (convOut?.id && convOut.status === "closed") {
            await supabase
              .from("webchat_conversations")
              .update({
                status: "human_active",
                closed_at: null,
                evolution_instance_id: instance.id,
              })
              .eq("id", convOut.id);
          }

          // Persiste o LID na conversa achada por telefone (pra próximos eventos só com @lid casarem).
          if (convOut?.id && lidId) {
            const { data: convRow } = await supabase
              .from("webchat_conversations")
              .select("metadata")
              .eq("id", convOut.id)
              .maybeSingle();
            const meta = (convRow?.metadata as any) || {};
            if (meta.wa_lid !== lidId) {
              await supabase
                .from("webchat_conversations")
                .update({ metadata: { ...meta, wa_lid: lidId } })
                .eq("id", convOut.id);
            }
          }

          // Sem telefone real e sem match por LID → não criar conversa fantasma.
          if (!convOut?.id && !remotePhoneCanonical) {
            console.log(
              "[uazapi-webhook] external_outbound: skip lid_no_phone",
              { lidId },
            );
            return new Response(
              JSON.stringify({ ok: true, skipped: "lid_no_phone" }),
              {
                headers: { ...corsHeaders, "Content-Type": "application/json" },
              },
            );
          }

          if (!convOut?.id) {
            const { data: newLead, error: newLeadErr } = await supabase
              .from("leads")
              .insert({
                organization_id: instance.organization_id,
                name: norm.pushName || targetPhone,
                phone: targetPhone,
                source: "whatsapp",
              })
              .select("id")
              .single();
            if (newLeadErr) {
              console.error(
                "[uazapi-webhook] external_outbound: lead_insert_error",
                newLeadErr.message,
              );
            }

            const { data: newConv, error: newConvErr } = await supabase
              .from("webchat_conversations")
              .insert({
                organization_id: instance.organization_id,
                channel: "whatsapp",
                visitor_phone: targetPhone,
                visitor_name: norm.pushName || targetPhone,
                status: "human_active",
                evolution_instance_id: instance.id,
                lead_id: newLead?.id || null,
                last_message_at: new Date().toISOString(),
                metadata: lidId ? { wa_lid: lidId } : {},
              })
              .select("id")
              .single();
            if (newConvErr && (newConvErr as any).code === "23505") {
              const { data: race } = await supabase
                .from("webchat_conversations")
                .select("id")
                .eq("organization_id", instance.organization_id)
                .eq("channel", "whatsapp")
                .eq("visitor_phone_normalized", remotePhoneCanonical)
                .neq("status", "closed")
                .limit(1)
                .maybeSingle();
              convOut = race as any;
              console.log(
                "[uazapi-webhook] external_outbound: conv_race_resolved",
                convOut?.id,
              );
            } else if (newConvErr) {
              console.error(
                "[uazapi-webhook] external_outbound: conv_insert_error",
                newConvErr.message,
              );
            } else {
              convOut = newConv as any;
              console.log(
                "[uazapi-webhook] external_outbound: conv_created",
                convOut?.id,
              );
            }
          } else {
            console.log(
              "[uazapi-webhook] external_outbound: conv_found",
              convOut.id,
            );
          }

          if (convOut?.id) {
            const mediaInfo = norm.media
              ? {
                media_url: norm.media.url || null,
                media_type: norm.media.type || null,
              }
              : null;
            const { data: insertedAgentMsg, error: insertErr } = await supabase
              .from("webchat_messages")
              .insert({
                conversation_id: convOut.id,
                sender_type: "agent",
                direction: "outbound",
                content: norm.content || (norm.media ? "[mídia]" : ""),
                content_type: norm.media?.type === "image"
                  ? "image"
                  : norm.media?.type === "audio"
                  ? "audio"
                  : norm.media
                  ? "file"
                  : "text",
                metadata: {
                  external_id: norm.messageId,
                  source: "external_device",
                  from_device: true,
                  ...(mediaInfo || {}),
                },
              })
              .select("*")
              .single();

            if (insertErr) {
              console.error(
                "[uazapi-webhook] external_outbound: insert_error",
                insertErr.message,
                JSON.stringify(insertErr),
              );
              return new Response(
                JSON.stringify({ ok: false, error: insertErr.message }),
                {
                  status: 500,
                  headers: {
                    ...corsHeaders,
                    "Content-Type": "application/json",
                  },
                },
              );
            }

            console.log(
              "[uazapi-webhook] external_outbound: insert_ok",
              JSON.stringify({
                message_id: insertedAgentMsg?.id,
                conversation_id: convOut.id,
              }),
            );

            await supabase
              .from("webchat_conversations")
              .update({ last_message_at: new Date().toISOString() })
              .eq("id", convOut.id);

            // Broadcast realtime → painel atualiza na hora
            if (insertedAgentMsg) {
              try {
                const ch = supabase.channel(`conversation:${convOut.id}`);
                await ch.send({
                  type: "broadcast",
                  event: "new_message",
                  payload: insertedAgentMsg,
                });
                await supabase.removeChannel(ch);
              } catch (e) {
                console.error(
                  "[uazapi-webhook] broadcast (agent) non-fatal:",
                  e,
                );
              }
            }
          }

          return new Response(
            JSON.stringify({ ok: true, stored: "external_outbound" }),
            {
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            },
          );
        } catch (e: any) {
          console.error(
            "[uazapi-webhook] external_outbound: exception",
            e?.message || String(e),
            e?.stack || "",
          );
          return new Response(
            JSON.stringify({
              ok: false,
              error: e?.message || "external_outbound exception",
            }),
            {
              status: 500,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            },
          );
        }
      }

      const phone = remotePhone;
      const phoneCandidates = remotePhoneCandidates;
      const phoneCanonical = remotePhoneCanonical;
      if (!phone) {
        console.log(
          "[uazapi-webhook] skipped: no_phone (LID-only inbound), remoteJid was:",
          remoteJid,
          "lid:",
          lidId,
        );
        return new Response(JSON.stringify({ ok: true, skipped: "no_phone" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const senderName = norm.pushName || phone;
      console.log(
        "[uazapi-webhook] processing message from phone:",
        phone,
        "name:",
        senderName,
      );

      // Find or create conversation for this phone + org.
      // Estratégia tolerante a troca de instância:
      //   1) Tenta achar conversa aberta com a MESMA instância.
      //   2) Se não achar, busca qualquer conversa aberta do mesmo (org, telefone, whatsapp)
      //      sem filtrar instância — assim PRESERVAMOS o histórico do contato mesmo
      //      quando o número é reconectado/migrado para outra instância.
      // NÃO fechamos conversas duplicadas automaticamente: o histórico do atendente
      // nunca pode sumir por trás dele. Se houver duplicatas, o atendente encerra
      // manualmente quando quiser.
      let conversationId: string | null = null;
      let existing: { id: string } | null = null;

      // Busca por telefone NORMALIZADO (canonical BR), tolerante a 55/+55/9 móvel.
      // Aceita também conversa FECHADA do mesmo número e reabre — assim nunca duplicamos.
      const { data: existingByPhone } = await supabase
        .from("webchat_conversations")
        .select(
          "id, status, lead_id, current_flow_id, flow_completed, product_id",
        )
        .eq("organization_id", instance.organization_id)
        .eq("channel", "whatsapp")
        .eq("visitor_phone_normalized", phoneCanonical)
        .order("evolution_instance_id", { ascending: false, nullsFirst: false })
        .order("product_id", { ascending: false, nullsFirst: false })
        .order("status", { ascending: true }) // 'closed' fica por último
        .order("last_message_at", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (existingByPhone?.id) {
        existing = { id: existingByPhone.id };
        if ((existingByPhone as any).status === "closed") {
          // Check if there is an active funnel for this channel to restart it
          let funnelToRunReopen:
            | { id: string; start_block_id: string | null }
            | null = null;
          try {
            const { data: candidates } = await supabase
              .from("capture_funnels")
              .select("id, start_block_id, channels, allow_reentry")
              .eq("organization_id", instance.organization_id)
              .eq("status", "active");

            const normMsgReopen = normalizeForMatch(norm.content || "");
            for (const cand of candidates || []) {
              const wa = (cand as any).channels?.whatsapp;
              if (!wa?.enabled) continue;
              const boundInstance = wa.evolution_instance_id;
              if (boundInstance && boundInstance !== instance.id) continue;

              // Detect ad-trigger keyword match for this candidate
              const kw = wa.trigger_keywords || wa.keywords || "";
              const kwList = typeof kw === "string"
                ? kw.split(",").map((k: string) => normalizeForMatch(k)).filter((k: string) => k.length > 0)
                : (Array.isArray(kw) ? kw.map((k: any) => normalizeForMatch(String(k))) : []);
              const isKeywordMatchReopen = kwList.length > 0 &&
                kwList.some((k: string) => normMsgReopen === k || normMsgReopen.includes(k));

              // NEW: check if lead already completed this funnel
              const leadId = (existingByPhone as any).lead_id;
              if (leadId && !(cand as any).allow_reentry) {
                const { data: leadRow } = await supabase
                  .from("leads")
                  .select("funnels_completed")
                  .eq("id", leadId)
                  .maybeSingle();

                const { data: history } = await supabase
                  .from("lead_funnel_history")
                  .select("id")
                  .eq("lead_id", leadId)
                  .eq("funnel_id", cand.id)
                  .eq("status", "completed")
                  .limit(1)
                  .maybeSingle();

                const isAlreadyCompletedOnLead = Array.isArray(leadRow?.funnels_completed) && 
                  leadRow.funnels_completed.includes(cand.id);

                if (history || isAlreadyCompletedOnLead) {
                  if (!isKeywordMatchReopen) {
                    console.log(
                      `[uazapi-webhook] funnel_blocked_already_completed: funnel ${cand.id} already completed by lead ${leadId} (reopen)`,
                    );
                    continue;
                  }
                  console.log(
                    `[AD_TRIGGER_REENTRY_ALLOWED] funnel=${cand.id} lead=${leadId} conv=${existingByPhone.id} ctx=reopen`,
                  );
                }
              }


              funnelToRunReopen = {
                id: cand.id,
                start_block_id: (cand as any).start_block_id || null,
              };
              break;
            }

          } catch (e: any) {
            console.warn(
              "[uazapi-webhook] funnel lookup error (reopen):",
              e?.message || String(e),
            );
          }

          const updatePayload: any = {
            status: "human_active",
            closed_at: null,
            evolution_instance_id: instance.id,
          };

          if (funnelToRunReopen && funnelToRunReopen.start_block_id) {
            updatePayload.status = "bot_active";
            updatePayload.current_flow_id = funnelToRunReopen.id;
            updatePayload.current_block_id = funnelToRunReopen.start_block_id;
            updatePayload.flow_variables = {};
            updatePayload.flow_completed = false;
            updatePayload.flow_source = "funnel";
            updatePayload.current_agent_id = null;
            (payload as any).__is_new_funnel = true;
            console.log(
              "[uazapi-webhook] reopened closed conversation matched funnel → starting funnel run",
              funnelToRunReopen.id,
            );
          }

          // Reabre a mesma conversa em vez de criar uma nova: preserva histórico
          await supabase
            .from("webchat_conversations")
            .update(updatePayload)
            .eq("id", existingByPhone.id);
          console.log(
            "[uazapi-webhook] reopened closed conversation for phone:",
            phoneCanonical,
            "status:",
            updatePayload.status,
          );
        }
      }

      // Telemetria: se houver mais de uma conversa aberta, apenas logamos.
      try {
        const { count: openCount } = await supabase
          .from("webchat_conversations")
          .select("id", { count: "exact", head: true })
          .eq("organization_id", instance.organization_id)
          .in("visitor_phone", phoneCandidates)
          .eq("channel", "whatsapp")
          .neq("status", "closed");
        if ((openCount ?? 0) > 1) {
          console.log(
            `[uazapi-webhook] multiple open conversations for phone=${phone} count=${openCount} (NOT auto-closing — preserving history)`,
          );
        }
      } catch (_) { /* non-fatal */ }

      if (existing) {
        conversationId = existing.id;

        // Ensure lead_id is linked if missing (fix for leads not appearing in Central)
        const { data: convData } = await supabase
          .from("webchat_conversations")
          .select("lead_id, status, current_flow_id, current_block_id")
          .eq("id", existing.id)
          .maybeSingle();

        if (convData && !convData.lead_id) {
          console.log(
            "[uazapi-webhook] existing conv missing lead_id → looking up/creating lead",
          );
          let { data: lead } = await supabase
            .from("leads")
            .select("id")
            .eq("organization_id", instance.organization_id)
            .eq("phone_normalized", phoneCanonical)
            .limit(1)
            .maybeSingle();

          if (!lead?.id) {
            // Resolve default stage for this product
            let defaultStageId: string | null = null;
            const pid = convData?.product_id;
            if (pid) {
              const { data: stages } = await supabase
                .from("pipeline_stages")
                .select("id")
                .eq("product_id", pid)
                .order("order_index", { ascending: true })
                .limit(1);
              defaultStageId = stages?.[0]?.id || null;
            }

            const { data: createdLead } = await supabase
              .from("leads")
              .insert({
                organization_id: instance.organization_id,
                name: senderName || phoneCanonical,
                phone: phoneCanonical,
                source: "whatsapp",
                lead_origin: "whatsapp",
                product_id: pid,
                current_stage_id: defaultStageId,
                last_contact_at: new Date().toISOString(),
              })
              .select("id")
              .single();
            lead = createdLead;
          }

          if (lead?.id) {
            await supabase
              .from("webchat_conversations")
              .update({ lead_id: lead.id, connection_id: instance.id })
              .eq("id", existing.id);
            
            await supabase
              .from("leads")
              .update({ connection_id: instance.id })
              .eq("id", lead.id);

            console.log(
              "[uazapi-webhook] linked missing lead_id to existing conv:",
              lead.id,
            );
          }
        }

        // ---- FUNNEL TRIGGER FOR EXISTING CONVERSATION ----
        // If the conversation is waiting human, or bot active without block,
        // or if the message matches a trigger keyword, (re)trigger the funnel.
        const normMsg = normalizeForMatch(norm.content || "");
        let funnelToRunExisting:
          | { id: string; start_block_id: string | null }
          | null = null;

        try {
          const { data: funnels } = await supabase
            .from("capture_funnels")
            .select("id, start_block_id, channels, allow_reentry")
            .eq("organization_id", instance.organization_id)
            .eq("status", "active");

          for (const cand of funnels || []) {
            const wa = (cand as any).channels?.whatsapp;
            if (!wa?.enabled) continue;
            const boundInstance = wa.evolution_instance_id;
            if (boundInstance && boundInstance !== instance.id) continue;

            const keywords = wa.trigger_keywords || wa.keywords || "";
            const keywordList = typeof keywords === "string"
              ? keywords.split(",").map((k) => normalizeForMatch(k)).filter(
                (k) => k.length > 0,
              )
              : (Array.isArray(keywords)
                ? keywords.map((k) => normalizeForMatch(String(k)))
                : []);

            const isKeywordMatch = keywordList.length > 0 &&
              keywordList.some((k) => normMsg === k || normMsg.includes(k));

            // Re-trigger conditions:
            // 1) Keyword match (highest priority, even if human_active)
            // 2) Stuck/Waiting (only if no other funnel is active)
            const isStuckOrWaiting = !convData?.flow_completed &&
              (convData?.status === "waiting_human" ||
                (convData?.status === "bot_active" &&
                  !convData?.current_block_id));

            if (
              isKeywordMatch || (isStuckOrWaiting && keywordList.length === 0)
            ) {
              // Check if already completed
              if (convData?.lead_id && !(cand as any).allow_reentry) {
                const { data: leadRow } = await supabase
                  .from("leads")
                  .select("funnels_completed")
                  .eq("id", convData.lead_id)
                  .maybeSingle();

                const { data: history } = await supabase
                  .from("lead_funnel_history")
                  .select("id")
                  .eq("lead_id", convData.lead_id)
                  .eq("funnel_id", cand.id)
                  .in("status", ["completed", "stopped"])
                  .limit(1)
                  .maybeSingle();

                const isAlreadyCompletedOnLead = Array.isArray(leadRow?.funnels_completed) && 
                  leadRow.funnels_completed.includes(cand.id);

                if (history || isAlreadyCompletedOnLead) {
                  if (!isKeywordMatch) {
                    console.log(
                      `[uazapi-webhook] funnel_blocked_already_completed: funnel ${cand.id} already completed/stopped by lead ${convData.lead_id} (existing)`,
                    );
                    continue;
                  }
                  console.log(
                    `[AD_TRIGGER_REENTRY_ALLOWED] funnel=${cand.id} lead=${convData.lead_id} conv=${existing.id} ctx=existing`,
                  );
                }

              }

              funnelToRunExisting = {
                id: cand.id,
                start_block_id: (cand as any).start_block_id || null,
              };
              break;
            }
          }

          if (funnelToRunExisting && funnelToRunExisting.start_block_id) {
            (payload as any).__is_new_funnel = true;
            (payload as any).__trigger_message_id = norm.messageId;
            const updateData: any = {
              status: "bot_active",
              current_flow_id: funnelToRunExisting.id,
              current_block_id: funnelToRunExisting.start_block_id,
              flow_variables: {},
              flow_completed: false,
              flow_source: "funnel",
              current_agent_id: null,
              bot_locked_until: null,
            };
            await supabase
              .from("webchat_conversations")
              .update(updateData)
              .eq("id", existing.id);

            // Registrar início no histórico
            if (convData?.lead_id) {
              try {
                await supabase.from("lead_funnel_history").insert({
                  lead_id: convData.lead_id,
                  funnel_id: funnelToRunExisting.id,
                  status: 'running',
                  started_at: new Date().toISOString()
                });
              } catch (_) { /* noop */ }
            }

            console.log(
              "[uazapi-webhook] (re)triggered funnel for existing conversation:",
              funnelToRunExisting.id,
            );

          }
        } catch (e) {
          console.warn(
            "[uazapi-webhook] error checking for funnel re-trigger:",
            e,
          );
        }

        // Read current_agent_id + agent_type + orchestrator state to decide whether
        // we can/should reassign an instance-bound agent here.
        const { data: currentConv } = await supabase
          .from("webchat_conversations")
          .select(
            "current_agent_id, orchestrator_state, product_agents:current_agent_id(agent_type, is_active)",
          )
          .eq("id", existing.id)
          .maybeSingle();

        const currentAgentInfo = (currentConv as any)?.product_agents;
        const isManualAdminOverride =
          currentAgentInfo?.agent_type === "admin" &&
          currentAgentInfo?.is_active === true;

        // Check if the org uses an Orchestrator. When enabled, the Orchestrator owns
        // the routing and we MUST NOT pre-assign instance-bound agents while the
        // conversation is still in triage / quick-menu states. Otherwise the lead
        // would be answered by an SDR before going through the welcome flow.
        const { data: orchCfg } = await supabase
          .from("organization_orchestrator_config")
          .select("is_enabled, orchestrator_agent_id")
          .eq("organization_id", instance.organization_id)
          .maybeSingle();
        const orchActive =
          !!(orchCfg?.is_enabled && orchCfg?.orchestrator_agent_id);
        const convState = (currentConv as any)?.orchestrator_state || null;

        // Auto-reset for stale conversations: if the orchestrator is active and
        // the lead has been silent for a long time, force the conversation back
        // into triage so the welcome flow runs again. This makes "returning leads"
        // pass through the orchestrator on every reactivation, as required.
        let stateAfterReset = convState;
        let didResetForStale = false;
        if (orchActive && !isManualAdminOverride) {
          try {
            const { data: lastOutboundEW } = await supabase
              .from("webchat_messages")
              .select("created_at")
              .eq("conversation_id", existing.id)
              .eq("direction", "outbound")
              .order("created_at", { ascending: false })
              .limit(1)
              .maybeSingle();
            const SIX_HOURS_MS = 6 * 60 * 60 * 1000;
            const lastT = (lastOutboundEW as any)?.created_at
              ? new Date((lastOutboundEW as any).created_at).getTime()
              : 0;
            if (lastT > 0 && Date.now() - lastT > SIX_HOURS_MS) {
              didResetForStale = true;
              stateAfterReset = null;
              console.log(
                "[uazapi-webhook] existing conv: silence>6h → resetting orchestrator",
              );
            }
          } catch (_) { /* non-fatal */ }
        }

        const inTriageStates = orchActive &&
          (stateAfterReset === null || stateAfterReset === "triagem" ||
            stateAfterReset === "aguardando_menu");

        const updatePayload: any = {
          connection_id: instance.id,
          evolution_instance_id: instance.id,
          last_message_at: new Date().toISOString(),
        };


        if (didResetForStale) {
          updatePayload.orchestrator_state = null;
          updatePayload.orchestrator_context = null;
          updatePayload.orchestrator_question_count = 0;
          updatePayload.current_agent_id = null;
        }

        if (isManualAdminOverride) {
          console.log(
            "[uazapi-webhook] preserving admin agent override:",
            (currentConv as any)?.current_agent_id,
          );
        } else if (inTriageStates) {
          // Orchestrator is in charge — leave current_agent_id untouched (likely null)
          // so the orchestrator can route fresh based on the lead's message.
          console.log(
            "[uazapi-webhook] existing conv in triage → letting orchestrator route",
          );
        } else {
          // No orchestrator (or already in active attendance with a specialist):
          // safe to bind the conversation to the instance-bound agent if we have one.
          const { data: instanceBoundAgent } = await supabase
            .from("product_agents")
            .select("id")
            .eq("evolution_instance_id", instance.id)
            .eq("is_active", true)
            .order("is_default", { ascending: false })
            .limit(1)
            .maybeSingle();
          if (instanceBoundAgent?.id) {
            updatePayload.current_agent_id = instanceBoundAgent.id;
            console.log(
              "[uazapi-webhook] existing conv → reassigning to bound agent:",
              instanceBoundAgent.id,
            );
          }
        }
        await supabase
          .from("webchat_conversations")
          .update(updatePayload)
          .eq("id", existing.id);

          // PERSIST TRACKING FOR EXISTING CONVERSATION
          // Every inbound message must create a lead_tracking record.
          const currentLeadId = (existing as any).lead_id || (convData as any)?.lead_id;
          if (currentLeadId) {
            const { isCtwa, ctwaData, rawContext } = extractCTWA(payload);
            const referral = extractReferral(payload);

            const resolvedCtwaClid = ctwaData.ctwa_clid || referral?.ctwa_clid || null;
            const detectedSource = isCtwa ? "facebook_ads_whatsapp" : (resolvedCtwaClid ? "facebook_ads_whatsapp" : (referral ? "facebook_ads_referral" : "whatsapp_organic"));

            const tracking = {
              lead_id: currentLeadId,
              phone: phoneCanonical,
              organization_id: instance.organization_id,
              fbclid: (referral?.fbclid) || null,
              ctwa_clid: resolvedCtwaClid,
              campaign_id: (referral?.campaign_id) || null,
              campaign_name: (referral?.campaign_name) || null,
              adset_id: (referral?.adset_id) || null,
              adset_name: (referral?.adset_name) || null,
              ad_id: (referral?.ad_id) || null,
              ad_name: (referral?.ad_name) || (ctwaData.ad_headline) || null,
              source: detectedSource,
              utm_source: (referral?.source) || (ctwaData.ad_source_app) || null,
              utm_medium: (referral?.medium) || null,
              utm_campaign: (referral?.campaign) || null,
              utm_term: (referral?.term) || null,
              utm_content: (referral?.content) || null,
              referral_ctwa_clid: resolvedCtwaClid,
              raw_payload: payload || {},
              raw_ctwa_payload: rawContext || null,
              ...ctwaData,
            };

            const leadUpdate: any = {
              connection_id: instance.id,
              source: detectedSource,
              ctwa_detected: isCtwa ? true : undefined,
            };
            if (tracking.fbclid) leadUpdate.fbclid = tracking.fbclid;
            if (tracking.ctwa_clid) leadUpdate.ctwa_clid = tracking.ctwa_clid;
            if (tracking.campaign_id) leadUpdate.campaign_id = tracking.campaign_id;
            if (tracking.campaign_name) leadUpdate.campaign_name = tracking.campaign_name;
            if (tracking.adset_id) leadUpdate.adset_id = tracking.adset_id;
            if (tracking.ad_id) leadUpdate.ad_id = tracking.ad_id;
            if (tracking.ad_name) leadUpdate.ad_name = tracking.ad_name;

            if (isCtwa) {
              if (ctwaData.ad_headline) leadUpdate.ad_headline = ctwaData.ad_headline;
              if (ctwaData.ad_body) leadUpdate.ad_body = ctwaData.ad_body;
              if (ctwaData.ad_source_app) leadUpdate.ad_source_app = ctwaData.ad_source_app;
              if (ctwaData.ad_source_url) leadUpdate.ad_source_url = ctwaData.ad_source_url;
              if (ctwaData.entry_point_conversion_source) leadUpdate.entry_point_conversion_source = ctwaData.entry_point_conversion_source;

              console.log("[uazapi-webhook] ctwa_detected", {
                phone: phoneCanonical,
                lead_id: currentLeadId,
                ctwa_clid: tracking.ctwa_clid,
                ad_source_id: ctwaData.ad_source_id,
                ad_source_type: ctwaData.ad_source_type,
                source_app: ctwaData.ad_source_app,
                headline: ctwaData.ad_headline,
              });

              // Snapshot CTWA on the conversation itself
              const { error: convCtwaErr } = await supabase
                .from("webchat_conversations")
                .update({ ctwa_data: { ...ctwaData, ctwa_clid: tracking.ctwa_clid, detected_at: new Date().toISOString() } })
                .eq("id", existing.id);
              if (convCtwaErr) console.error("[uazapi-webhook] ctwa_conv_snapshot_failed:", convCtwaErr);
            }

            const { error: trackErr } = await supabase.from("lead_tracking").insert(tracking);
            if (trackErr) {
              console.error("[uazapi-webhook] attribution_tracking_insert_failed:", trackErr, { lead_id: currentLeadId, ctwa_clid: tracking.ctwa_clid });
            } else {
              console.log("[uazapi-webhook] lead_tracking_inserted (existing conv)", { lead_id: currentLeadId, isCtwa, ctwa_clid: tracking.ctwa_clid });
            }

            const { data: currentLead, error: leadFetchErr } = await supabase.from("leads").select("source").eq("id", currentLeadId).single();
            if (leadFetchErr) console.error("[uazapi-webhook] lead_fetch_failed:", leadFetchErr);
            const { error: leadUpdErr } = await supabase.from("leads").update(leadUpdate).eq("id", currentLeadId);
            if (leadUpdErr) {
              console.error("[uazapi-webhook] attribution_lead_update_failed:", leadUpdErr, { lead_id: currentLeadId });
            } else if (isCtwa && currentLead?.source !== detectedSource) {
              console.log("[uazapi-webhook] ctwa_lead_updated", {
                lead_id: currentLeadId,
                previous_source: currentLead?.source,
                new_source: detectedSource,
              });
            }
          }


      } else {
        const { data: widget } = await supabase
          .from("webchat_widgets")
          .select("id, product_id")
          .eq("organization_id", instance.organization_id)
          .eq("is_active", true)
          .limit(1)
          .maybeSingle();

        // Lookup do lead pelo telefone NORMALIZADO (anti-duplicação por DDI/9 móvel)
        let { data: lead } = await supabase
          .from("leads")
          .select("id, name, funnels_completed")
          .eq("organization_id", instance.organization_id)
          .eq("phone_normalized", phoneCanonical)
          .limit(1)
          .maybeSingle();

        // Auto-create lead if none exists for this contact (no manual linking).
        if (!lead?.id) {
          try {
            // Resolve default stage for this product
            let defaultStageId: string | null = null;
            const pid = (widget as any)?.product_id;
            if (pid) {
              const { data: stages } = await supabase
                .from("pipeline_stages")
                .select("id")
                .eq("product_id", pid)
                .order("order_index", { ascending: true })
                .limit(1);
              defaultStageId = stages?.[0]?.id || null;
            }

            const { data: createdLead, error: createLeadErr } = await supabase
              .from("leads")
              .insert({
                organization_id: instance.organization_id,
                name: senderName || phoneCanonical,
                phone: phoneCanonical,
                source: "whatsapp",
                lead_origin: "whatsapp",
                product_id: pid,
                current_stage_id: defaultStageId,
                last_contact_at: new Date().toISOString(),
              })
              .select("id, name")
              .single();
            if (createLeadErr) {
              // 23505 → outro fluxo criou simultaneamente; recupera o existente
              if ((createLeadErr as any).code === "23505") {
                const { data: race } = await supabase
                  .from("leads")
                  .select("id, name")
                  .eq("organization_id", instance.organization_id)
                  .eq("phone_normalized", phoneCanonical)
                  .limit(1)
                  .maybeSingle();
                lead = race as any;
                console.log("[INBOUND_LEAD_CREATED_OR_UPDATED] FOUND (RACE)", { lead_id: lead?.id });
              } else {
                console.error(
                  "[uazapi-webhook] auto-create lead failed (non-fatal):",
                  createLeadErr,
                );
              }
            } else {
              lead = createdLead;
              console.log("[INBOUND_LEAD_CREATED_OR_UPDATED] CREATED", { lead_id: lead?.id });
            }

            // Always try to update/persist tracking if a lead exists (new or returning)
            if (lead?.id) {
              const referral = (norm as any).referral;

              // Unified CTWA extraction (raw payload always wins over normalized,
              // since UazAPI keeps CTWA fields at message.content.contextInfo).
              const { isCtwa, ctwaData, rawContext } = extractCTWA(payload);
              const resolvedCtwaClid = ctwaData.ctwa_clid || referral?.ctwa_clid || null;
              const detectedSource = isCtwa ? "facebook_ads_whatsapp" : (resolvedCtwaClid ? "facebook_ads_whatsapp" : (referral ? "facebook_ads_referral" : "whatsapp_organic"));

              const tracking = {
                lead_id: lead.id,
                phone: phoneCanonical,
                organization_id: instance.organization_id,
                fbclid: (referral?.fbclid) || null,
                ctwa_clid: resolvedCtwaClid,
                campaign_id: (referral?.campaign_id) || null,
                campaign_name: (referral?.campaign_name) || null,
                adset_id: (referral?.adset_id) || null,
                adset_name: (referral?.adset_name) || null,
                ad_id: (referral?.ad_id) || null,
                ad_name: (referral?.ad_name) || (ctwaData.ad_headline) || null,
                source: detectedSource,
                utm_source: (referral?.source) || (ctwaData.ad_source_app) || null,
                utm_medium: (referral?.medium) || null,
                utm_campaign: (referral?.campaign) || null,
                utm_term: (referral?.term) || null,
                utm_content: (referral?.content) || null,
                referral_ctwa_clid: resolvedCtwaClid,
                raw_payload: payload || {},
                raw_ctwa_payload: rawContext || null,
                ...ctwaData,
              };

              const leadUpdate: any = {
                connection_id: instance.id,
              };

              if (isCtwa || lead.source === "whatsapp_organic" || !lead.source) {
                leadUpdate.source = detectedSource;
              }

              if (tracking.fbclid) leadUpdate.fbclid = tracking.fbclid;
              if (tracking.ctwa_clid) leadUpdate.ctwa_clid = tracking.ctwa_clid;
              if (tracking.campaign_id) leadUpdate.campaign_id = tracking.campaign_id;
              if (tracking.campaign_name && !lead.campaign_name) leadUpdate.campaign_name = tracking.campaign_name;
              if (tracking.adset_id) leadUpdate.adset_id = tracking.adset_id;
              if (tracking.adset_name && !lead.adset_name) leadUpdate.adset_name = tracking.adset_name;
              if (tracking.ad_id) leadUpdate.ad_id = tracking.ad_id;
              if (tracking.ad_name && !lead.ad_name) leadUpdate.ad_name = tracking.ad_name;

              if (isCtwa) {
                if (ctwaData.ad_headline) leadUpdate.ad_headline = ctwaData.ad_headline;
                if (ctwaData.ad_body) leadUpdate.ad_body = ctwaData.ad_body;
                if (ctwaData.ad_source_app) leadUpdate.ad_source_app = ctwaData.ad_source_app;
                if (ctwaData.ad_source_url) leadUpdate.ad_source_url = ctwaData.ad_source_url;
                if (ctwaData.entry_point_conversion_source) leadUpdate.entry_point_conversion_source = ctwaData.entry_point_conversion_source;
                leadUpdate.ctwa_detected = true;

                console.log("[uazapi-webhook] ctwa_detected (new lead)", {
                  phone: phoneCanonical,
                  lead_id: lead.id,
                  ctwa_clid: tracking.ctwa_clid,
                  ad_source_id: ctwaData.ad_source_id,
                  ad_source_type: ctwaData.ad_source_type,
                  source_app: ctwaData.ad_source_app,
                  headline: ctwaData.ad_headline,
                });
              }

              const { error: trackErr } = await supabase.from("lead_tracking").insert(tracking);
              if (trackErr) {
                console.error("[uazapi-webhook] attribution_tracking_insert_failed (new lead path):", trackErr, { lead_id: lead.id, ctwa_clid: tracking.ctwa_clid });
              } else {
                console.log("[uazapi-webhook] lead_tracking_inserted (new lead)", { lead_id: lead.id, isCtwa, ctwa_clid: tracking.ctwa_clid });
              }

              const { error: leadUpdErr } = await supabase.from("leads").update(leadUpdate).eq("id", lead.id);
              if (leadUpdErr) {
                console.error("[uazapi-webhook] attribution_lead_update_failed (new lead path):", leadUpdErr, { lead_id: lead.id });
              }

              // Stash so the new-conversation insert below can persist ctwa_data on the conv row
              (lead as any).__ctwa_snapshot = isCtwa ? { ...ctwaData, ctwa_clid: tracking.ctwa_clid, detected_at: new Date().toISOString() } : null;
            }


          } catch (e) {
            console.error(
              "[uazapi-webhook] auto-create lead error (non-fatal):",
              e,
            );
          }
        }

        // Decide initial status: if product has an active AI agent, start in bot_active
        let initialStatus = "human_active";
        let initialAgentId: string | null = null;
        let productResolvedId: string | null = (widget as any)?.product_id ??
          null;

        // PRIORITY 1 (ALWAYS): agent explicitly bound to THIS UazAPI instance.
        // A dedicated WhatsApp number means the customer is talking to a SPECIFIC
        // product/agent — the orchestrator must NEVER override this, otherwise a
        // number dedicated to "Product A" could end up being answered by an agent
        // from "Product B", which is exactly the bug we just fixed.
        const { data: instanceBoundAgent } = await supabase
          .from("product_agents")
          .select("id, product_id")
          .eq("evolution_instance_id", instance.id)
          .eq("is_active", true)
          .order("is_default", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (instanceBoundAgent?.id) {
          initialStatus = "bot_active";
          initialAgentId = instanceBoundAgent.id;
          if (instanceBoundAgent.product_id) {
            productResolvedId = instanceBoundAgent.product_id;
          }
          console.log(
            "[uazapi-webhook] new conv → instance-bound agent (lock):",
            initialAgentId,
            "product:",
            productResolvedId,
          );
        } else {
          // No agent dedicated to this WhatsApp number → fall back to orchestrator
          // (when enabled) or to product default agent (legacy).
          const { data: orchCfgNew } = await supabase
            .from("organization_orchestrator_config")
            .select("is_enabled, orchestrator_agent_id")
            .eq("organization_id", instance.organization_id)
            .maybeSingle();
          const orchActiveNew =
            !!(orchCfgNew?.is_enabled && orchCfgNew?.orchestrator_agent_id);

          if (orchActiveNew) {
            initialStatus = "bot_active";
            initialAgentId = null;
            if (!productResolvedId) {
              const { data: anyProd } = await supabase
                .from("products")
                .select("id")
                .eq("organization_id", instance.organization_id)
                .eq("is_active", true)
                .order("created_at", { ascending: true })
                .limit(1)
                .maybeSingle();
              productResolvedId = anyProd?.id || null;
            }
            console.log(
              "[uazapi-webhook] new conv → no instance lock; orchestrator will triage",
            );
          } else if (productResolvedId) {
            // Priority 2: default agent of the widget's product (legacy behavior)
            const { data: defAgent } = await supabase
              .from("product_agents")
              .select("id")
              .eq("product_id", productResolvedId)
              .eq("is_default", true)
              .eq("is_active", true)
              .maybeSingle();
            let agent = defAgent;
            if (!agent) {
              const { data: anyAgent } = await supabase
                .from("product_agents")
                .select("id")
                .eq("product_id", productResolvedId)
                .eq("is_active", true)
                .order("created_at", { ascending: true })
                .limit(1)
                .maybeSingle();
              agent = anyAgent;
            }
            if (agent?.id) {
              initialStatus = "bot_active";
              initialAgentId = agent.id;
            }
          }

          // Priority 3 (FINAL FALLBACK): no instance-lock, no orchestrator, no
          // widget product_id resolved. Pick ANY active agent of the org with a
          // product_id so the bot can at least respond instead of going silent.
          // Without this, conversations end up with status=bot_active but
          // agent_id=null/product_id=null and webchat-bot just skips ("no product_id").
          if (!initialAgentId) {
            const { data: orgFallbackAgent } = await supabase
              .from("product_agents")
              .select("id, product_id")
              .eq("organization_id", instance.organization_id)
              .eq("is_active", true)
              .not("product_id", "is", null)
              .order("is_default", { ascending: false })
              .order("created_at", { ascending: true })
              .limit(1)
              .maybeSingle();
            if (orgFallbackAgent?.id) {
              initialStatus = "bot_active";
              initialAgentId = orgFallbackAgent.id;
              productResolvedId = orgFallbackAgent.product_id;
              console.log(
                "[uazapi-webhook] new conv → org-wide fallback agent:",
                initialAgentId,
                "product:",
                productResolvedId,
              );
            }
          }
        }

        // ---- FUNNEL TRIGGER (WhatsApp channel) ----
        // Look for an active capture_funnel that has the WhatsApp channel enabled
        // and matches this evolution instance (or any instance) and trigger rules.
        let funnelToRun: { id: string; start_block_id: string | null } | null =
          null;
        try {
          const { data: candidates } = await supabase
            .from("capture_funnels")
            .select("id, start_block_id, channels, allow_reentry")
            .eq("organization_id", instance.organization_id)
            .eq("status", "active");

          const normMsg = normalizeForMatch(norm.content || "");
          for (const cand of candidates || []) {
            const wa = (cand as any).channels?.whatsapp;
            if (!wa?.enabled) continue;
            const boundInstance = wa.evolution_instance_id;
            if (boundInstance && boundInstance !== instance.id) continue;

            const keywords = wa.trigger_keywords || wa.keywords || "";
            const keywordList = typeof keywords === "string"
              ? keywords.split(",").map((k) => normalizeForMatch(k)).filter(
                (k) => k.length > 0,
              )
              : (Array.isArray(keywords)
                ? keywords.map((k) => normalizeForMatch(String(k)))
                : []);

            const isMatch = keywordList.length > 0
              ? keywordList.some((k) => normMsg === k || normMsg.includes(k))
              : true; // Catch-all trigger if no keywords

            if (!isMatch) continue;

            // NEW: check if lead already completed this funnel
            if (lead?.id && !(cand as any).allow_reentry) {
              const { data: history } = await supabase
                .from("lead_funnel_history")
                .select("id")
                .eq("lead_id", lead.id)
                .eq("funnel_id", cand.id)
                .eq("status", "completed")
                .limit(1)
                .maybeSingle();

              // Check if funnel ID is in funnels_completed array on lead
              const isAlreadyCompletedOnLead = Array.isArray(lead.funnels_completed) && 
                lead.funnels_completed.includes(cand.id);

              if ((history || isAlreadyCompletedOnLead) && keywordList.length === 0) {
                console.log(
                  `[uazapi-webhook] funnel_blocked_already_completed: funnel ${cand.id} already completed by lead ${lead.id} (new)`,
                );
                continue;
              }
            }


            funnelToRun = {
              id: cand.id,
              start_block_id: (cand as any).start_block_id || null,
            };
            break;
          }
        } catch (e: any) {
          console.warn(
            "[uazapi-webhook] funnel lookup error:",
            e?.message || String(e),
          );
        }

        // Resolve setor padrão da organização (ou o primeiro ativo)
        let defaultSectorId: string | null = null;
        try {
          const { data: sectors } = await supabase
            .from("sectors")
            .select("id, is_default")
            .eq("organization_id", instance.organization_id)
            .eq("is_active", true)
            .order("is_default", { ascending: false })
            .order("created_at", { ascending: true });

          defaultSectorId = sectors?.[0]?.id || null;
        } catch (_) { /* noop */ }

        const newConv: any = {
          organization_id: instance.organization_id,
          visitor_id: crypto.randomUUID(),
          channel: "whatsapp",
          status: initialStatus,
          visitor_phone: phoneCanonical,
          visitor_name: lead?.name || senderName,
          connection_id: instance.id,
          evolution_instance_id: instance.id,
          last_message_at: new Date().toISOString(),
          // Phase 1: Atribuição Completa
          flow_variables: {
            fbclid: ((norm as any).referral?.fbclid) || null,
            ctwa_clid: ((norm as any).referral?.ctwa_clid) || null,
            campaign_id: ((norm as any).referral?.campaign_id) || null,
            campaign_name: ((norm as any).referral?.campaign_name) || null,
            adset_id: ((norm as any).referral?.adset_id) || null,
            adset_name: ((norm as any).referral?.adset_name) || null,
            ad_id: ((norm as any).referral?.ad_id) || null,
            ad_name: ((norm as any).referral?.ad_name) || null,
            source: ((norm as any).referral?.source) || null,
            medium: ((norm as any).referral?.medium) || null,
            campaign: ((norm as any).referral?.campaign) || null,
            term: ((norm as any).referral?.term) || null,
            content: ((norm as any).referral?.content) || null,
            lead_created_at: new Date().toISOString()
          }
        };

        if (widget?.id) newConv.widget_id = widget.id;
        if (lead?.id) newConv.lead_id = lead.id;
        if (initialAgentId) newConv.current_agent_id = initialAgentId;
        if (defaultSectorId) newConv.sector_id = defaultSectorId;

        // Persist CTWA snapshot captured during lead creation
        const ctwaSnapshot = (lead as any)?.__ctwa_snapshot;
        if (ctwaSnapshot) newConv.ctwa_data = ctwaSnapshot;

        // If a funnel matches, the funnel takes over: bot_active + flow state set
        if (funnelToRun && funnelToRun.start_block_id) {
          newConv.status = "bot_active";

          newConv.current_flow_id = funnelToRun.id;
          newConv.current_block_id = funnelToRun.start_block_id;
          newConv.flow_variables = {};
          newConv.flow_completed = false;
          newConv.flow_source = "funnel";
          // The funnel controls the conversation; agent only takes over via ai_takeover/agent_switch.
          newConv.current_agent_id = null;
          (payload as any).__is_new_funnel = true;
          (payload as any).__trigger_message_id = norm.messageId;
          console.log(
            "[uazapi-webhook] funnel matched → starting funnel run",
            JSON.stringify({
              funnel_id: funnelToRun.id,
              start_block_id: funnelToRun.start_block_id,
            }),
          );
        }

        const { data: created, error: convErr } = await supabase
          .from("webchat_conversations")
          .insert(newConv)
          .select("id")
          .single();

        if (created?.id) {
          conversationId = created.id;
          console.log("[INBOUND_CONVERSATION_CREATED_OR_UPDATED] CREATED", {
            conversation_id: conversationId,
            lead_id: lead?.id,
            connection_id: instance.id
          });
          
          // Registrar início no histórico
          if (lead?.id && funnelToRun) {
            console.log("[INBOUND_FUNNEL_TRIGGERED] SUCCESS", {
              funnel_id: funnelToRun.id,
              lead_id: lead.id
            });
            try {
              await supabase.from("lead_funnel_history").insert({
                lead_id: lead.id,
                funnel_id: funnelToRun.id,
                status: 'running',
                started_at: new Date().toISOString()
              });
            } catch (_) { /* noop */ }
          } else if (lead?.id && !funnelToRun) {
            console.log("[INBOUND_FUNNEL_NOT_TRIGGERED] Reason: No matching funnel found for connection/content");
          }
        }

        if (convErr) {

          if ((convErr as any).code === "23505") {
            // Race com outro fluxo — reusar conversa existente do mesmo telefone
            const { data: race } = await supabase
              .from("webchat_conversations")
              .select("id")
              .eq("organization_id", instance.organization_id)
              .eq("channel", "whatsapp")
              .eq("visitor_phone_normalized", phoneCanonical)
              .neq("status", "closed")
              .order("last_message_at", { ascending: false, nullsFirst: false })
              .limit(1)
              .maybeSingle();
            if (race?.id) {
              conversationId = race.id;
              console.log(
                "[uazapi-webhook] reused conversation after 23505 race:",
                conversationId,
              );
            } else {
              console.error(
                "[uazapi-webhook] conv create error (23505 no race row):",
                convErr,
              );
              return new Response(
                JSON.stringify({ ok: false, error: convErr.message }),
                {
                  status: 500,
                  headers: {
                    ...corsHeaders,
                    "Content-Type": "application/json",
                  },
                },
              );
            }
          } else {
            console.error("[uazapi-webhook] conv create error:", convErr);
            return new Response(
              JSON.stringify({ ok: false, error: convErr.message }),
              {
                status: 500,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
              },
            );
          }
        } else {
          conversationId = created.id;
        }

        console.log(
          "[uazapi-webhook] new conversation created",
          JSON.stringify({
            id: conversationId,
            status: initialStatus,
            agent_id: initialAgentId,
            phone,
          }),
        );

        // Fire-and-forget: enrich with WhatsApp profile picture (best effort, non-blocking).
        // Pulled from UazAPI: GET /chat/findContacts or /chat/fetchProfilePictureUrl.
        try {
          const { data: cfg } = await supabase
            .from("integration_settings")
            .select("settings")
            .eq("organization_id", instance.organization_id)
            .eq("integration_type", "whatsapp_provider")
            .maybeSingle();
          const settings = (cfg as any)?.settings || {};
          let evoUrl = String(settings.evolution_go_url || "").replace(
            /\/$/,
            "",
          );
          let apiKey: string | undefined = instance.instance_token ||
            settings.evolution_go_global_api_key;
          if (!evoUrl || !apiKey) {
            const { data: platformCfg } = await supabase
              .from("platform_settings")
              .select("evolution_go_url, evolution_go_global_api_key")
              .limit(1)
              .maybeSingle();
            evoUrl = evoUrl ||
              String((platformCfg as any)?.evolution_go_url || "").replace(
                /\/$/,
                "",
              );
            apiKey = apiKey ||
              (platformCfg as any)?.evolution_go_global_api_key;
          }
          if (evoUrl && apiKey && instance.name) {
            const picResp = await fetch(
              `${evoUrl}/chat/fetchProfilePictureUrl/${
                encodeURIComponent(instance.name)
              }`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json", apikey: apiKey },
                body: JSON.stringify({ number: phone }),
              },
            );
            if (picResp.ok) {
              const picJson = await picResp.json().catch(() => null);
              const picUrl: string | undefined = picJson?.profilePictureUrl ||
                picJson?.profile_picture_url || picJson?.url;
              if (picUrl && /^https?:\/\//.test(picUrl)) {
                await supabase
                  .from("webchat_conversations")
                  .update({ visitor_avatar_url: picUrl })
                  .eq("id", conversationId);
                console.log(
                  "[uazapi-webhook] saved visitor_avatar_url for",
                  conversationId,
                );
              }
            } else {
              console.log(
                "[uazapi-webhook] profile pic lookup status",
                picResp.status,
              );
            }
          }
        } catch (picErr) {
          console.warn(
            "[uazapi-webhook] profile pic lookup failed (non-fatal):",
            picErr,
          );
        }

        // Safety net: fecha qualquer outra conversa aberta do mesmo telefone normalizado
        const { error: closeErr } = await supabase
          .from("webchat_conversations")
          .update({ status: "closed", closed_at: new Date().toISOString() })
          .eq("organization_id", instance.organization_id)
          .eq("visitor_phone_normalized", phoneCanonical)
          .eq("channel", "whatsapp")
          .neq("status", "closed")
          .neq("id", conversationId);
        if (closeErr) {
          console.warn(
            "[uazapi-webhook] close duplicates warn:",
            closeErr.message,
          );
        }
      }

      // ---- MULTIMODAL ENRICHMENT (audio / image / video / document / sticker) ----
      // For ALL inbound media we attempt to:
      //   1. Decrypt / download the bytes (local HKDF/AES, then UazAPI fallbacks).
      //   2. Upload the decrypted bytes to the public `chat-media` bucket so the
      //      Inbox can render them (the original WhatsApp URL is an encrypted
      //      `.enc` blob and never works as an <img>/<video> src).
      //   3. For audio/image: also call process-media-message (Whisper / Vision)
      //      to enrich the textual content the agent will read.
      //
      // mediaMeta is the canonical payload consumed by `extractMedia()` on the
      // front-end (src/lib/messageMedia.ts) → Inbox renders audio player, image,
      // video player, document chip, sticker.
      // isWhatsappEncryptedUrl was moved to a more global scope for reuse

      const mediaMeta: any = norm.media
        ? {
          kind: norm.media.type,
          mime: norm.media.mime || null,
          // Start with whatever URL the webhook gave us, but null it out if
          // it's a WhatsApp-encrypted URL (which the browser cannot render).
          // Storage upload below will overwrite this with a public URL.
          url: isWhatsappEncryptedUrl(norm.media.url)
            ? null
            : (norm.media.url || null),
          caption: (norm.media as any).caption || null,
          filename: (norm.media as any).rawMessage?.fileName ||
            (norm.media as any).rawMessage?.FileName ||
            null,
          size_bytes: Number(
            (norm.media as any).rawMessage?.fileLength ||
              (norm.media as any).rawMessage?.FileLength ||
              0,
          ) || null,
          duration_ms: norm.media.type === "audio" &&
              (norm.media as any).rawMessage?.seconds
            ? Number((norm.media as any).rawMessage.seconds) * 1000
            : norm.media.type === "video" &&
                (norm.media as any).rawMessage?.seconds
            ? Number((norm.media as any).rawMessage.seconds) * 1000
            : null,
          width: Number(
            (norm.media as any).rawMessage?.width ||
              (norm.media as any).rawMessage?.Width ||
              0,
          ) || null,
          height: Number(
            (norm.media as any).rawMessage?.height ||
              (norm.media as any).rawMessage?.Height ||
              0,
          ) || null,
        }
        : null;

      let processedContent = norm.content;
      let processedKind: "audio" | "image" | null = null;

      if (norm.media) {
        try {
          // 1) Resolve agent (for audio/image AI toggles only).
          const { data: convAgent } = await supabase
            .from("webchat_conversations")
            .select("current_agent_id")
            .eq("id", conversationId)
            .maybeSingle();
          let agentId: string | null = (convAgent as any)?.current_agent_id ||
            null;
          if (!agentId) {
            const { data: ia } = await supabase
              .from("product_agents")
              .select("id")
              .eq("evolution_instance_id", instance.id)
              .eq("is_active", true)
              .order("created_at", { ascending: true })
              .limit(1)
              .maybeSingle();
            agentId = (ia as any)?.id || null;
          }
          let canAudio = true;
          let canImage = true;
          if (agentId) {
            const { data: ag } = await supabase
              .from("product_agents")
              .select("enable_audio_transcription, enable_image_vision")
              .eq("id", agentId)
              .maybeSingle();
            if (ag) {
              canAudio = (ag as any).enable_audio_transcription !== false;
              canImage = (ag as any).enable_image_vision !== false;
            }
          }

          // 2) Download / decrypt bytes (always for any media type).
          let b64 = norm.media.base64;
          let mime = norm.media.mime;
          let mediaUrl =
            norm.media.url && !isWhatsappEncryptedUrl(norm.media.url)
              ? norm.media.url
              : undefined;

          // Resolve UazAPI config (needed for media download)
          const { data: cfg } = await supabase
            .from("integration_settings")
            .select("settings")
            .eq("organization_id", instance.organization_id)
            .eq("integration_type", "whatsapp_provider")
            .maybeSingle();
          const settings = (cfg as any)?.settings || {};
          let resolvedEvoUrl = String(settings.evolution_go_url || "").replace(
            /\/$/,
            "",
          );
          const resolvedApiKeys = [
            instance.instance_token,
            settings.evolution_go_global_api_key,
          ];
          if (!resolvedEvoUrl || resolvedApiKeys.every((k) => !k)) {
            const { data: platformCfg } = await supabase
              .from("platform_settings")
              .select("evolution_go_url, evolution_go_global_api_key")
              .limit(1)
              .maybeSingle();
            resolvedEvoUrl = resolvedEvoUrl ||
              String((platformCfg as any)?.evolution_go_url || "").replace(
                /\/$/,
                "",
              );
            resolvedApiKeys.push(
              (platformCfg as any)?.evolution_go_global_api_key,
            );
          }

          if (!b64) {
            const dl = await downloadMediaBase64(
              resolvedEvoUrl,
              resolvedApiKeys,
              norm.media.rawMessage,
              norm.messageId,
              norm.media.type,
              norm.remoteJid,
              instance.name || norm.instance,
              instance.instance_id,
            );
            if (dl) {
              b64 = dl.base64;
              norm.media.base64 = dl.base64; // Store back so ai_receipt block can use it
              if (dl.mime) mime = dl.mime;
              mediaUrl = undefined;
            }
          }

          // 3) Upload decrypted bytes to Storage so the Inbox can render them.
          if (b64) {
            try {
              const bytes = base64ToUint8(b64);
              const finalMime = mime || mediaMeta?.mime ||
                "application/octet-stream";
              const publicUrl = await uploadInboundMediaToStorage(
                supabase,
                instance.organization_id,
                conversationId,
                norm.messageId,
                bytes,
                finalMime,
                mediaMeta?.filename,
              );
              if (publicUrl && mediaMeta) {
                mediaMeta.url = publicUrl;
                mediaMeta.mime = finalMime;
                if (!mediaMeta.size_bytes) {
                  mediaMeta.size_bytes = bytes.byteLength;
                }
              }
            } catch (upErr: any) {
              console.warn(
                "[uazapi-webhook] media upload pipeline failed:",
                upErr?.message || String(upErr),
              );
            }
          } else if (mediaMeta && isWhatsappEncryptedUrl(norm.media.url)) {
            // No bytes AND original URL is encrypted → frontend cannot render.
            mediaMeta.url = null;
          }

          // 4) AI text enrichment (audio Whisper / image Vision only).
          const fileName = (norm.media as any).rawMessage?.fileName ||
            (norm.media as any).rawMessage?.FileName || "";
          const isPdf = norm.media.type === "document" &&
            (mime === "application/pdf" ||
              fileName.toLowerCase().endsWith(".pdf") ||
              norm.media.caption?.toLowerCase()?.endsWith(".pdf") ||
              norm.media.mime === "application/pdf" ||
              (b64 && b64.startsWith("JVBERi"))); // Magic bytes for PDF (%PDF) in base64

          // AI text enrichment is allowed for images, audio, and documents (PDFs).
          // Per user request, audio MUST be transcribed to be understood by the AI receipt block.
          const aiAllowed = (norm.media.type === "image" && canImage) ||
            (norm.media.type === "audio" && canAudio) ||
            (norm.media.type === "document" && isPdf && canImage); // Treat PDF as image-like vision task if possible


          if (aiAllowed) {
            if (b64 || mediaUrl) {
              const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
              const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
              const text = await processMediaToText(supabaseUrl, serviceKey, {
                kind: norm.media.type as "audio" | "image" | "document",
                base64: b64,
                url: mediaUrl,
                mime,
                organization_id: instance.organization_id,
              });
              if (text) {
                processedKind = norm.media.type as
                  | "audio"
                  | "image"
                  | "document";

                if (norm.media.type === "audio") {
                  processedContent = `🎙️ [Áudio]: ${text}`;
                } else if (norm.media.type === "image") {
                  processedContent = norm.media.caption
                    ? `🖼️ Imagem (legenda: "${norm.media.caption}"): ${text}`
                    : `🖼️ Imagem: ${text}`;
                } else if (norm.media.type === "document") {
                  const fname = mediaMeta?.filename || "documento.pdf";
                  processedContent = `📎 Documento (${fname}): ${text}`;
                }

                console.log(
                  `[uazapi-webhook] media processed (${norm.media.type}): ${
                    text.slice(0, 80)
                  }...`,
                );
              } else {
                if (norm.media.type === "audio") {
                  processedContent = `🎙️ [Áudio recebido]`;
                } else if (norm.media.type === "image") {
                  processedContent = norm.media.caption
                    ? `🖼️ [Imagem]: ${norm.media.caption}`
                    : `🖼️ [Imagem recebida]`;
                } else if (norm.media.type === "document") {
                  processedContent = `📎 [Documento recebido]`;
                }
                console.warn(
                  `[uazapi-webhook] media NOT processed by process-media-message (${norm.media.type}); using fallback placeholder`,
                );
              }
            } else {
              if (norm.media.type === "audio") {
                processedContent = `🎙️ [Áudio: sem dados]`;
              } else if (norm.media.type === "image") {
                processedContent = `🖼️ [Imagem: sem dados]`;
              } else if (norm.media.type === "document") {
                processedContent = `📎 [PDF: sem dados]`;
              } else {
                processedContent = `📦 [Mídia: sem dados]`;
              }
              console.warn(
                `[uazapi-webhook] media has no b64 nor url; using fallback placeholder (${norm.media.type})`,
              );
            }
          } else {
            const fname = mediaMeta?.filename;
            if (norm.media.type === "audio") {
              processedContent = `🎙️ [Áudio recebido]`;
            } else if (norm.media.type === "image") {
              processedContent = norm.media.caption
                ? `🖼️ Imagem (legenda: "${norm.media.caption}")`
                : `🖼️ [Imagem recebida]`;
            } else if (norm.media.type === "video") {
              processedContent = norm.media.caption
                ? `🎥 Vídeo (legenda: "${norm.media.caption}")`
                : `🎥 [Vídeo enviado pelo cliente]`;
            } else if (norm.media.type === "document") {
              processedContent = fname
                ? `📎 Documento: ${fname}`
                : `📎 [Documento enviado pelo cliente]`;
            } else if (norm.media.type === "sticker") {
              processedContent = `🟡 [Figurinha enviada pelo cliente]`;
            }
          }
        } catch (e: any) {
          console.warn(
            "[uazapi-webhook] media processing failed:",
            e?.message || String(e),
          );
          if (norm.media.type === "audio") {
            processedContent = `🎙️ [Áudio: erro]`;
          } else if (norm.media.type === "image") {
            processedContent = `🖼️ [Imagem: erro]`;
          } else if (norm.media.type === "video") {
            processedContent = `🎥 [Vídeo: erro]`;
          } else if (norm.media.type === "document") {
            processedContent = `📎 [Documento: erro]`;
          } else {
            processedContent = `📎 [Mídia: erro]`;
          }
        }
      }

      // ============================================================
      // INBOUND DEDUP — UazAPI pode reentregar o mesmo webhook
      // várias vezes (timeout do nosso handler). Camadas:
      //  1) processed_messages (UNIQUE instance_id+message_id) → barra retries
      //     antes de qualquer trabalho pesado. TTL de 24h.
      //  2) webchat_messages.metadata->>evolution_message_id → 2ª barreira.
      // ============================================================
      if (norm.messageId) {
        const isDup = await isDuplicateInboundMessage(
          supabase,
          instance.id,
          remotePhone || null,
          norm.messageId,
        );
        if (isDup) {
          console.log(
            "[uazapi-webhook] skip: duplicate_message_id",
            norm.messageId,
          );
          return new Response(
            JSON.stringify({ ok: true, skipped: "duplicate_message_id" }),
            {
              status: 200,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            },
          );
        }
        const { data: dup } = await supabase
          .from("webchat_messages")
          .select("id")
          .eq("conversation_id", conversationId)
          .eq("metadata->>evolution_message_id", norm.messageId)
          .limit(1)
          .maybeSingle();
        if (dup?.id) {
          console.log(
            "[uazapi-webhook] skip: inbound duplicate (evolution_message_id match)",
            norm.messageId,
          );
          return new Response(
            JSON.stringify({ ok: true, skipped: "inbound_duplicate" }),
            {
              status: 200,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            },
          );
        }
      }

      let savedMessageCreatedAt: string | null = null;
      let savedMessageId: string | null = null;

      // Grava msg inbound no Inbox (visitor → bot)
      // IGNORAMOS inserção se for uma retomada interna (resume)
      if (!(payload as any).__is_resume) {
        const insertPayload = {
          conversation_id: conversationId,
          content: processedContent,
          sender_type: "visitor",
          direction: "inbound",
          metadata: {
            evolution_message_id: norm.messageId,
            evolution_instance_id: instance.id,
            sender_name: senderName,
            ...(mediaMeta ? { media: mediaMeta } : {}),
            ...(processedKind ? { multimodal_processed: processedKind } : {}),
          },
        };

        try {
          const { data: inserted, error: insertErr } = await supabase
            .from("webchat_messages")
            .insert(insertPayload)
            .select("*")
            .single();

          if (insertErr) {
            // Race: outra invocação concorrente já gravou esta mesma msg
            // (índice único parcial garante unicidade no banco).
            if ((insertErr as any).code === "23505") {
              console.log(
                "[uazapi-webhook] skip: inbound duplicate (unique index)",
                norm.messageId,
              );
              return new Response(
                JSON.stringify({ ok: true, skipped: "inbound_duplicate_race" }),
                {
                  status: 200,
                  headers: {
                    ...corsHeaders,
                    "Content-Type": "application/json",
                  },
                },
              );
            }
            console.error(
              "[uazapi-webhook] insert_result: error",
              JSON.stringify({
                error: insertErr.message,
                code: insertErr.code,
                details: insertErr.details,
                hint: insertErr.hint,
                conversation_id: conversationId,
                content_preview:
                  (typeof norm.content === "string" ? norm.content : "").slice(
                    0,
                    80,
                  ),
              }),
            );
            return new Response(
              JSON.stringify({ ok: false, error: insertErr.message }),
              {
                status: 500,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
              },
            );
          }

          savedMessageCreatedAt = inserted?.created_at ?? null;
          savedMessageId = inserted?.id ?? null;
          console.log(
            "[uazapi-webhook] insert_result: ok",
            JSON.stringify({
              message_id: inserted?.id,
              conversation_id: conversationId,
            }),
          );

          // Broadcast realtime → o painel (SellerInbox) escuta `conversation:{id}`
          // e adiciona a mensagem na cache instantaneamente. Sem isso, a janela
          // de chat fica congelada até o usuário recarregar / trocar de conversa.
          if (inserted) {
            try {
              const ch = supabase.channel(`conversation:${conversationId}`);
              await ch.send({
                type: "broadcast",
                event: "new_message",
                payload: inserted,
              });
              await supabase.removeChannel(ch);
            } catch (e) {
              console.error(
                "[uazapi-webhook] broadcast (visitor) non-fatal:",
                e,
              );
            }
          }
        } catch (e: any) {
          console.error(
            "[uazapi-webhook] insert_result: exception",
            e?.message || String(e),
          );
          return new Response(
            JSON.stringify({
              ok: false,
              error: e?.message || "insert exception",
            }),
            {
              status: 500,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            },
          );
        }
      }

      // ===== Booking reply detection (non-blocking) =====
      // If this inbound number has an active booking awaiting confirmation,
      // parse 1/2/3 (or text) and update the booking accordingly.
      try {
        const phoneDigits = (remotePhone || "").replace(/\D/g, "");
        if (phoneDigits) {
          // Match by suffix (last 10 digits) to be tolerant to DDI variations.
          const suffix = phoneDigits.slice(-10);
          const { data: bookings } = await supabase
            .from("booking_requests")
            .select("id, organization_id, status, guest_phone, host_user_id")
            .in("status", [
              "confirmacao_enviada",
              "lembrete_enviado",
              "confirmed",
              "agendado",
            ])
            .order("start_time", { ascending: false })
            .limit(20);

          const target = (bookings || []).find((b: any) =>
            (b.guest_phone || "").replace(/\D/g, "").endsWith(suffix)
          );

          if (target) {
            const text = (norm.content || "").trim().toLowerCase();
            let newStatus: string | null = null;
            if (/^1\b|^confirm/i.test(text)) newStatus = "confirmado";
            else if (/^2\b|reagend/i.test(text)) {
              newStatus = "reagendamento_solicitado";
            } else if (/^3\b|cancel/i.test(text)) newStatus = "cancelado";

            const updates: Record<string, any> = {
              last_reply_at: new Date().toISOString(),
              last_reply_text: norm.content || "",
            };
            if (newStatus) {
              updates.status = newStatus;
              if (newStatus === "confirmado") {
                updates.confirmed_at = new Date().toISOString();
              }
            }

            await supabase.from("booking_requests").update(updates).eq(
              "id",
              target.id,
            );
            await supabase.from("booking_logs").insert({
              booking_id: target.id,
              organization_id: target.organization_id,
              type: "reply_received",
              channel: "whatsapp",
              payload: { text: norm.content, parsed_status: newStatus },
            });
            console.log(
              `[uazapi-webhook] booking reply matched id=${target.id} -> ${
                newStatus || "noop"
              }`,
            );
          }
        }
      } catch (e: any) {
        console.warn(
          "[uazapi-webhook] booking reply hook failed:",
          e?.message || String(e),
        );
      }

      // ============================================================
      // BUFFER CURTO (humanização sem queimar tempo)
      // ============================================================
      // Lê configurações de humanização da org. Janela padrão = 3s.
      // Teto absoluto = 8s desde a 1ª msg do burst — nunca mais que isso.
      // Loop: dorme em fatias de 1s; se chegou nova msg do visitor, deferimos
      // para a invocação dessa nova msg (que vai re-medir o teto).
      let groupingEnabled = true;
      let groupingWindowMs = 200; // Reduzido de 500ms para 200ms
      let groupingMaxMs = 3000; // Reduzido de 4000ms para 3000ms
      let presenceEnabledOrg = true;
      try {
        const { data: orgRow } = await supabase
          .from("organizations")
          .select(
            "ai_grouping_enabled, ai_grouping_window_ms, ai_grouping_max_ms, ai_debounce_ms, presence_enabled",
          )
          .eq("id", instance.organization_id)
          .maybeSingle();
        if (orgRow) {
          if (orgRow.ai_grouping_enabled === false) groupingEnabled = false;
          if (orgRow.ai_grouping_window_ms != null) {
            groupingWindowMs = Math.max(
              0,
              Math.min(8000, Number(orgRow.ai_grouping_window_ms)),
            );
          } else if (orgRow.ai_debounce_ms != null) {
            // Fallback compatível com config antiga, mas com TETO de 8s.
            groupingWindowMs = Math.max(
              0,
              Math.min(8000, Number(orgRow.ai_debounce_ms)),
            );
          }
          if (orgRow.ai_grouping_max_ms != null) {
            groupingMaxMs = Math.max(
              groupingWindowMs,
              Math.min(8000, Number(orgRow.ai_grouping_max_ms)),
            );
          }
          if ((orgRow as any).presence_enabled === false) {
            presenceEnabledOrg = false;
          }
        }
      } catch (_) { /* keep defaults */ }

      if (groupingEnabled && groupingWindowMs > 0 && savedMessageCreatedAt) {
        const startedAt = Date.now();
        const tickMs = 1000;
        let lastSeenAt = savedMessageCreatedAt;
        let lastSeenId = savedMessageId ||
          "00000000-0000-0000-0000-000000000000";
        let deferred = false;
        let extensions = 0;
        console.log(
          "[uazapi-webhook] grouping start",
          JSON.stringify({ window: groupingWindowMs, max: groupingMaxMs }),
        );

        // Rolling window: a cada msg nova do visitor, estende a espera até o teto absoluto (max).
        // Se outra invocação posterior assumir o turno, abortamos esta.
        while ((Date.now() - startedAt) < groupingMaxMs) {
          const remainingToWindow = groupingWindowMs -
            (Date.now() - startedAt) + extensions * groupingWindowMs;
          const remainingToMax = groupingMaxMs - (Date.now() - startedAt);
          const wait = Math.max(
            0,
            Math.min(tickMs, remainingToWindow, remainingToMax),
          );
          if (wait <= 0) break;
          await new Promise((r) => setTimeout(r, wait));

          const { data: newer } = await supabase
            .from("webchat_messages")
            .select("id, created_at")
            .eq("conversation_id", conversationId)
            .eq("sender_type", "visitor")
            .gte("created_at", lastSeenAt)
            .order("created_at", { ascending: false })
            .limit(5);

          const arrived = (newer || []).filter((m: any) => {
            if (!m) return false;
            if (m.created_at > lastSeenAt) return true;
            if (m.created_at === lastSeenAt && m.id > lastSeenId) return true;
            return false;
          });

          if (arrived.length > 0) {
            // Nova mensagem do visitor → estende janela. A invocação mais nova
            // assume o turno: se esta não for a mais antiga, abortamos.
            const newest = arrived[0];
            lastSeenAt = newest.created_at;
            lastSeenId = newest.id;
            extensions += 1;
            deferred = true; // outra invocação (gerada pela msg nova) cuidará da resposta
            console.log(
              "[uazapi-webhook] grouping: newer msg arrived, deferring to it",
            );
            break;
          }
        }

        if (deferred) {
          return new Response(JSON.stringify({ ok: true, debounced: true }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        console.log(
          "[uazapi-webhook] grouping done",
          JSON.stringify({ waitedMs: Date.now() - startedAt }),
        );
      }

      // ---- BOT TRIGGER ----
      // If conversation is in bot_active mode, run the funnel engine OR delegate to webchat-bot.
      try {
        let { data: conv } = await supabase
          .from("webchat_conversations")
          .select(
            "id, status, widget_id, visitor_name, current_agent_id, lead_id, current_flow_id, current_block_id, flow_variables, flow_completed, flow_source, orchestrator_state, bot_locked_until, webchat_widgets(product_id)",
          )
          .eq("id", conversationId)
          .maybeSingle();

        // Smart Pause check
        // Smart Pause check (skipped for funnel resumes and will be refined inside funnel engine)
        if (
          conv?.bot_locked_until && !(payload as any).__is_resume &&
          (conv as any).flow_source !== "funnel"
        ) {
          const lockTime = new Date(conv.bot_locked_until).getTime();
          if (Date.now() < lockTime) {
            console.log(
              "[uazapi-webhook] skip: bot locked until",
              conv.bot_locked_until,
            );
            return new Response(
              JSON.stringify({ ok: true, skipped: "bot_locked" }),
              {
                status: 200,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
              },
            );
          }
        }

        // ---- FUNNEL ENGINE (WhatsApp) ----
        // If the conversation is bound to a funnel and the flow is not completed,
        // execute the next blocks here. Agents take over only when blocks
        // ai_takeover/agent_switch/handoff/end are reached, or when flow finishes.
        if (
          conv &&
          conv.status === "bot_active" &&
          (conv as any).flow_source === "funnel" &&
          (conv as any).current_flow_id &&
          (conv as any).current_block_id &&
          !(conv as any).flow_completed
        ) {
          const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
          const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

          const isResume = (payload as any).__is_resume === true;
          const isNewFunnel = (payload as any).__is_new_funnel === true;

          // GLOBAL STOP GUARD
          if ((conv as any).flow_variables?.__manual_stop === true) {
            console.log(`[uazapi-webhook] funnel_run_skipped: manual_stop detected for ${conversationId}`);
            if (lockAcquired) await releaseConversationLock(supabase, conversationId);
            return new Response(JSON.stringify({ ok: true, skipped: "manual_stop" }), {
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }

          // Acquire lock for funnel processing to prevent race conditions
          // If it's an inbound message, we retry a few times to avoid discarding a valid answer
          // while the resume-cron is running.
          let lockAcquired = false;
          const maxRetries = (isResume || isNewFunnel) ? 1 : 5;

          const waitingInputPre = (conv as any).flow_variables?.__waiting_input;
          const isAtInputBlockPre = !!waitingInputPre &&
            waitingInputPre.answered !== true;
          const isLeadMessagePre = norm.kind === "message" && !norm.fromMe &&
            !isResume && !isNewFunnel;

          // SPECIAL CASE: If it's a lead answer for a question, we BYPASS the lock failure
          // because lead answers MUST always have priority and must NOT be lost due to cron locks.
          let forceProcessing = false;
          if (isAtInputBlockPre && isLeadMessagePre) {
            forceProcessing = true;
            console.log(
              "[uazapi-webhook] input_answer_priority: bypassing lock attempt for",
              conversationId,
            );
          }

          if (!forceProcessing) {
            for (let i = 0; i < maxRetries; i++) {
              lockAcquired = await acquireConversationLock(
                supabase,
                conversationId,
                60_000,
              );
              if (lockAcquired) break;
              if (i < maxRetries - 1) {
                console.log(
                  `[uazapi-webhook] funnel_run: lock retry ${
                    i + 1
                  }/${maxRetries} for ${conversationId}`,
                );
                await new Promise((r) => setTimeout(r, 1000));
              }
            }
          }

          if (!lockAcquired && !forceProcessing) {
            console.log(
              "[uazapi-webhook] funnel_run: skip (conversation locked by another job)",
            );
            return new Response(
              JSON.stringify({ ok: true, skipped: "conversation_locked" }),
              {
                status: 200,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
              },
            );
          }

          // If we are forcing processing without a lock, or if we got the lock but want to be sure,
          // re-fetch the conversation to avoid race conditions.
          if (
            forceProcessing || (lockAcquired && (isLeadMessagePre || isResume))
          ) {
            const { data: freshConv } = await supabase
              .from("webchat_conversations")
              .select("*")
              .eq("id", conversationId)
              .single();
            if (freshConv) {
              (conv as any) = freshConv;
              console.log(
                "[uazapi-webhook] conversation_refreshed_for_priority_processing",
              );
            }
          }

          const { data: funnel } = await supabase
            .from("capture_funnels")
            .select("id, name, flow_blocks")
            .eq("id", (conv as any).current_flow_id)
            .maybeSingle();

          const blocks: any[] = ((funnel as any)?.flow_blocks || []) as any[];
          const findBlock = (
            id: string | null,
          ) => (id ? blocks.find((b) => b.id === id) : null);

          let currentBlock: any = findBlock((conv as any).current_block_id);

          // ───────────────────────────────────────────────────────────────
          // [AI_RECEIPT_PENDING_MEDIA] Buffer de mídia pré-ai_receipt
          // Persiste comprovantes (PDF/imagem) enviados ANTES do flow
          // chegar no bloco ai_receipt, para replay posterior.
          // NÃO afeta texto, áudio, OCR, Pixel, Purchase ou debounce.
          // ───────────────────────────────────────────────────────────────
          try {
            const hasAiReceiptInFunnel = blocks.some(
              (b: any) => String(b?.type || "").toLowerCase() === "ai_receipt",
            );
            // [COMPROVANTE_UNSUPPORTED_MEDIA_IGNORED] image/webp removido
            // intencionalmente: figurinhas WhatsApp chegam como image/webp
            // sem caption e contaminavam o pipeline de comprovante. Mantemos
            // somente formatos comprovadamente válidos para Pix/recibo.
            const RECEIPT_MIME_ALLOWLIST = new Set([
              "application/pdf",
              "image/jpeg",
              "image/jpg",
              "image/png",
            ]);
            const _normAny: any = norm as any;
            const isInboundLead = _normAny?.kind === "message" &&
              _normAny?.fromMe === false &&
              (_normAny?.direction === "inbound" || !_normAny?.direction) &&
              (_normAny?.senderType === "visitor" || !_normAny?.senderType);
            const mediaType = _normAny?.media?.type || null;
            const mediaMime = String(
              _normAny?.media?.mime || _normAny?.media?.mimetype || "",
            ).toLowerCase().split(";")[0].trim();
            const mediaUrl = _normAny?.media?.url || null;
            const isReceiptCandidate = isInboundLead &&
              !!_normAny?.media &&
              (mediaType === "document" || mediaType === "image") &&
              RECEIPT_MIME_ALLOWLIST.has(mediaMime) &&
              !!mediaUrl;
            const convActive = !(conv as any)?.flow_completed &&
              (conv as any)?.status !== "closed";
            const notYetAtAiReceipt =
              String(currentBlock?.type || "").toLowerCase() !== "ai_receipt";

            if (
              hasAiReceiptInFunnel && isReceiptCandidate && convActive &&
              notYetAtAiReceipt
            ) {
              const flowVarsExisting: any =
                (conv as any)?.flow_variables || {};
              const pendingPayload = {
                url: mediaUrl,
                mime: mediaMime,
                type: mediaType,
                message_id: _normAny?.messageId || null,
                received_at: new Date().toISOString(),
                original_text_preview:
                  typeof _normAny?.content === "string"
                    ? String(_normAny.content).slice(0, 200)
                    : null,
              };
              flowVarsExisting.__pending_receipt_media = pendingPayload;
              (conv as any).flow_variables = flowVarsExisting;
              await supabase
                .from("webchat_conversations")
                .update({ flow_variables: flowVarsExisting })
                .eq("id", conversationId);
              console.log(
                "[AI_RECEIPT_PENDING_MEDIA_SAVED]",
                JSON.stringify({
                  conversation_id: conversationId,
                  current_block_id: (conv as any).current_block_id,
                  current_block_type: currentBlock?.type || null,
                  media: pendingPayload,
                }),
              );
            }
          } catch (pendingErr) {
            console.warn(
              "[AI_RECEIPT_PENDING_MEDIA_SAVE_FAILED]",
              String(pendingErr),
            );
          }

          // Refined lock check for funnels (smart pause / timeout)
          if (conv?.bot_locked_until && !(payload as any).__is_resume) {
            const lockTime = new Date(conv.bot_locked_until).getTime();
            if (Date.now() < lockTime) {
              // If it's an interactive block waiting for the lead, allow incoming messages even while
              // bot_locked_until is set for the timeout window. Lead answers must wake the block up.
              const interuptable = [
                "input",
                "question",
                "pergunta",
                "user_input",
                "wait_input",
                "wait_response",
                "ia_pergunta",
                "buttons",
                "ai_receipt",
              ].includes(currentBlock?.type);
              if (
                forceProcessing ||
                (interuptable && !currentBlock.data?.message_buffer_enabled)
              ) {
                console.log(
                  "[uazapi-webhook] bot_locked_until set for timeout, but processing incoming message anyway",
                );
              } else {
                console.log(
                  "[uazapi-webhook] funnel skip: bot locked until",
                  conv.bot_locked_until,
                );
                if (lockAcquired) {
                  await releaseConversationLock(supabase, conversationId);
                }
                return new Response(
                  JSON.stringify({ ok: true, skipped: "bot_locked" }),
                  {
                    status: 200,
                    headers: {
                      ...corsHeaders,
                      "Content-Type": "application/json",
                    },
                  },
                );
              }
            }
          }
          let flowVariables: Record<string, any> = {
            ...(((conv as any).flow_variables) || {}),
          };

          // CRITICAL: Merge in lead's custom fields to make variables "global and reusable"
          if (conv.lead_id && !isResume) {
            try {
              const { data: lead } = await supabase.from("leads").select(
                "custom_fields, name, email, phone, fbclid, ctwa_clid, campaign_id, adset_id, ad_id, created_at",
              ).eq("id", conv.lead_id).maybeSingle();
              if (lead) {
                // Known fields map
                const leadData: Record<string, any> = {
                  nome: lead.name,
                  email: lead.email,
                  telefone: lead.phone,
                  fbclid: lead.fbclid,
                  ctwa_clid: lead.ctwa_clid,
                  campaign_id: lead.campaign_id,
                  adset_id: lead.adset_id,
                  ad_id: lead.ad_id,
                  lead_created_at: lead.created_at,
                  ...(lead.custom_fields || {}),
                };
                // Fill in only if not already in flowVariables to prioritize current session
                Object.entries(leadData).forEach(([k, v]) => {
                  if (
                    v !== null && v !== undefined &&
                    flowVariables[k] === undefined
                  ) {
                    flowVariables[k] = v;
                  }
                });
                console.log(
                  "[uazapi-webhook] lead_data_merged_to_flow_vars:",
                  Object.keys(leadData),
                );
              }
            } catch (e) {
              console.warn("[uazapi-webhook] lead_merge_error:", e);
            }
          }

          // Make sure current user message is always available as 'resposta' globally
          // ONLY if we are currently at an input block, to avoid polluting from trigger messages.
          // CRITICAL: We also ignore messages that arrived before or very close to the question_sent_at.
          if (norm.kind === "message" && !norm.fromMe && !isResume) {
            const inputTypes = ["input", "question", "pergunta", "user_input", "wait_input", "wait_response", "ia_pergunta", "ai_receipt"];
            const isAtInput = currentBlock && inputTypes.includes(String(currentBlock.type).toLowerCase());
            
            const qSentAtMs = (conv as any).flow_variables?.__waiting_input?.question_sent_at 
              ? new Date((conv as any).flow_variables.__waiting_input.question_sent_at).getTime() 
              : 0;
            const msgAtMs = (norm as any).createdAt ? (norm as any).createdAt * 1000 : Date.now();
            
            // CRITICAL: Check if this message was already consumed as an answer
            const consumedIds = (conv as any).flow_variables?.__consumed_input_message_ids || [];
            const alreadyConsumed = norm.messageId && consumedIds.includes(norm.messageId);

            const isValidTime = qSentAtMs > 0 && msgAtMs > (qSentAtMs + 800);

            if (isAtInput && isValidTime && !alreadyConsumed) {
              const incomingContent = processedContent || norm.content || "";
              if (incomingContent) {
                flowVariables["resposta"] = incomingContent;
                console.log("[uazapi-webhook] resposta_var_updated:", incomingContent.slice(0, 50));
              }
            } else if (isAtInput) {
              console.log("[uazapi-webhook] resposta_var_update_skipped:", { qSentAtMs, msgAtMs, alreadyConsumed });
            }
          }

          let chunksToSend: {
            type: string;
            payload: any;
            show_typing?: boolean;
            typing_duration?: number;
            delay?: number;
            reply_to_message?: boolean;
            source_block_id?: string;
          }[] = [];
          if (healthId) {
            await updateWebhookHealth(supabase, healthId, {
              flow_started: true
            });
          }
          let nextBlockId: string | null = (conv as any).current_block_id;

          let flowCompleted = false;

          // DIAGNOSTIC LOGGING FOR INBOUND
          if (
            norm.kind === "message" && !norm.fromMe && !isResume && !isNewFunnel
          ) {
            console.log("[uazapi-webhook] inbound_diagnostic:", {
              conversation_id: conversationId,
              current_flow_id: (conv as any).current_flow_id,
              current_block_id: (conv as any).current_block_id,
              current_block_type: currentBlock?.type,
              bot_locked_until: conv?.bot_locked_until,
              waiting_input: flowVariables["__waiting_input"],
              received_message: norm.content?.slice(0, 100),
            });
          }

          let handoffToAgent: string | null = null;
          let releaseToOrchestrator = false;
          let closeConversation = false;
          let pendingDelayMs = 0;
          let advancedByInteraction = false;
          let updatedBotLockedUntil = conv?.bot_locked_until || null;
          let receiptRecognizedThisLoop = false;
          let pixelEnteredThisLoop = false;
          const replaceVars = (txt: any) => {
            if (typeof txt !== "string") return txt;
            let result = txt;
            for (const [key, value] of Object.entries(flowVariables)) {
              const reg = new RegExp(`{{${key}}}`, "g");
              if (typeof value === "string" || typeof value === "number") {
                result = result.replace(reg, String(value));
              } else if (value && typeof value === "object") {
                // If it's a media object, try to use its text representation
                const textVal = value.text || value.transcription ||
                  (value.type ? `[${value.type}]` : JSON.stringify(value));
                result = result.replace(reg, String(textVal));
              }
            }
            // Standard variables
            result = result.replace(
              /{{contact_name}}/g,
              (conv as any).contact_name || "",
            );
            result = result.replace(
              /{{name}}/g,
              (conv as any).contact_name || "",
            );
            result = result.replace(
              /{{lead_name}}/g,
              (conv as any).contact_name || "",
            );
            return result;
          };

          // 1) Consume user's message if at a question/input block
          const inputTypes = [
            "input",
            "question",
            "pergunta",
            "user_input",
            "wait_input",
            "wait_response",
            "ia_pergunta",
            "ai_receipt",
          ];
          const isAtInputBlock = currentBlock &&
            inputTypes.includes(String(currentBlock.type).toLowerCase());
          const waitingInput = flowVariables["__waiting_input"];

          if (!Array.isArray(flowVariables["__consumed_input_message_ids"])) {
            flowVariables["__consumed_input_message_ids"] = [];
          }
          const consumedIds = flowVariables["__consumed_input_message_ids"];
          const isAlreadyConsumed = norm.messageId &&
            consumedIds.includes(norm.messageId);

          // Check if this message matches the funnel trigger keywords
          // If it does, we ONLY check if NOT at an input block
          let isTriggerMessage = false;
          if (funnel && !isNewFunnel && !isResume && !isAtInputBlock) {
            const { matchesTrigger } = await import("./funnel-matcher.ts");
            isTriggerMessage = matchesTrigger(norm.content, funnel);
          }

          const normCreatedAtMs = (norm as any).createdAt
            ? (norm as any).createdAt * 1000
            : Date.now();
          const questionSentAtMs =
            (waitingInput?.block_id === currentBlock?.id &&
                waitingInput?.question_sent_at)
              ? new Date(waitingInput.question_sent_at).getTime()
              : 0;

          // CRITICAL: A response is ONLY valid if it arrived AFTER the question was sent.
          // If no question was sent yet (questionSentAtMs === 0), it CANNOT be a response.
          const isResponseAfterQuestion = questionSentAtMs > 0 &&
            normCreatedAtMs > (questionSentAtMs + 1000);

          const isSameAsTrigger =
            waitingInput?.trigger_message_id === norm.messageId;

          // Content comparison to avoid echos
          const isEchoContent = waitingInput?.question_text &&
            norm.content?.trim() === waitingInput.question_text.trim();

          // Decide if this is a response to a question
          const isLeadMessage = norm.kind === "message" &&
            norm.fromMe === false &&
            (norm.senderType === "visitor" || !norm.senderType) &&
            (norm.direction === "inbound" || !norm.direction) &&
            !isResume &&
            !isNewFunnel;

          if (isAtInputBlock && !isResume && !isNewFunnel) {
            if (!isLeadMessage) {
              console.log(
                "[uazapi-webhook] question_echo_ignored: fromMe/type mismatch",
                {
                  fromMe: norm.fromMe,
                  senderType: norm.senderType,
                  direction: norm.direction,
                  messageId: norm.messageId,
                },
              );
            } else if (isAlreadyConsumed) {
              console.log(
                "[uazapi-webhook] input_message_already_consumed_ignored:",
                {
                  messageId: norm.messageId,
                },
              );
            } else if (isEchoContent) {
              console.log(
                "[uazapi-webhook] question_echo_ignored: content match",
                {
                  content: norm.content?.slice(0, 50),
                },
              );
            } else if (!isResponseAfterQuestion && questionSentAtMs > 0) {
              console.log(
                "[uazapi-webhook] question_echo_ignored: too early (before question_sent_at)",
                {
                  normCreatedAt: new Date(normCreatedAtMs).toISOString(),
                  questionSentAt: new Date(questionSentAtMs).toISOString(),
                },
              );
            }
          }

          console.log("[uazapi-webhook] answer_processing_eval:", {
            isAtInputBlock,
            isLeadMessage,
            isSameAsTrigger,
            isEchoContent,
            isResponseAfterQuestion,
            isAlreadyConsumed,
            questionSentAtMs,
            normCreatedAtMs,
            waitingInput_block_id: waitingInput?.block_id,
            currentBlock_id: currentBlock?.id,
            norm_message_id: norm.messageId,
          });

          if (
            isAtInputBlock && isLeadMessage && !isSameAsTrigger &&
            !isEchoContent && isResponseAfterQuestion && !isAlreadyConsumed
          ) {
            // Check if it's a valid response time-wise (if we have metadata)
            // Or if metadata is missing, we trust the current state (fallback)
            const questionSentAt = waitingInput?.question_sent_at;
            const canProcessAnswer = !questionSentAt || isResponseAfterQuestion;

            if (canProcessAnswer) {
              const waitingBlockId = waitingInput?.block_id || currentBlock?.id;

              // Fallback for variable name: check multiple fields
              const varName = (waitingInput?.variable_name ||
                currentBlock?.data?.ia_pergunta_variable ||
                currentBlock?.data?.variable_name ||
                currentBlock?.data?.input_variable ||
                currentBlock?.data?.name ||
                "resposta").toString().replace(/{{|}}/g, "");

              console.log("[uazapi-webhook] question_answer_received:", {
                block_id: waitingBlockId,
                variable: varName,
                message_type: norm.media?.type || "text",
                content_preview: norm.content?.slice(0, 50),
              });

              let savedValue: any = null;

              // Handle different media types for input
              if (norm.media?.type === "audio") {
                const transcription = (norm as any).transcription ||
                  (norm.media as any).transcription || (norm.media as any).text;
                const url = norm.media.url || "";
                savedValue = {
                  type: "audio",
                  text: transcription || "",
                  media_url: url,
                  message_id: norm.messageId,
                  rawMessage: norm.media.rawMessage,
                  mime: norm.media.mime,
                };
              } else if (norm.media?.type === "image") {
                const url = norm.media.url || "";
                savedValue = {
                  type: "image",
                  text: norm.content || "",
                  media_url: url,
                  message_id: norm.messageId,
                  rawMessage: norm.media.rawMessage,
                  mime: norm.media.mime,
                };
              } else if (norm.media?.type === "document") {
                const url = norm.media.url || "";
                const filename = norm.media.fileName || "";
                savedValue = {
                  type: "document",
                  text: filename,
                  media_url: url,
                  message_id: norm.messageId,
                  rawMessage: norm.media.rawMessage,
                  mime: norm.media.mime,
                };
              } else if (norm.media?.type === "video") {
                const url = norm.media.url || "";
                savedValue = {
                  type: "video",
                  text: norm.content || "",
                  media_url: url,
                  message_id: norm.messageId,
                  rawMessage: norm.media.rawMessage,
                  mime: norm.media.mime,
                };
              } else if (norm.media?.type === "sticker") {
                savedValue = {
                  type: "sticker",
                  message_id: norm.messageId,
                  rawMessage: norm.media.rawMessage,
                  mime: norm.media.mime,
                };
              } else {
                savedValue = processedContent || norm.content || "";
              }

              // Update both the specific variable and the global "resposta" variable
              flowVariables[varName] = savedValue;
              flowVariables["resposta"] = savedValue;

              // Sincroniza imediatamente com o lead
              await syncFlowVarsToLead(
                supabase,
                conversationId,
                flowVariables,
                { onlyKeys: [varName, "resposta"] },
              );

              console.log(
                "[uazapi-webhook] question_answer_saved_variable:",
                varName,
                "and global resposta =",
                typeof savedValue === "object"
                  ? JSON.stringify(savedValue).slice(0, 100)
                  : String(savedValue).slice(0, 100),
              );

              // [FASE 2.1] Se estamos em um bloco ai_receipt, NÃO seguir pelo caminho genérico
              // de "answer-success" (que avançaria direto para success_next_block_id pulando
              // o case "ai_receipt"). Forçamos a re-entrada no mesmo bloco para que o handler
              // de ai_receipt processe OCR/regex/LLM/fallback e grave as variáveis.
              if (currentBlock?.type === 'ai_receipt') {
                console.log('[AI_RECEIPT_INBOUND_ROUTE_ENTERED]', {
                  conversation_id: conversationId,
                  block_id: currentBlock.id,
                  has_media: !!norm.media,
                  media_type: norm.media?.type || null,
                  message_id: norm.messageId || null,
                });
                console.log('[AI_RECEIPT_BYPASS_PREVENTED]', {
                  block_id: currentBlock.id,
                  reason: 'force_case_ai_receipt_processing',
                });
                nextBlockId = currentBlock.id;
                advancedByInteraction = true;
                // currentBlock permanece o mesmo: o loop entrará em case "ai_receipt"
                // com hasFreshLeadMessage=true e executará a lógica completa.
              } else {

              // Buffer Logic: only buffer extra messages while we were already waiting.
              // The first valid answer must still advance the flow.
              if (
                currentBlock?.data?.message_buffer_enabled &&
                currentBlock?.data?.message_buffer_seconds &&
                flowVariables["__waiting_input"]?.buffer_collecting === true
              ) {
                const existing = typeof flowVariables[varName] === "string"
                  ? flowVariables[varName]
                  : "";
                const incoming = typeof savedValue === "string"
                  ? savedValue
                  : ((processedContent || norm.content || "") as string);
                flowVariables[varName] = existing
                  ? (existing + "\n" + incoming)
                  : incoming;
                flowVariables["resposta"] = flowVariables[varName];
                const lockUntil = new Date(
                  Date.now() +
                    (currentBlock.data.message_buffer_seconds * 1000),
                ).toISOString();
                await supabase.from("webchat_conversations").update({
                  flow_variables: flowVariables,
                  bot_locked_until: lockUntil,
                }).eq("id", conversationId);
                console.log(
                  "[uazapi-webhook] message buffered, lock until:",
                  lockUntil,
                );
                if (lockAcquired) {
                  await releaseConversationLock(supabase, conversationId);
                }
                return new Response(
                  JSON.stringify({ ok: true, buffered: true }),
                  {
                    headers: {
                      ...corsHeaders,
                      "Content-Type": "application/json",
                    },
                  },
                );
              }

              if (typeof flowVariables[varName] === "string") {
                const val = flowVariables[varName];
                if (/^\S+@\S+\.\S+$/.test(val)) flowVariables["email"] = val;
                if (/^\+?\d[\d\s().-]{6,}$/.test(val)) {
                  flowVariables["telefone"] = val;
                }
              }

              // Handle reaction
              if (currentBlock?.data?.react_to_message && norm.messageId) {
                chunksToSend.push({
                  type: "reaction",
                  payload: {
                    reaction: currentBlock.data.reaction_emoji || "✅",
                    key: {
                      remoteJid: norm.remoteJid,
                      fromMe: norm.fromMe,
                      id: norm.messageId,
                    },
                  },
                  delay: 0,
                  source_block_id: currentBlock.id,
                });
              }

              // ADVANCE: Inbound response MUST use success paths
              // Rules for Unified Pergunta: sim_next_block_id/nao_next_block_id based on AI classification

              const hasAIConfig = !!(currentBlock.data?.ia_pergunta_prompt ||
                currentBlock.data?.sim_next_block_id ||
                currentBlock.data?.nao_next_block_id);

              if (hasAIConfig) {
                console.log(
                  "[uazapi-webhook] pergunta_ai_started:",
                  currentBlock.id,
                );
                console.log(
                  "[uazapi-webhook] pergunta_ai_variable_name:",
                  varName,
                );

                let resolvedText = "";
                let imageUrl = "";
                const variableValue = flowVariables[varName];
                console.log(
                  "[uazapi-webhook] pergunta_ai_variable_value:",
                  `${varName} = ${
                    typeof variableValue === "object"
                      ? JSON.stringify(variableValue)
                      : variableValue
                  }`,
                );

                if (
                  typeof variableValue === "object" && variableValue !== null
                ) {
                  const mediaType = variableValue.type;
                  const mediaUrl = variableValue.media_url;
                  const existingText = variableValue.text;

                  if (
                    mediaType === "audio" &&
                    currentBlock.data?.ia_pergunta_understand_audio !== false
                  ) {
                    if (existingText) {
                      resolvedText = existingText;
                    } else if (mediaUrl) {
                      const transcription = await processMediaToText(
                        supabaseUrl,
                        serviceKey,
                        {
                          kind: "audio",
                          url: mediaUrl,
                          organization_id: (conv as any).organization_id,
                        },
                      );
                      resolvedText = transcription || "[áudio sem transcrição]";
                    }
                  } else if (
                    mediaType === "image" &&
                    currentBlock.data?.ia_pergunta_understand_image !== false
                  ) {
                    imageUrl = mediaUrl;
                    resolvedText = existingText || "";
                  } else {
                    resolvedText = existingText ||
                      (mediaType ? `[${mediaType}]` : "");
                  }
                } else {
                  resolvedText = String(variableValue || "");
                }

                // If resolvedText is empty but we have processedContent/norm.content, use it as fallback
                if (!resolvedText && !imageUrl) {
                  resolvedText = processedContent || (typeof norm.content === "string" ? norm.content : "");
                  console.log("[uazapi-webhook] pergunta_ai_resolved_text_fallback:", resolvedText);
                }

                if (!resolvedText && !imageUrl && !isResume) {
                  console.warn("[uazapi-webhook] pregunta_ai_aborted: no text or image to classify");
                  if (lockAcquired) {
                    await releaseConversationLock(supabase, conversationId);
                  }
                  return new Response(JSON.stringify({ ok: true, error: "no_content_to_classify" }), {
                    headers: { ...corsHeaders, "Content-Type": "application/json" },
                  });
                }

                const promptTemplate = currentBlock.data?.ia_pergunta_prompt ||
                  `Você é um classificador de resposta de lead.
Analise a mensagem abaixo e responda exclusivamente com uma das opções:

#sim
#não

Regras:
- Responda #sim se o lead demonstrou interesse, concordância, autorização, confirmação, aceitação ou intenção positiva.
- Responda #não se o lead recusou, negou, demonstrou desinteresse, pediu para parar, reclamou ou respondeu negativamente.
- Se a resposta for ambígua, curta, áudio sem transcrição ou impossível de entender, responda #não.
- Não explique.
- Não adicione texto fora de #sim ou #não.

Mensagem do lead:
{{variavel}}`;

                const aiClass = await classifyAnswer(
                  promptTemplate,
                  resolvedText,
                  imageUrl,
                  (conv as any).organization_id,
                  replaceVars,
                );
                console.log(
                  "[uazapi-webhook] question_ai_classification:",
                  aiClass,
                );
                console.log(
                  "[uazapi-webhook] pergunta_ai_route_selected:",
                  `route = ${aiClass === "sim" ? "sim" : "nao"}`,
                );

                if (aiClass === "sim") {
                  nextBlockId = currentBlock.data?.sim_next_block_id ||
                    currentBlock.data?.true_next_block_id ||
                    currentBlock.data?.success_next_block_id ||
                    currentBlock.next_block_id;
                } else {
                  nextBlockId = currentBlock.data?.nao_next_block_id ||
                    currentBlock.data?.false_next_block_id || null;
                }
              } else {
                // Fallback to standard routing if no AI config.
                // Aguarda Resposta has one success output: the normal Próximo Bloco / next_block_id.
                nextBlockId = waitingInput?.success_next_block_id ||
                  currentBlock?.next_block_id ||
                  currentBlock?.data?.true_next_block_id ||
                  currentBlock?.data?.success_next_block_id ||
                  currentBlock?.data?.sim_next_block_id ||
                  null;
              }

              console.log("[uazapi-webhook] question_success_execute:", {
                waiting_block_id: waitingBlockId,
                next_block_id: nextBlockId,
                hasAIConfig,
                waitingInput_success_id: waitingInput?.success_next_block_id,
                currentBlock_true_id: currentBlock?.data?.true_next_block_id,
                currentBlock_success_id: currentBlock?.data
                  ?.success_next_block_id,
              });

              if (!nextBlockId) {
                console.error(
                  "[uazapi-webhook] input_success_error: nextBlockId is empty",
                  {
                    block_id: currentBlock?.id,
                    block_data: currentBlock?.data,
                  },
                );
              }

              // Mark as answered and record metadata
              flowVariables["__waiting_input"] = {
                ...(waitingInput || {}),
                block_id: waitingBlockId,
                variable_name: varName,
                answered: true,
                answered_at: new Date().toISOString(),
                answer_text: flowVariables[varName],
                answer_message_id: norm.messageId,
              };

              // Track consumed message IDs to prevent re-use in multiple questions
              if (norm.messageId) {
                if (!consumedIds.includes(norm.messageId)) {
                  consumedIds.push(norm.messageId);
                  flowVariables["__consumed_input_message_ids"] = consumedIds;
                  console.log(
                    "[uazapi-webhook] input_message_consumed:",
                    norm.messageId,
                  );
                }
              }

              updatedBotLockedUntil = null; // Clear timeout
              advancedByInteraction = true;

              console.log(
                "[uazapi-webhook] question_success_after_new_message_only:",
                {
                  block_id: waitingBlockId,
                  next_block_id: nextBlockId,
                  messageId: norm.messageId,
                },
              );

              console.log(
                "[uazapi-webhook] input_success_path_advancing_to:",
                nextBlockId,
              );

              // Important: find the actual block object for the next loop
              currentBlock = findBlock(nextBlockId);
              } // [FASE 2.1] close: else branch para blocos não-ai_receipt
            } else {
              console.log(
                "[uazapi-webhook] input_answer_rejected: too early (before question_sent_at)",
              );
            }
          } else if (isAtInputBlock && isResume) {
            console.log("[uazapi-webhook] resume_input_block_check:", {
              block_id: currentBlock?.id,
              waiting_input: waitingInput,
              now: new Date().toISOString(),
            });
            const now = Date.now();
            const timeoutAtMs = waitingInput?.timeout_at
              ? new Date(waitingInput.timeout_at).getTime()
              : (conv?.bot_locked_until
                ? new Date(conv.bot_locked_until).getTime()
                : 0);

            // CRITICAL: Before executing timeout, check if an answer was ALREADY saved
            const varName = waitingInput?.variable_name ||
              currentBlock?.data?.variable_name ||
              currentBlock?.data?.input_variable ||
              currentBlock?.data?.name ||
              "resposta";
            // PHASE 2.3C: For ai_receipt, NEVER trust residual flowVariables[varName] —
            // it reuses "resposta" from the prior wait_response and would always look
            // "already answered" on first resume. Only the explicit answered flag or a
            // post-WAIT_START answer_message_id count as a real answer.
            const isAiReceiptBlock = currentBlock?.type === "ai_receipt";
            const waitStartMs = waitingInput?.question_sent_at
              ? new Date(waitingInput.question_sent_at).getTime()
              : 0;
            const answerMsgAtMs = waitingInput?.answer_message_at
              ? new Date(waitingInput.answer_message_at).getTime()
              : 0;
            const hasPostWaitAnswerMsg = !!waitingInput?.answer_message_id &&
              (answerMsgAtMs === 0 || answerMsgAtMs >= waitStartMs);

            const alreadyAnswered = isAiReceiptBlock
              ? (waitingInput?.answered === true || hasPostWaitAnswerMsg)
              : (waitingInput?.answered === true || (
                flowVariables[varName] !== undefined &&
                flowVariables[varName] !== null &&
                flowVariables[varName] !== "" &&
                flowVariables[varName] !== "..." &&
                flowVariables[varName] !== "waiting..." &&
                flowVariables[varName] !== "pode enviar?" && // Extra guard: never treat question text as answer
                flowVariables[varName] !== waitingInput?.question_text
              ));

            if (isAiReceiptBlock) {
              console.log("[AI_RECEIPT_ALREADY_ANSWERED_CHECK]", {
                conversation_id: conversationId,
                block_id: currentBlock?.id,
                answered_flag: waitingInput?.answered,
                has_post_wait_answer_msg: hasPostWaitAnswerMsg,
                already_answered: alreadyAnswered,
              });
            }

            // GHOST CLEANUP HELPER: clears bot_locked_until + __waiting_input so the
            // conversation does not reappear in the resume-cron backlog indefinitely.
            const cleanupGhost = async (reason: string) => {
              try {
                const cleanedVars = { ...(flowVariables || {}) };
                delete cleanedVars["__waiting_input"];
                delete cleanedVars["waiting_for_input"];
                await supabase
                  .from("webchat_conversations")
                  .update({
                    bot_locked_until: null,
                    flow_variables: cleanedVars,
                  })
                  .eq("id", conversationId);
                console.log(
                  `[uazapi-webhook] ghost_cleanup_done (${reason}) for conv ${conversationId}`,
                );
              } catch (e) {
                console.warn(
                  `[uazapi-webhook] ghost_cleanup_failed (${reason}):`,
                  e,
                );
              }
            };

            if (alreadyAnswered) {
              console.log(
                "[uazapi-webhook] resume_funnel_aborted: answer already detected",
                {
                  block_id: currentBlock?.id,
                  variable: varName,
                  answered_flag: waitingInput?.answered,
                },
              );

              await cleanupGhost("already_handled_by_inbound");

              if (lockAcquired) {
                await releaseConversationLock(supabase, conversationId);
              }
              return new Response(
                JSON.stringify({
                  ok: true,
                  skipped: "already_handled_by_inbound",
                  ghost_cleaned: true,
                }),
                {
                  headers: {
                    ...corsHeaders,
                    "Content-Type": "application/json",
                  },
                },
              );
            } else if (now >= timeoutAtMs) {
              // EXTRA CHECK: Verify if there are any inbound messages after question_sent_at
              const { data: recentMessages } = await supabase
                .from("webchat_messages")
                .select("id, content")
                .eq("conversation_id", conversationId)
                .eq("direction", "inbound")
                .gt(
                  "created_at",
                  waitingInput?.question_sent_at || new Date(0).toISOString(),
                )
                .limit(1);

              if (recentMessages && recentMessages.length > 0) {
                console.log(
                  "[uazapi-webhook] timeout_aborted: recent inbound message detected",
                  recentMessages[0].id,
                );
                await cleanupGhost("recent_message_detected");
                if (lockAcquired) {
                  await releaseConversationLock(supabase, conversationId);
                }
                return new Response(
                  JSON.stringify({
                    ok: true,
                    skipped: "recent_message_detected",
                    ghost_cleaned: true,
                  }),
                  {
                    headers: {
                      ...corsHeaders,
                      "Content-Type": "application/json",
                    },
                  },
                );
              }

              // TIMEOUT REACHED
              console.log(
                "[uazapi-webhook] question_timeout_no_answer:",
                currentBlock?.id,
              );
              console.log("[uazapi-webhook] question_timeout_execute:", {
                block_id: currentBlock?.id,
                timeout_at: waitingInput?.timeout_at,
                now: new Date().toISOString(),
                timeout_next_block_id: waitingInput?.timeout_next_block_id ||
                  currentBlock?.data?.false_next_block_id ||
                  currentBlock?.data?.timeout_next_block_id,
                is_nnn: (waitingInput?.timeout_next_block_id ||
                  currentBlock?.data?.false_next_block_id ||
                  currentBlock?.data?.timeout_next_block_id) ===
                  "block_1780197052355_26era1814",
              });

              // CRITICAL: Timeout NUNCA pode usar caminhos de sucesso
              // Rules: false_next_block_id -> timeout_next_block_id
              nextBlockId = waitingInput?.timeout_next_block_id ||
                currentBlock?.data?.false_next_block_id ||
                currentBlock?.data?.timeout_next_block_id ||
                null;

              console.log(
                "[uazapi-webhook] question_timeout_next_id:",
                nextBlockId,
              );

              if (!nextBlockId) {
                console.error(
                  "[uazapi-webhook] question_timeout_missing_next_id: no path configured for timeout",
                  {
                    block_id: currentBlock?.id,
                    data: currentBlock?.data,
                  },
                );
                // If no timeout path, we STOP here to avoid sending "success" content by mistake
                if (lockAcquired) {
                  await releaseConversationLock(supabase, conversationId);
                }
                return new Response(
                  JSON.stringify({ ok: true, error: "timeout_no_path" }),
                  {
                    headers: {
                      ...corsHeaders,
                      "Content-Type": "application/json",
                    },
                  },
                );
              }

              // Clear waiting state
              delete flowVariables["__waiting_input"];
              delete flowVariables["waiting_for_input"];

              // Clear lock
              updatedBotLockedUntil = null;
              currentBlock = findBlock(nextBlockId);
            } else {
              // NOT YET TIMEOUT
              console.log("[uazapi-webhook] question_block_still_waiting:", {
                block_id: waitingInput?.block_id,
                timeout_at: waitingInput?.timeout_at,
                remaining_ms: timeoutAtMs - now,
              });
              updatedBotLockedUntil = waitingInput?.timeout_at;
              currentBlock = null; // stop loop
            }
          }

          // 2) Walk passive blocks and emit chunks until we need user input or a release
          let safety = 0;
          if (!isResume && !isNewFunnel) {
            console.log("[uazapi-webhook] funnel_started_normal:", {
              conversation_id: conversationId,
              current_block_id: currentBlock?.id,
            });
          }
          console.log(
            `[uazapi-webhook] funnel_run_loop_start: conversation=${conversationId} start_block=${currentBlock?.id}`,
          );
          let loop_iteration = 0;
          while (currentBlock && safety < 100) {
            safety++;
            loop_iteration++;
            const b = currentBlock;
            console.log(
              `[uazapi-webhook] loop_iteration=${loop_iteration} block_id=${b.id} type=${b.type} data=${
                JSON.stringify(b.data)
              } nextBlockId_before=${nextBlockId}`,
            );

            // STOP GUARD WITHIN LOOP
            const { data: loopConv } = await supabase
              .from("webchat_conversations")
              .select("flow_variables, status")
              .eq("id", conversationId)
              .single();
            
            if (loopConv?.flow_variables?.__manual_stop === true || loopConv?.status !== 'bot_active') {
              console.log(`[uazapi-webhook] loop_break: manual_stop or status_change detected for ${conversationId}`);
              currentBlock = null;
              break;
            }

            switch (String(b.type).toLowerCase()) {
              case "message": {
                if (b.data?.content) {
                  const delay = b.data.delay_ms || 0;
                  const typing_duration_raw = b.data.typing_duration_ms ?? 2000;
                  const show_typing = b.data.show_typing ?? true;
                  
                  // NEW LOGIC: Presence must be part of delay, never sum.
                  const total_wait_ms = delay;
                  const typing_duration = Math.min(typing_duration_raw, total_wait_ms);
                  const payload = { text: replaceVars(b.data.content) };
                  
                  console.log(`[uazapi-webhook] presence_config_loaded: block_id=${b.id} block_type=message show_typing=${show_typing} configured_typing=${typing_duration_raw}ms resolved_typing=${typing_duration}ms total_delay=${total_wait_ms}ms`);
                  if (typing_duration_raw > total_wait_ms) console.log(`[uazapi-webhook] timing_overlap_resolved: block_id=${b.id} typing reduced to match total delay`);

                  chunksToSend.push({
                    type: "text",
                    payload: payload,
                    show_typing: show_typing,
                    typing_duration: typing_duration,
                    delay: pendingDelayMs + total_wait_ms,
                    reply_to_message: b.data.reply_to_message,
                    source_block_id: b.id,
                  });
                }
                pendingDelayMs = 0;
                nextBlockId = b.next_block_id || null;
                currentBlock = findBlock(nextBlockId);
                break;
              }
              case "image": {
                if (b.data?.image_url) {
                  const delay = b.data.delay_ms || 0;
                  const payload = {
                    url: b.data.image_url,
                    type: "image",
                    caption: replaceVars(b.data.content || ""),
                    image_alt: b.data.image_alt,
                  };
                  console.log(
                    `[uazapi-webhook] chunk_push source_block_id=${b.id} type=media_image payload=${
                      JSON.stringify(payload)
                    }`,
                  );
                  chunksToSend.push({
                    type: "media",
                    payload: payload,
                    show_typing: b.data.show_typing,
                    typing_duration: b.data.typing_duration_ms,
                    delay: pendingDelayMs + delay,
                    source_block_id: b.id,
                  });
                }
                pendingDelayMs = 0;
                nextBlockId = b.next_block_id || null;
                currentBlock = findBlock(nextBlockId);
                break;
              }
              case "video": {
                const delay = b.data?.delay_ms || 0;
                const payload = {
                  url: b.data.video_url,
                  type: "video",
                  caption: replaceVars(b.data.content || ""),
                };
                console.log(
                  `[uazapi-webhook] chunk_push source_block_id=${b.id} type=media_video payload=${
                    JSON.stringify(payload)
                  }`,
                );
                if (
                  b.data?.video_url &&
                  (b.data.video_type === "file" || !b.data.video_type)
                ) {
                  chunksToSend.push({
                    type: "media",
                    payload: payload,
                    show_typing: b.data.show_typing,
                    typing_duration: b.data.typing_duration_ms,
                    delay: pendingDelayMs + delay,
                  });
                } else if (b.data?.video_url) {
                  // External link for YouTube/Vimeo
                  const textPayload = {
                    text: (b.data.content
                      ? replaceVars(b.data.content) + "\n"
                      : "") + b.data.video_url,
                  };
                  console.log(
                    `[uazapi-webhook] chunk_push source_block_id=${b.id} type=text_video_link payload=${
                      JSON.stringify(textPayload)
                    }`,
                  );
                  chunksToSend.push({
                    type: "text",
                    payload: textPayload,
                    show_typing: b.data.show_typing,
                    typing_duration: b.data.typing_duration_ms,
                    delay: pendingDelayMs + delay,
                  });
                }
                pendingDelayMs = 0;
                nextBlockId = b.next_block_id || null;
                currentBlock = findBlock(nextBlockId);
                break;
              }
              case "audio": {
                if (b.data?.audio_url) {
                  const delay = b.data.delay_ms || 0;
                  const show_typing = b.data.show_typing ?? true;
                  const typing_duration_raw = b.data.typing_duration_ms ?? 6000;
                  
                  // NEW LOGIC: Presence must be part of delay, never sum.
                  const total_wait_ms = delay;
                  const typing_duration = Math.min(typing_duration_raw, total_wait_ms);
                  
                  console.log(`[uazapi-webhook] presence_config_loaded: block_id=${b.id} block_type=audio show_typing=${show_typing} configured_recording=${typing_duration_raw}ms resolved_recording=${typing_duration}ms total_delay=${total_wait_ms}ms`);
                  if (typing_duration_raw > total_wait_ms) console.log(`[uazapi-webhook] timing_overlap_resolved: block_id=${b.id} recording reduced to match total delay`);

                  chunksToSend.push({
                    type: "audio",
                    payload: {
                      url: b.data.audio_url,
                      ptt: b.data.ptt !== false,
                    },
                    show_typing: show_typing,
                    typing_duration: typing_duration,
                    delay: pendingDelayMs + total_wait_ms,
                  });
                }
                pendingDelayMs = 0;
                nextBlockId = b.next_block_id || null;
                currentBlock = findBlock(nextBlockId);
                break;
              }
              case "document": {
                const docs = b.data?.document_urls || (b.data?.document_url
                  ? [{
                    url: b.data.document_url,
                    name: b.data.file_name || "documento.pdf",
                  }]
                  : []);

                if (docs.length > 0) {
                  const delay = b.data.delay_ms || 0;
                  for (let dIdx = 0; dIdx < docs.length; dIdx++) {
                    const doc = docs[dIdx];
                    chunksToSend.push({
                      type: "media",
                      payload: {
                        url: doc.url,
                        type: "document",
                        fileName: doc.name,
                        caption: dIdx === docs.length - 1
                          ? replaceVars(b.data.content || "")
                          : "",
                      },
                      show_typing: b.data.show_typing,
                      typing_duration: b.data.typing_duration_ms,
                      delay: dIdx === 0 ? pendingDelayMs + delay : 1000, // Small gap between multiple files
                    });
                  }
                } else {
                  console.warn(
                    `[uazapi-webhook] document block skipped: empty document_url(s) (block: ${b.id})`,
                  );
                }
                pendingDelayMs = 0;
                nextBlockId = b.next_block_id || null;
                currentBlock = findBlock(nextBlockId);
                break;
              }
              case "link": {
                if (b.data?.link_url) {
                  const delay = b.data.delay_ms || 0;
                  chunksToSend.push({
                    type: "text",
                    payload: {
                      text: (b.data.link_title
                        ? `*${replaceVars(b.data.link_title)}*\n`
                        : "") +
                        (b.data.link_description
                          ? replaceVars(b.data.link_description) + "\n"
                          : "") +
                        b.data.link_url,
                    },
                    show_typing: b.data.show_typing,
                    typing_duration: b.data.typing_duration_ms,
                    delay: pendingDelayMs + delay,
                  });
                }
                pendingDelayMs = 0;
                nextBlockId = b.next_block_id || null;
                currentBlock = findBlock(nextBlockId);
                break;
              }
              case "pix_button": {
                if (b.data?.pix_key && b.data?.pix_type) {
                  console.log(`[pix_button_block_enter] flow_id=${funnel.id} block_id=${b.id} conversation_id=${conversationId}`);
                  const delay = b.data.delay_ms || 0;
                  
                  const pixPayload = {
                    pixType: b.data.pix_type,
                    pixKey: replaceVars(b.data.pix_key),
                    pixName: replaceVars(b.data.pix_name || "Pix"),
                    merchantName: replaceVars(b.data.pix_name || "Pix"), // UazAPI use merchantName
                    allow_pix_text_fallback: (b.data as any).allow_pix_text_fallback ?? true
                  };

                  console.log(`[pix_button_payload_final] flow_id=${funnel.id} payload=${JSON.stringify(pixPayload)}`);

                  chunksToSend.push({
                    type: "pix_button",
                    payload: pixPayload,
                    show_typing: b.data.show_typing,
                    typing_duration: b.data.typing_duration_ms,
                    delay: pendingDelayMs + delay,
                    source_block_id: b.id
                  });
                } else {
                  console.warn(`[pix_button_validation_failed] flow_id=${funnel.id} block_id=${b.id} - Missing pix_key or pix_type`);
                }
                pendingDelayMs = 0;
                nextBlockId = b.next_block_id || null;
                currentBlock = findBlock(nextBlockId);
                break;
              }
              case "pixel": {
                pixelEnteredThisLoop = true;
                const pageId = b.data?.pixel_page_id;
                const blockPixelId = b.data?.pixel_name || b.data?.pixel_id;
                const eventName = b.data.pixel_event_type || b.data.event_name || "Purchase";
                console.log(`[pixel_block_enter] conversation: ${conversationId}, block: ${b.id}, event: ${eventName}, pageId: ${pageId}, blockPixelId: ${blockPixelId}`);
                
                if (pageId || blockPixelId) {
                  try {
                    // Phase 4: Deduplication
                    // Critério: conversation_id + pixel_block_id
                    const { data: existingPurchase } = await supabase
                      .from("purchase_audit")
                      .select("id")
                      .eq("conversation_id", conversationId)
                      .eq("pixel_block_id", b.id)
                      .eq("purchase_status", "success")
                      .maybeSingle();

                    if (existingPurchase) {
                      console.log(`[pixel_dedup_blocked] PURCHASE_DUPLICATE_BLOCKED for block ${b.id}`);
                      await supabase.from("purchase_audit").insert({
                        conversation_id: conversationId,
                        lead_id: (conv as any).lead_id,
                        pixel_block_id: b.id,
                        event_name: eventName,
                        purchase_status: "duplicate",
                        purchase_source: "webhook"
                      });
                      nextBlockId = b.next_block_id || null;
                      currentBlock = findBlock(nextBlockId);
                      break;
                    }

                    // Phase 5: Validation
                    const valueRaw = b.data.pixel_item_value;
                    let valueStr = valueRaw ? replaceVars(valueRaw) : undefined;
                    
                    if (valueRaw && valueStr === valueRaw && flowVariables[valueRaw] !== undefined) {
                      valueStr = String(flowVariables[valueRaw]);
                    }

                    const numericValue = valueStr ? parseFloat(valueStr.replace(",", ".")) : NaN;
                    if (eventName === "Purchase" && (isNaN(numericValue) || numericValue <= 0)) {
                      console.error(`[pixel_value_invalid] PIXEL_VALUE_INVALID: ${valueStr}`);
                      await supabase.from("purchase_audit").insert({
                        conversation_id: conversationId,
                        lead_id: (conv as any).lead_id,
                        pixel_block_id: b.id,
                        event_name: eventName,
                        purchase_status: "failed",
                        purchase_source: "webhook",
                        error_details: { error_code: "PIXEL_VALUE_INVALID", value: valueStr }
                      });
                      nextBlockId = b.next_block_id || null;
                      currentBlock = findBlock(nextBlockId);
                      break;
                    }

                    // 2. Find integration
                    let query = supabase.from("facebook_lead_integrations").select("pixel_id, pixel_access_token").eq("is_active", true);
                    if (pageId) {
                      query = query.eq("page_id", pageId);
                    } else if (blockPixelId) {
                      query = query.eq("pixel_id", blockPixelId);
                    }

                    const { data: integ } = await query.maybeSingle();

                    if (integ?.pixel_id && integ?.pixel_access_token) {
                      const currency = b.data.pixel_currency || "BRL";
                      const leadPhone = flowVariables["telefone"] || flowVariables["phone"] || remotePhoneCanonical;
                      const leadEmail = flowVariables["email"];
                      const leadName = flowVariables["nome"] || flowVariables["name"] || norm.pushName;

                      const external_id = (conv as any).lead_id;

                      // ──────────────────────────────────────────────────────────
                      // Attribution fallback chain (Phase 2)
                      //   flow_variables → conv.ctwa_data → lead_tracking → leads
                      // Never overwrite a present value with null/empty.
                      // ──────────────────────────────────────────────────────────
                      const fv = flowVariables || {};
                      const convCtwa = ((conv as any).ctwa_data || {}) as Record<string, any>;

                      let leadRow: any = null;
                      let lt: any = null;
                      try {
                        if (external_id) {
                          const { data: lr } = await supabase
                            .from("leads")
                            .select("phone, email, name, fbclid, ctwa_clid, campaign_id, campaign_name, adset_id, adset_name, ad_id, ad_name, ad_headline, ad_source_app, ad_source_url, entry_point_conversion_source, ctwa_detected, created_at")
                            .eq("id", external_id)
                            .maybeSingle();
                          leadRow = lr;

                          const { data: lts } = await supabase
                            .from("lead_tracking")
                            .select("fbclid, ctwa_clid, campaign_id, campaign_name, adset_id, adset_name, ad_id, ad_name, ad_source_id, ad_source_type, ad_source_url, ad_headline, ad_source_app, entry_point_conversion_source, entry_point_conversion_app, source, created_at")
                            .eq("lead_id", external_id)
                            .order("created_at", { ascending: false })
                            .limit(1)
                            .maybeSingle();
                          lt = lts;
                        }
                      } catch (e) {
                        console.error("[pixel_attribution_lookup_failed]", e);
                      }

                      const pick = (...vals: any[]): string | undefined => {
                        for (const v of vals) {
                          if (v !== undefined && v !== null && String(v).trim() !== "" && String(v) !== "undefined" && String(v) !== "null") {
                            return String(v);
                          }
                        }
                        return undefined;
                      };

                      const fbclid     = pick(fv.fbclid,         convCtwa.fbclid,       lt?.fbclid,       leadRow?.fbclid);
                      const ctwa_clid  = pick(fv.ctwa_clid,      convCtwa.ctwa_clid,    lt?.ctwa_clid,    leadRow?.ctwa_clid);
                      const campaign_id   = pick(fv.campaign_id,    lt?.campaign_id,    leadRow?.campaign_id);
                      const campaign_name = pick(fv.campaign_name,  lt?.campaign_name,  leadRow?.campaign_name);
                      const adset_id      = pick(fv.adset_id,       lt?.adset_id,       leadRow?.adset_id);
                      const adset_name    = pick(fv.adset_name,     lt?.adset_name,     leadRow?.adset_name);
                      const ad_id         = pick(fv.ad_id,          lt?.ad_id,          leadRow?.ad_id);
                      const ad_name       = pick(fv.ad_name,        lt?.ad_name,        leadRow?.ad_name);
                      const ad_source_id  = pick(convCtwa.ad_source_id, lt?.ad_source_id);
                      const ad_source_type = pick(convCtwa.ad_source_type, lt?.ad_source_type);
                      const ad_source_url = pick(convCtwa.ad_source_url, lt?.ad_source_url, leadRow?.ad_source_url);
                      const ad_headline   = pick(convCtwa.ad_headline,   lt?.ad_headline,   leadRow?.ad_headline);
                      const entry_point_conversion_source = pick(convCtwa.entry_point_conversion_source, lt?.entry_point_conversion_source, leadRow?.entry_point_conversion_source);
                      const entry_point_conversion_app    = pick(convCtwa.entry_point_conversion_app,    lt?.entry_point_conversion_app);
                      const fbp = pick(fv.fbp, convCtwa.fbp);
                      const client_ip_address = pick(fv.client_ip_address, fv.ip);
                      const client_user_agent = pick(fv.client_user_agent, fv.user_agent);

                      const leadCreatedAt = fv.lead_created_at || leadRow?.created_at;
                      const creationTime = leadCreatedAt ? new Date(leadCreatedAt).getTime() : Date.now();
                      const fbc = fbclid ? `fb.1.${creationTime}.${fbclid}` : undefined;

                      // CTWA evidence → action_source = "chat" (Meta's recommended value for WhatsApp Business)
                      const isCtwa = !!(ctwa_clid || convCtwa.ctwa_payload || entry_point_conversion_source === "ctwa_ad" || leadRow?.ctwa_detected);
                      const action_source = isCtwa ? "chat" : "system_generated";

                      console.log(`[pixel_attribution_resolved] ctwa_clid=${ctwa_clid || "-"} ad_source_id=${ad_source_id || "-"} action_source=${action_source} sources={fv:${!!fv.ctwa_clid},conv:${!!convCtwa.ctwa_clid},lt:${!!lt?.ctwa_clid},lead:${!!leadRow?.ctwa_clid}}`);

                      const result = await sendFacebookConversion(
                        integ.pixel_id,
                        integ.pixel_access_token,
                        eventName,
                        {
                          phone: leadPhone,
                          email: leadEmail,
                          fn: leadName,
                          external_id,
                          fbc,
                          fbp,
                          client_ip_address,
                          client_user_agent,
                        },
                        {
                          value: isNaN(numericValue) ? undefined : numericValue,
                          currency,
                          campaign_id,
                          campaign_name,
                          adset_id,
                          adset_name,
                          ad_id,
                          ad_name,
                          ctwa_clid,
                          ad_source_id,
                          ad_source_type,
                          ad_source_url,
                          ad_headline,
                          entry_point_conversion_source,
                          entry_point_conversion_app,
                        },
                        { actionSource: action_source },
                      );

                      if (healthId) {
                        await updateWebhookHealth(supabase, healthId, {
                          pixel_sent: result.success,
                        });
                      }

                      console.log(`[pixel_payload_final] ${JSON.stringify(result.payload)}`);
                      console.log(`[pixel_meta_response] ${JSON.stringify(result.response)}`);

                      // Phase 2: Purchase Audit (now includes resolved attribution)
                      await supabase.from("purchase_audit").insert({
                        lead_id: external_id,
                        conversation_id: conversationId,
                        flow_execution_id: flowVariables["__flow_execution_id"],
                        connection_id: instance,
                        phone: leadPhone,
                        customer_name: leadName,
                        purchase_value: isNaN(numericValue) ? null : numericValue,
                        currency,
                        campaign_id,
                        campaign_name,
                        adset_id,
                        adset_name,
                        ad_id,
                        ad_name,
                        ctwa_clid,
                        ad_source_id,
                        ad_source_type,
                        entry_point_conversion_source,
                        action_source,
                        pixel_id: integ.pixel_id,
                        event_id: result.payload?.data?.[0]?.event_id,
                        fbtrace_id: result.response?.fbtrace_id,
                        meta_status: result.success ? "success" : "failed",
                        purchase_status: result.success ? "success" : "failed",
                        purchase_source: "webhook",
                        pixel_block_id: b.id,
                        raw_payload: result.payload,
                        raw_response: result.response,
                        error_details: result.success ? null : result.response,
                      });

                      // Keep legacy log for backward compatibility
                      await supabase.from("pixel_event_logs").insert({
                        conversation_id: conversationId,
                        lead_id: external_id,
                        block_id: b.id,
                        event_name: eventName,
                        pixel_id: integ.pixel_id,
                        payload: result.payload,
                        response: result.response,
                        success: result.success,
                      });
                    }
                  } catch (e) {
                    console.error("[facebook-pixel] exception:", e);
                  }
                }
                nextBlockId = b.next_block_id || null;
                currentBlock = findBlock(nextBlockId);
                break;
              }

              case "delay": {
                if (b.data?.is_smart_pause) {
                  const ms = b.data?.delay_ms || 5000;
                  const lockUntil = new Date(Date.now() + ms).toISOString();
                  nextBlockId = b.next_block_id || null;
                  updatedBotLockedUntil = lockUntil;
                  console.log(
                    "[uazapi-webhook] smart pause activated until",
                    lockUntil,
                  );
                  currentBlock = null;
                  break;
                }
                
                let ms = 5000;
                const data = b.data || {};
                const isRandom = data.delay_random !== false; 
                
                if (isRandom) {
                  const min = Number(data.delay_min ?? 5) * 1000;
                  const max = Number(data.delay_max ?? 16) * 1000;
                  ms = Math.floor(Math.random() * (max - min + 1)) + min;
                  console.log(`[uazapi-webhook] timing_block_enter: block_id=${b.id} block_type=delay conversation_id=${conversationId} delay_random=true min=${min/1000}s max=${max/1000}s resolved=${ms/1000}s`);
                } 
                else if (data.delay_seconds !== undefined) {
                  ms = Number(data.delay_seconds) * 1000;
                  console.log(`[uazapi-webhook] timing_block_enter: block_id=${b.id} block_type=delay conversation_id=${conversationId} delay_random=false delay_seconds=${ms/1000}s`);
                }
                else {
                  ms = 5000;
                  console.log(`[uazapi-webhook] timing_block_enter: block_id=${b.id} block_type=delay conversation_id=${conversationId} fallback_delay=5s`);
                }

                // Reset typing configuration for the next block
                pendingDelayMs = ms;
                
                // CRITICAL: A 'delay' block must act as a sequence breaker ONLY if it's very significant (> 15s)
                // so it doesn't just add to pendingDelayMs and get skipped by Edge Function timeout.
                // We increase this threshold because pg_cron runs every 1 minute, which causes huge delays.
                if (ms > 15000) {
                  const lockUntil = new Date(Date.now() + ms).toISOString();
                  nextBlockId = b.next_block_id || null;
                  updatedBotLockedUntil = lockUntil;
                  console.log(`[uazapi-webhook] pause_delay_resolved: block_id=${b.id} resolved_delay=${ms/1000}s significant_delay=true -> scheduling resume via lockUntil`);
                  
                  // NEW: Send presence even during significant delay if requested
                  if (data.show_typing !== false && remoteJid) {
                    const presenceType = data.is_audio_delay ? "recording" : "composing";
                    const presence_payload = {
                      state: presenceType,
                      presence: presenceType,
                      delay: ms,
                      duration_ms: ms,
                      skip_warmup: true,
                    };
                    console.log(`[uazapi-webhook] presence_endpoint_called: block_id=${b.id} presence_type=${presenceType} presence_duration=${ms/1000}s payload=${JSON.stringify(presence_payload)}`);
                    
                    await fetch(`${supabaseUrl}/functions/v1/uazapi-send`, {
                      method: "POST",
                      headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${serviceKey}`,
                        apikey: serviceKey,
                      },
                      body: JSON.stringify({
                        organization_id: (conv as any).organization_id,
                        instance_id: instance.id,
                        type: "presence",
                        to: remoteJid,
                        payload: presence_payload,
                      }),
                    }).catch((e) => console.warn("[uazapi-webhook] presence call failed (significant delay):", e));
                  }

                  pendingDelayMs = 0; // Reset as it's handled by lock
                  currentBlock = null;
                  break;
                }

                nextBlockId = b.next_block_id || null;
                nextBlockId = b.next_block_id || null;

                // Safety: if cumulative delay is too high (> 30s), auto-pause and resume later via cron
                if (pendingDelayMs >= 30000) {
                  const lockUntil = new Date(Date.now() + pendingDelayMs)
                    .toISOString();
                  updatedBotLockedUntil = lockUntil;
                  console.log(
                    `[uazapi-webhook] cumulative delay too high (${pendingDelayMs}ms), auto-pausing until`,
                    lockUntil,
                  );
                  currentBlock = null; // stop loop and persist state
                  break;
                }

                currentBlock = findBlock(nextBlockId);
                break;
              }
              case "question":
              case "input":
              case "pergunta":
              case "user_input":
              case "wait_input":
              case "wait_response":
              case "ia_pergunta": {
                // Idempotency check: if we are already waiting for this block, don't resend
                const existingWaiting = flowVariables["__waiting_input"];
                if (
                  existingWaiting && existingWaiting.block_id === b.id &&
                  existingWaiting.answered === false
                ) {
                  console.log(
                    `[uazapi-webhook] question_already_waiting_skip_resend: block_id=${b.id}`,
                  );
                  currentBlock = null;
                  safety = 1000;
                  break;
                }

                console.log(
                  `[uazapi-webhook] question_block_enter: block_id=${b.id} data=${
                    JSON.stringify(b.data)
                  }`,
                );

                const varName =
                  (b.data?.ia_pergunta_variable || b.data?.variable_name ||
                    b.data?.input_variable || b.data?.name ||
                    b.data?.input_type || "resposta").toString().replace(
                      /{{|}}/g,
                      "",
                    );
                const qContent = b.data?.content ||
                  b.data?.ia_pergunta_question || b.data?.question ||
                  b.data?.message;
                const isResumeLocal = (payload as any).__is_resume;

                // CRITICAL FIX: Clear the variable when entering the block to ensure we wait for fresh input.
                // This prevents the loop from thinking it's already answered if the same variable was used before.
                if (!isResumeLocal) {
                  console.log(
                    `[uazapi-webhook] question_clearing_variable: ${varName}`,
                  );
                  flowVariables[varName] = "waiting..."; // More distinct placeholder
                  flowVariables["resposta"] = "waiting...";
                }

                // React if enabled (only if we have an incoming message to react to)
                if (
                  b.data?.react_to_message && norm.messageId && !isResumeLocal
                ) {
                  const reactionPayload = {
                    reaction: b.data.reaction_emoji || "✅",
                    key: {
                      remoteJid: norm.remoteJid,
                      fromMe: norm.fromMe,
                      id: norm.messageId,
                    },
                  };
                  chunksToSend.push({
                    type: "reaction",
                    payload: reactionPayload,
                    delay: 0,
                    source_block_id: b.id,
                  });
                }

                let qText = "";
                if (qContent && !isResumeLocal) {
                  qText = replaceVars(qContent);
                  const delay = b.data.delay_ms || 0;
                  const textPayload = { text: qText };
                  chunksToSend.push({
                    type: "text",
                    payload: textPayload,
                    show_typing: b.data.show_typing,
                    typing_duration: b.data.typing_duration_ms,
                    delay: pendingDelayMs + delay,
                    reply_to_message: b.data.reply_to_message,
                    source_block_id: b.id,
                  });
                  console.log(
                    "[uazapi-webhook] question_sent_once:",
                    b.id,
                    qText.slice(0, 30),
                  );
                } else if (b.data?.placeholder && !isResumeLocal) {
                  qText = replaceVars(b.data.placeholder);
                  const delay = b.data.delay_ms || 0;
                  const textPayload = { text: qText };
                  chunksToSend.push({
                    type: "text",
                    payload: textPayload,
                    show_typing: b.data.show_typing,
                    typing_duration: b.data.typing_duration_ms,
                    delay: pendingDelayMs + delay,
                    reply_to_message: b.data.reply_to_message,
                  });
                  console.log(
                    "[uazapi-webhook] question_sent_once:",
                    b.id,
                    qText.slice(0, 30),
                  );
                }

                // Timeout setup
                const unit = b.data?.timeout_unit || b.data?.delay_unit ||
                  "minutes";
                const val = b.data?.timeout_value || b.data?.timeout ||
                  b.data?.delay || b.data?.conditional_delay ||
                  (unit === "minutes" ? 1 : 10);
                let ms = Number(val) * 1000;
                if (unit === "minutes") ms *= 60;
                else if (unit === "hours") ms *= 3600;
                else if (unit === "days") ms *= 86400;

                if (b.data?.wait_indefinitely) ms = 365 * 24 * 3600 * 1000;

                const nowTs = Date.now();
                const lockUntil = new Date(nowTs + ms).toISOString();
                updatedBotLockedUntil = lockUntil;

                const success_next_block_id = b.data?.true_next_block_id ||
                  b.data?.success_next_block_id || b.next_block_id || null;
                const timeout_next_block_id = b.data?.timeout_next_block_id ||
                  b.data?.false_next_block_id || null;

                // Explicitly REPLACE waiting state
                flowVariables["waiting_for_input"] = true;
                flowVariables["__waiting_input"] = {
                  block_id: b.id,
                  variable_name: varName,
                  question_sent_at: new Date(nowTs).toISOString(),
                  question_text: qText,
                  timeout_at: lockUntil,
                  is_timeout: false, // Start with false, resume-cron sets to true if it fires

                  success_next_block_id: success_next_block_id,
                  timeout_next_block_id: timeout_next_block_id,
                  question_sent: true,
                  answered: false,
                  answer_text: null,
                  answered_at: null,
                  trigger_message_id: norm.messageId || null,
                };

                console.log("[uazapi-webhook] question_wait_started:", {
                  block_id: b.id,
                  success_next_block_id,
                  timeout_next_block_id,
                  timeout_at: lockUntil,
                  timeoutMs: ms,
                  unit: unit,
                });

                pendingDelayMs = 0;
                nextBlockId = b.id;

                // PERSIST and STOP
                const updatePatch: any = {
                  flow_variables: flowVariables,
                  current_block_id: b.id,
                  flow_completed: false,
                  bot_locked_until: lockUntil,
                };
                await supabase.from("webchat_conversations").update(updatePatch)
                  .eq("id", conversationId);

                console.log(
                  "[uazapi-webhook] question_hard_pause_return:",
                  b.id,
                );

                currentBlock = null;
                safety = 1000;
                break;
              }
              case "buttons": {
                const opts: any[] = b.data?.options || [];
                const header = replaceVars(
                  b.data?.content || "Escolha uma opção:",
                );
                chunksToSend.push({
                  type: "text",
                  payload: {
                    text: header + "\n\n" +
                      opts.map((o: any, i: number) =>
                        `${i + 1}) ${o.emoji ? o.emoji + " " : ""}${o.label}`
                      ).join("\n"),
                  },
                  show_typing: b.data.show_typing,
                  typing_duration: b.data.typing_duration_ms,
                  source_block_id: b.id,
                });
                pendingDelayMs = 0;
                nextBlockId = b.id; // wait here for next user message
                currentBlock = null;
                break;
              }
              case "ai_receipt": {
                // ─────────────────────────────────────────────────────────
                // Fase G.1 — Curto-circuito controlado: consumir resultado
                // oficial da VPS2 (tabela vps_receipt_results). Triplo guard:
                // flag global + allowlist de instância + allowlist de funil.
                // Qualquer falha/timeout → fallback automático ao caminho
                // legado abaixo (fail-open). Nenhuma alteração em Pixel,
                // CAPI, Purchase, Leads, Inbox, Conversations, WhatsApp.
                // ─────────────────────────────────────────────────────────
                try {
                  const { isVpsReceiptEnabled, pollVpsReceiptResult } =
                    await import("../_shared/vps-receipt-bridge.ts");
                  const _gate = isVpsReceiptEnabled(
                    (instance as any)?.name ?? null,
                    (funnel as any)?.name ?? null,
                  );
                  if (!_gate.enabled) {
                    console.log("[VPS_RECEIPT_BYPASS]", JSON.stringify({
                      conversation_id: conversationId,
                      block_id: b.id,
                      reason: _gate.reason,
                      instance: (instance as any)?.name ?? null,
                      funnel: (funnel as any)?.name ?? null,
                    }));
                  } else if (norm.messageId) {
                    const _vps = await pollVpsReceiptResult(supabase, {
                      messageId: String(norm.messageId),
                    });
                    if (!_vps) {
                      console.log("[VPS_RECEIPT_FALLBACK]", JSON.stringify({
                        conversation_id: conversationId,
                        block_id: b.id,
                        reason: "vps_timeout_fallback",
                        message_id: norm.messageId,
                      }));
                    } else if (_vps.is_receipt === false) {
                      console.log("[VPS_RECEIPT_NOT_RECEIPT]", JSON.stringify({
                        conversation_id: conversationId,
                        block_id: b.id,
                        message_id: norm.messageId,
                      }));
                      // VPS classificou como não-comprovante: respeitamos e
                      // caímos no caminho legado (que tem suas próprias
                      // rotinas de objeção/buffer/figurinha etc.).
                    } else {
                      // HIT — usar resultado oficial da VPS2.
                      const _nameVar =
                        b.data?.receipt_name_var || "nomecomprovante";
                      const _valueVar =
                        b.data?.receipt_value_var || "valorcomprovante";
                      const _vpsName = (_vps.customer_name ?? "").toString().trim();
                      const _vpsAmount = _vps.amount != null
                        ? Number(_vps.amount)
                        : null;
                      const _vpsValueStr = _vpsAmount != null && !Number.isNaN(_vpsAmount)
                        ? _vpsAmount.toFixed(2)
                        : "";

                      flowVariables[_nameVar] = _vpsName;
                      flowVariables[_valueVar] = _vpsValueStr;
                      (flowVariables as any).comprovante_identified = true;
                      flowVariables["ai.response"] = "";

                      if (!Array.isArray(flowVariables["__consumed_input_message_ids"])) {
                        flowVariables["__consumed_input_message_ids"] = [];
                      }
                      if (
                        norm.messageId &&
                        !flowVariables["__consumed_input_message_ids"].includes(norm.messageId)
                      ) {
                        flowVariables["__consumed_input_message_ids"].push(norm.messageId);
                      }

                      // Limpa estados de espera/buffer relacionados a este bloco.
                      try {
                        delete (flowVariables as any).__waiting_input;
                        delete (flowVariables as any).waiting_for_input;
                        delete (flowVariables as any).waiting_question_sent_at;
                        if ((flowVariables as any).__pending_receipt_media) {
                          delete (flowVariables as any).__pending_receipt_media;
                        }
                      } catch (_) { /* noop */ }

                      // Atualiza metadata do lead (best-effort).
                      if ((conv as any).lead_id) {
                        try {
                          const { data: _lead } = await supabase
                            .from("leads")
                            .select("metadata")
                            .eq("id", (conv as any).lead_id)
                            .single();
                          await supabase.from("leads").update({
                            metadata: {
                              ...(_lead?.metadata || {}),
                              [_nameVar]: _vpsName,
                              [_valueVar]: _vpsValueStr,
                              last_receipt_at: new Date().toISOString(),
                              last_receipt_source: "vps2-pilot",
                            },
                          }).eq("id", (conv as any).lead_id);
                        } catch (_leadErr) { /* best-effort */ }
                      }

                      const _vpsNext =
                        b.data?.receipt_success_block_id ||
                        b.data?.true_next_block_id ||
                        b.next_block_id ||
                        null;

                      // Checkpoint imediato — evita race com 2º webhook.
                      try {
                        await supabase
                          .from("webchat_conversations")
                          .update({
                            current_block_id: _vpsNext,
                            flow_variables: flowVariables,
                            updated_at: new Date().toISOString(),
                          })
                          .eq("id", conversationId);
                      } catch (_persistErr) {
                        console.warn(
                          "[VPS_RECEIPT_PERSIST_FAILED]",
                          (_persistErr as Error)?.message,
                        );
                      }

                      console.log("[VPS_RECEIPT_HIT]", JSON.stringify({
                        conversation_id: conversationId,
                        block_id: b.id,
                        message_id: norm.messageId,
                        pix_id: _vps.pix_id,
                        amount: _vpsValueStr,
                        customer_name: _vpsName?.slice(0, 60),
                        next_block_id: _vpsNext,
                        confidence: _vps.confidence,
                        source: "vps2-pilot",
                      }));

                      (receiptRecognizedThisLoop as any) = true;
                      nextBlockId = _vpsNext;
                      currentBlock = _vpsNext ? findBlock(_vpsNext) : null;
                      break;
                    }
                  }
                } catch (_vpsErr) {
                  console.warn(
                    "[VPS_RECEIPT_BRIDGE_ERROR]",
                    (_vpsErr as Error)?.message,
                  );
                  // segue para o caminho legado abaixo
                }
                // ─────────────────────────────────────────────────────────
                // Caminho legado original (inalterado a partir daqui).
                // ─────────────────────────────────────────────────────────
                // ───────────────────────────────────────────────────────
                // [AI_RECEIPT_PENDING_MEDIA_REPLAY] Recupera comprovante
                // enviado pelo lead ANTES do flow chegar aqui.
                // Se a mensagem atual não trouxe mídia mas o buffer tem
                // um PDF/imagem válido (<10 min), reinjeta em norm.media
                // para que a recognition pipeline normal o processe.
                // ───────────────────────────────────────────────────────
                let _replayedFromPending = false;
                try {
                  const pending: any =
                    (flowVariables as any).__pending_receipt_media;
                  const hasIncomingMedia = !!(norm as any)?.media;
                  if (pending && pending.url && !hasIncomingMedia) {
                    const ageMs = Date.now() -
                      new Date(pending.received_at || 0).getTime();
                    if (ageMs >= 0 && ageMs <= 10 * 60 * 1000) {
                      (norm as any).media = {
                        type: pending.type || "document",
                        url: pending.url,
                        mime: pending.mime,
                        caption: "",
                        needsDownload: false,
                      };
                      _replayedFromPending = true;
                      console.log("[AI_RECEIPT_PENDING_MEDIA_REPLAY]",
                        JSON.stringify({
                          conversation_id: conversationId,
                          block_id: b.id,
                          age_ms: ageMs,
                          media: pending,
                        }));
                    } else {
                      console.log("[AI_RECEIPT_PENDING_MEDIA_EXPIRED]",
                        JSON.stringify({
                          conversation_id: conversationId,
                          block_id: b.id,
                          age_ms: ageMs,
                          received_at: pending.received_at,
                        }));
                      delete (flowVariables as any).__pending_receipt_media;
                    }
                  }
                } catch (replayErr) {
                  console.warn("[AI_RECEIPT_PENDING_MEDIA_REPLAY_FAILED]",
                    String(replayErr));
                }

                // ───────────────────────────────────────────────────────
                // [COMPROVANTE_UNSUPPORTED_MEDIA_IGNORED]
                // Guarda restrita ao bloco ai_receipt: figurinhas (sticker),
                // image/webp, image/gif, vídeo sem caption útil e
                // application/octet-stream com extensão .gif/.webp NÃO
                // disparam OCR/vision/IA, não avançam o funil e não são
                // salvos como __pending_receipt_media. No máximo 1 resposta
                // fixa por inbound (idempotência 5 min).
                // JPG/JPEG/PNG/PDF de comprovante real seguem intactos.
                // ───────────────────────────────────────────────────────
                try {
                  const _mediaAny: any = (norm as any)?.media;
                  if (_mediaAny && !_replayedFromPending) {
                    const _mediaMime = String(_mediaAny?.mime || _mediaAny?.mimetype || "")
                      .toLowerCase().split(";")[0].trim();
                    const _mediaType = String(_mediaAny?.type || "").toLowerCase();
                    const _mediaUrl = String(_mediaAny?.url || "");
                    const _mediaCaption = String(
                      _mediaAny?.caption || (typeof norm.content === "string" ? norm.content : "") || ""
                    ).trim();
                    const _isSticker = _mediaAny?.isSticker === true
                      || _mediaType === "sticker"
                      || !!_mediaAny?.rawMessage?.stickerMessage;
                    const _isWebp = _mediaMime === "image/webp";
                    const _isGif = _mediaMime === "image/gif" || _mediaAny?.isGif === true;
                    const _isVideoNoCaption = (_mediaType === "video" || _mediaMime.startsWith("video/"))
                      && _mediaCaption.length < 3;
                    const _isOctetSusp = _mediaMime === "application/octet-stream"
                      && /\.(gif|webp)(\?|#|$)/i.test(_mediaUrl);
                    const _isUnsupportedReceipt = _isSticker || _isWebp || _isGif
                      || _isVideoNoCaption || _isOctetSusp;

                    if (_isUnsupportedReceipt) {
                      const _inboundMsgId = norm.messageId || "no_msg_id";
                      const _unsupKey =
                        `unsupported_media::${conversationId}::${_inboundMsgId}`;
                      let _alreadyHandled = false;
                      try {
                        _alreadyHandled = await isDuplicateResponse(
                          supabase, conversationId, _unsupKey, 300_000,
                        );
                      } catch (_) { _alreadyHandled = false; }

                      console.log("[COMPROVANTE_UNSUPPORTED_MEDIA_IGNORED]",
                        JSON.stringify({
                          conversation_id: conversationId,
                          block_id: b.id,
                          inbound_message_id: _inboundMsgId,
                          mime: _mediaMime,
                          type: _mediaType,
                          sticker: _isSticker,
                          gif: _isGif,
                          webp: _isWebp,
                          video_no_caption: _isVideoNoCaption,
                          octet_susp: _isOctetSusp,
                          idempotent_block: _alreadyHandled,
                        }));

                      // Marca inbound como consumido para que nenhum outro
                      // bloco/orquestrador reprocesse esta mensagem.
                      if (!Array.isArray(flowVariables["__consumed_input_message_ids"])) {
                        flowVariables["__consumed_input_message_ids"] = [];
                      }
                      if (norm.messageId
                        && !flowVariables["__consumed_input_message_ids"].includes(norm.messageId)) {
                        flowVariables["__consumed_input_message_ids"].push(norm.messageId);
                      }
                      // Garante que não fica buffer pendente desta mídia inválida.
                      if ((flowVariables as any).__pending_receipt_media) {
                        delete (flowVariables as any).__pending_receipt_media;
                      }

                      if (!_alreadyHandled) {
                        const _fixedMsg = "Não consegui identificar o comprovante nessa imagem. Pode me enviar o print ou foto do comprovante Pix, por favor? 🙏";
                        chunksToSend.push({
                          type: "text",
                          payload: { text: _fixedMsg },
                          source_block_id: b.id,
                          delay: pendingDelayMs,
                        });
                        pendingDelayMs = 0;
                        try {
                          await recordSentResponse(supabase, conversationId, _unsupKey);
                        } catch (_) { /* best-effort */ }
                      }

                      // Permanece no bloco; não chama IA/OCR; não avança.
                      nextBlockId = b.id;
                      try {
                        await supabase.from("webchat_conversations").update({
                          flow_variables: flowVariables,
                          current_block_id: b.id,
                          flow_completed: false,
                        }).eq("id", conversationId);
                      } catch (_persistErr) {
                        console.warn("[COMPROVANTE_UNSUPPORTED_MEDIA_PERSIST_FAILED]",
                          String(_persistErr));
                      }
                      currentBlock = null;
                      safety = 1000;
                      break;
                    }
                  }
                } catch (_unsupErr) {
                  console.warn("[COMPROVANTE_UNSUPPORTED_MEDIA_GUARD_FAILED]",
                    String(_unsupErr));
                }



                // Se acabamos de chegar neste bloco vindo de outro, enviia instrução e PAUSA para aguardar.
                // Mas se b.id já era o current_block_id da conversa, significa que o usuário ACABOU de enviar
                // a resposta (comprovante/texto/áudio) e agora devemos processar com IA.
                // MELHORIA: Se acabamos de receber uma mensagem do lead, não pausamos, processamos imediatamente.
                // [FASE 2.2] Impede reuso de mensagem já consumida por bloco de entrada anterior
                // no mesmo ciclo (ex.: wait_response → ai_receipt). Sem isso, o ai_receipt
                // processaria imediatamente a mensagem que acabou de ser gravada em "resposta".
                const _consumedIdsForFresh = Array.isArray(flowVariables["__consumed_input_message_ids"])
                  ? flowVariables["__consumed_input_message_ids"]
                  : [];
                const _msgAlreadyConsumed = !!(norm.messageId && _consumedIdsForFresh.includes(norm.messageId));
                const _msgIsPriorAnswer = !!(
                  norm.messageId &&
                  flowVariables["__waiting_input"]?.answer_message_id === norm.messageId &&
                  flowVariables["__waiting_input"]?.block_id !== b.id
                );
                // Replay de mídia pendente conta como "fresh lead message" para
                // que o flow processe o comprovante imediatamente em vez de pausar.
                const hasFreshLeadMessage = _replayedFromPending || (
                  isLeadMessage && !isResume && !isNewFunnel
                    && !_msgAlreadyConsumed && !_msgIsPriorAnswer
                );
                if (_msgAlreadyConsumed || _msgIsPriorAnswer) {
                  console.log("[AI_RECEIPT_PRIOR_MESSAGE_IGNORED]", JSON.stringify({
                    conversation_id: conversationId,
                    block_id: b.id,
                    message_id: norm.messageId,
                    reason: _msgAlreadyConsumed ? "already_consumed" : "prior_answer_message_id",
                  }));
                }
                if (b.id !== (conv as any).current_block_id && !hasFreshLeadMessage) {
                  if (b.data?.content) {
                    chunksToSend.push({
                      type: "text",
                      payload: { text: replaceVars(b.data.content) },
                      show_typing: b.data?.show_typing,
                      typing_duration: b.data?.typing_duration_ms,
                      delay: pendingDelayMs,
                    });
                  }

                  // Timeout opt-in: só ativa quando explicitamente habilitado pelo editor.
                  // Caso contrário, mantém o comportamento legado (sem timeout, sem lock).
                  const timeoutEnabled = b.data?.timeout_enabled === true;
                  const timeoutValRaw = Number(b.data?.timeout_value);
                  const timeoutValid = timeoutEnabled && Number.isFinite(timeoutValRaw) && timeoutValRaw > 0;

                  let lockUntil: string | null = null;
                  let timeoutAtIso: string | null = null;
                  let timeoutMs = 0;
                  let timeoutUnit = "";
                  if (timeoutValid) {
                    timeoutUnit = b.data?.timeout_unit || "minutes";
                    let ms = timeoutValRaw * 1000;
                    if (timeoutUnit === "minutes") ms *= 60;
                    else if (timeoutUnit === "hours") ms *= 3600;
                    else if (timeoutUnit === "days") ms *= 86400;
                    timeoutMs = ms;
                    lockUntil = new Date(Date.now() + ms).toISOString();
                    timeoutAtIso = lockUntil;
                    updatedBotLockedUntil = lockUntil;
                  } else {
                    updatedBotLockedUntil = null; // legado: não trava o bot
                  }

                  // Saída cinza dedicada: APENAS timeout_next_block_id.
                  // false_next_block_id continua exclusivo da saída vermelha (resposta inválida).
                  const timeoutNextBlockId = timeoutValid
                    ? (b.data?.timeout_next_block_id || null)
                    : null;

                  const nowTs = Date.now();
                  flowVariables["waiting_for_input"] = true;
                  flowVariables["__waiting_input"] = {
                    block_id: b.id,
                    variable_name: b.data?.receipt_variable_name || "resposta",
                    question_sent_at: new Date(nowTs - 2000).toISOString(), // Subtract 2s to allow immediate response matching
                    question_text: b.data?.content ? replaceVars(b.data.content) : "Aguardando comprovante",
                    timeout_at: timeoutAtIso,
                    is_timeout: false,

                    success_next_block_id: b.data?.true_next_block_id || b.next_block_id || null,
                    timeout_next_block_id: timeoutNextBlockId,
                    question_sent: true,
                    answered: false,
                    trigger_message_id: norm.messageId || null,
                  };

                  console.log("[AI_RECEIPT_WAIT_START]", JSON.stringify({
                    conversation_id: conversationId,
                    lead_id: (conv as any).lead_id || null,
                    funnel_id: (conv as any).current_flow_id || null,
                    block_id: b.id,
                    timeout_enabled: timeoutEnabled,
                    timeout_at: timeoutAtIso,
                    current_block_id: b.id,
                    next_block_id: b.id,
                  }));
                  if (timeoutValid) {
                    console.log("[AI_RECEIPT_TIMEOUT_SCHEDULED]", JSON.stringify({
                      conversation_id: conversationId,
                      lead_id: (conv as any).lead_id || null,
                      funnel_id: (conv as any).current_flow_id || null,
                      block_id: b.id,
                      timeout_at: timeoutAtIso,
                      timeout_ms: timeoutMs,
                      timeout_unit: timeoutUnit,
                      timeout_next_block_id: timeoutNextBlockId,
                    }));
                  }

                  pendingDelayMs = 0;
                  nextBlockId = b.id; // estaciona aqui para aguardar a próxima mensagem do lead

                  // PERSIST and STOP
                  await supabase.from("webchat_conversations").update({
                    flow_variables: flowVariables,
                    current_block_id: b.id,
                    flow_completed: false,
                    bot_locked_until: lockUntil,
                  }).eq("id", conversationId);

                  currentBlock = null;
                  safety = 1000;
                  break;
                }

                const receiptVar = b.data?.receipt_variable_name || "resposta";
                const contentVal = flowVariables[receiptVar] ||
                  flowVariables["resposta"] ||
                  processedContent || norm.content || "";
                
                // Extração robusta de mídia da variável ou do payload atual
                let mediaFromVar = null;
                try {
                  // Se for string que parece JSON, tenta parsear
                  const valToParse = typeof contentVal === "string" && (contentVal.trim().startsWith("{") || contentVal.trim().startsWith("["))
                    ? JSON.parse(contentVal)
                    : contentVal;
                    
                  if (valToParse && typeof valToParse === "object" && !Array.isArray(valToParse)) {
                    // Se já for o objeto normalizado que salvamos no CRM
                    if (valToParse.type) {
                      mediaFromVar = { ...valToParse };
                      
                      // UazAPI salva o JSON bruto da mídia no campo 'text' às vezes
                      if (typeof mediaFromVar.text === "string" && mediaFromVar.text.trim().startsWith("{")) {
                        try {
                          const inner = JSON.parse(mediaFromVar.text);
                          if (inner.URL || inner.url || inner.directPath || inner.imageMessage || inner.audioMessage) {
                            mediaFromVar.url = inner.URL || inner.url || inner.directPath || mediaFromVar.url;
                            mediaFromVar.rawMessage = inner.imageMessage || inner.audioMessage || inner.documentMessage || inner;
                          }
                        } catch (_) { /* ignore */ }
                      }
                      
                      // Se o objeto tiver media_url em vez de url (compatibilidade CRM)
                      if (mediaFromVar.media_url && !mediaFromVar.url) {
                        mediaFromVar.url = mediaFromVar.media_url;
                      }
                    } 
                    // Se for o objeto de mídia bruto do WhatsApp (ex: imageMessage)
                    else {
                      const whatsappMedia = valToParse.imageMessage || valToParse.audioMessage || valToParse.documentMessage || (valToParse.url ? valToParse : null);
                      if (whatsappMedia) {
                        mediaFromVar = {
                          type: valToParse.imageMessage ? "image" : (valToParse.audioMessage ? "audio" : (valToParse.documentMessage ? "document" : "image")),
                          url: whatsappMedia.url || whatsappMedia.URL || whatsappMedia.directPath,
                          rawMessage: whatsappMedia,
                          mime: whatsappMedia.mimetype
                        };
                      }
                    }
                  }
                } catch (_) { /* não é JSON ou erro no parse */ }

                const effectiveMedia = norm.media || (mediaFromVar ? {
                  type: mediaFromVar.type || "image",
                  url: mediaFromVar.url || mediaFromVar.media_url,
                  caption: mediaFromVar.caption || mediaFromVar.text || "",
                  mime: mediaFromVar.mime || (mediaFromVar.type === "image" ? "image/jpeg" : undefined),
                  base64: mediaFromVar.base64 || mediaFromVar.media,
                  rawMessage: mediaFromVar.rawMessage,
                  messageId: mediaFromVar.message_id || mediaFromVar.messageId
                } : null);

                // Melhoria na extração do texto da variável para não confundir a IA com JSON bruto
                let contentText = (typeof contentVal === "string" && !contentVal.trim().startsWith("{"))
                  ? contentVal
                  : (contentVal?.text || (effectiveMedia ? `[Arquivo de mídia enviado: ${effectiveMedia.type}]` : String(contentVal)));
                
                // Se a variável 'resposta' for um PDF enviado pelo bot (ex: link do drive), ignore para não confundir
                if (typeof contentText === "string" && contentText.includes("drive.google.com")) {
                  contentText = "[Link de material enviado anteriormente]";
                }

                // [FASE 1] Detectar OCR/multimodal já presente em processedContent/norm.content e
                // substituir o JSON cru da mídia (URL/mediaKey/SHA) por texto OCR legível.
                const ocrCandidate: string = (typeof processedContent === "string" && processedContent.trim().length > 0
                  ? processedContent
                  : (typeof norm.content === "string" ? norm.content : "")) || "";
                const looksLikeOcr = /🖼️|Valor\s*:|Pagador\s*:|Comprovante|Pix|PIX/i.test(ocrCandidate)
                  && !ocrCandidate.trim().startsWith("{")
                  && !/mediaKey|fileSHA256|mmg\.whatsapp\.net/i.test(ocrCandidate);
                const contentTextLooksLikeMediaJson = typeof contentText === "string"
                  && (/mediaKey|fileSHA256|mmg\.whatsapp\.net|directPath/i.test(contentText)
                      || (contentText.trim().startsWith("{") && /"URL"|"url"/.test(contentText)));
                if (looksLikeOcr && contentTextLooksLikeMediaJson) {
                  console.log("[AI_RECEIPT_OCR_TEXT_DETECTED]", { ocr_len: ocrCandidate.length });
                  console.log("[AI_RECEIPT_MEDIA_JSON_SUPPRESSED]", { original_len: (contentText as string).length });
                  contentText = ocrCandidate;
                }

                const normalizeDeterministicReceiptValue = (rawValue: string): string => {
                  let cleaned = String(rawValue || "").replace(/[^\d.,]/g, "").trim();
                  if (!cleaned) return "";
                  const lastComma = cleaned.lastIndexOf(",");
                  const lastDot = cleaned.lastIndexOf(".");
                  if (lastComma >= 0 && lastDot >= 0) {
                    cleaned = lastComma > lastDot
                      ? cleaned.replace(/\./g, "").replace(",", ".")
                      : cleaned.replace(/,/g, "");
                  } else if (lastComma >= 0) {
                    cleaned = cleaned.replace(",", ".");
                  }
                  const parsed = parseFloat(cleaned);
                  return Number.isFinite(parsed) && parsed > 0 ? parsed.toFixed(2) : "";
                };

                const extractDeterministicReceiptFromOcr = (ocrText: string) => {
                  const text = String(ocrText || "");
                  // [FASE 2.1] Tolerar markdown: **Valor:** 316.00 | Valor:** 316.00 | Valor: **316.00**
                  // e variações de label para o pagador: "Nome do Pagador" | "Pagador" | "Nome"
                  const valueRe = /(?:^|\n|\b)(?:[-•*]\s*)?(?:\d+[.)]\s*)?\*{0,2}\s*Valor(?:\s+(?:pago|total|do\s+pagamento))?\s*\*{0,2}\s*[:\-]\s*\*{0,2}\s*(?:R\$\s*)?([0-9][0-9.,]*)\s*\*{0,2}/i;
                  const nameRe = /(?:^|\n)\s*(?:[-•*]\s*)?(?:\d+[.)]\s*)?\*{0,2}\s*(?:Nome\s+do\s+Pagador|Pagador|Nome)\s*\*{0,2}\s*[:\-]\s*\*{0,2}\s*([^\n\r]+)/i;
                  const valueMatch = text.match(valueRe);
                  const nameMatch = text.match(nameRe);
                  const extractedValue = valueMatch ? normalizeDeterministicReceiptValue(valueMatch[1]) : "";
                  const extractedName = nameMatch
                    ? String(nameMatch[1] || "")
                      .replace(/\*{1,2}/g, "")
                      .replace(/\s+(?:\d+[.)]\s*)?(?:Data(?:\s+e\s+Hora)?|Valor|CPF|CNPJ|Banco)\b.*$/i, "")
                      .trim()
                    : "";
                  const hasReceiptSignals = /\*{0,2}\s*Valor\s*\*{0,2}\s*:|\*{0,2}\s*(?:Nome\s+do\s+)?Pagador\s*\*{0,2}\s*:|\*{0,2}\s*Data\s+e\s+Hora\s*\*{0,2}\s*:/i.test(text);
                  const rawMatchText = `${valueMatch?.[0] || ""} ${nameMatch?.[0] || ""}`;
                  const hasMarkdown = /\*\*/.test(rawMatchText);
                  if (extractedValue || extractedName) {
                    console.log("[AI_RECEIPT_MARKDOWN_REGEX_MATCH]", {
                      has_markdown: hasMarkdown,
                      raw_value: valueMatch?.[1] || "",
                      raw_name: nameMatch?.[1]?.slice(0, 80) || "",
                      value: extractedValue,
                      name: extractedName,
                    });
                  }
                  return {
                    source_len: text.length,
                    has_receipt_signals: hasReceiptSignals,
                    has_date: /Data\s+e\s+Hora\s*\*{0,2}\s*:/i.test(text),
                    raw_value: valueMatch?.[1] || "",
                    value: extractedValue,
                    name: extractedName,
                  };
                };

                const deterministicOcrText = [processedContent, norm.content, contentText]
                  .filter((part) => typeof part === "string" && part.trim().length > 0 && !part.trim().startsWith("{"))
                  .join("\n");
                const deterministicExtraction = extractDeterministicReceiptFromOcr(deterministicOcrText);
                console.log("[AI_RECEIPT_DETERMINISTIC_EXTRACTION]", deterministicExtraction);

                // ───────────────────────────────────────────────────────────
                // [AI_RECEIPT_DETERMINISTIC_SHORTCUT] — Atalho conservador (A)
                // Quando o OCR/texto já trouxer COMPROVANTE IDENTIFICADO com
                // valor + nome válidos e o valor casar com a lista aceita pelo
                // bloco/funil/produto, segue rota verde SEM chamar IA.
                // Não interfere em mídia/IA quando os critérios não baterem.
                // ───────────────────────────────────────────────────────────
                const _auditReceipt = async (payload: Record<string, any>) => {
                  try {
                    await supabase.from("ai_receipt_audits").insert({
                      conversation_id: conversationId,
                      lead_id: (conv as any).lead_id || null,
                      organization_id: (conv as any).organization_id || null,
                      funnel_id: (conv as any).current_flow_id || null,
                      block_id: b.id,
                      message_id: norm.messageId || null,
                      ocr_text_preview: String(deterministicOcrText || "").slice(0, 500),
                      ...payload,
                    });
                  } catch (_auditErr) { /* best-effort */ }
                };

                await _auditReceipt({
                  source: "enter",
                  decision: "ai_receipt_enter",
                  metadata: {
                    has_media: !!(norm as any)?.media,
                    replayed_from_pending: _replayedFromPending,
                    det_value: deterministicExtraction.value,
                    det_name_len: (deterministicExtraction.name || "").length,
                    det_has_signals: deterministicExtraction.has_receipt_signals,
                  },
                });

                try {
                  const _detVal = parseFloat(String(deterministicExtraction.value || "").replace(",", "."));
                  const _detName = String(deterministicExtraction.name || "").trim();
                  const _ocrText = String(deterministicOcrText || "");
                  const _extSignalsRe = /COMPROVANTE IDENTIFICADO|Valor\s*:|Nome do Pagador|Pagador\s*:|Pix Enviado|Efetivada|ID transa[cç][aã]o|Institui[cç][aã]o/i;
                  const _hasSignals = _extSignalsRe.test(_ocrText) || deterministicExtraction.has_receipt_signals === true;

                  const _shortAckRe = /^(obg|obgda|obrigad[ao]|j[áa]\s*mandei|enviei|ok|valeu|tmj|mandei|pronto)\b\.?$/i;
                  const _curText = String((norm as any)?.content || "").trim();
                  const _curIsShortAck =
                    _curText.length > 0 && _curText.length <= 25 &&
                    _shortAckRe.test(_curText) && !_extSignalsRe.test(_curText);

                  // Lista de valores aceitos: prioriza config do bloco, depois
                  // parsing dos R$ X,XX do receipt_prompt.
                  const _parseBRLNumbers = (txt: string): number[] => {
                    const out: number[] = [];
                    const re = /R\$\s*([0-9]+(?:\.[0-9]{3})*(?:[.,][0-9]{1,2})?)/g;
                    let m: RegExpExecArray | null;
                    while ((m = re.exec(txt || ""))) {
                      let raw = m[1];
                      if (raw.includes(",") && raw.includes(".")) raw = raw.replace(/\./g, "").replace(",", ".");
                      else if (raw.includes(",")) raw = raw.replace(",", ".");
                      const v = parseFloat(raw);
                      if (Number.isFinite(v) && v > 0) out.push(Number(v.toFixed(2)));
                    }
                    return Array.from(new Set(out));
                  };
                  let _acceptedValues: number[] = [];
                  const _accRaw: any = b.data?.accepted_values;
                  if (Array.isArray(_accRaw)) {
                    _acceptedValues = _accRaw
                      .map((v: any) => parseFloat(String(v).replace(",", ".")))
                      .filter((n: number) => Number.isFinite(n) && n > 0)
                      .map((n: number) => Number(n.toFixed(2)));
                  }
                  if (_acceptedValues.length === 0 && b.data?.expected_value != null) {
                    const ev = parseFloat(String(b.data.expected_value).replace(",", "."));
                    if (Number.isFinite(ev) && ev > 0) _acceptedValues = [Number(ev.toFixed(2))];
                  }
                  if (_acceptedValues.length === 0 && typeof b.data?.receipt_prompt === "string") {
                    _acceptedValues = _parseBRLNumbers(b.data.receipt_prompt);
                  }

                  if (_hasSignals && _detName.length >= 3 && Number.isFinite(_detVal) && _detVal > 0) {
                    await _auditReceipt({
                      source: "deterministic",
                      identified: false,
                      name: _detName,
                      value: _detVal.toFixed(2),
                      decision: "deterministic_extracted",
                      metadata: { accepted_values: _acceptedValues, cur_text: _curText.slice(0, 80) },
                    });

                    if (_curIsShortAck) {
                      console.log("[AI_RECEIPT_DETERMINISTIC_SHORT_ACK_IGNORED]", {
                        value: _detVal, name: _detName.slice(0, 40), cur_text: _curText.slice(0, 40),
                      });
                      await _auditReceipt({
                        source: "deterministic", identified: false, name: _detName, value: _detVal.toFixed(2),
                        route: "stay", decision: "ignored_short_ack_over_ocr",
                        metadata: { cur_text: _curText.slice(0, 80) },
                      });
                      // Segue para o fluxo IA normal abaixo (não força break).
                    } else {
                      // [FIX pague-o-que-puder] Aceitar QUALQUER valor positivo desde que
                      // haja evidências de comprovante + nome (>=3) + valor > 0. A lista
                      // accepted_values é apenas informativa e não bloqueia rota verde.
                      const _matched = _acceptedValues.length === 0
                        ? null
                        : _acceptedValues.find((av) => Math.abs(av - _detVal) <= 0.01);

                      console.log("[DEPLOY_MARKER_ANY_AMOUNT_ACTIVE]", { build: "6f860259", ts: new Date().toISOString() });
                      console.log("[AI_RECEIPT_VALUE_ACCEPTED_ANY_AMOUNT]", {
                        value: _detVal, accepted_values: _acceptedValues, matched_value: _matched,
                      });
                      await _auditReceipt({
                        source: "deterministic", identified: true, name: _detName, value: _detVal.toFixed(2),
                        route: "info", decision: "receipt_value_accepted_any_amount",
                        metadata: { accepted_values: _acceptedValues, matched_value: _matched },
                      });

                      {
                        // Idempotência por hash do OCR (10 min).
                        let _ocrHash = "";
                        try {
                          const _buf = await crypto.subtle.digest(
                            "SHA-256", new TextEncoder().encode(_ocrText.slice(0, 500)),
                          );
                          _ocrHash = Array.from(new Uint8Array(_buf))
                            .map((x) => x.toString(16).padStart(2, "0")).join("").slice(0, 32);
                        } catch (_) { _ocrHash = String(Date.now()); }
                        const _detKey = `ai_receipt_deterministic::${conversationId}::${_ocrHash}`;

                        let _dup = false;
                        try { _dup = await isDuplicateResponse(supabase, conversationId, _detKey, 600_000); } catch (_) {}
                        if (_dup) {
                          console.log("[AI_RECEIPT_DETERMINISTIC_DEDUP_BLOCKED]", { key: _detKey });
                          await _auditReceipt({
                            source: "deterministic", identified: true, name: _detName, value: _detVal.toFixed(2),
                            route: "none", decision: "deterministic_dedup_blocked",
                            metadata: { ocr_hash: _ocrHash },
                          });
                          // Não chama IA, não avança, fica no bloco.
                          nextBlockId = b.id;
                          currentBlock = null;
                          safety = 1000;
                          break;
                        }
                        try { await recordSentResponse(supabase, conversationId, _detKey); } catch (_) {}

                        const _nameVar = b.data?.receipt_name_var || "nomecomprovante";
                        const _valueVar = b.data?.receipt_value_var || "valorcomprovante";
                        const _finalValue = _detVal.toFixed(2);
                        flowVariables[_nameVar] = _detName;
                        flowVariables[_valueVar] = _finalValue;
                        (flowVariables as any).comprovante_identified = true;
                        flowVariables["ai.response"] = "";

                        if (!Array.isArray(flowVariables["__consumed_input_message_ids"])) {
                          flowVariables["__consumed_input_message_ids"] = [];
                        }
                        if (norm.messageId && !flowVariables["__consumed_input_message_ids"].includes(norm.messageId)) {
                          flowVariables["__consumed_input_message_ids"].push(norm.messageId);
                        }

                        if ((conv as any).lead_id) {
                          try {
                            const { data: _lead } = await supabase.from("leads")
                              .select("metadata").eq("id", (conv as any).lead_id).single();
                            await supabase.from("leads").update({
                              metadata: {
                                ...(_lead?.metadata || {}),
                                [_nameVar]: _detName,
                                [_valueVar]: _finalValue,
                                last_receipt_at: new Date().toISOString(),
                              },
                            }).eq("id", (conv as any).lead_id);
                          } catch (_leadErr) { /* best-effort */ }
                        }

                        const _greenNext = b.data?.true_next_block_id || b.next_block_id || null;
                        console.log("[AI_RECEIPT_DETERMINISTIC_GREEN_ROUTE]", {
                          conversation_id: conversationId,
                          block_id: b.id,
                          value: _finalValue,
                          name: _detName.slice(0, 60),
                          next_block_id: _greenNext,
                          matched_value: _matched,
                        });
                        console.log("[AI_RECEIPT_ROUTE_DECISION]", JSON.stringify({
                          route: "green",
                          reason: "deterministic_ocr_shortcut",
                          next_block_id: _greenNext,
                          saved_ai_response: false,
                        }));
                        await _auditReceipt({
                          source: "deterministic",
                          identified: true,
                          name: _detName,
                          value: _finalValue,
                          route: "green",
                          decision: "deterministic_green_route",
                          metadata: {
                            accepted_values: _acceptedValues,
                            matched_value: _matched,
                            ocr_hash: _ocrHash,
                            next_block_id: _greenNext,
                          },
                        });

                        receiptRecognizedThisLoop = true;
                        nextBlockId = _greenNext;

                        // [FIX v2] Persistir IMEDIATAMENTE o avanço para evitar
                        // race com segunda chamada concorrente do webhook (mesmo PDF
                        // dispara 2x em ~250ms). Sem checkpoint, a 2ª call lê
                        // current_block_id antigo (ai_receipt), cai em
                        // deterministic_dedup_blocked com nextBlockId=b.id e
                        // sobrescreve o avanço quando persiste no final.
                        const _greenNextBlock = _greenNext ? findBlock(_greenNext) : null;
                        currentBlock = _greenNextBlock;
                        const _oldBlockId = b.id;
                        const _waitingInputBlockId =
                          (flowVariables as any)?.__waiting_input?.block_id || null;

                        // Limpar __waiting_input para impedir que o handler do
                        // wait_response trate qualquer próximo inbound como resposta
                        // ainda em rota vermelha desse ai_receipt.
                        try {
                          delete (flowVariables as any).__waiting_input;
                          delete (flowVariables as any).waiting_for_input;
                          delete (flowVariables as any).waiting_question_sent_at;
                        } catch (_) { /* noop */ }

                        // Limpar buffer pendente de mídia.
                        try {
                          if ((flowVariables as any).__pending_receipt_media) {
                            delete (flowVariables as any).__pending_receipt_media;
                          }
                        } catch (_) { /* noop */ }

                        // CHECKPOINT: persistir current_block_id + flow_variables
                        // antes de continuar o loop, antes de qualquer reentrada
                        // concorrente, antes de qualquer dedup.
                        let _dbCurrentBlockIdAfter: string | null = null;
                        let _dbWaitingInputAfter: any = null;
                        try {
                          await supabase
                            .from("webchat_conversations")
                            .update({
                              current_block_id: _greenNext,
                              flow_variables: flowVariables,
                              updated_at: new Date().toISOString(),
                            })
                            .eq("id", conversationId);

                          // Post-check
                          const { data: _checkRow } = await supabase
                            .from("webchat_conversations")
                            .select("current_block_id, flow_variables")
                            .eq("id", conversationId)
                            .maybeSingle();
                          _dbCurrentBlockIdAfter = (_checkRow as any)?.current_block_id || null;
                          _dbWaitingInputAfter =
                            (_checkRow as any)?.flow_variables?.__waiting_input || null;

                          if (_dbCurrentBlockIdAfter !== _greenNext) {
                            console.error("[AI_RECEIPT_DETERMINISTIC_GREEN_PERSIST_FAILED]", JSON.stringify({
                              conversation_id: conversationId,
                              expected_block_id: _greenNext,
                              db_current_block_id: _dbCurrentBlockIdAfter,
                              waiting_input_db: _dbWaitingInputAfter,
                            }));
                            await _auditReceipt({
                              source: "deterministic",
                              identified: true,
                              name: _detName,
                              value: _finalValue,
                              route: "green",
                              decision: "deterministic_green_persist_failed",
                              error: "db_current_block_id_mismatch",
                              metadata: {
                                expected: _greenNext,
                                db_current_block_id: _dbCurrentBlockIdAfter,
                              },
                            });
                          }
                        } catch (_persistErr) {
                          console.error("[AI_RECEIPT_DETERMINISTIC_GREEN_PERSIST_FAILED]", String(_persistErr));
                          await _auditReceipt({
                            source: "deterministic",
                            identified: true,
                            name: _detName,
                            value: _finalValue,
                            route: "green",
                            decision: "deterministic_green_persist_failed",
                            error: String(_persistErr).slice(0, 500),
                            metadata: {},
                          });
                        }

                        const _consumedCount = Array.isArray(
                          flowVariables["__consumed_input_message_ids"],
                        )
                          ? flowVariables["__consumed_input_message_ids"].length
                          : 0;
                        console.log("[AI_RECEIPT_DETERMINISTIC_GREEN_PERSISTED]", JSON.stringify({
                          conversation_id: conversationId,
                          old_current_block_id: _oldBlockId,
                          waiting_input_block_id: _waitingInputBlockId,
                          green_next_block_id: _greenNext,
                          current_block_id_after_update: _greenNext,
                          db_current_block_id_after_update: _dbCurrentBlockIdAfter,
                          message_id: norm.messageId || null,
                          name: _detName.slice(0, 60),
                          value: _finalValue,
                          consumed_message_ids_count: _consumedCount,
                          continue_loop: !!_greenNextBlock,
                        }));
                        await _auditReceipt({
                          source: "deterministic",
                          identified: true,
                          name: _detName,
                          value: _finalValue,
                          route: "green",
                          decision: "deterministic_green_persisted",
                          metadata: {
                            old_current_block_id: _oldBlockId,
                            waiting_input_block_id: _waitingInputBlockId,
                            green_next_block_id: _greenNext,
                            db_current_block_id_after_update: _dbCurrentBlockIdAfter,
                            consumed_message_ids_count: _consumedCount,
                            continue_loop: !!_greenNextBlock,
                          },
                        });
                        // break: sai do switch; loop continua em _greenNext (Pixel/Purchase).
                        break;
                      }
                    }
                  }
                } catch (_detErr) {
                  console.warn("[AI_RECEIPT_DETERMINISTIC_SHORTCUT_FAILED]", String(_detErr));
                  await _auditReceipt({
                    source: "deterministic", decision: "shortcut_exception",
                    error: String(_detErr).slice(0, 500), metadata: {},
                  });
                }


                const hasMedia = !!effectiveMedia && (
                  (effectiveMedia.type === "image" &&
                    b.data?.receipt_understand_image !== false) ||
                  (effectiveMedia.type === "audio" &&
                    b.data?.receipt_understand_audio !== false) ||
                  (effectiveMedia.type === "document" &&
                    b.data?.receipt_understand_pdf !== false)
                );

                console.log(
                  "[uazapi-webhook] [receipt_recognition_start] block_id:",
                  b.id,
                  "conversation_id:",
                  conversationId,
                  "media_type:",
                  effectiveMedia?.type,
                );
                console.log("[AI_RECEIPT_PDF_AUDIT_START]", JSON.stringify({
                  block_id: b.id,
                  conversation_id: conversationId,
                  lead_id: (conv as any).lead_id || null,
                  message_id: norm.messageId || null,
                  inbound_text_preview: typeof norm.content === "string" ? String(norm.content).slice(0, 200) : null,
                  processed_content_preview: typeof processedContent === "string" ? processedContent.slice(0, 200) : null,
                  norm_media_present: !!norm.media,
                  media_from_var_present: !!mediaFromVar,
                }));
                console.log("[AI_RECEIPT_PDF_MEDIA]", JSON.stringify({
                  effective_media_present: !!effectiveMedia,
                  type: effectiveMedia?.type || null,
                  mime: (effectiveMedia as any)?.mime || null,
                  url: effectiveMedia?.url || null,
                  has_base64: !!(effectiveMedia as any)?.base64,
                  base64_len: (effectiveMedia as any)?.base64?.length || 0,
                  has_rawMessage: !!(effectiveMedia as any)?.rawMessage,
                  caption: (effectiveMedia as any)?.caption || null,
                  text_field: (effectiveMedia as any)?.text || null,
                  receipt_understand_pdf: b.data?.receipt_understand_pdf,
                  hasMedia_resolved: hasMedia,
                }));


                try {
                  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
                  if (!LOVABLE_API_KEY) {
                    throw new Error("LOVABLE_API_KEY not set");
                  }

                  // Substitui variáveis no prompt também para garantir que referências como {{nome}} funcionem
                  // Removemos redundâncias e focamos no objetivo
                  const blockPrompt = replaceVars(b.data?.receipt_prompt || "Você é Sandra, uma assistente virtual.");

                  const messages: any[] = [
                    {
                      role: "system",
                      content: `${blockPrompt}


### INSTRUÇÕES DE EXTRAÇÃO (AGILIDADE E PRECISÃO)
1. Sua prioridade absoluta é a IMAGEM/PDF ANEXADO **ou** o TEXTO OCR/MULTIMODAL já extraído (ex.: "🖼️ Imagem: 1. Valor: ... 2. Nome do Pagador: ..."). Trate o texto OCR como evidência equivalente ao anexo.
2. Ignore valores de exemplo citados nas regras (como R$ 10,00) se eles forem diferentes do valor no comprovante real.
3. Extraia o NOME completo do pagador e o VALOR exato pago.
4. "identified": deve ser true se houver anexo real de comprovante (Pix, transferência, depósito) **OU** se o texto OCR/multimodal contiver evidências claras de pagamento (valor + nome do pagador, ou menção a Pix/InfinitePay/Nubank/Mercado Pago/transferência/depósito com valor).
5. Se "identified" for true, o campo "response" DEVE ser obrigatoriamente vazio "". Não envie nenhuma mensagem de texto.
6. Se não for um comprovante, "identified" deve ser false e "response" deve conter a resposta curta de acordo com as REGRAS.
7. Se o anexo/OCR estiver ilegível ou incompleto, "identified" deve ser false e "response" deve pedir um novo envio nítido.
8. Se o conteúdo extraído de PDF/OCR contiver "Pix Enviado", "Efetivada", valor em R$, recebedor, ID de transação e instituição bancária, considere comprovante válido mesmo que o nome apareça quebrado em várias linhas. Recombine o nome do recebedor/pagador em uma única linha.


### REQUISITO DE SAÍDA:
Responda APENAS com um objeto JSON válido.

FORMATO JSON:
{
  "identified": true,
  "name": "Nome Completo do Pagador",
  "value": "10.00",
  "response": ""
}`,
                    },
                  ];

                  const userContent: any[] = [];
                  let pdfUnreadableForReceipt = false;
                  
                  // Inclusão do contexto da mensagem enviada anteriormente
                  if (b.data?.receipt_sent_message) {
                    const sentMsg = replaceVars(b.data.receipt_sent_message);
                    userContent.push({
                      type: "text",
                      text: `Contexto (Mensagem que o bot enviou antes): ${sentMsg}`
                    });
                  }

                  // Limpeza do contentText para evitar que a IA tente seguir links
                  let displayContent = contentText;
                  if (typeof contentText === "string" && (
                    contentText.startsWith("http") || 
                    contentText.includes("mmg.whatsapp.net") ||
                    /\.(jpg|jpeg|png|pdf|webp|ogg|mp3|mp4|enc)$/i.test(contentText)
                  )) {
                    displayContent = `[Arquivo de mídia fornecido - Analise a IMAGEM ANEXADA em vez de links]`;
                  }

                  userContent.push({
                    type: "text",
                    text:
                      `Conteúdo da variável ${receiptVar}: ${displayContent}\n\nMensagem atual do usuário: ${
                        processedContent || norm.content || (hasMedia ? "[Arquivo de mídia enviado]" : "")
                      }`,
                  });

                  if (hasMedia && effectiveMedia) {
                    let mediaData = "";
                    if (effectiveMedia.base64) {
                      mediaData = effectiveMedia.base64;
                    } else if (effectiveMedia.url && !isWhatsappEncryptedUrl(effectiveMedia.url)) {
                      try {
                        console.log("[uazapi-webhook] ai_receipt: fetching public media url", effectiveMedia.url);
                        const resp = await fetch(effectiveMedia.url);
                        if (resp.ok) {
                          const buffer = await resp.arrayBuffer();
                          mediaData = encodeBase64(buffer);
                          console.log("[uazapi-webhook] ai_receipt: success fetching public media", { b64Len: mediaData.length });
                        } else {
                          console.warn("[uazapi-webhook] ai_receipt: failed to fetch public media url, status:", resp.status);
                        }
                      } catch (err) {
                        console.warn("[uazapi-webhook] ai_receipt: error fetching public media url", err);
                      }
                    } 
                    
                    if (!mediaData && effectiveMedia.rawMessage) {
                      console.log("[uazapi-webhook] ai_receipt: attempting downloadMediaBase64", { mediaType: effectiveMedia.type });
                      const dl = await downloadMediaBase64(
                        resolvedEvoUrl,
                        resolvedApiKeys,
                        effectiveMedia.rawMessage,
                        (effectiveMedia as any).messageId || norm.messageId,
                        effectiveMedia.type as any,
                        norm.remoteJid,
                        instance.name || norm.instance,
                        instance.instance_id,
                      );

                      if (dl?.base64) {
                        mediaData = dl.base64;
                      } else {
                        console.warn(
                          "[uazapi-webhook] ai_receipt: could not download media for IA",
                        );
                      }
                    }

                    if (mediaData) {
                      console.log(
                        "[uazapi-webhook] ai_receipt: sending media to IA",
                        { type: effectiveMedia.type, b64Len: mediaData.length },
                      );
                      console.log("[AI_RECEIPT_PDF_DOWNLOAD]", JSON.stringify({
                        type: effectiveMedia.type,
                        mime: (effectiveMedia as any).mime || null,
                        b64_len: mediaData.length,
                        source: (effectiveMedia as any).base64 ? "inline_base64"
                          : (effectiveMedia.url && !isWhatsappEncryptedUrl(effectiveMedia.url) ? "public_url_fetch" : "downloadMediaBase64"),
                      }));

                      // Use proper vision block for images only. 
                      // PDFs are NOT supported via image_url in chat/completions.
                      if (effectiveMedia.type === "image") {
                        const mime = effectiveMedia.mime || "image/jpeg";
                        userContent.push({
                          type: "image_url",
                          image_url: {
                            url: `data:${mime};base64,${mediaData}`,
                          },
                        });
                      } else if (
                        effectiveMedia.type === "audio" &&
                        b.data?.receipt_understand_audio !== false
                      ) {
                        userContent.push({
                          type: "text",
                          text: "[O usuário enviou um áudio]",
                        });
                      } else if (
                        effectiveMedia.type === "document"
                      ) {
                        const isPDF = effectiveMedia.mime === "application/pdf" || (effectiveMedia.text || "").toLowerCase().endsWith(".pdf");
                        // Tenta extrair o texto do PDF e injetar no contexto antes de chamar a IA.
                        // Isso garante que QUALQUER provedor configurado no bloco (OpenAI/GPT inclusive)
                        // consiga ler o comprovante, já que /chat/completions OpenAI não aceita PDF via image_url.
                        let pdfText = "";
                        if (isPDF) {
                          try {
                            const binStr = atob(mediaData);
                            const pdfBytes = new Uint8Array(binStr.length);
                            for (let i = 0; i < binStr.length; i++) pdfBytes[i] = binStr.charCodeAt(i);
                            console.log("[AI_RECEIPT_PDF_BYTES]", JSON.stringify({ bytes: pdfBytes.byteLength, expected_public_url: effectiveMedia.url || null }));
                            const { extractText, getDocumentProxy } = await import("https://esm.sh/unpdf@0.12.1");
                            const doc = await getDocumentProxy(pdfBytes);
                            try {
                              const { text } = await extractText(doc, { mergePages: true });
                              pdfText = Array.isArray(text) ? text.join("\n") : String(text || "");
                            } catch (_) { /* fallback abaixo */ }
                            if (pdfText.trim().length < 5) {
                              const pages: string[] = [];
                              for (let i = 1; i <= Math.min(doc.numPages, 10); i++) {
                                try {
                                  const pg = await doc.getPage(i);
                                  const content = await pg.getTextContent();
                                  pages.push(content.items.map((it: any) => it.str).join(" "));
                                } catch (_) {}
                              }
                              pdfText = pages.join("\n");
                            }
                            console.log("[uazapi-webhook] ai_receipt: PDF text extracted", { len: pdfText.length, pages: doc.numPages });
                            console.log("[AI_RECEIPT_PDF_OCR]", JSON.stringify({
                              extracted_len: pdfText.length,
                              pages: doc.numPages,
                              preview: pdfText.slice(0, 600),
                              will_inject_to_llm: pdfText.trim().length >= 20,
                            }));
                            if (pdfText.trim().length < 20) {
                              console.log("[AI_RECEIPT_PDF_FALLBACK_START]", JSON.stringify({ reason: "unpdf_text_too_short", extracted_len: pdfText.trim().length, bytes: pdfBytes.byteLength }));
                              const fallbackText = await processMediaToText(supabaseUrl, serviceKey, {
                                kind: "document",
                                base64: mediaData,
                                mime: "application/pdf",
                                filename: effectiveMedia.text || effectiveMedia.caption || "documento.pdf",
                                organization_id: (conv as any).organization_id,
                              });
                              if (fallbackText && fallbackText.trim().length >= 20) {
                                pdfText = fallbackText.trim();
                                console.log("[AI_RECEIPT_PDF_FALLBACK_OK]", JSON.stringify({ extracted_len: pdfText.length, preview: pdfText.slice(0, 600) }));
                              } else {
                                pdfUnreadableForReceipt = true;
                                console.warn("[AI_RECEIPT_PDF_UNREADABLE]", JSON.stringify({ reason: "fallback_empty_or_short", fallback_len: fallbackText?.trim().length || 0, bytes: pdfBytes.byteLength }));
                              }
                            }

                          } catch (pdfErr) {
                            console.warn("[uazapi-webhook] ai_receipt: PDF extraction failed", pdfErr);
                            pdfUnreadableForReceipt = true;
                          }
                        }
                        if (pdfText && pdfText.trim().length >= 20) {
                          userContent.push({
                            type: "text",
                            text: `Conteúdo extraído do PDF do comprovante (anexo do usuário):\n"""\n${pdfText.slice(0, 8000)}\n"""\nUse APENAS esse conteúdo para identificar valor, pagador e data.`,
                          });
                        } else {
                          userContent.push({
                            type: "text",
                            text: `[O usuário enviou um documento ${isPDF ? "PDF" : ""} (${
                              effectiveMedia.text || effectiveMedia.caption || "sem nome"
                            })] - Não foi possível extrair texto confiável do anexo; NÃO trate como objeção comum.`,
                          });
                        }
                      }
                    }
                  }

                  messages.push({ role: "user", content: userContent });
                  console.log(
                    "[uazapi-webhook] [receipt_payload_final] payload:",
                    JSON.stringify({
                      media_type: effectiveMedia?.type || null,
                      messages_count: messages.length,
                      user_content_types: userContent.map((c) => c.type),
                    }),
                  );
                  console.log("[AI_RECEIPT_PROMPT_PAYLOAD]", JSON.stringify({
                    messages_count: messages.length,
                    user_content_types: userContent.map((c) => c.type),
                    user_text_preview: userContent
                      .filter((c: any) => c.type === "text")
                      .map((c: any) => String(c.text || "").slice(0, 400))
                  }));

                  if (pdfUnreadableForReceipt) {
                    console.log("[AI_RECEIPT_ROUTE_DECISION]", JSON.stringify({
                      route: "stay",
                      reason: "pdf_unreadable_empty_response",
                      next_block_id: b.id,
                      saved_ai_response: false,
                    }));
                    nextBlockId = b.id;
                  } else {



                  // ============================================================
                  // Resolve AI provider/model com a seguinte prioridade:
                  //   1) Config do PRÓPRIO BLOCO (receipt_ai_provider/model/auth)
                  //   2) Padrão GLOBAL da plataforma: OpenAI GPT-5 Mini (auth global)
                  //   3) Roteamento da organização (resolveAIProvider) como fallback
                  //   4) Lovable Gateway (Gemini) como último recurso
                  // ============================================================

                  let aiApiKey = Deno.env.get("LOVABLE_API_KEY") || "";
                  let aiUrl = "https://ai.gateway.lovable.dev/v1/chat/completions";
                  let aiModel = "google/gemini-2.5-flash"; // fallback último recurso
                  let aiSource: "block" | "platform_default" | "org" | "fallback" = "fallback";

                  // PADRÃO GLOBAL DA PLATAFORMA
                  const PLATFORM_DEFAULT_PROVIDER = "openai";
                  const PLATFORM_DEFAULT_MODEL = "gpt-5-mini";
                  const PLATFORM_DEFAULT_AUTH = "global";

                  // Se o bloco não tem provider configurado, herda o padrão global da plataforma
                  const blockProvider = (b.data?.receipt_ai_provider as string | undefined) || PLATFORM_DEFAULT_PROVIDER;
                  const blockModel = (b.data?.receipt_ai_model as string | undefined) || (b.data?.receipt_ai_provider ? "" : PLATFORM_DEFAULT_MODEL);
                  const blockAuthMode = (b.data?.receipt_ai_auth_mode as string | undefined) || PLATFORM_DEFAULT_AUTH;
                  const blockApiKey = (b.data?.receipt_ai_api_key as string | undefined) || "";
                  const blockHasExplicitConfig = !!(b.data?.receipt_ai_provider);

                  const applyProviderModel = (provider: string, model: string, apiKey: string) => {
                    const isOpenAI = provider === "openai" || apiKey.startsWith("sk-");
                    if (isOpenAI) {
                      aiUrl = "https://api.openai.com/v1/chat/completions";
                      aiApiKey = apiKey;
                      aiModel = model || PLATFORM_DEFAULT_MODEL;
                    } else {
                      // lovable / gemini / qualquer outro -> Gateway Lovable
                      aiUrl = "https://ai.gateway.lovable.dev/v1/chat/completions";
                      aiApiKey = apiKey || Deno.env.get("LOVABLE_API_KEY") || "";
                      if (model) {
                        aiModel = model.includes("/") ? model : (provider === "gemini" ? `google/${model}` : `openai/${model}`);
                      } else {
                        aiModel = "google/gemini-2.5-flash";
                      }
                    }
                  };

                  try {
                    let key = "";
                    if (blockAuthMode === "manual" && blockApiKey) {
                      key = blockApiKey;
                    } else {
                      // global: tenta org_ai_credentials, cai para envs
                      try {
                        const resolved = await resolveAIProvider(
                          instance.organization_id,
                          "image_vision",
                        );
                        if (resolved && (blockProvider === "lovable" || resolved.provider === blockProvider)) {
                          key = resolved.apiKey;
                        }
                      } catch (_) { /* ignora */ }
                      if (!key) {
                        if (blockProvider === "openai") key = Deno.env.get("OPENAI_API_KEY") || "";
                        else if (blockProvider === "gemini") key = Deno.env.get("LOVABLE_API_KEY") || "";
                        else key = Deno.env.get("LOVABLE_API_KEY") || "";
                      }
                    }
                    applyProviderModel(blockProvider, blockModel, key);
                    aiSource = blockHasExplicitConfig ? "block" : "platform_default";
                  } catch (e) {
                    console.warn("[uazapi-webhook] ai_receipt: provider resolve failed, falling back to org", e);
                  }

                  if (aiSource === "fallback") {
                    try {
                      const resolved = await resolveAIProvider(
                        instance.organization_id,
                        "image_vision",
                      );
                      applyProviderModel(resolved.provider, blockModel || resolved.model || "", resolved.apiKey);
                      aiSource = "org";
                    } catch (e) {
                      console.warn(
                        "[uazapi-webhook] ai_receipt: resolveAIProvider failed, falling back to Lovable Gateway",
                        e,
                      );
                    }
                  }

                  console.log("[uazapi-webhook] ai_receipt: provider resolved", {
                    source: aiSource,
                    provider: blockProvider,
                    model: aiModel,
                    auth_mode: blockAuthMode,
                    block_has_explicit_config: blockHasExplicitConfig,
                  });

                  // ============================================================
                  // [COMPROVANTE_AI_CALL_BLOCKED] Trava lógica anti-duplicação
                  // de chamada IA no contexto comprovante. Chave:
                  //   conversation_id + inbound_message_id + receipt_context
                  // TTL: 5 min. Fail-CLOSED: se já houve decisão IA nos últimos
                  // 5 min para este inbound, NÃO chama IA novamente — evita
                  // 2x/3x respostas concorrentes (ai_receipt + ai_takeover +
                  // orquestrador + retry) para o mesmo inbound_message_id.
                  // ============================================================
                  const _inboundMsgIdForLock = norm.messageId || "no_msg_id";
                  const _aiReceiptCallLockKey =
                    `ai_call::ai_receipt_objection::${conversationId}::${_inboundMsgIdForLock}`;
                  let _aiReceiptCallBlocked = false;
                  if (norm.messageId) {
                    try {
                      _aiReceiptCallBlocked = await isDuplicateResponse(
                        supabase,
                        conversationId,
                        _aiReceiptCallLockKey,
                        300_000,
                      );
                    } catch (_lockErr) {
                      _aiReceiptCallBlocked = false; // só fail-open se o check em si falhar
                    }
                  }
                  let aiResp: Response | null = null;
                  if (_aiReceiptCallBlocked) {
                    console.log(
                      "[COMPROVANTE_AI_CALL_BLOCKED]",
                      JSON.stringify({
                        conversation_id: conversationId,
                        inbound_message_id: _inboundMsgIdForLock,
                        block_id: b.id,
                        receipt_context: "ai_receipt_objection",
                        reason: "duplicate_ai_call_within_5min",
                      }),
                    );
                    // Fail-closed: não chama IA, não envia nada novo.
                    // Permanece no bloco aguardando próxima mensagem real.
                    nextBlockId = b.id;
                  } else {
                  // Reserva a chave ANTES do fetch — invocações concorrentes
                  // verão duplicidade e abortarão.
                  if (norm.messageId) {
                    try {
                      await recordSentResponse(
                        supabase,
                        conversationId,
                        _aiReceiptCallLockKey,
                      );
                    } catch (_) { /* best-effort */ }
                  }

                  aiResp = await fetch(aiUrl, {
                    method: "POST",
                    headers: {
                      "Authorization": `Bearer ${aiApiKey}`,
                      "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                      model: aiModel,
                      messages,
                      response_format: { type: "json_object" },
                    }),
                  });

                  if (aiResp && aiResp.ok) {
                    const aiData = await aiResp.json();
                    let aiContent = aiData.choices[0].message.content || "{}";
                    // Strip markdown code blocks if present
                    if (aiContent.includes("```")) {
                      aiContent = aiContent.replace(/```json|```/g, "").trim();
                    }
                    console.log(
                      "[uazapi-webhook] [pixel_meta_response] raw:",
                      aiContent,
                    );
                    console.log("[AI_RECEIPT_RAW_RESULT]", JSON.stringify({ raw_content: String(aiContent).slice(0, 1500) }));
                    const result = JSON.parse(aiContent);

                    console.log("[uazapi-webhook] [receipt_recognition_success] result:", result);
                    console.log("[AI_RECEIPT_LLM_RESULT]", { identified: result?.identified, name: result?.name, value: result?.value, response_preview: typeof result?.response === "string" ? result.response.slice(0, 120) : null });
                    console.log("[AI_RECEIPT_PARSED_RESULT]", JSON.stringify({
                      identified: result?.identified,
                      name: result?.name || "",
                      value: result?.value || "",
                      response: typeof result?.response === "string" ? result.response.slice(0, 300) : "",
                    }));


                    if (result?.identified === false && deterministicExtraction.value && deterministicExtraction.name) {
                      result.identified = true;
                      result.name = deterministicExtraction.name;
                      result.value = deterministicExtraction.value;
                      result.response = "Comprovante identificado com sucesso.";
                      console.log("[AI_RECEIPT_DETERMINISTIC_FALLBACK_APPLIED]", {
                        identified: result.identified,
                        name: result.name,
                        value: result.value,
                        llm_identified: false,
                      });
                    }

                    // Importante: Considerar identificado se tiver nome E valor mesmo que a IA oscile no booleano
                    const isIdentified = result.identified === true || (!!result.name && !!result.value && parseFloat(result.value.replace(/[^\d.,]/g, "").replace(",", ".")) > 0);
                    console.log("[AI_RECEIPT_IS_IDENTIFIED_DECISION]", { isIdentified, reason: result.identified === true ? "llm_true" : (isIdentified ? "name_value_fallback" : "llm_false_no_fallback") });




                    if (isIdentified) {
                      receiptRecognizedThisLoop = true;
                      const nameVar = b.data?.receipt_name_var ||
                        "nomecomprovante";
                      const valueVar = b.data?.receipt_value_var ||
                        "valorcomprovante";
                      const extractedName = String(
                        result.name || "Não identificado",
                      ).trim();
                      let extractedValue = String(result.value || "0").trim();

                      // Cleanup value: handle BR currency formats precisely
                      // "R$ 1.500,00" -> "1500.00"
                      // "316" -> "316.00"
                      extractedValue = extractedValue.replace(/[^\d.,]/g, "");
                      
                      if (extractedValue.includes(",") && extractedValue.includes(".")) {
                        // "1.500,00" -> remove all dots, then replace comma with dot
                        extractedValue = extractedValue.replace(/\./g, "").replace(",", ".");
                      } else if (extractedValue.includes(",")) {
                        // "316,00" -> "316.00"
                        extractedValue = extractedValue.replace(",", ".");
                      }
                      
                      // Ensure it's a valid number or default to 0
                      const finalValueNum = parseFloat(extractedValue);
                      const finalValue = isNaN(finalValueNum) ? "0.00" : finalValueNum.toFixed(2);

                      flowVariables[nameVar] = extractedName;
                      flowVariables[valueVar] = finalValue;

                      // Update lead metadata safely
                      if ((conv as any).lead_id) {
                        try {
                          const { data: lead } = await supabase.from("leads")
                            .select("metadata").eq("id", (conv as any).lead_id)
                            .single();
                          console.log(`[receipt_recognition_success] lead_id: ${(conv as any).lead_id}, name: ${extractedName}, value: ${finalValue}`);
                          await supabase.from("leads").update({
                            metadata: {
                              ...(lead?.metadata || {}),
                              [nameVar]: extractedName,
                              [valueVar]: finalValue,
                              last_receipt_at: new Date().toISOString(),
                            },
                          }).eq("id", (conv as any).lead_id);
                        } catch (leadErr) {
                          console.error(
                            "[uazapi-webhook] error updating lead metadata:",
                            leadErr,
                          );
                        }
                      }

                      // Log to agent_action_logs for dashboard analysis
                      try {
                        await supabase.from("agent_action_logs").insert({
                          organization_id: (conv as any).organization_id,
                          conversation_id: conversationId,
                          lead_id: (conv as any).lead_id,
                          action_type: "receipt_extraction",
                          action_data: {
                            block_id: b.id,
                            variable_name: nameVar,
                            value_variable: valueVar,
                          },
                          result: {
                            name: extractedName,
                            value: extractedValue,
                            message_id: norm.messageId,
                          },
                          success: true,
                        });
                      } catch (logErr) {
                        console.warn(
                          "[uazapi-webhook] failed to log receipt action:",
                          logErr,
                        );
                      }

                      // identified as receipt: NO message to lead, just follow routing
                      console.log("[uazapi-webhook] [receipt_next_block_execute] follow success path:", b.data?.true_next_block_id);
                      console.log("[AI_RECEIPT_ROUTE_DECISION]", JSON.stringify({
                        route: "green",
                        reason: "identified_true",
                        next_block_id: b.data?.true_next_block_id || null,
                        saved_ai_response: false,
                      }));
                      nextBlockId = b.data?.true_next_block_id || null;
                    } else {
                      // NOT identified: new routing logic (no engine-side send)
                      const aiResponseText = (result.response || "").trim();
                      if (aiResponseText) {
                        // Expose to red path Mensagem block via {{ai.response}}
                        flowVariables["ai.response"] = aiResponseText;
                        console.log("[uazapi-webhook] [AI_RECEIPT_RESPONSE] follow red path with ai.response var:", b.data?.false_next_block_id);
                        console.log("[AI_RECEIPT_ROUTE_DECISION]", JSON.stringify({
                          route: "red",
                          reason: "identified_false_with_response",
                          next_block_id: b.data?.false_next_block_id || null,
                          saved_ai_response: true,
                          ai_response_preview: aiResponseText.slice(0, 200),
                        }));
                        nextBlockId = b.data?.false_next_block_id || null;
                      } else {
                        // No response → stay on current block so timeout scheduler can act
                        console.log("[uazapi-webhook] [AI_RECEIPT_RESPONSE] empty response → stay on current block for timeout");
                        console.log("[AI_RECEIPT_ROUTE_DECISION]", JSON.stringify({
                          route: "stay",
                          reason: "identified_false_empty_response",
                          next_block_id: b.id,
                          saved_ai_response: false,
                        }));
                        nextBlockId = b.id; // sentinel: persistence keeps current_block_id = b.id
                      }


                    }

                  } else {
                    console.error(
                      "[uazapi-webhook] ai_receipt AI error:",
                      aiResp ? await aiResp.text() : "(no response)",
                    );
                    console.log("[AI_RECEIPT_ROUTE_DECISION]", JSON.stringify({ route: "red", reason: "ai_http_error", next_block_id: b.data?.false_next_block_id || null }));
                    nextBlockId = b.data?.false_next_block_id || null;
                  }
                  } // close [COMPROVANTE_AI_CALL_BLOCKED] else wrapper
                  }
                  console.log("[AI_RECEIPT_PDF_AUDIT_END]", JSON.stringify({ block_id: b.id, conversation_id: conversationId, next_block_id: nextBlockId }));

                } catch (e) {
                  console.error("[uazapi-webhook] ai_receipt exception:", e);
                  nextBlockId = b.data?.false_next_block_id || null;
                }

                // Sempre limpa o buffer pendente após processar ai_receipt
                // (sucesso, falha ou exceção). NÃO dispara verde/Pixel/Purchase
                // — apenas remove a flag para evitar replay duplicado.
                if ((flowVariables as any).__pending_receipt_media) {
                  const _cleared = (flowVariables as any)
                    .__pending_receipt_media;
                  delete (flowVariables as any).__pending_receipt_media;
                  console.log("[AI_RECEIPT_PENDING_MEDIA_CLEARED]",
                    JSON.stringify({
                      conversation_id: conversationId,
                      block_id: b.id,
                      replayed: _replayedFromPending,
                      media_url: _cleared?.url,
                    }));
                }

                // FORCE CLEAR: remoção real da chave JSONB direto no DB, mesmo
                // que o objeto flowVariables em memória não contivesse a flag
                // (race com o side-write de [AI_RECEIPT_PENDING_MEDIA_SAVED]).
                try {
                  const { data: _fvRow } = await supabase
                    .from("webchat_conversations")
                    .select("flow_variables")
                    .eq("id", conversationId)
                    .maybeSingle();
                  const _fvDb: any = (_fvRow as any)?.flow_variables || {};
                  if (
                    _fvDb && typeof _fvDb === "object" &&
                    Object.prototype.hasOwnProperty.call(
                      _fvDb,
                      "__pending_receipt_media",
                    )
                  ) {
                    const _removedUrl = _fvDb?.__pending_receipt_media?.url ||
                      null;
                    delete _fvDb.__pending_receipt_media;
                    await supabase
                      .from("webchat_conversations")
                      .update({ flow_variables: _fvDb })
                      .eq("id", conversationId);
                    if ((flowVariables as any).__pending_receipt_media) {
                      delete (flowVariables as any).__pending_receipt_media;
                    }
                    console.log(
                      "[AI_RECEIPT_PENDING_MEDIA_FORCE_CLEARED]",
                      JSON.stringify({
                        conversation_id: conversationId,
                        block_id: b.id,
                        media_url: _removedUrl,
                      }),
                    );
                  }
                } catch (_forceClearErr) {
                  console.warn(
                    "[AI_RECEIPT_PENDING_MEDIA_FORCE_CLEAR_FAILED]",
                    String(_forceClearErr),
                  );
                }


                 // If "stay on current block" was decided (nextBlockId === b.id), do not advance
                 if (nextBlockId === b.id) {
                   currentBlock = null; // stop loop; persistence keeps current_block_id = b.id
                 } else {
                   currentBlock = findBlock(nextBlockId);
                 }
                break;
              }
              // NOTE: case "ia_pergunta" foi unificado com "pergunta" acima (linha ~3825).
              // O bloco agora SEMPRE espera resposta do lead antes de classificar com IA.

              case "condition": {
                const normalize = (s: any) =>
                  String(s ?? "").toLowerCase().normalize("NFD").replace(
                    /[\u0300-\u036f]/g,
                    "",
                  ).trim();

                const evalRule = (rule: any) => {
                  if (!rule || !rule.variable || !rule.operator) return false;

                  const lhsRaw = flowVariables[rule.variable] || "";
                  const lhs = normalize(lhsRaw);
                  const rhs = normalize(rule.value);

                  switch (rule.operator) {
                    case "equals":
                      return lhs === rhs;
                    case "not_equals":
                      return lhs !== rhs;
                    case "contains":
                      return lhs.includes(rhs);
                    case "greater_than":
                      return Number(lhs) > Number(rhs);
                    case "less_than":
                      return Number(lhs) < Number(rhs);
                    default:
                      return false;
                  }
                };
                
                let truthy = false;
                const conditions = b.data?.conditions;
                
                if (Array.isArray(conditions) && conditions.length > 0) {
                  const logic = b.data?.condition_logic || "all";
                  const results = conditions.map(evalRule);
                  truthy = logic === "any"
                    ? results.some(Boolean)
                    : results.every(Boolean);
                } else if (b.data?.condition) {
                  truthy = evalRule(b.data?.condition);
                }
                
                nextBlockId = (truthy
                  ? b.data?.true_next_block_id
                  : b.data?.false_next_block_id) || null;
                currentBlock = findBlock(nextBlockId);
                break;
              }

              case "ai_takeover":
              case "agent_switch": {
                handoffToAgent = b.data?.agent_id || null;
                releaseToOrchestrator = true;
                flowCompleted = true;
                nextBlockId = null;
                currentBlock = null;
                break;
              }
              case "handoff": {
                if (b.data?.handoff_message) {
                  chunksToSend.push({
                    type: "text",
                    payload: { text: replaceVars(b.data.handoff_message) },
                    show_typing: b.data.show_typing,
                    typing_duration: b.data.typing_duration_ms,
                  });
                }
                flowCompleted = true;
                nextBlockId = null;
                currentBlock = null;
                // Mark conversation as needing human
                await supabase.from("webchat_conversations").update({
                  status: "human_active",
                  flow_completed: true,
                  current_block_id: null,
                  flow_variables: flowVariables,
                }).eq("id", conversationId);
                break;
              }
              case "end": {
                if (b.data?.success_message) {
                  chunksToSend.push({
                    type: "text",
                    payload: { text: replaceVars(b.data.success_message) },
                    show_typing: b.data.show_typing,
                    typing_duration: b.data.typing_duration_ms,
                  });
                }
                flowCompleted = true;
                closeConversation = true;
                nextBlockId = null;
                currentBlock = null;
                break;
              }
              default: {
                // Unknown/unsupported block in WhatsApp engine — just advance
                console.warn("[uazapi-webhook] unknown_block_type_advancing:", {
                  id: b.id,
                  type: b.type,
                });
                nextBlockId = b.next_block_id || null;
                currentBlock = findBlock(nextBlockId);
              }
            }
            console.log("[uazapi-webhook] funnel_run_after_switch:", {
              after_switch_currentBlock: currentBlock?.id,
              after_switch_nextBlockId: nextBlockId,
            });
          }

          // If nextBlockId is null, it means we reached the end of the sequence.
          // We mark it as completed so it doesn't restart automatically.
          if (nextBlockId === null) {
            flowCompleted = true;
          }

          // 3) Persist flow state
          // [FINALIZAR_FUNIL_HARDENING] When flow completes, sanitize residual
          // WAIT state from flow_variables so nothing reactivates the funnel.
          if (flowCompleted && flowVariables && typeof flowVariables === "object") {
            try {
              delete (flowVariables as any).__waiting_input;
              delete (flowVariables as any).waiting_for_input;
              delete (flowVariables as any).waiting_question_sent_at;
              console.log("[uazapi-webhook] [FINALIZAR_FUNIL_CLEANUP] removed __waiting_input/waiting_for_input from flow_variables");
            } catch (_) { /* noop */ }
          }

          const updatePatch: any = {
            flow_variables: flowVariables,
            current_block_id: nextBlockId,
            flow_completed: flowCompleted,
            bot_locked_until: flowCompleted ? null : updatedBotLockedUntil,
            unread_count_agents: 0, // Auto-mark as read on response
          };
          if (flowCompleted) {
            updatePatch.flow_completed_at = new Date().toISOString();
          }
          if (handoffToAgent) updatePatch.current_agent_id = handoffToAgent;
          if (closeConversation) {
            updatePatch.status = "closed";
            updatePatch.closed_at = new Date().toISOString();
          }
          await supabase.from("webchat_conversations").update(updatePatch).eq(
            "id",
            conversationId,
          );

          // Registrar conclusão no histórico
          if (flowCompleted && (conv as any).current_flow_id && (conv as any).lead_id) {
            try {
              await supabase.from("lead_funnel_history")
                .update({ 
                  status: 'completed', 
                  completed_at: new Date().toISOString() 
                })
                .eq('lead_id', (conv as any).lead_id)
                .eq('funnel_id', (conv as any).current_flow_id)
                .eq('status', 'running');
              
              // Marcar no lead para acesso rápido
              await supabase.rpc('mark_funnel_completed_on_lead', {
                p_lead_id: (conv as any).lead_id,
                p_funnel_id: (conv as any).current_flow_id
              });

              console.log(`[uazapi-webhook] funnel_completed: lead_id=${(conv as any).lead_id} funnel_id=${(conv as any).current_flow_id}`);
            } catch (err) {
              console.warn("[uazapi-webhook] failed to update funnel history:", err);
            }
          }


          // 4) Send chunks via UazAPI — ilimitadas bolhas conforme solicitado
          /* removed anti-spam hard-cap */

          // 4) Send chunks via UazAPI — sequentially to respect order and delays
          let totalWaitTime = 0;
          const MAX_TOTAL_WAIT = 45000; // 45s safety limit for Edge Functions

          let lastChunkWasMedia = false;

          for (let i = 0; i < chunksToSend.length; i++) {
            const chunk = chunksToSend[i];
            const stepId = `step_${i}_${chunk.source_block_id || "inline"}`;
            console.log(`[uazapi-webhook] [STEP_START] ${stepId}`);

            try {
              const isAudio = chunk.type === "audio" ||
                (chunk.payload &&
                  (chunk.payload.ptt || chunk.payload.type === "ptt"));
              const isMedia = chunk.type === "media" || chunk.type === "audio" || (chunk.payload && (chunk.payload.url || chunk.payload.media));
              const presenceType = isAudio ? "recording" : "composing";

              // IDEMPOTENCY CHECK (structural — convId + blockId + url)
              if (chunk.source_block_id) {
                const stepHash = normalizeResponseHash(`${conversationId}_${chunk.source_block_id}_${chunk.payload?.url || ""}`);
                const isDup = await isDuplicateResponse(supabase, conversationId, stepHash, 60000); // 1 min window
                if (isDup) {
                  console.log(`[uazapi-webhook] [IDEMPOTENCY] block ${chunk.source_block_id} already sent recently, skipping.`);
                  continue;
                }
                await recordSentResponse(supabase, conversationId, stepHash);
              }

              // [COMPROVANTE_DUPLICATE_BLOCKED] Conservative content-hash dedup
              // for outbound text/caption: blocks identical content sent to the
              // same conversation within 120s, regardless of (possibly dynamic)
              // source_block_id. Targets the receipt/objection block duplication
              // where the AI generates fresh synthetic block_ids per chunk and
              // the structural dedup above cannot match.
              // Media (URL-based) keeps the structural dedup only — does not
              // interfere with legitimate document/image deliveries.
              try {
                const _outboundText = typeof chunk.payload === "string"
                  ? chunk.payload
                  : (chunk.payload?.text || chunk.payload?.caption || "");
                const _normalizedContent = normalizeResponseHash(_outboundText);
                if (_normalizedContent && _normalizedContent.length >= 6) {
                  // Tag the hash so it does not collide with structural step hashes.
                  const _contentHash = `content::${_normalizedContent}`;
                  // Janela default: 2 min. Apenas para textos fixos de
                  // objeção do bloco Comprovante usamos 5 min, ignorando
                  // o source_block_id (objection chains geram block_ids
                  // sintéticos diferentes para o mesmo texto).
                  const _isReceiptObjection =
                    /n[aã]o consegui identificar o comprovante|n[aã]o (?:é|eh) um comprovante|esse arquivo n[aã]o (?:é|eh) um comprovante/i
                      .test(_outboundText || "");
                  const _dedupWindowMs = _isReceiptObjection ? 300_000 : 120_000;
                  const _isContentDup = await isDuplicateResponse(
                    supabase,
                    conversationId,
                    _contentHash,
                    _dedupWindowMs,
                  );
                  if (_isContentDup) {
                    console.log(
                      `[uazapi-webhook] [COMPROVANTE_DUPLICATE_BLOCKED] conversation=${conversationId} block=${chunk.source_block_id || "inline"} reason=content_hash_match preview="${_outboundText.slice(0, 80).replace(/\n/g, " ")}"`,
                    );
                    continue;
                  }
                  await recordSentResponse(supabase, conversationId, _contentHash);
                }
              } catch (_dedupErr) {
                console.warn("[uazapi-webhook] content_dedup_failed:", (_dedupErr as any)?.message);
              }

              // MEDIA REFRESH & VALIDATION (PROACTIVE)
              if (isMedia && chunk.payload?.url) {
                console.log(`[uazapi-webhook] [MEDIA_UPLOAD] refreshing and validating media for block ${chunk.source_block_id || "inline"}`);
                
                // 1. Refresh URL (Signed URL if Supabase Storage)
                const originalUrl = chunk.payload.url;
                const freshUrl = await refreshStorageUrl(supabase, originalUrl);
                chunk.payload.url = freshUrl;
                
                // 2. Validate URL (HEAD check ONLY for Supabase Storage)
                const isSupabase = freshUrl.includes(".supabase.co");
                if (isSupabase) {
                  const validation = await validateUrl(freshUrl);
                  console.log(`[uazapi-webhook] [MEDIA_VALIDATION] isSupabase=${isSupabase} status=${validation.status} size=${validation.size || "unknown"}`);
                  
                  if (!validation.ok) {
                    console.error(`[uazapi-webhook] [MEDIA_VALIDATION_FAILED] Supabase URL returns ${validation.status}: ${freshUrl}`);
                  }
                } else {
                  console.log(`[uazapi-webhook] [MEDIA_VALIDATION_SKIP] skipping HEAD check for external URL`);
                }
              }

              // 1. Initial Delay & Presence Simulation
              // Presence must happen WITHIN the delay.
              const mandatoryGap = i > 0
                ? (lastChunkWasMedia ? 3000 : 1200)
                : 0;
              
              const total_delay = chunk.delay > 0 
                ? chunk.delay 
                : mandatoryGap;
              
              const show_presence = chunk.show_typing !== false &&
                (chunk.type === "text" || chunk.type === "audio" || chunk.type === "audio_ptt");
              
              const typing_duration = show_presence ? (chunk.typing_duration || 0) : 0;
              const remaining_wait = Math.max(0, total_delay - typing_duration);

              console.log(`[uazapi-webhook] timing_flow: block_id=${chunk.source_block_id || "inline"} total_wait=${total_delay}ms presence=${typing_duration}ms remaining=${remaining_wait}ms`);

              if (show_presence && typing_duration > 0 && totalWaitTime < MAX_TOTAL_WAIT) {
                const typingWait = Math.min(typing_duration, MAX_TOTAL_WAIT - totalWaitTime);
                const presence_payload = {
                  state: presenceType,
                  presence: presenceType,
                  delay: typingWait,
                  duration_ms: typingWait,
                  skip_warmup: true,
                };
                
                console.log(`[uazapi-webhook] presence_start: block_id=${chunk.source_block_id || "inline"} type=${presenceType} duration=${typingWait}ms`);
                
                await fetch(`${supabaseUrl}/functions/v1/uazapi-send`, {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${serviceKey}`,
                    apikey: serviceKey,
                  },
                  body: JSON.stringify({
                    organization_id: instance.organization_id,
                    instance_id: instance.id,
                    type: "presence",
                    to: remoteJid,
                    payload: presence_payload,
                  }),
                }).catch((e) => console.warn("[uazapi-webhook] presence call failed:", e));

                const startWait = Date.now();
                await new Promise((r) => setTimeout(r, typingWait));
                totalWaitTime += typingWait;
                console.log(`[uazapi-webhook] presence_end: block_id=${chunk.source_block_id || "inline"} real_elapsed=${Date.now() - startWait}ms`);
              }

              if (remaining_wait > 0 && totalWaitTime < MAX_TOTAL_WAIT) {
                const wait = Math.min(remaining_wait, MAX_TOTAL_WAIT - totalWaitTime);
                console.log(`[uazapi-webhook] remaining_wait_start: block_id=${chunk.source_block_id || "inline"} duration=${wait}ms`);
                await new Promise((r) => setTimeout(r, wait));
                totalWaitTime += wait;
              }

              const sendPayload: any = {
                organization_id: instance.organization_id,
                instance_id: instance.id,
                type: chunk.type,
                to: phone,
                payload: {
                  ...chunk.payload,
                  quotedMsgId: chunk.reply_to_message
                    ? norm.messageId
                    : undefined,
                  delay: 0,
                  presence: undefined,
                  skip_warmup: true,
                },
              };

              // 2. RETRY LOOP FOR SENDING
              let sendSuccess = false;
              let retryCount = 0;
              const maxRetries = 3;
              let lastSendError = "";

              while (!sendSuccess && retryCount < maxRetries) {
                if (retryCount > 0) {
                  console.log(`[uazapi-webhook] [RETRY] attempt=${retryCount + 1} block_id=${chunk.source_block_id || "inline"}`);
                  // Exponential backoff
                  await new Promise(r => setTimeout(r, 1000 * retryCount));
                }

                console.log(`[uazapi-webhook] [MEDIA_SEND] sending chunk ${i} (attempt ${retryCount + 1}) to ${phone}`);
                
                try {
                  const sendRes = await fetch(
                    `${supabaseUrl}/functions/v1/uazapi-send`,
                    {
                      method: "POST",
                      headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${serviceKey}`,
                        apikey: serviceKey,
                      },
                      body: JSON.stringify(sendPayload),
                    },
                  );

                  if (sendRes.ok) {
                    sendSuccess = true;
                    const resJson = await sendRes.json().catch(() => ({}));
                    console.log(`[uazapi-webhook] [MEDIA_DELIVERED] success=true block_id=${chunk.source_block_id || "inline"} msg_id=${resJson.body?.id || resJson.body?.key?.id || "unknown"}`);
                  } else {
                    lastSendError = await sendRes.text();
                    const status = sendRes.status;
                    const isRetryable = status === 429 || status >= 500;
                    
                    console.error(`[uazapi-webhook] [SEND_FAILED] attempt=${retryCount + 1} status=${status} retryable=${isRetryable} error=`, lastSendError);
                    
                    if (isRetryable) {
                      retryCount++;
                    } else {
                      console.warn(`[uazapi-webhook] [SEND_ABORT] non-retryable error (${status}), skipping retries.`);
                      break; 
                    }
                  }
                } catch (sendErr: any) {
                  lastSendError = sendErr.message;
                  console.error(`[uazapi-webhook] [SEND_EXCEPTION] attempt=${retryCount + 1} error=`, sendErr.message);
                  retryCount++;
                }
              }

              if (!sendSuccess) {
                console.error(`[uazapi-webhook] [STEP_FAILED] All attempts failed for block ${chunk.source_block_id || "inline"}. Error: ${lastSendError}`);
                
                // Watchdog - purchase_send_failed
                if (chunk.source_block_id) {
                  const sourceBlock = findBlock(chunk.source_block_id);
                  if (sourceBlock?.type === "pixel") {
                    await supabase.from("purchase_audit").update({
                      purchase_status: "failed",
                      error_details: { error: lastSendError, attempts: retryCount }
                    }).eq("conversation_id", conversationId).eq("pixel_block_id", chunk.source_block_id);
                  }
                }
              }

              lastChunkWasMedia = isMedia;
              console.log(`[uazapi-webhook] [STEP_FINISH] ${stepId}`);

              // Persist message to DB so it shows up in the inbox
              const text = typeof chunk.payload === "string"
                ? chunk.payload
                : (chunk.payload?.text || chunk.payload?.caption || "");
              if (text || chunk.type !== "text") {
                const logTag = chunk.type === "audio" ? "audio_send_after_presence" : "message_send_after_presence";
                console.log(`[uazapi-webhook] ${logTag}: block_id=${chunk.source_block_id || "inline"} type=${chunk.type} conversation_id=${conversationId} total_wait_ms=${chunk.delay} configured_presence_ms=${chunk.typing_duration} send_timestamp=${new Date().toISOString()}`);
                
                await supabase.from("webchat_messages").insert({
                  conversation_id: conversationId,
                  direction: "outbound",
                  sender_type: "bot",
                  content: text,
                  message_type: chunk.type === "media"
                    ? (chunk.payload?.type || "file")
                    : chunk.type,
                  metadata: {
                    funnel_id: funnel.id,
                    block_id: nextBlockId,
                    chunk_index: i,
                    ...(chunk.payload?.url
                      ? { media_url: chunk.payload.url }
                      : {}),
                  },
                });
              }
            } catch (sendErr: any) {
              console.error(
                "[uazapi-webhook] funnel_send: exception",
                sendErr?.message || String(sendErr),
              );
            }
          }

          // REFRESH question_sent_at after all messages are sent, so we only count responses AFTER the question is actually out
          if (
            flowVariables["__waiting_input"] &&
            flowVariables["__waiting_input"].answered === false && !isResume
          ) {
            const now = new Date().toISOString();
            flowVariables["__waiting_input"].question_sent_at = now;
            flowVariables["waiting_question_sent_at"] = now;
            console.log(
              "[uazapi-webhook] question_block_sent_at_refreshed:",
              now,
            );

            // Persist the refreshed question_sent_at immediately so concurrent webhooks see it
            try {
              await supabase.from("webchat_conversations").update({
                flow_variables: flowVariables,
              }).eq("id", conversationId);
              console.log(
                "[uazapi-webhook] question_block_sent_at_persisted_successfully",
              );
            } catch (persistErr) {
              console.error(
                "[uazapi-webhook] question_block_sent_at_persist_failed:",
                persistErr,
              );
            }
          }

          console.log(
            "[uazapi-webhook] funnel_run: done",
            JSON.stringify({
              chunks: chunksToSend.length,
              next_block_id: nextBlockId,
              flow_completed: flowCompleted,
              handoff_to_agent: handoffToAgent,
              closed: closeConversation,
            }),
          );

          if (receiptRecognizedThisLoop && !pixelEnteredThisLoop) {
            console.error(`[WATCHDOG] [receipt_flow_stuck] conversation: ${conversationId}, receipt recognized but pixel block not entered in same loop.`);
            try {
              await supabase.from("agent_action_logs").insert({
                organization_id: (conv as any).organization_id,
                conversation_id: conversationId,
                lead_id: (conv as any).lead_id,
                action_type: "receipt_flow_stuck",
                action_data: {
                  current_block_id: (conv as any).current_block_id,
                  next_block_id: nextBlockId,
                  debug_version: "WATCHDOG_V1"
                },
                success: false,
                error_message: "Receipt recognized but flow did not reach Pixel block"
              });
            } catch (watchErr) {
              console.error("[WATCHDOG] failed to log stuck flow:", watchErr);
            }
          }

          // 5) Release lock
          if (lockAcquired) {
            await releaseConversationLock(supabase, conversationId);
          }

          // If we are NOT releasing to the orchestrator/agent, stop here
          if (!releaseToOrchestrator) {
            return new Response(JSON.stringify({ ok: true, funnel: true }), {
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }
          // Otherwise fall through to the normal bot pipeline below so the
          // newly assigned agent can respond on the same incoming message.
        }

        if (conv && conv.status === "bot_active") {
          const productId = (conv as any).webchat_widgets?.product_id;

          // PRIORITY: if THIS instance has a dedicated agent, lock to it and
          // bypass the orchestrator entirely. A WhatsApp number dedicated to a
          // product/agent must NEVER be answered by another product's agent.
          const { data: instanceLockAgent } = await supabase
            .from("product_agents")
            .select("id, product_id")
            .eq("evolution_instance_id", instance.id)
            .eq("is_active", true)
            .order("is_default", { ascending: false })
            .limit(1)
            .maybeSingle();

          let agentId: string | null = null;
          let resolvedProductId: string | null = productId || null;
          let orchOwnsConversation = false;

          if (instanceLockAgent?.id) {
            agentId = instanceLockAgent.id;
            if (instanceLockAgent.product_id) {
              resolvedProductId = instanceLockAgent.product_id;
            }
            // Se a conversa já está com OUTRO agente ATIVO da mesma org (típico
            // após handoff Maria→Sonia), respeite — NÃO force voltar pro instance lock.
            // Só sobrescreve se current_agent_id for null/inválido.
            const currentAgentId = (conv as any).current_agent_id || null;
            if (currentAgentId && currentAgentId !== agentId) {
              const { data: currentAgentRow } = await supabase
                .from("product_agents")
                .select("id, organization_id, is_active")
                .eq("id", currentAgentId)
                .maybeSingle();
              if (
                currentAgentRow?.is_active &&
                currentAgentRow.organization_id === instance.organization_id
              ) {
                agentId = currentAgentRow.id;
                console.log(
                  "[uazapi-webhook] bot_call: respecting current_agent_id (post-handoff):",
                  agentId,
                );
              } else {
                await supabase
                  .from("webchat_conversations")
                  .update({
                    current_agent_id: agentId,
                    orchestrator_state: "em_atendimento",
                  })
                  .eq("id", conversationId);
                console.log(
                  "[uazapi-webhook] bot_call: re-locking conv to instance agent (current invalid):",
                  agentId,
                );
              }
            }
          } else {
            // No instance lock → consider orchestrator
            const { data: orchCfgBot } = await supabase
              .from("organization_orchestrator_config")
              .select("is_enabled, orchestrator_agent_id")
              .eq("organization_id", instance.organization_id)
              .maybeSingle();
            const orchActiveBot =
              !!(orchCfgBot?.is_enabled && orchCfgBot?.orchestrator_agent_id);
            const convOrchState = (conv as any).orchestrator_state || null;
            orchOwnsConversation = orchActiveBot &&
              (convOrchState === null || convOrchState === "triagem" ||
                convOrchState === "aguardando_menu");

            if (!orchOwnsConversation) {
              agentId = (conv as any).current_agent_id || null;
              if (!agentId && resolvedProductId) {
                const { data: defAgent } = await supabase
                  .from("product_agents")
                  .select("id")
                  .eq("product_id", resolvedProductId)
                  .eq("is_default", true)
                  .eq("is_active", true)
                  .maybeSingle();
                agentId = defAgent?.id || null;
              }
              if (!agentId && resolvedProductId) {
                const { data: anyAgent } = await supabase
                  .from("product_agents")
                  .select("id")
                  .eq("product_id", resolvedProductId)
                  .eq("is_active", true)
                  .order("created_at", { ascending: true })
                  .limit(1)
                  .maybeSingle();
                agentId = anyAgent?.id || null;
              }
            } else {
              console.log(
                "[uazapi-webhook] bot_call: orchestrator owns conversation → no agent_id",
              );
            }
          }

          // Derive product_id from agent when only agent_id is known
          if (agentId && !resolvedProductId) {
            const { data: agentRow } = await supabase
              .from("product_agents")
              .select("product_id")
              .eq("id", agentId)
              .maybeSingle();
            if (agentRow?.product_id) {
              resolvedProductId = agentRow.product_id;
              console.log(
                "[uazapi-webhook] bot_call: derived product_id from agent:",
                resolvedProductId,
              );
            }
          }

          // Persist resolved product_id on the conversation so future messages skip resolution
          if (resolvedProductId && !(conv as any).product_id) {
            await supabase
              .from("webchat_conversations")
              .update({ product_id: resolvedProductId })
              .eq("id", conversationId);
          }

          let productIdForBot = resolvedProductId;

          // FINAL FALLBACK: if we still have no product/agent and orchestrator is not active,
          // grab any active agent of the org with a product_id so we never go silent.
          if (!productIdForBot && !orchOwnsConversation && !agentId) {
            const { data: orgFallbackAgent } = await supabase
              .from("product_agents")
              .select("id, product_id")
              .eq("organization_id", instance.organization_id)
              .eq("is_active", true)
              .not("product_id", "is", null)
              .order("is_default", { ascending: false })
              .order("created_at", { ascending: true })
              .limit(1)
              .maybeSingle();
            if (orgFallbackAgent?.id) {
              agentId = orgFallbackAgent.id;
              productIdForBot = orgFallbackAgent.product_id;
              await supabase
                .from("webchat_conversations")
                .update({ current_agent_id: agentId })
                .eq("id", conversationId);
              console.log(
                "[uazapi-webhook] bot_call: org-wide fallback agent applied:",
                agentId,
                "product:",
                productIdForBot,
              );
            }
          }

          if (!productIdForBot && !orchOwnsConversation) {
            console.log(
              "[uazapi-webhook] bot_call: skip (no product_id and no orchestrator)",
            );
          } else {
            const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
            const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

            // ============================================================
            // LOCK POR CONVERSA — impede 2 jobs paralelos para o mesmo lead
            // ============================================================
            let singleProc = true;
            let dedupEnabled = true;
            let dedupWindowMs = 120_000;
            try {
              const { data: orgCfg } = await supabase
                .from("organizations")
                .select(
                  "ai_single_processing_per_conversation, ai_dedup_enabled, ai_dedup_window_ms",
                )
                .eq("id", instance.organization_id)
                .maybeSingle();
              if (orgCfg) {
                if (orgCfg.ai_single_processing_per_conversation === false) {
                  singleProc = false;
                }
                if (orgCfg.ai_dedup_enabled === false) dedupEnabled = false;
                if (orgCfg.ai_dedup_window_ms != null) {
                  dedupWindowMs = Math.max(
                    0,
                    Math.min(600_000, Number(orgCfg.ai_dedup_window_ms)),
                  );
                }
              }
            } catch (_) { /* keep defaults */ }

            let lockAcquired = false;
            if (singleProc) {
              lockAcquired = await acquireConversationLock(
                supabase,
                conversationId,
                30_000,
              );
              if (!lockAcquired) {
                console.log(
                  "[uazapi-webhook] bot_call: skip (conversation locked by another job)",
                );
                return new Response(
                  JSON.stringify({ ok: true, skipped: "conversation_locked" }),
                  {
                    headers: {
                      ...corsHeaders,
                      "Content-Type": "application/json",
                    },
                  },
                );
              }
            }

            // Disponibiliza p/ o restante deste bloco (resp dedup + release)
            (globalThis as any).__convDedup = {
              enabled: dedupEnabled,
              windowMs: dedupWindowMs,
            };

            console.log(
              "[uazapi-webhook] bot_call: invoking",
              JSON.stringify({
                conversation_id: conversationId,
                product_id: productIdForBot,
                agent_id: agentId,
                instance_locked: !!instanceLockAgent?.id,
                lock_acquired: lockAcquired,
              }),
            );

            // ============================================================
            // Agrega TODAS as mensagens do visitor desde a última resposta
            // do bot/agente. Garante que múltiplas mensagens consecutivas
            // virem 1 contexto único para o agente raciocinar.
            // ============================================================
            let aggregatedMessage = processedContent || norm.content;
            try {
              const { data: lastBotMsg } = await supabase
                .from("webchat_messages")
                .select("created_at")
                .eq("conversation_id", conversationId)
                .in("sender_type", ["bot", "agent"])
                .order("created_at", { ascending: false })
                .limit(1)
                .maybeSingle();

              let pendingQ = supabase
                .from("webchat_messages")
                .select("content, created_at")
                .eq("conversation_id", conversationId)
                .eq("sender_type", "visitor")
                .order("created_at", { ascending: true });
              if (lastBotMsg?.created_at) {
                pendingQ = pendingQ.gt("created_at", lastBotMsg.created_at);
              }
              const { data: pendingMsgs } = await pendingQ;

              if (pendingMsgs && pendingMsgs.length > 1) {
                aggregatedMessage = pendingMsgs
                  .map((m: any) => String(m.content || "").trim())
                  .filter((s: string) => s.length > 0)
                  .join("\n");
                console.log(
                  "[uazapi-webhook] aggregated",
                  pendingMsgs.length,
                  "visitor msgs into one",
                );
              }
            } catch (aggErr: any) {
              console.warn(
                "[uazapi-webhook] aggregation failed (non-fatal):",
                aggErr?.message,
              );
            }

            const botRes = await fetch(
              `${supabaseUrl}/functions/v1/webchat-bot`,
              {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${serviceKey}`,
                  apikey: serviceKey,
                },
                body: JSON.stringify({
                  conversation_id: conversationId,
                  // Send aggregated content so the agent sees the full thought
                  // (e.g. "Boa noite\nTudo bem?\nQuero ver imóveis") at once.
                  message: aggregatedMessage,
                  product_id: productIdForBot,
                  visitor_name: (conv as any).visitor_name || senderName,
                  agent_id: agentId,
                  lead_id: (conv as any).lead_id || null,
                  channel: "whatsapp",
                }),
              },
            );

            const botText = await botRes.text();
            let botData: any = null;
            try {
              botData = botText ? JSON.parse(botText) : null;
            } catch {
              botData = botText;
            }

            if (!botRes.ok) {
              console.error(
                "[uazapi-webhook] bot_call: error",
                JSON.stringify({
                  status: botRes.status,
                  body: typeof botData === "string"
                    ? botData.slice(0, 500)
                    : JSON.stringify(botData).slice(0, 500),
                }),
              );
            } else {
              // Collect responses: prefer chunks, fallback to single message content
              let chunks: string[] =
                Array.isArray(botData?.chunks) && botData.chunks.length > 0
                  ? botData.chunks.filter((c: any) =>
                    typeof c === "string" && c.trim().length > 0
                  )
                  : (botData?.message?.content
                    ? [String(botData.message.content)]
                    : []);

              // Humanization delays (computed by webchat-bot via humanizer)
              const firstDelayMs: number = Number(botData?.delays?.firstMs) ||
                0;
              let betweenDelaysMs: number[] =
                Array.isArray(botData?.delays?.betweenMs)
                  ? botData.delays.betweenMs.map((n: any) => Number(n) || 0)
                  : [];
              let typingMsPerBubble: number[] = Array.isArray(botData?.typingMs)
                ? botData.typingMs.map((n: any) => Number(n) || 0)
                : [];
              const sharedMetadata = botData?.metadata || null;

              // ============================================================
              // CAP de bolhas (defesa em profundidade) — apenas teto absoluto
              // de 4 bolhas para WhatsApp. Não colapsa a decisão do agente.
              // ============================================================
              if (chunks.length > 0) {
                const HARD_TETO = 4;
                if (chunks.length > HARD_TETO) {
                  const head = chunks.slice(0, HARD_TETO - 1);
                  const tail = chunks.slice(HARD_TETO - 1).join("\n\n").trim();
                  chunks = [...head, tail];
                  betweenDelaysMs = betweenDelaysMs.slice(0, HARD_TETO - 1);
                  while (betweenDelaysMs.length < HARD_TETO - 1) {
                    betweenDelaysMs.push(1200);
                  }
                  if (typingMsPerBubble.length > HARD_TETO) {
                    const headT = typingMsPerBubble.slice(0, HARD_TETO - 1);
                    const tailT = typingMsPerBubble.slice(HARD_TETO - 1).reduce(
                      (a, b) => a + b,
                      0,
                    );
                    typingMsPerBubble = [...headT, tailT];
                  }
                  console.log(
                    "[uazapi-webhook] whatsapp hard-cap: chunks reduced to",
                    chunks.length,
                  );
                }
                // Clamp delays entre 800ms e 4000ms
                betweenDelaysMs = betweenDelaysMs.map((n) =>
                  Math.min(4000, Math.max(800, Number(n) || 1200))
                );
              }

              console.log(
                "[uazapi-webhook] bot_call: ok",
                JSON.stringify({
                  chunks_count: chunks.length,
                  first_delay_ms: firstDelayMs,
                  between_delays_ms: betweenDelaysMs,
                }),
              );

              // Initial human-like delay before the first bubble.
              // HARD CAP: 15s — antes era 120s e estava fazendo IA demorar 1-2 min.
              if (firstDelayMs > 0) {
                await new Promise((r) =>
                  setTimeout(r, Math.min(firstDelayMs, 15_000))
                );
              }

              // Toggle "Simular digitando..." do agente liga/desliga a Presence Engine real.
              const agentTypingIndicator = botData?.typingIndicator !== false;

              const sendEvo = async (payloadBody: any) => {
                return await fetch(`${supabaseUrl}/functions/v1/uazapi-send`, {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${serviceKey}`,
                    apikey: serviceKey,
                  },
                  body: JSON.stringify(payloadBody),
                });
              };

              const dedupCfg = (globalThis as any).__convDedup ||
                { enabled: true, windowMs: 120_000 };

              for (let i = 0; i < chunks.length; i++) {
                const text = chunks[i];

                // 0) DEDUP DE RESPOSTA — não envia se uma resposta igual saiu há pouco
                if (dedupCfg.enabled) {
                  const dup = await isDuplicateResponse(
                    supabase,
                    conversationId,
                    text,
                    dedupCfg.windowMs,
                  );
                  if (dup) {
                    console.log(
                      "[uazapi-webhook] bot_send: skip duplicate_response",
                      text.slice(0, 60),
                    );
                    continue;
                  }
                }

                const isTimeoutResume = (payload as any).__is_resume && (conv as any).flow_variables?.__waiting_input?.is_timeout === true;
                if (isTimeoutResume) {
                  console.log("[uazapi-webhook] bot_send: skipping message delivery due to timeout resume (silent)");
                  continue;
                }

                // 1) "digitando..." REAL no WhatsApp via Presence Engine

                //    (POST /message/presence — UazAPI, com heartbeat a cada 7s)
                const typingMs = Math.max(
                  600,
                  Math.min(
                    typingMsPerBubble[i] || (1500 + text.length * 25),
                    8000,
                  ),
                );
                const presenceEnabled = presenceEnabledOrg &&
                  agentTypingIndicator;
                const typingHandle = await startTyping(supabase, {
                  organization_id: instance.organization_id,
                  instance_id: instance.id,
                  phone,
                  isAudio: false,
                  enabled: presenceEnabled,
                });
                await new Promise((r) => setTimeout(r, typingMs));

                // 2) Envia o balão
                let externalId: string | null = null;
                try {
                  const sendRes = await sendEvo({
                    organization_id: instance.organization_id,
                    instance_id: instance.id,
                    type: "text",
                    to: phone,
                    payload: { text },
                  });
                  const sendBody = await sendRes.text();
                  console.log(
                    "[uazapi-webhook] bot_send chunk",
                    i + 1,
                    "/",
                    chunks.length,
                    "status:",
                    sendRes.status,
                    "body:",
                    sendBody.slice(0, 200),
                  );
                  if (sendRes.ok) {
                    await recordSentResponse(supabase, conversationId, text);
                  }
                  try {
                    const parsed = JSON.parse(sendBody);
                    externalId = parsed?.body?.key?.id ||
                      parsed?.body?.messageId ||
                      parsed?.body?.id ||
                      null;
                  } catch { /* ignore */ }
                } catch (sendErr: any) {
                  console.error(
                    "[uazapi-webhook] bot_send: exception",
                    sendErr?.message || String(sendErr),
                  );
                }

                // 2.5) Encerra "digitando..." (paused) — heartbeat para
                try {
                  await typingHandle.stop();
                } catch { /* noop */ }

                // 3) Persiste 1 linha por chunk no Inbox (espelho fiel do WhatsApp)
                try {
                  const chunkMetadata: Record<string, any> = {
                    chunk_index: i,
                    chunk_total: chunks.length,
                  };
                  if (externalId) chunkMetadata.external_id = externalId;
                  if (sharedMetadata && i === chunks.length - 1) {
                    Object.assign(chunkMetadata, sharedMetadata);
                  }
                  await supabase.from("webchat_messages").insert({
                    conversation_id: conversationId,
                    direction: "outbound",
                    sender_type: "bot",
                    content: text,
                    message_type: "text",
                    metadata: chunkMetadata,
                  });
                } catch (persistErr: any) {
                  console.warn(
                    "[uazapi-webhook] persist chunk: failed (non-fatal)",
                    persistErr?.message,
                  );
                }

                // 4) Pausa humana entre balões — HARD CAP 6s (antes 60s).
                if (i < chunks.length - 1) {
                  const between = betweenDelaysMs[i] ?? 1200;
                  await new Promise((r) =>
                    setTimeout(r, Math.min(between, 6_000))
                  );
                }
              }

              // Atualiza last_message_at depois de todos os chunks
              if (chunks.length > 0) {
                try {
                  await supabase
                    .from("webchat_conversations")
                    .update({
                      last_message_at: new Date().toISOString(),
                      unread_count_agents: 0, // Auto-mark as read on response
                    })
                    .eq("id", conversationId);
                } catch { /* ignore */ }
              }
            }
          }
        } else {
          console.log(
            "[uazapi-webhook] bot_call: skip (status:",
            conv?.status || "unknown",
            ")",
          );
        }
      } catch (botErr: any) {
        // Never break the webhook because of bot errors — UazAPI would retry
        console.error(
          "[uazapi-webhook] bot_call: exception",
          botErr?.message || String(botErr),
        );
      } finally {
        // Sempre libera o lock por conversa (best-effort)
        try {
          await releaseConversationLock(supabase, conversationId);
        } catch (_) {
          /* noop */
        }
      }

      // DEBUG ACTION: Controlled insert test
      const url = new URL(req.url);
      const action = url.searchParams.get("action");
      if (action === "debug-insert-tracking") {
        const payload = await req.json();
        const result = await debugInsertTracking(supabase, payload);
        return new Response(JSON.stringify(result), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ---- UNKNOWN ----
    console.log(
      "[uazapi-webhook] unhandled event:",
      (norm as any).event,
      "instance:",
      norm.instance,
      "payload_keys:",
      Object.keys(payload),
    );
    if (norm.instance) {
      console.log(
        "[uazapi-webhook] unknown event payload dump:",
        JSON.stringify(payload).slice(0, 1000),
      );
    }
    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("[uazapi-webhook] error:", err);
    if (healthId) {
      await updateWebhookHealth(supabase, healthId, {
        error: err.message || String(err)
      });
    }
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

});


/** Helper: Sincroniza variáveis capturadas no fluxo (name, phone, email, etc.) para o lead vinculado. */
async function syncFlowVarsToLead(
  supabase: any,
  conversationId: string,
  flowVariables: Record<string, any>,
  options?: { onlyKeys?: string[] },
): Promise<void> {
  try {
    const { data: conv } = await supabase
      .from("webchat_conversations")
      .select("lead_id, organization_id")
      .eq("id", conversationId)
      .maybeSingle();
    if (!conv?.lead_id) return;

    const KNOWN: Record<string, string> = {
      name: "name",
      nome: "name",
      full_name: "name",
      email: "email",
      "e-mail": "email",
      phone: "phone",
      telefone: "phone",
      whatsapp: "phone",
      celular: "phone",
      company: "company",
      empresa: "company",
      cpf: "cpf",
      cnpj: "cnpj",
    };

    const update: Record<string, any> = {};
    const customFields: Record<string, any> = {};
    let hasCustom = false;

    const entries = Object.entries(flowVariables).filter(([k, v]) => {
      if (k.startsWith("__")) return false;
      if (v == null || String(v).trim() === "") return false;
      if (options?.onlyKeys && !options.onlyKeys.includes(k)) return false;
      return true;
    });

    for (const [rawKey, rawValue] of entries) {
      const key = rawKey.toLowerCase();
      const value = typeof rawValue === "object"
        ? JSON.stringify(rawValue)
        : String(rawValue).trim();
      const mapped = KNOWN[key];
      if (mapped) {
        update[mapped] = value;
      } else {
        customFields[rawKey] = value;
        hasCustom = true;
      }
    }

    if (Object.keys(update).length === 0 && !hasCustom) return;

    if (hasCustom) {
      const { data: leadRow } = await supabase
        .from("leads")
        .select("custom_fields")
        .eq("id", conv.lead_id)
        .maybeSingle();
      update.custom_fields = {
        ...(leadRow?.custom_fields || {}),
        ...customFields,
      };
    }

    await supabase.from("leads").update(update).eq("id", conv.lead_id);
    console.log(
      "[uazapi-webhook] lead_synced:",
      conv.lead_id,
      Object.keys(update),
    );
  } catch (e) {
    console.warn("[uazapi-webhook] sync_lead_error:", e);
  }
}
