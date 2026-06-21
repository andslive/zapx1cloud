// Process media (audio / image / document) coming from a conversational channel
// (today: WhatsApp via Evolution Go).
//
// Input options (POST JSON):
//   { kind: "audio" | "image" | "document", base64: "<raw base64>", mime?: string, caption?: string }
//   { kind: "audio" | "image" | "document", url: "https://...", mime?: string, caption?: string }
//
// Output:
//   { success: true, text: string, kind, model_used }
//
// Audio  -> OpenAI Whisper (whisper-1) -> transcription text
// Image  -> OpenAI gpt-4o-mini (Vision) -> short, factual description
// Document -> PDF text extraction -> GPT-4o-mini analysis
// Both use OPENAI_API_KEY (centralizado em uma única chave da organização).

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function jsonResponse(body: any, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function base64ToBytes(b64: string): Uint8Array {
  // Accepts data URLs and raw base64.
  const cleaned = b64.includes(",") ? b64.split(",", 2)[1] : b64;
  const bin = atob(cleaned);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// Inspect the first bytes of a binary buffer to detect the real container format.
// WhatsApp / Evolution often delivers the wrong mime (e.g. "audio/ogg" for an
// OGG-Opus blob, or "image/jpeg" for a WebP/PNG). Whisper and GPT Vision both
// reject unsupported formats with HTTP 400, so we sniff and override.
function sniffFormat(bytes: Uint8Array): { ext: string; mime: string } | null {
  if (!bytes || bytes.length < 12) return null;
  const b = bytes;
  const ascii = (i: number, n: number) =>
    String.fromCharCode(...Array.from(b.subarray(i, i + n)));

  // Images
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { ext: "jpg", mime: "image/jpeg" };
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return { ext: "png", mime: "image/png" };
  if (ascii(0, 6) === "GIF87a" || ascii(0, 6) === "GIF89a") return { ext: "gif", mime: "image/gif" };
  if (ascii(0, 4) === "RIFF" && ascii(8, 4) === "WEBP") return { ext: "webp", mime: "image/webp" };

  // Documents
  if (b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46) return { ext: "pdf", mime: "application/pdf" };

  // Audio
  if (ascii(0, 4) === "OggS") return { ext: "ogg", mime: "audio/ogg" };
  if (ascii(0, 4) === "RIFF" && ascii(8, 4) === "WAVE") return { ext: "wav", mime: "audio/wav" };
  if (ascii(0, 4) === "fLaC") return { ext: "flac", mime: "audio/flac" };
  // MP3: ID3 tag or sync frame
  if (ascii(0, 3) === "ID3" || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0)) return { ext: "mp3", mime: "audio/mpeg" };
  // M4A / MP4 audio: ...ftyp at offset 4
  if (ascii(4, 4) === "ftyp") return { ext: "m4a", mime: "audio/mp4" };
  // WebM (EBML header)
  if (b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3) return { ext: "webm", mime: "audio/webm" };

  return null;
}

async function fetchAsBytes(url: string): Promise<{ bytes: Uint8Array; mime: string }> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`fetch media url failed: ${r.status}`);
  const mime = r.headers.get("content-type") || "application/octet-stream";
  const buf = new Uint8Array(await r.arrayBuffer());
  return { bytes: buf, mime };
}

