import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

declare const OffscreenCanvas: {
  new (width: number, height: number): {
    getContext(type: "2d"): { drawImage: (image: { width: number; height: number }, dx: number, dy: number) => void } | null;
    convertToBlob: (options?: { type?: string; quality?: number }) => Promise<Blob>;
  };
};

declare function createImageBitmap(image: Blob): Promise<{
  width: number;
  height: number;
  close: () => void;
}>;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface SendBody {
  conversation_id: string;
  item_id: string;
  caption_override?: string | null;
  send_extra_images?: boolean; // default true (até 2 fotos extras)
  send_videos?: boolean;       // default true
  send_documents?: boolean;    // default true
}

const DELAY_MS = 1200;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function formatPrice(price: number | null, currency: string | null): string {
  if (price == null) return "";
  const cur = (currency || "BRL").toUpperCase();
  try {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: cur,
      maximumFractionDigits: 0,
    }).format(price);
  } catch {
    return `${cur} ${price.toFixed(2)}`;
  }
}

function buildCaption(item: any, override?: string | null): string {
  if (override && override.trim()) return override.trim();
  const lines: string[] = [];
  lines.push(`*${item.title}*`);
  if (item.price != null) lines.push(formatPrice(item.price, item.currency));
  if (item.description) {
    const desc = String(item.description).slice(0, 180);
    lines.push("");
    lines.push(desc);
  }
  if (item.url) {
    lines.push("");
    lines.push(`🔗 ${item.url}`);
  }
  return lines.join("\n");
}

/**
 * Build the prioritized list of image URLs:
 * 1. primeira imagem de item.images
 * 2. thumbnail_url (se diferente)
 * 3. extras de item.images (até completar 3 no total)
 */
