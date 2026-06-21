import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { encodeBase64 } from "https://deno.land/std@0.207.0/encoding/base64.ts";
import { normalizePhoneBR, phoneVariantsBR } from "../_shared/phone.ts";
import { startTyping } from "../_shared/presence.ts";
import { resolveAIProvider } from "../_shared/ai-credentials.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ============================================================================
// Anti-spam & Humanization helpers
// ============================================================================

/** Delay aleatório para simular comportamento humano (800ms a 2500ms). */
const randomDelay = (min = 800, max = 2500) =>
  new Promise(resolve => setTimeout(resolve, Math.floor(Math.random() * (max - min + 1) + min)));


/** Hash normalizado de uma resposta para dedup curto-prazo. */
function normalizeResponseHash(text: string): string {
  return (text || "")
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
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
  console.warn("[anti-spam] processed_messages insert non-unique error:", (error as any).message);
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

async function releaseConversationLock(supabase: any, conversationId: string): Promise<void> {
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

async function recordSentResponse(supabase: any, conversationId: string, text: string): Promise<void> {
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
      remoteJid: string;
      lidJid?: string;
      pushName: string;
      messageId: string;
      content: string;
      media?: MediaInfo;
      contextInfo?: any;
    }
  | { kind: "message_delete"; instance: string; messageId: string; remoteJid: string }
  | { kind: "message_ack"; instance: string; messageId: string; remoteJid: string; status: "sent" | "delivered" | "read" | "failed"; error?: string }
  | { kind: "connection"; instance: string; state: "open" | "connecting" | "close"; phone?: string }
  | { kind: "qrcode"; instance: string; qr: string }
  | { kind: "unknown"; instance: string; event: string };


function extractString(val: any): string {
  if (val == null) return "";
  if (typeof val === "string") return val.trim();
  if (typeof val === "object") {
    // Candidates for ID in various UazAPI/Uazapi/whatsmeow structures.
    // We prioritize JID/Phone fields over internal IDs like 'id'.
    const id =
      val.wa_chatid || val.wa_chatId || val.chatid || val.chatId ||
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
    typeof payload?.instance === "object" ? (payload?.instance?.instanceName || payload?.instance?.name || payload?.instance?.id) : null,
    payload?.data?.instance,
    payload?.data?.Instance,
    payload?.data?.instanceName,
    payload?.data?.instance_name,
    payload?.data?.instanceId,
    payload?.data?.instance_id,
    payload?.data?.session,
    typeof payload?.data?.instance === "object" ? (payload?.data?.instance?.name || payload?.data?.instance?.instanceName) : null,
    payload?.sender?.instance,
  ];
  for (const c of candidates) {
    const s = extractString(c);
    if (s) return s;
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
  const eventRaw = payload.event || payload.EventType || payload.type || payload.Event || "";
  const event = typeof eventRaw === "string" ? eventRaw : "";
  const instance: string = extractInstance(payload);

  if (!instance) return null;
  const data = payload.data || payload;


  // Helper: extract media info from a whatsmeow-style message object.
  // Audio is the most common multimodal input we get from leads.
  function extractMedia(message: any): MediaInfo | undefined {
    if (!message) return undefined;

    // Handle nested 'content' (common in Uazapi/UazAPI)
    if (message.content && typeof message.content === "object" && !message.imageMessage && !message.audioMessage) {
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
      typeof m?.base64 === "string" ? m.base64 :
      typeof m?.Base64 === "string" ? m.Base64 :
      typeof m?.media === "string" ? m.media :
      typeof m?.Media === "string" ? m.Media :
      undefined;

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
      const type = flatMime.startsWith("audio/") ? "audio" :
                   flatMime.startsWith("image/") ? "image" :
                   flatMime.startsWith("video/") ? "video" :
                   flatMime.startsWith("application/") ? "document" :
                   flatMime.includes("webp") ? "sticker" : "document";
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
    if (typeof data.content === "string" && data.content.trim().startsWith("{")) {
      try {
        const parsed = JSON.parse(data.content);
        if (parsed.URL || parsed.url || parsed.directPath || parsed.imageMessage || parsed.audioMessage) {
          actualData = { ...data, ...parsed };
        }
      } catch (_) { /* ignore */ }
    }

    const messages = Array.isArray(actualData.messages)
      ? actualData.messages
      : (actualData.message && typeof actualData.message === "object" && actualData.message.key ? [actualData.message] : [actualData]);

    const msg = messages[0];
    if (!msg) return null;

    const key = msg.key || {};
    const contextInfo = msg.message?.contextInfo || data.contextInfo || msg.contextInfo;
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
      ""
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
      ""
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
      ""
    );


    // Fallback for content: Uazapi sometimes flattens the message text or nests it differently
    const content =
      msg.message?.conversation ||
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
      (typeof data.content === 'object' && data.content?.text ? data.content.text : null) ||
      (media?.type === "audio" ? "[áudio]" : "") ||
      (media?.type === "image" ? "[imagem]" : "") ||
      (media?.type === "video" ? "[vídeo]" : "") ||
      (media?.type === "document" ? "[documento]" : "") ||
      "";

    return {
      kind: "message",
      instance,
      fromMe:
        key.fromMe === true ||
        data.fromMe === true ||
        msg.fromMe === true ||
        data.isFromMe === true ||
        data.is_from_me === true ||
        data.from_me === true ||
        data.Direction === "outbound",
      remoteJid,
      pushName,
      messageId,
      content,
      media,
      contextInfo,
    };
  }





  if (event === "messages.delete" || event === "MESSAGES_DELETE" || event === "MessageRevoke") {
    const messageId = extractString(data.id || data.key?.id || data.messageId || "");
    const remoteJid = extractString(data.remoteJid || data.key?.remoteJid || data.chat || "");
    if (messageId) {
      return { kind: "message_delete", instance, messageId, remoteJid };
    }
  }

  // ---- ACK events ----
  if (event === "messages.update" || event === "MESSAGES_UPDATE" || event === "message.ack" || event === "MessageStatus" || event === "MessageUpdate") {
    // Evolution / Uazapi Go standard shape
    const updates = Array.isArray(data) ? data : (data.messages || [data]);
    const first = updates[0];
    if (first) {
      const key = first.key || first;
      const messageId = extractString(key.id || key.messageId || first.id || "");
      const remoteJid = extractString(key.remoteJid || first.chat || first.remoteJid || "");

      // Map numeric status to strings
      // Evolution/whatsmeow: 0=Error, 1=Pending, 2=Server/Sent, 3=Delivered, 4=Read, 5=Played
      // UazAPI v1 sometimes uses different mapping but usually 2=Sent, 3=Delivered, 4=Read
      const rawStatus = first.update?.status ?? first.status;
      let status: "sent" | "delivered" | "read" | "failed" | undefined;

      if (rawStatus === 0 || rawStatus === "ERROR" || rawStatus === "failed") status = "failed";
      else if (rawStatus === 1) status = "sent"; // pending -> sent for UI simplicity
      else if (rawStatus === 2 || rawStatus === "SENT") status = "sent";
      else if (rawStatus === 3 || rawStatus === "DELIVERED") status = "delivered";
      else if (rawStatus === 4 || rawStatus === 5 || rawStatus === "READ" || rawStatus === "SEEN") status = "read";

      if (messageId && status) {
        return {
          kind: "message_ack",
          instance,
          messageId,
          remoteJid,
          status,
          error: first.update?.error || first.error
        };
      }
    }
  }

  if (event === "connection.update" || event === "CONNECTION_UPDATE" || event === "connection" || event === "INSTANCE_UPDATE") {
    const state = data.state || data.status || data.connectionStatus || "";
    const isOpen = state === "open" || state === "connected" || state === "CONNECTED" || state === "OPEN";
    const isConnecting = state === "connecting" || state === "CONNECTING";

    return {
      kind: "connection",
      instance,
      state: isOpen ? "open" : isConnecting ? "connecting" : "close",
      phone: data.wuid || data.number || data.phoneNumber || data.jid,
    };
  }

  if (event === "qrcode.updated" || event === "QRCODE_UPDATED" || event === "qrcode" || event === "QRCODE") {
    const qrRaw = data.qrcode?.base64 || data.qrcode?.code || data.base64 || data.code || data.qrcode || data.qr;
    return { kind: "qrcode", instance, qr: normalizeQrString(qrRaw) || "" };
  }

  // ---- UazAPI events ----
  // Message / SendMessage payloads carry whatsmeow Info + Message structures.
  if (event === "Message" || event === "SendMessage") {
    const info = data.Info || data.info || {};
    const message = data.Message || data.message || {};
    const sender: string = info.Sender || info.sender || info.RemoteJid || "";
    const rawRemoteJid: string = info.Chat || info.RemoteJid || sender || "";
    const fromMe: boolean = !!(info.IsFromMe ?? info.isFromMe ?? event === "SendMessage");

    // Resolver JID @lid → JID @s.whatsapp.net (telefone real) quando whatsmeow envia o "Alt".
    // Em fromMe, o destino real (telefone) vem em RecipientAlt/RecipientPn/ChatAlt.
    // Em inbound, o sender real vem em SenderAlt/SenderPn.
    const altJidCandidates = fromMe
      ? [info.RecipientAlt, info.RecipientPn, info.ChatAlt, info.recipientAlt, info.recipientPn, info.chatAlt]
      : [info.SenderAlt, info.SenderPn, info.senderAlt, info.senderPn];
    const altPhoneJid = altJidCandidates.find(
      (j: any) => typeof j === "string" && j.includes("@s.whatsapp.net"),
    ) as string | undefined;

    // Preferimos o JID telefônico real; mantemos o LID como referência separada.
    const remoteJid = altPhoneJid || rawRemoteJid;
    const lidJid = rawRemoteJid.includes("@lid") ? rawRemoteJid : (altJidCandidates.find((j: any) => typeof j === "string" && j.includes("@lid")) as string | undefined);

    const content =
      message.conversation ||
      message.extendedTextMessage?.text ||
      message.imageMessage?.caption ||
      message.videoMessage?.caption ||
      (message.audioMessage ? "[áudio]" : "") ||
      (message.imageMessage ? "[imagem]" : "") ||
      (message.videoMessage ? "[vídeo]" : "") ||
      (message.documentMessage ? "[documento]" : "") ||
      "";

    const media = extractMedia(message);

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
      contextInfo: message.contextInfo,
    };
  }


  if (event === "Connected" || event === "PairSuccess") {
    return { kind: "connection", instance, state: "open", phone: data.JID || data.jid };
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
      data.QRCode, data.qrcode, data.qr, data.Qr, data.code, data.Code,
      data.base64, data.Base64,
      data?.qrcode?.base64, data?.qrcode?.code,
      data?.QRCode?.Base64, data?.QRCode?.Code,
      data?.data?.qrcode, data?.data?.base64, data?.data?.code,
      payload.QRCode, payload.qrcode, payload.qr, payload.code, payload.base64,
    ];
    let qr = "";
    for (const c of candidates) {
      const normalizedQr = normalizeQrString(c);
      if (normalizedQr) { qr = normalizedQr; break; }
    }
    if (!qr) {
      try {
        console.warn("[uazapi-webhook] QRCode event sem QR extraível — payload:",
          JSON.stringify(payload).slice(0, 2000));
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
    if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return true; // JPEG
    if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return true; // PNG
    if (ascii(0, 6) === "GIF87a" || ascii(0, 6) === "GIF89a") return true;
    if (ascii(0, 4) === "RIFF" && ascii(8, 4) === "WEBP") return true;
    // Audio
    if (ascii(0, 4) === "OggS") return true;
    if (ascii(0, 4) === "RIFF" && ascii(8, 4) === "WAVE") return true;
    if (ascii(0, 4) === "fLaC") return true;
    if (ascii(0, 3) === "ID3") return true;
    if (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0) return true; // MP3 sync
    if (ascii(4, 4) === "ftyp") return true; // M4A/MP4
    if (bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3) return true; // WebM
    // Documents
    if (bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) return true; // PDF
    return false;
  } catch {
    return false;
  }
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  const chunk = 0x8000;
