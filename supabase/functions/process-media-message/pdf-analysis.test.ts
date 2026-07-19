// deno test --allow-import pdf-analysis.test.ts
//
// Cobre o fallback OpenAI Responses API para PDF-imagem (FASE 1B) e a
// compatibilidade do texto produzido com o parser determinístico do
// bloco ai_receipt (uazapi-webhook/index.ts).

import {
  analyzeMultimodalPdf,
  analyzePdfViaOpenAI,
  extractPdfText,
  extractResponsesOutputText,
  PDF_RECEIPT_PROMPT,
  PdfAnalysisError,
} from "./pdf-analysis.ts";

const enc = new TextEncoder();

// PDF mínimo VÁLIDO com camada de texto ("Valor: R$ 9,90 Nome do Pagador: Maria Teste").
function textLayerPdf(): Uint8Array {
  const stream =
    "BT /F1 12 Tf 20 700 Td (Valor: R$ 9,90 Nome do Pagador: Maria Teste) Tj ET";
  const objs = [
    "1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj",
    "2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj",
    "3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj",
    `4 0 obj<</Length ${stream.length}>>stream\n${stream}\nendstream endobj`,
    "5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj",
  ];
  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];
  for (const o of objs) {
    offsets.push(pdf.length);
    pdf += o + "\n";
  }
  const xref = pdf.length;
  pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` +
    offsets.map((x) => `${String(x).padStart(10, "0")} 00000 n \n`).join("") +
    `trailer<</Size ${objs.length + 1}/Root 1 0 R>>\nstartxref\n${xref}\n%%EOF`;
  return enc.encode(pdf);
}

// PDF válido SEM camada de texto (uma página vazia — simula PDF-imagem).
function imageOnlyPdf(): Uint8Array {
  const objs = [
    "1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj",
    "2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj",
    "3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]>>endobj",
  ];
  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];
  for (const o of objs) {
    offsets.push(pdf.length);
    pdf += o + "\n";
  }
  const xref = pdf.length;
  pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` +
    offsets.map((x) => `${String(x).padStart(10, "0")} 00000 n \n`).join("") +
    `trailer<</Size ${objs.length + 1}/Root 1 0 R>>\nstartxref\n${xref}\n%%EOF`;
  return enc.encode(pdf);
}

function fakeResponsesApi(
  handler: (url: string, init: RequestInit) => { status: number; body: any },
): { fetchFn: typeof fetch; calls: { url: string; body: any }[] } {
  const calls: { url: string; body: any }[] = [];
  const fetchFn = (async (url: any, init: any) => {
    const parsed = JSON.parse(String(init?.body || "{}"));
    calls.push({ url: String(url), body: parsed });
    const r = handler(String(url), init);
    return new Response(JSON.stringify(r.body), {
      status: r.status,
      headers: { "x-request-id": "req_test_123" },
    });
  }) as typeof fetch;
  return { fetchFn, calls };
}

const okResponsesPayload = (text: string) => ({
  output: [
    {
      type: "message",
      content: [{ type: "output_text", text }],
    },
  ],
});

// ── 1. PDF com camada de texto usa unpdf (sem OpenAI) ────────────────────────
Deno.test("PDF com texto: unpdf extrai e OpenAI não é necessária", async () => {
  const text = await extractPdfText(textLayerPdf());
  if (!text.includes("Valor: R$ 9,90")) {
    throw new Error(`texto extraído inesperado: ${text.slice(0, 120)}`);
  }
  // No fluxo do index.ts, texto >= 5 chars significa que analyzeMultimodalPdf
  // (OpenAI) nem é chamada — condição verificada aqui:
  if (text.trim().length < 5) throw new Error("texto curto acionaria fallback");
});

// ── 2. PDF-imagem: unpdf vazio → OpenAI recebe input_file e devolve valor ───
Deno.test("PDF-imagem: fallback OpenAI Responses com input_file", async () => {
  const empty = await extractPdfText(imageOnlyPdf());
  if (empty.trim().length >= 5) throw new Error("fixture deveria ser sem texto");

  const { fetchFn, calls } = fakeResponsesApi(() => ({
    status: 200,
    body: okResponsesPayload(
      "COMPROVANTE IDENTIFICADO\nValor: 19.90\nNome do Pagador: Maria T.\nData e Hora: 19/07/2026 10:00",
    ),
  }));
  const out = await analyzeMultimodalPdf(
    imageOnlyPdf(), "application/pdf", "sk-test", undefined, fetchFn,
  );
  if (!out.includes("Valor: 19.90")) throw new Error(`saída inesperada: ${out}`);
  const call = calls[0];
  if (!call.url.endsWith("/v1/responses")) throw new Error(`endpoint errado: ${call.url}`);
  const content = call.body.input?.[0]?.content || [];
  const file = content.find((c: any) => c.type === "input_file");
  const textPart = content.find((c: any) => c.type === "input_text");
  if (!file?.file_data?.startsWith("data:application/pdf;base64,")) {
    throw new Error("input_file/file_data ausente ou mal formatado");
  }
  if (file.filename !== "receipt.pdf") throw new Error("filename ausente");
  if (file.detail !== "high") throw new Error("detail:high ausente no input_file");
  if (!textPart?.text?.includes("comprovante")) throw new Error("input_text ausente");
});

// ── 3. PDF inválido/corrompido: falha controlada, sem exceção não tratada ───
Deno.test("PDF corrompido: extractPdfText retorna vazio sem lançar", async () => {
  const junk = enc.encode("%PDF-1.4 isto nao é um pdf de verdade");
  const text = await extractPdfText(junk);
  if (text.trim().length !== 0) throw new Error("esperava vazio");
});

