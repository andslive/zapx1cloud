// PDF analysis helpers for process-media-message.
//
// Extraction order for documents:
//   1. Local text-layer extraction via unpdf (free, no network).
//   2. Image-only PDFs (no text layer) -> OpenAI Responses API with the PDF
//      attached as input_file, using OPENAI_API_KEY. OpenAI reads both the
//      text and the rendered page images.
//   3. Non-OpenAI keys keep the legacy Lovable Gateway path (Gemini).
//
// Failures raise PdfAnalysisError with a stable `code` so callers can log and
// react without parsing message strings.

export type PdfAnalysisErrorCode =
  | "openai_key_missing"
  | "openai_http_error"
  | "openai_empty_response"
  | "gateway_http_error";

export class PdfAnalysisError extends Error {
  code: PdfAnalysisErrorCode;
  httpStatus?: number;
  requestId?: string;
  constructor(
    code: PdfAnalysisErrorCode,
    message: string,
    opts?: { httpStatus?: number; requestId?: string },
  ) {
    super(message);
    this.name = "PdfAnalysisError";
    this.code = code;
    this.httpStatus = opts?.httpStatus;
    this.requestId = opts?.requestId;
  }
}

export function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

export async function extractPdfText(bytes: Uint8Array): Promise<string> {
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

// Prompt pede transcrição estruturada com os MESMOS rótulos que o parser
// determinístico do ai_receipt reconhece ("Valor:", "Nome do Pagador:").
export const PDF_RECEIPT_PROMPT =
  "Você é um especialista em análise de comprovantes bancários brasileiros (Pix, Transferência, Boleto, Cartão). " +
  "Você recebeu um arquivo PDF anexado. Leia o conteúdo textual e visual das páginas. " +
  "Se for um comprovante de pagamento CONCLUÍDO, responda começando com 'COMPROVANTE IDENTIFICADO' e liste, um por linha, apenas os campos visíveis no documento: " +
  "Valor: (numérico, ex: 15.00) | Nome do Pagador: | Recebedor: | Data e Hora: | Instituição: | ID transação: | Status: | Moeda:. " +
  "Nunca invente campos que não estejam visíveis. " +
  "Agendamento, QR Code ou instrução/solicitação de pagamento NÃO são pagamento concluído: nesses casos, e se não for comprovante, descreva brevemente o documento sem usar 'COMPROVANTE IDENTIFICADO'.";

// Analisa um PDF sem camada de texto via OpenAI Responses API, anexando o
// arquivo como input_file (data URL). Requer chave OpenAI (sk-...).
export async function analyzePdfViaOpenAI(
  bytes: Uint8Array,
  apiKey: string,
  model?: string,
  fetchFn: typeof fetch = fetch,
): Promise<string> {
  if (!apiKey || !apiKey.startsWith("sk-")) {
    throw new PdfAnalysisError(
      "openai_key_missing",
      "OPENAI_API_KEY ausente ou inválida para análise multimodal de PDF",
    );
  }
  const b64 = bytesToBase64(bytes);
  const modelName = model && !model.includes("/") ? model : "gpt-4o-mini";
  const startedAt = Date.now();

  const res = await fetchFn("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: modelName,
      input: [
        {
          role: "user",
          content: [
            { type: "input_text", text: PDF_RECEIPT_PROMPT },
            {
              type: "input_file",
              filename: "receipt.pdf",
              file_data: `data:application/pdf;base64,${b64}`,
              detail: "high",
            },
          ],
        },
      ],
      max_output_tokens: 600,
    }),
  });

  const requestId = res.headers.get("x-request-id") || undefined;
  const durationMs = Date.now() - startedAt;

  if (!res.ok) {
    const t = await res.text().catch(() => "");
    console.error(
      "[process-media-message] openai pdf error",
      JSON.stringify({
        provider: "openai",
        model: modelName,
        http_status: res.status,
        duration_ms: durationMs,
        bytes: bytes.byteLength,
        request_id: requestId || null,
        error_preview: t.slice(0, 200),
      }),
    );
    throw new PdfAnalysisError(
      "openai_http_error",
      `openai pdf error ${res.status}: ${t.slice(0, 200)}`,
      { httpStatus: res.status, requestId },
    );
  }

  const data = await res.json().catch(() => null);
  const text = extractResponsesOutputText(data);
  console.log(
    "[process-media-message] openai pdf ok",
    JSON.stringify({
      provider: "openai",
      model: modelName,
      http_status: res.status,
      duration_ms: durationMs,
      bytes: bytes.byteLength,
      text_len: text.length,
      request_id: requestId || null,
    }),
  );
  if (!text) {
    throw new PdfAnalysisError(
      "openai_empty_response",
      "OpenAI Responses retornou saída vazia para o PDF",
      { httpStatus: res.status, requestId },
    );
  }
  return text;
}

// Extrai o texto de saída do JSON da Responses API (itens type=message ->
// content type=output_text). Tolera `output_text` de conveniência se presente.
export function extractResponsesOutputText(data: any): string {
  if (!data) return "";
  if (typeof data.output_text === "string" && data.output_text.trim()) {
    return data.output_text.trim();
  }
  const out = Array.isArray(data.output) ? data.output : [];
  const parts: string[] = [];
  for (const item of out) {
    if (item?.type !== "message" || !Array.isArray(item.content)) continue;
    for (const c of item.content) {
      if (c?.type === "output_text" && typeof c.text === "string") parts.push(c.text);
    }
  }
  return parts.join("").trim();
}

// Roteia a análise multimodal de PDF conforme a chave disponível:
//   sk-...  -> OpenAI Responses API (input_file)   [caminho novo]
//   outra   -> Lovable Gateway / Gemini (legado, inalterado)
//   nenhuma -> falha tipada
export async function analyzeMultimodalPdf(
  bytes: Uint8Array,
  mime: string,
  apiKey: string,
  model?: string,
  fetchFn: typeof fetch = fetch,
): Promise<string> {
  if (apiKey && apiKey.startsWith("sk-")) {
    return await analyzePdfViaOpenAI(bytes, apiKey, model, fetchFn);
  }
  if (!apiKey) {
    throw new PdfAnalysisError(
      "openai_key_missing",
      "Nenhuma chave de IA disponível para análise multimodal de PDF",
    );
  }

  // Caminho legado via Gateway (chave não-OpenAI fornecida pelo caller).
  const dataUrl = `data:${mime};base64,${bytesToBase64(bytes)}`;
  const modelName = "google/gemini-2.5-flash";
  const res = await fetchFn("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
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
                "Responda começando com 'COMPROVANTE IDENTIFICADO' se for um comprovante válido.",
            },
            {
              type: "image_url", // O Gateway Lovable traduz image_url com mime PDF para o formato correto do Gemini
              image_url: { url: dataUrl },
            },
          ],
        },
      ],
      temperature: 0.1,
    }),
  });

  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new PdfAnalysisError(
      "gateway_http_error",
      `multimodal pdf error ${res.status}: ${t.slice(0, 300)}`,
      { httpStatus: res.status },
    );
  }
  const data = await res.json();
  return data?.choices?.[0]?.message?.content?.trim() || "";
}
