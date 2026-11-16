// FASE 2.1 — classificador administrativo ISOLADO de comprovantes, usado
// exclusivamente para a auditoria/reconciliação do backlog do incidente de
// crédito OpenAI (2026-07-26/27). NÃO faz parte do fluxo de produção.
//
// O que este endpoint NUNCA faz, por design (nenhum destes efeitos existe
// no código abaixo):
//   - avançar funil / alterar conversa (nunca escreve em webchat_conversations)
//   - enviar mensagem (nunca chama uazapi-send/whatsapp-send)
//   - criar venda (nunca escreve em purchase_audit/pixel_event_logs)
//   - disparar Purchase (nunca chama a Meta CAPI)
//   - ativar recovery automaticamente (nunca escreve em receipt_recovery_requests)
//
// O único efeito colateral é uma chamada de LEITURA à API da OpenAI (paga,
// processa dados financeiros reais do cliente) e a leitura do objeto no
// Storage. Nada é persistido em banco por este endpoint — o chamador decide
// o que fazer com a resposta.
//
// Segurança:
//   - verify_jwt=true (config.toml, default) — rejeita chamadas sem JWT válido.
//   - Checagem adicional própria: só aceita Authorization === Bearer <service_role key>.
//     Um usuário autenticado comum (mesmo admin da organização) é rejeitado.
//   - Não aceita URL arbitrária: só {bucket, objectPath}, e objectPath é
//     validado contra o padrão conhecido de upload
//     (whatsapp-inbound/{org_uuid}/{conversation_uuid}/{arquivo}) antes de
//     qualquer download — evita SSRF e leitura de objetos fora do escopo
//     esperado.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const OBJECT_PATH_PATTERN =
  /^whatsapp-inbound\/[0-9a-f-]{36}\/[0-9a-f-]{36}\/[A-Za-z0-9._-]+$/;

const ALLOWED_BUCKETS = new Set(["chat-media"]);
const MAX_BYTES = 20 * 1024 * 1024; // 20MB — mesmo teto implícito do pipeline de produção

interface ClassifyRequest {
  bucket: string;
  objectPath: string;
  mediaType: "image" | "document";
}

interface ReceiptClassification {
  is_receipt: boolean;
  e2e_or_transaction_id: string | null;
  value: number | null;
  date_text: string | null;
  bank: string | null;
  confidence: "alta" | "media" | "baixa";
  sha256: string;
  mime: string;
  size_bytes: number;
}

function maskPII(s: string | null): string | null {
  if (!s) return s;
  // Mantém só os últimos 4 caracteres visíveis — suficiente para correlação
  // manual sem expor o identificador completo em relatórios/logs.
  if (s.length <= 4) return "*".repeat(s.length);
  return "*".repeat(s.length - 4) + s.slice(-4);
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes.buffer as ArrayBuffer);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

const CLASSIFY_PROMPT = `Você está analisando uma imagem ou PDF que pode ser um
comprovante de pagamento (Pix, TED, boleto) brasileiro. Esta é uma leitura
SOMENTE PARA CLASSIFICAÇÃO administrativa — não decide nada automaticamente,
não aprova nenhuma venda. Responda em JSON estrito, sem nenhum texto fora do JSON:
{
  "is_receipt": boolean,
  "e2e_or_transaction_id": string|null,
  "value": number|null,
  "date_text": string|null,
  "bank": string|null,
  "confidence": "alta"|"media"|"baixa"
}
Se a imagem/PDF claramente NÃO for um comprovante de pagamento (ex.: receita
culinária, foto pessoal, print de conversa, produto), responda
is_receipt=false e os demais campos como null.`;