// ── 4. OPENAI_API_KEY ausente: falha tipada, sem Lovable, sem vazar secret ──
Deno.test("sem chave: PdfAnalysisError openai_key_missing e nenhuma chamada", async () => {
  const { fetchFn, calls } = fakeResponsesApi(() => ({ status: 200, body: {} }));
  let err: unknown = null;
  try {
    await analyzeMultimodalPdf(imageOnlyPdf(), "application/pdf", "", undefined, fetchFn);
  } catch (e) {
    err = e;
  }
  if (!(err instanceof PdfAnalysisError) || err.code !== "openai_key_missing") {
    throw new Error(`erro tipado esperado, veio: ${String(err)}`);
  }
  if (calls.length !== 0) throw new Error("não deveria chamar nenhum provedor");
  if (String(err).includes("sk-")) throw new Error("mensagem expõe chave");
});

// ── 5. Resposta OpenAI vazia/inválida: falha controlada, não fabrica valor ──
Deno.test("resposta vazia: PdfAnalysisError openai_empty_response", async () => {
  const { fetchFn } = fakeResponsesApi(() => ({ status: 200, body: { output: [] } }));
  let err: unknown = null;
  try {
    await analyzePdfViaOpenAI(imageOnlyPdf(), "sk-test", undefined, fetchFn);
  } catch (e) {
    err = e;
  }
  if (!(err instanceof PdfAnalysisError) || err.code !== "openai_empty_response") {
    throw new Error(`esperava openai_empty_response, veio: ${String(err)}`);
  }
});

Deno.test("HTTP 500 da OpenAI: PdfAnalysisError openai_http_error com request_id", async () => {
  const { fetchFn } = fakeResponsesApi(() => ({ status: 500, body: { error: "boom" } }));
  let err: unknown = null;
  try {
    await analyzePdfViaOpenAI(imageOnlyPdf(), "sk-test", undefined, fetchFn);
  } catch (e) {
    err = e;
  }
  if (!(err instanceof PdfAnalysisError) || err.code !== "openai_http_error") {
    throw new Error(`esperava openai_http_error, veio: ${String(err)}`);
  }
  if ((err as PdfAnalysisError).requestId !== "req_test_123") {
    throw new Error("request_id não capturado");
  }
});

// ── parser da Responses API ─────────────────────────────────────────────────
Deno.test("extractResponsesOutputText: message/output_text e output_text top-level", () => {
  const a = extractResponsesOutputText(okResponsesPayload("abc"));
  if (a !== "abc") throw new Error(`a=${a}`);
  const b = extractResponsesOutputText({ output_text: " xyz " });
  if (b !== "xyz") throw new Error(`b=${b}`);
  const c = extractResponsesOutputText(null);
  if (c !== "") throw new Error(`c=${c}`);
});

// ── 7. Valores brasileiros: compatibilidade com o parser determinístico ─────
// Réplica fiel das regex/normalização do ai_receipt
// (uazapi-webhook/index.ts:7595-7621) para garantir que a saída pedida no
// PDF_RECEIPT_PROMPT ("Valor:" / "Nome do Pagador:") seria aceita.
function deterministicValue(raw: string): string {
  let cleaned = String(raw || "").trim();
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
}
const valueRe =
  /(?:^|\n|\b)(?:[-•*]\s*)?(?:\d+[.)]\s*)?\*{0,2}\s*Valor(?:\s+(?:pago|total|do\s+pagamento))?\s*\*{0,2}\s*[:\-]\s*\*{0,2}\s*(?:R\$\s*)?([0-9][0-9.,]*)\s*\*{0,2}/i;
const nameRe =
  /(?:^|\n)\s*(?:[-•*]\s*)?(?:\d+[.)]\s*)?\*{0,2}\s*(?:Nome\s+do\s+Pagador|Pagador|Nome)\s*\*{0,2}\s*[:\-]\s*\*{0,2}\s*([^\n\r]+)/i;

Deno.test("saída do prompt casa com o determinístico (R$ 9,90 / 19,90 / 100,00 / 1.234,56)", () => {
  const cases: [string, string][] = [
    ["COMPROVANTE IDENTIFICADO\nValor: 9,90\nNome do Pagador: Ana", "9.90"],
    ["Valor: R$ 19,90\nNome do Pagador: Bia", "19.90"],
    ["Valor: 100,00\nNome do Pagador: Caio", "100.00"],
    ["Valor: 1.234,56\nNome do Pagador: Duda", "1234.56"],
    ["Valor: 15.00\nNome do Pagador: Edu", "15.00"],
  ];
  for (const [text, expected] of cases) {
    const vm = text.match(valueRe);
    const nm = text.match(nameRe);
    if (!vm) throw new Error(`valueRe não casou: ${text}`);
    if (!nm) throw new Error(`nameRe não casou: ${text}`);
    const norm = deterministicValue(vm[1]);
    if (norm !== expected) throw new Error(`${vm[1]} → ${norm}, esperava ${expected}`);
  }
});

// ── 8. Não-comprovante: prompt exige evidência e proíbe fabricar ────────────
Deno.test("prompt proíbe inventar e exclui agendamento/QR de pagamento concluído", () => {
  if (!/Nunca invente/i.test(PDF_RECEIPT_PROMPT)) throw new Error("falta 'Nunca invente'");
  if (!/Agendamento, QR Code/i.test(PDF_RECEIPT_PROMPT)) throw new Error("falta exclusão de agendamento/QR");
  // Resposta sem 'COMPROVANTE IDENTIFICADO' e sem 'Valor:' não vira rota verde:
  const nonReceipt = "O documento é um catálogo de produtos, sem dados de pagamento.";
  if (valueRe.test(nonReceipt)) throw new Error("falso positivo de valor");
});