function buildImageList(item: any): string[] {
  const images: string[] = Array.isArray(item.images)
    ? item.images.filter((u: any) => typeof u === "string" && u.length > 0)
    : [];
  const thumb: string | null = item.thumbnail_url || null;
  const ordered: string[] = [];
  if (images[0]) ordered.push(images[0]);
  if (thumb && !ordered.includes(thumb)) ordered.push(thumb);
  for (const img of images.slice(1)) {
    if (!ordered.includes(img)) ordered.push(img);
    if (ordered.length >= 3) break;
  }
  return ordered;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const body = (await req.json()) as SendBody;
    if (!body.conversation_id || !body.item_id) {
      return new Response(JSON.stringify({ error: "conversation_id and item_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const sendExtraImages = body.send_extra_images !== false;
    const sendVideos = body.send_videos !== false;
    const sendDocuments = body.send_documents !== false;

    // Load conversation context
    const { data: conv, error: convErr } = await supabase
      .from("webchat_conversations")
      .select("id, organization_id, channel, lead_id, evolution_instance_id, visitor_phone")
      .eq("id", body.conversation_id)
      .maybeSingle();

    if (convErr || !conv) {
      return new Response(JSON.stringify({ error: "conversation not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Load catalog item
    const { data: item, error: itemErr } = await supabase
      .from("product_catalog_items")
      .select("*")
      .eq("id", body.item_id)
      .eq("organization_id", conv.organization_id)
      .maybeSingle();

    if (itemErr || !item) {
      return new Response(JSON.stringify({ error: "catalog item not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const caption = buildCaption(item, body.caption_override);
    const channel = (conv.channel || "chat").toLowerCase();

    // Try to find lead phone if not in conversation
    let phone: string | null = conv.visitor_phone || null;
    if (!phone && conv.lead_id) {
      const { data: lead } = await supabase
        .from("leads")
        .select("phone")
        .eq("id", conv.lead_id)
        .maybeSingle();
      phone = lead?.phone || null;
    }

    let delivered = false;
    let deliveryChannel = channel;
    let lastProviderError: string | null = null;
    const sentCounts = { images: 0, videos: 0, documents: 0 };

    const imageList = buildImageList(item);
    const videos: string[] = Array.isArray(item.videos) ? item.videos : [];
    const documents: Array<{ url: string; name: string; type?: string }> =
      Array.isArray(item.documents) ? item.documents : [];

    // ---------------------------------------------------------------
    // Pre-validate a remote URL so we don't hand the provider a broken
    // link (HTML page, 404, redirect to login, wrong content-type, etc.).
    // Returns { ok, contentType, contentLength } so we can decide whether
    // to send by URL or fall back to base64.
    // ---------------------------------------------------------------
    const validateMediaUrl = async (
      mediaUrl: string,
    ): Promise<{ ok: boolean; contentType: string | null; contentLength: number | null; reason?: string }> => {
      try {
        // HEAD first (cheap)
        let r = await fetch(mediaUrl, { method: "HEAD", redirect: "follow" });
        if (!r.ok) {
          // Some CDNs (incl. WordPress sites) reject HEAD; retry with ranged GET
          r = await fetch(mediaUrl, {
            method: "GET",
            redirect: "follow",
            headers: { Range: "bytes=0-1023" },
          });
        }
        if (!r.ok && r.status !== 206) {
          return { ok: false, contentType: null, contentLength: null, reason: `http_${r.status}` };
        }
        const ct = r.headers.get("content-type");
        const cl = r.headers.get("content-length");
        const len = cl ? parseInt(cl, 10) : null;
        const isMedia = ct
          ? /^(image|video|audio|application\/pdf|application\/octet-stream)/i.test(ct)
          : false;
        if (!isMedia) {
          return { ok: false, contentType: ct, contentLength: len, reason: `bad_content_type:${ct}` };
        }
        return { ok: true, contentType: ct, contentLength: len };
      } catch (e: any) {
        return { ok: false, contentType: null, contentLength: null, reason: `exception:${e.message || e}` };
      }
    };

    // ---------------------------------------------------------------
    // Download a remote media URL and return it as a data URL (base64).
    // Used as a fallback when the provider rejects the public URL.
    // Cap at ~4 MB to avoid abusive payloads to the WhatsApp gateway.
    // ---------------------------------------------------------------
    const arrayBufferToBase64 = (buffer: ArrayBuffer): string => {
      const bytes = new Uint8Array(buffer);
      let binary = "";
      const chunk = 0x8000;
      for (let i = 0; i < bytes.length; i += chunk) {
        binary += String.fromCharCode.apply(
          null,
          Array.from(bytes.subarray(i, i + chunk)),
        );
      }
      return btoa(binary);
    };

    const convertImageForWhatsApp = async (
      buffer: ArrayBuffer,
      mimetype: string,
    ): Promise<{ buffer: ArrayBuffer; mimetype: string; fileNameExt: string }> => {
      const normalized = mimetype.toLowerCase();
      if (!/image\/webp/i.test(normalized)) {
        return { buffer, mimetype, fileNameExt: normalized.includes('png') ? 'png' : 'jpg' };
      }

      try {
        const blob = new Blob([buffer], { type: mimetype });
        const bitmap = await createImageBitmap(blob);
        const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          return { buffer, mimetype, fileNameExt: 'webp' };
        }
        ctx.drawImage(bitmap, 0, 0);
        bitmap.close();
        const converted = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.9 });
        const convertedBuffer = await converted.arrayBuffer();
        return { buffer: convertedBuffer, mimetype: 'image/jpeg', fileNameExt: 'jpg' };
      } catch (conversionError: any) {
        console.warn(`[send-catalog-item] webp to jpeg conversion failed: ${conversionError?.message || conversionError}`);
        return { buffer, mimetype, fileNameExt: 'webp' };
      }
    };

    const fetchAsBase64 = async (
      mediaUrl: string,
      maxBytes = 4 * 1024 * 1024,
    ): Promise<{ dataUrl: string; mimetype: string; fileNameExt: string } | null> => {
      try {
        const r = await fetch(mediaUrl, { redirect: "follow" });
        if (!r.ok) return null;
        const buf = await r.arrayBuffer();
        if (buf.byteLength > maxBytes) {
          console.warn(`[send-catalog-item] media too large for base64 fallback: ${buf.byteLength} bytes`);
          return null;
        }
        const originalMimetype = r.headers.get("content-type") || "application/octet-stream";
        const prepared = await convertImageForWhatsApp(buf, originalMimetype);
        const b64 = arrayBufferToBase64(prepared.buffer);
        return {
          dataUrl: `data:${prepared.mimetype};base64,${b64}`,
          mimetype: prepared.mimetype,
          fileNameExt: prepared.fileNameExt,
        };
      } catch (e: any) {
        console.warn(`[send-catalog-item] base64 fetch failed: ${e.message || e}`);
        return null;
      }
    };

    // Helper: invoke whatsapp-send and detect REAL provider success.
    // The function returns { ok, status, body } where `ok` is the upstream
    // Evolution HTTP success. We must inspect `data.ok` (not just absence of
    // SDK error) to avoid the false-positive that was masking failures.
    const sendViaEvolution = async (
      mediatype: "image" | "video" | "document",
      mediaUrl: string,
      cap: string,
      fileName?: string,
    ): Promise<boolean> => {
      // 1) pre-validate URL (skip validation for data: URLs already in base64)
      const isDataUrl = mediaUrl.startsWith("data:");
      let mimetype: string | undefined;
      let transport: "url" | "base64" = "url";
      let payloadUrl = mediaUrl;
      let effectiveFileName = fileName;

      if (!isDataUrl) {
        const v = await validateMediaUrl(mediaUrl);
        if (v.ok && v.contentType) mimetype = v.contentType;
        if (mediatype === "image" && mimetype && /image\/webp/i.test(mimetype)) {
          console.warn(`[send-catalog-item] webp detected; forcing base64 jpeg fallback for mobile compatibility`);
          const b64 = await fetchAsBase64(mediaUrl);
          if (!b64) {
            lastProviderError = `webp_conversion_failed`;
            return false;
          }
          payloadUrl = b64.dataUrl;
          mimetype = b64.mimetype;
          effectiveFileName = effectiveFileName || `catalog-image.${b64.fileNameExt}`;
          transport = "base64";
        } else if (!v.ok) {
          console.warn(`[send-catalog-item] URL validation failed (${v.reason}), trying base64 fallback`);
          const b64 = await fetchAsBase64(mediaUrl);
          if (!b64) {
            lastProviderError = `validation_failed:${v.reason}`;
            return false;
          }
          payloadUrl = b64.dataUrl;
          mimetype = b64.mimetype;
          effectiveFileName = effectiveFileName || `catalog-media.${b64.fileNameExt}`;
          transport = "base64";
        }
      }

      const tryInvoke = async (urlToSend: string, mt: string | undefined, fileNameToSend?: string): Promise<{ ok: boolean; reason?: string }> => {
        const { data, error } = await supabase.functions.invoke("whatsapp-send", {
          body: {
            organization_id: conv.organization_id,
            instance_id: conv.evolution_instance_id,
            type: "media",
            to: phone!.replace(/\D/g, ""),
            payload: {
              type: mediatype,
              url: urlToSend,
              mimetype: mt,
              caption: cap,
              fileName: fileNameToSend,
            },
          },
        });
        if (error) {
          return { ok: false, reason: `invoke_error: ${error.message || String(error)}` };
        }
        if ((data as any)?.ok === false) {
          return {
            ok: false,
            reason: `provider_status_${(data as any)?.status}: ${
              JSON.stringify((data as any)?.body).slice(0, 300)
            }`,
          };
        }
        return { ok: true };
      };

      try {
        let result = await tryInvoke(payloadUrl, mimetype, effectiveFileName);

        // 2) if URL transport was rejected by the provider, retry once via base64
        if (!result.ok && transport === "url" && !isDataUrl) {
          console.warn(`[send-catalog-item] provider rejected URL (${result.reason}); retrying with base64`);
          const b64 = await fetchAsBase64(mediaUrl);
          if (b64) {
            transport = "base64";
            effectiveFileName = effectiveFileName || `catalog-media.${b64.fileNameExt}`;
            result = await tryInvoke(b64.dataUrl, b64.mimetype, effectiveFileName);
          }
        }

        if (!result.ok) {
          lastProviderError = `[${transport}] ${result.reason}`;
          console.error("[send-catalog-item] evolution provider rejected:", lastProviderError);
          return false;
        }
        console.log(`[send-catalog-item] media delivered via ${transport} (${mediatype})`);
        return true;
      } catch (e: any) {
        lastProviderError = `exception: ${e.message || String(e)}`;
        console.error("[send-catalog-item] whatsapp-send exception:", e);
        return false;
      }
    };

    // === WhatsApp delivery via Evolution (provider único, sem fallback) ===
    if (channel === "whatsapp" && phone && conv.evolution_instance_id && imageList.length > 0) {
      // 1. Foto principal com caption completa
      const okMain = await sendViaEvolution("image", imageList[0], caption);
      if (okMain) {
        delivered = true;
        deliveryChannel = "evolution";
        sentCounts.images++;

        // 2. Fotos extras (até 2)
        if (sendExtraImages) {
          const extras = imageList.slice(1, 3);
          for (const img of extras) {
            await sleep(DELAY_MS);
            const ok = await sendViaEvolution("image", img, "");
            if (ok) sentCounts.images++;
          }
        }

        // 3. Vídeo (1)
        if (sendVideos && videos[0]) {
          await sleep(DELAY_MS);
          const ok = await sendViaEvolution("video", videos[0], `🎬 Vídeo: ${item.title}`);
          if (ok) sentCounts.videos++;
        }

        // 4. Documento (1)
        if (sendDocuments && documents[0]?.url) {
          await sleep(DELAY_MS);
          const doc = documents[0];
          const ok = await sendViaEvolution(
            "document",
            doc.url,
            "",
            doc.name || `${item.title}.pdf`,
          );
          if (ok) sentCounts.documents++;
        }
      } else {
        console.error(
          "[send-catalog-item] FAILED to deliver via Evolution. error:",
          lastProviderError,
        );
      }
    } else if (channel === "whatsapp") {
      // Diagnóstico claro do motivo de não tentar Evolution
      lastProviderError = !phone
        ? "missing_phone"
        : !conv.evolution_instance_id
        ? "missing_evolution_instance"
        : imageList.length === 0
        ? "no_images_in_catalog_item"
        : "unknown";
      console.warn("[send-catalog-item] skipping Evolution delivery:", lastProviderError);
    }

    // === Persist message in history ===
    const { data: msg, error: msgErr } = await supabase
      .from("webchat_messages")
      .insert({
        conversation_id: body.conversation_id,
        direction: "outbound",
        sender_type: "bot",
        content: caption,
        message_type: "catalog_card",
        metadata: {
          catalog_item: {
            id: item.id,
            title: item.title,
            price: item.price,
            currency: item.currency,
            url: item.url,
            thumbnail_url: item.thumbnail_url,
            images: item.images || [],
            videos,
            documents,
            attributes: item.attributes || {},
          },
          delivered,
          delivery_channel: deliveryChannel,
          sent_counts: sentCounts,
          provider_error: lastProviderError,
        },
      })
      .select()
      .single();

    if (msgErr) {
      console.error("[send-catalog-item] persist error:", msgErr);
    }

    // Log action — success reflects REAL delivery on WhatsApp channel
    try {
      await supabase.from("agent_action_logs").insert({
        organization_id: conv.organization_id,
        conversation_id: conv.id,
        lead_id: conv.lead_id || null,
        product_id: item.product_id || null,
        action_type: "send_catalog_item",
        action_data: {
          item_id: item.id,
          channel: deliveryChannel,
          sent_counts: sentCounts,
        },
        success: channel === "whatsapp" ? delivered : true,
        error_message: delivered ? null : lastProviderError,
      });
    } catch (logErr) {
      console.warn("[send-catalog-item] log failed:", logErr);
    }

    return new Response(
      JSON.stringify({
        success: channel === "whatsapp" ? delivered : true,
        delivered,
        delivery_channel: deliveryChannel,
        sent_counts: sentCounts,
        provider_error: lastProviderError,
        message: msg,
        item: {
          id: item.id,
          title: item.title,
          price: item.price,
          url: item.url,
          has_video: videos.length > 0,
          has_document: documents.length > 0,
        },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("[send-catalog-item] exception:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