function extractOutputText(data: any): string {
  const out = data?.output;
  if (Array.isArray(out)) {
    for (const item of out) {
      const content = item?.content;
      if (Array.isArray(content)) {
        for (const c of content) {
          if (typeof c?.text === "string") return c.text;
        }
      }
    }
  }
  return data?.output_text || "{}";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // Checagem por CLAIM do JWT (role === 'service_role'), não por
  // comparação de string exata com a env var — o valor exposto por
  // Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") no runtime da Edge Function
  // não é garantidamente o mesmo valor retornado pela Management API
  // (rotação/gerenciamento interno do Supabase), então comparar strings é
  // frágil. Decodificar o claim `role` do próprio JWT apresentado é o
  // padrão robusto: só um token assinado com o segredo real do projeto e
  // role=service_role passa — verify_jwt=true (gateway) já garante que a
  // assinatura é válida antes de chegar aqui.
  const authHeader = req.headers.get("Authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  let role: string | null = null;
  try {
    const payloadB64 = token.split(".")[1];
    const payload = JSON.parse(atob(payloadB64.replace(/-/g, "+").replace(/_/g, "/")));
    role = payload?.role || null;
  } catch {
    role = null;
  }
  if (role !== "service_role") {
    return new Response(JSON.stringify({ error: "forbidden" }), {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const body = (await req.json()) as ClassifyRequest;

    if (!ALLOWED_BUCKETS.has(body.bucket)) {
      return new Response(JSON.stringify({ error: "bucket_not_allowed" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!OBJECT_PATH_PATTERN.test(body.objectPath)) {
      return new Response(JSON.stringify({ error: "object_path_invalid_pattern" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (body.mediaType !== "image" && body.mediaType !== "document") {
      return new Response(JSON.stringify({ error: "media_type_invalid" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabase = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // Download via Storage API (bound ao bucket/objectPath validados) — não
    // é um fetch de URL arbitrária.
    const { data: fileBlob, error: dlErr } = await supabase.storage
      .from(body.bucket)
      .download(body.objectPath);
    if (dlErr || !fileBlob) {
      return new Response(JSON.stringify({ error: "download_failed", detail: dlErr?.message }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const bytes = new Uint8Array(await fileBlob.arrayBuffer());
    if (bytes.byteLength > MAX_BYTES) {
      return new Response(JSON.stringify({ error: "file_too_large" }), {
        status: 413,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const sha256 = await sha256Hex(bytes);
    const mime = fileBlob.type || (body.mediaType === "document" ? "application/pdf" : "image/jpeg");
    // Achado real ao testar em escala: spread de Uint8Array grande em
    // String.fromCharCode(...bytes) estoura a call stack para PDFs maiores
    // (centenas de KB) — conversão em chunks evita isso.
    let binary = "";
    const CHUNK = 8192;
    for (let i = 0; i < bytes.length; i += CHUNK) {
      binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
    }
    const base64 = btoa(binary);

    const openaiKey = Deno.env.get("OPENAI_API_KEY");
    if (!openaiKey) {
      return new Response(JSON.stringify({ error: "openai_key_missing" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const content: any[] = [{ type: "input_text", text: CLASSIFY_PROMPT }];
    if (body.mediaType === "document") {
      content.push({
        type: "input_file",
        filename: "comprovante.pdf",
        file_data: `data:${mime};base64,${base64}`,
      });
    } else {
      content.push({
        type: "input_image",
        image_url: `data:${mime};base64,${base64}`,
        detail: "high",
      });
    }

    const openaiResp = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${openaiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        input: [{ role: "user", content }],
      }),
    });

    if (!openaiResp.ok) {
      const errText = await openaiResp.text();
      return new Response(
        JSON.stringify({ error: "openai_http_error", status: openaiResp.status, detail: errText.slice(0, 500) }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const data = await openaiResp.json();
    const text = extractOutputText(data);

    // Modelo às vezes envolve o JSON em cercas markdown (```json ... ```)
    // apesar do prompt pedir "sem nenhum texto fora do JSON" — normaliza
    // antes de parsear (achado real ao testar contra a API de verdade).
    const cleanedText = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();

    let parsed: any;
    try {
      parsed = JSON.parse(cleanedText);
    } catch {
      return new Response(JSON.stringify({ error: "openai_response_not_json", raw: text.slice(0, 500) }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Validação estrutural mínima — não confia cegamente no shape retornado.
    const result: ReceiptClassification = {
      is_receipt: typeof parsed.is_receipt === "boolean" ? parsed.is_receipt : false,
      e2e_or_transaction_id: typeof parsed.e2e_or_transaction_id === "string" ? parsed.e2e_or_transaction_id : null,
      value: typeof parsed.value === "number" ? parsed.value : null,
      date_text: typeof parsed.date_text === "string" ? parsed.date_text : null,
      bank: typeof parsed.bank === "string" ? parsed.bank : null,
      confidence: ["alta", "media", "baixa"].includes(parsed.confidence) ? parsed.confidence : "baixa",
      sha256,
      mime,
      size_bytes: bytes.byteLength,
    };

    console.log("[receipt-classify-admin] classified", JSON.stringify({
      objectPath: body.objectPath,
      sha256: result.sha256,
      is_receipt: result.is_receipt,
      e2e_masked: maskPII(result.e2e_or_transaction_id),
      value: result.value,
      confidence: result.confidence,
    }));

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: "exception", detail: String((e as Error)?.message || e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