async function transcribeAudio(
  bytes: Uint8Array,
  mime: string,
  ext: string,
  apiKey: string,
  model?: string,
): Promise<string> {
  const fileBuffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(fileBuffer).set(bytes);
  const blob = new Blob([fileBuffer], { type: mime });
  const fd = new FormData();
  fd.append("file", blob, `audio.${ext}`);
  const isOpenAI = apiKey.startsWith("sk-");
  let modelName = model || "whisper-1";
  if (!isOpenAI && !modelName.includes("/")) {
    modelName = `openai/${modelName}`;
  }
  fd.append("model", modelName);
  // Português é o idioma esperado da maior parte das mensagens; whisper auto-detecta se vier outro.
  fd.append("language", "pt");
  fd.append("response_format", "text");

  const url = apiKey.startsWith("sk-") 
    ? "https://api.openai.com/v1/audio/transcriptions"
    : "https://ai.gateway.lovable.dev/v1/audio/transcriptions";

  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey || Deno.env.get("LOVABLE_API_KEY")}` },
    body: fd,
  });

  if (!res.ok) {
    const t = await res.text();
    throw new Error(`whisper error ${res.status} (mime=${mime}, ext=${ext}, bytes=${bytes.byteLength}, head=${Array.from(bytes.slice(0,8)).map(x=>x.toString(16).padStart(2,'0')).join('')}): ${t.slice(0, 300)}`);
  }
  const text = (await res.text()).trim();
  return text;
}

async function describeImage(
  bytes: Uint8Array,
  mime: string,
  caption: string | undefined,
  apiKey: string,
  model?: string,
): Promise<string> {
  // Encode back to base64 for the data URL the Vision API expects.
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  const b64 = btoa(bin);
  const dataUrl = `data:${mime};base64,${b64}`;

  const userContent: any[] = [
    {
      type: "text",
      text:
        "Você é um especialista em análise de comprovantes bancários (Pix, Transferência, Boleto, Cartão). " +
        "Sua tarefa é extrair as informações mais importantes desta imagem em português. " +
        "IMPORTANTE: Se a imagem for um comprovante de pagamento, extraia EXATAMENTE: " +
        "1. Valor (numérico, ex: 15.00) " +
        "2. Nome do Pagador " +
        "3. Data e Hora. " +
        "Seja extremamente preciso. Se houver múltiplos valores, use o valor total pago. " +
        "Responda de forma direta e objetiva, começando pelos dados extraídos se for um comprovante. " +
        "Se não for um comprovante, descreva brevemente o conteúdo da imagem. " +
        "Se a imagem estiver ilegível, descreva o que é possível ver.",
    },
    { type: "image_url", image_url: { url: dataUrl } },
  ];
  if (caption && caption.trim()) {
    userContent.push({
      type: "text",
      text: `Legenda: "${caption.trim()}"`,
    });
  }

  const isOpenAI = apiKey.startsWith("sk-");
  const url = isOpenAI
    ? "https://api.openai.com/v1/chat/completions"
    : "https://ai.gateway.lovable.dev/v1/chat/completions";

  // When calling the gateway, we must prefix the model with the provider
  let modelName = model || "gpt-4o-mini";
  if (!isOpenAI && !modelName.includes("/")) {
    modelName = `openai/${modelName}`;
  }

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey || Deno.env.get("LOVABLE_API_KEY")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: modelName,
      messages: [
        {
          role: "system",
          content:
            "Você é um analisador visual de mensagens de WhatsApp em um CRM de vendas. " +
            "Sua resposta vira o conteúdo textual da mensagem que um agente IA vai ler. " +
            "Seja factual, objetivo e direto.",
        },
        { role: "user", content: userContent },
      ],
      temperature: 0.2,
      max_completion_tokens: 400,
    }),
  });

  if (!res.ok) {
    const t = await res.text();
    throw new Error(`vision error ${res.status} (mime=${mime}, bytes=${bytes.byteLength}, head=${Array.from(bytes.slice(0,12)).map(x=>x.toString(16).padStart(2,'0')).join('')}): ${t.slice(0, 300)}`);
  }
  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error("vision returned empty");
  return text;
}

async function extractPdfText(bytes: Uint8Array): Promise<string> {
  try {
    console.log(`[process-media-message] extracting text from PDF, bytes: ${bytes.byteLength}`);
    // Check if it's actually a PDF (magic bytes %PDF)
    if (bytes[0] !== 0x25 || bytes[1] !== 0x50 || bytes[2] !== 0x44 || bytes[3] !== 0x46) {
      console.warn(`[process-media-message] PDF magic bytes mismatch: ${Array.from(bytes.slice(0, 4)).map(b => b.toString(16).padStart(2, '0')).join(' ')}`);
    }

    const { extractText, getDocumentProxy } = await import("https://esm.sh/unpdf@0.12.1");
    const doc = await getDocumentProxy(bytes);
    
    // Tenta extração padrão
    let result = "";
    try {
      const { text } = await extractText(doc, { mergePages: true });
      result = Array.isArray(text) ? text.join("\n") : String(text || "");
    } catch (e) {
      console.warn("[process-media-message] standard extractText failed, falling back to page-by-page:", e);
    }
    
    // Se a extração falhou ou retornou muito pouco texto, tenta extrair página por página de forma manual
    if (result.trim().length < 5) {
      console.log("[process-media-message] extraction returned empty or failed, trying per-page manual extraction...");
      const pageTexts = [];
      for (let i = 1; i <= Math.min(doc.numPages, 10); i++) { // Limit to 10 pages for speed
        try {
          const page = await doc.getPage(i);
          const content = await page.getTextContent();
          const items = content.items.map((item: any) => item.str);
          pageTexts.push(items.join(" "));
        } catch (pageErr) {
          console.error(`[process-media-message] error on page ${i}:`, pageErr);
        }
      }
      result = pageTexts.join("\n");
    }

    console.log(`[process-media-message] PDF text extracted, length: ${result.length}, pages: ${doc.numPages}`);
    return result;
  } catch (err) {
    console.error("[process-media-message] PDF parse error:", err);
    return ""; // Return empty so we fallback to multimodal
  }
}

async function analyzeMultimodalPdf(
  bytes: Uint8Array,
  mime: string,
  apiKey: string,
  model?: string,
): Promise<string> {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  const b64 = btoa(bin);
  const dataUrl = `data:${mime};base64,${b64}`;

  // Usamos Gemini Flash via Gateway pois ele suporta PDF nativamente como multimodal
  const isOpenAI = apiKey.startsWith("sk-");
  const url = isOpenAI
    ? "https://api.openai.com/v1/chat/completions"
    : "https://ai.gateway.lovable.dev/v1/chat/completions";

  // IMPORTANTE: PDF multimodal é processado sempre por um modelo Gemini suportado
  // pelo Gateway. Configurações antigas (ex.: google/gemini-2.0-flash) quebram
  // com 400 e impedem o comprovante de chegar ao ai_receipt.
  let modelName = "google/gemini-2.5-flash";
  let finalUrl = url;
  let finalApiKey = apiKey;

  if (isOpenAI) {
    const lovableKey = Deno.env.get("LOVABLE_API_KEY");
    if (lovableKey) {
      finalUrl = "https://ai.gateway.lovable.dev/v1/chat/completions";
      finalApiKey = lovableKey;
      modelName = "google/gemini-2.5-flash";
    } else {
      throw new Error("PDF multimodal analysis requires Gemini (Google) or Lovable Gateway. OpenAI key detected.");
    }
  }

  const res = await fetch(finalUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${finalApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: modelName,
      messages: [
        {
          role: "system",
          content:
            "Você é um especialista em análise de comprovantes bancários (Pix, Transferência, Boleto, Cartão). " +
            "Você recebeu um arquivo PDF. Analise o conteúdo visual e textual dele em português.",
        },
        { 
          role: "user", 
          content: [
            { 
              type: "text", 
              text: "Analise este comprovante e extraia: 1. Valor (ex: 15.00), 2. Nome do Pagador/Beneficiário, 3. Data. " +
                    "Responda começando com 'COMPROVANTE IDENTIFICADO' se for um comprovante válido."
            },
            {
              type: "image_url", // O Gateway Lovable traduz image_url com mime PDF para o formato correto do Gemini
              image_url: { url: dataUrl }
            }
          ] 
        },
      ],
      temperature: 0.1,
    }),
  });

  if (!res.ok) {
    const t = await res.text();
    throw new Error(`multimodal pdf error ${res.status}: ${t.slice(0, 300)}`);
  }
  const data = await res.json();
  return data?.choices?.[0]?.message?.content?.trim() || "";
}

async function analyzeText(
  text: string,
  apiKey: string,
  model?: string,
): Promise<string> {
  const isOpenAI = apiKey.startsWith("sk-");
  const url = isOpenAI
    ? "https://api.openai.com/v1/chat/completions"
    : "https://ai.gateway.lovable.dev/v1/chat/completions";

  let modelName = model || "gpt-4o-mini";
  if (!isOpenAI && !modelName.includes("/")) {
    modelName = `openai/${modelName}`;
  }

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey || Deno.env.get("LOVABLE_API_KEY")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: modelName,
      messages: [
        {
          role: "system",
          content:
            "Você é um especialista em análise de comprovantes bancários (Pix, Transferência, Boleto, Cartão) extraídos de texto de arquivos PDF. " +
            "Sua tarefa é extrair as informações mais importantes deste texto em português. " +
            "IMPORTANTE: Identifique se o texto é um comprovante de pagamento. Se for, extraia: " +
            "1. Valor (numérico, ex: 15.00) " +
            "2. Nome do Pagador " +
            "3. Data e Hora. " +
            "Se for um comprovante, sua resposta deve começar com 'COMPROVANTE IDENTIFICADO' e listar os dados. " +
            "Se não for um comprovante, resuma brevemente o conteúdo do texto.",
        },
        { role: "user", content: `Texto extraído do PDF:\n\n${text}` },
      ],
      temperature: 0.2,
      max_completion_tokens: 400,
    }),
  });

  if (!res.ok) {
    const t = await res.text();
    throw new Error(`analyze text error ${res.status}: ${t.slice(0, 300)}`);
  }
  const data = await res.json();
  return data?.choices?.[0]?.message?.content?.trim() || "";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const kind = String(body?.kind || "").toLowerCase();
    if (kind !== "audio" && kind !== "image" && kind !== "document") {
      return jsonResponse({ success: false, error: "kind must be 'audio', 'image' or 'document'" }, 400);
    }

    // Resolve a chave da OpenAI: prioriza chave da organização (white-label),
    // cai para a secret global como fallback.
    let apiKey = Deno.env.get("OPENAI_API_KEY") || "";
    let modelOverride: string | undefined = undefined;

    const orgId: string | undefined = body?.organization_id;
    if (orgId) {
      try {
        const { resolveAIProvider } = await import("../_shared/ai-credentials.ts");
        const cap = kind === "audio" ? "audio_transcription" : (kind === "image" ? "image_vision" : "image_vision");
        const resolved = await resolveAIProvider(orgId, cap as any);
        apiKey = resolved.apiKey;
        modelOverride = resolved.model;
      } catch (e) {
        console.warn("[process-media-message] resolve org key failed, falling back:", e);
      }
    }

    // Override explícito vindo do caller (ex.: bloco ai_receipt configurado no funil)
    if (typeof body?.api_key === "string" && body.api_key.length > 5) {
      apiKey = body.api_key;
    }
    if (typeof body?.model === "string" && body.model.length > 1) {
      modelOverride = body.model;
    }

    if (!apiKey && !Deno.env.get("LOVABLE_API_KEY")) {
      return jsonResponse({ success: false, error: "AI key não configurada (defina em Integrações)" }, 500);
    }

    let bytes: Uint8Array | null = null;
    let mime: string = String(body?.mime || "");

    if (typeof body?.base64 === "string" && body.base64.length > 10) {
      bytes = base64ToBytes(body.base64);
      if (!mime) mime = kind === "audio" ? "audio/ogg" : (kind === "image" ? "image/jpeg" : "application/pdf");
    } else if (typeof body?.url === "string" && body.url.startsWith("http")) {
      const f = await fetchAsBytes(body.url);
      bytes = f.bytes;
      if (!mime) mime = f.mime;
    } else {
      return jsonResponse({ success: false, error: "provide 'base64' or 'url'" }, 400);
    }

    if (!bytes || bytes.byteLength === 0) {
      return jsonResponse({ success: false, error: "empty media" }, 400);
    }
    // Hard cap to keep things sane (25MB Whisper limit, well under for images too).
    if (bytes.byteLength > 24 * 1024 * 1024) {
      return jsonResponse({ success: false, error: "media too large (>24MB)" }, 413);
    }

    // Sniff the real format from the magic bytes — providers often lie about mime.
    const sniffed = sniffFormat(bytes);
    if (sniffed) {
      mime = sniffed.mime;
    } else {
      const head = Array.from(bytes.slice(0, 12))
        .map((x) => x.toString(16).padStart(2, "0"))
        .join("");
      console.error(
        `[process-media-message] unrecognized binary head=${head} bytes=${bytes.byteLength} kind=${kind} — likely still encrypted`,
      );
      return jsonResponse(
        {
          success: false,
          error: "unrecognized_binary",
          detail: `bytes do not match any known ${kind} format (head=${head}); upstream likely failed to decrypt`,
        },
        422,
      );
    }

    if (kind === "audio") {
      // Map mime -> whisper extension
      const ext =
        mime.includes("ogg") ? "ogg" :
        mime.includes("mpeg") || mime.includes("mp3") ? "mp3" :
        mime.includes("wav") ? "wav" :
        mime.includes("webm") ? "webm" :
        mime.includes("flac") ? "flac" :
        mime.includes("mp4") || mime.includes("m4a") ? "m4a" :
        "ogg";
      const finalMime = mime || "audio/ogg";
      const text = await transcribeAudio(bytes, finalMime, ext, apiKey, modelOverride);
      return jsonResponse({
        success: true,
        kind: "audio",
        text: text || "(áudio sem fala detectada)",
        model_used: "whisper-1",
        detected_mime: finalMime,
      });
    } else if (kind === "image") {
      // Vision only accepts png / jpeg / gif / webp.
      const supported = ["image/png", "image/jpeg", "image/gif", "image/webp"];
      if (!supported.includes(mime)) {
        mime = "image/jpeg";
      }
      const text = await describeImage(bytes, mime, body?.caption, apiKey, modelOverride);
      return jsonResponse({
        success: true,
        kind: "image",
        text,
        model_used: "gpt-4o-mini",
        detected_mime: mime,
      });
    } else if (kind === "document") {
      if (mime !== "application/pdf") {
        return jsonResponse({ success: false, error: "only PDF documents are supported for AI analysis" }, 400);
      }
      let extractedText = "";
      try {
        extractedText = await extractPdfText(bytes);
      } catch (err) {
        console.warn("[process-media-message] extractPdfText failed:", err);
      }

      let resultText = "";
      let modelUsed = "gpt-4o-mini";

      if (!extractedText || extractedText.trim().length < 5) {
        console.log("[process-media-message] fallback to multimodal PDF analysis");
        try {
          resultText = await analyzeMultimodalPdf(bytes, mime, apiKey, modelOverride);
          modelUsed = "gemini-2.5-flash-multimodal";
        } catch (multimodalErr: any) {
          console.error("[process-media-message] multimodal fallback failed:", multimodalErr.message);
          throw new Error(`Falha ao processar PDF: ${multimodalErr.message}`);
        }
      } else {
        resultText = await analyzeText(extractedText, apiKey, modelOverride);
      }

      return jsonResponse({
        success: true,
        kind: "document",
        text: resultText,
        model_used: modelUsed,
        detected_mime: mime,
      });
    }
  } catch (e: any) {
    console.error("[process-media-message] error:", e?.message || String(e));
    return jsonResponse({ success: false, error: e?.message || "unknown error" }, 500);
  }
});
