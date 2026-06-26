// Fase F — Receipt Production Write (proxy)
// Recebe POST da VPS2 e grava APENAS em public.purchase_audit
// (purchase_source='vps2-pilot'). Allowlist por instance.
// NÃO escreve em: leads, conversations, pixel_event_logs, inbox, funis.
// verify_jwt=false (default). Validação via header X-Receipt-Production-Token.

import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const ALLOWED_INSTANCES = new Set(["canal46", "canal36"]);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json(405, { ok: false, error: "method_not_allowed" });
  }

  const expected = Deno.env.get("RECEIPT_PRODUCTION_WRITE_TOKEN");
  if (!expected) {
    return json(500, { ok: false, error: "server_misconfigured" });
  }
  const provided = req.headers.get("x-receipt-production-token");
  if (provided !== expected) {
    return json(401, { ok: false, error: "unauthorized" });
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return json(400, { ok: false, error: "invalid_json" });
  }

  const instance = ((body.instance as string) ?? "").toLowerCase();
  const messageId = (body.message_id as string) ?? null;
  // Aceita ambos os formatos de contrato (Fase F antigo + atual).
  const pixId = ((body.pix_id as string) ?? (body.receipt_pix_id as string) ?? null);
  const amount = ((body.amount as number) ?? (body.purchase_value as number) ?? null);
  const payerName = ((body.payer_name as string) ?? (body.customer_name as string) ?? null);
  const confidence = ((body.confidence as number) ?? (body.receipt_confidence as number) ?? null);
  const ocrText = ((body.ocr_text as string) ?? (body.receipt_ocr_text as string) ?? null);
  const phone = ((body.phone as string) ?? null);
  const aiReason = ((body.ai_reason as string) ?? null);
  const receivedAt =
    (body.received_at as string) ?? new Date().toISOString();
  // is_receipt pode não vir no novo contrato — assume true se há mensagem + valor/pix.
  const isReceipt =
    (body.is_receipt as boolean) ??
    Boolean(amount != null || pixId);

  if (!isReceipt) {
    return json(200, { ok: true, ignored: true, reason: "not_receipt" });
  }
  if (!instance || !ALLOWED_INSTANCES.has(instance)) {
    return json(200, { ok: true, ignored: true, reason: "instance_not_allowed" });
  }
  if (!messageId) {
    return json(400, { ok: false, error: "missing_message_id" });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  // Idempotência 1 — event_id (message_id)
  const { data: dupByEvent, error: e1 } = await supabase
    .from("purchase_audit")
    .select("id")
    .eq("event_id", messageId)
    .limit(1);
  if (e1) return json(500, { ok: false, error: e1.message });
  if (dupByEvent && dupByEvent.length > 0) {
    return json(200, { ok: true, duplicate: true });
  }

  // Idempotência 2 — pix_id em raw_payload
  if (pixId) {
    const { data: dupByPix, error: e2 } = await supabase
      .from("purchase_audit")
      .select("id")
      .filter("raw_payload->>receipt_pix_id", "eq", pixId)
      .limit(1);
    if (e2) return json(500, { ok: false, error: e2.message });
    if (dupByPix && dupByPix.length > 0) {
      return json(200, { ok: true, duplicate: true });
    }
  }

  const row = {
    connection_id: instance,
    customer_name: payerName,
    purchase_value: amount,
    currency: "BRL",
    event_id: messageId,
    purchase_source: "vps2-pilot",
    purchase_status: "recognized",
    raw_payload: {
      receipt_message_id: messageId,
      receipt_pix_id: pixId,
      receipt_confidence: confidence,
      receipt_ocr_text: ocrText,
      receipt_received_at: receivedAt,
      pilot: "vps2-pilot",
    },
  };

  let purchaseAuditDuplicate = false;
  const { error } = await supabase.from("purchase_audit").insert(row);
  if (error) {
    const code = (error as { code?: string }).code;
    if (code === "23505" || /duplicate key/i.test(error.message)) {
      purchaseAuditDuplicate = true;
    } else {
      return json(500, { ok: false, error: error.message });
    }
  }

  // Fase G.1 — espelho dedicado para consumo pelo bloco ai_receipt (não
  // substitui purchase_audit; é fonte de verdade só do resultado da VPS2).
  // Falha aqui NÃO bloqueia a resposta de sucesso do pipeline F.
  try {
    await supabase
      .from("vps_receipt_results")
      .upsert(
        {
          message_id: messageId,
          instance,
          pix_id: pixId,
          is_receipt: true,
          amount,
          customer_name: payerName,
          confidence,
          ocr_text: ocrText,
          ai_reason: aiReason,
          phone,
          received_at: receivedAt,
          raw_payload: body,
        },
        { onConflict: "message_id" },
      );
  } catch (mirrorErr) {
    console.warn(
      "[receipt-production-write] vps_receipt_results mirror failed",
      (mirrorErr as Error)?.message,
    );
  }

  if (purchaseAuditDuplicate) {
    return json(200, { ok: true, duplicate: true });
  }
  return json(200, { ok: true, inserted: true });
});
