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

const ALLOWED_INSTANCES = new Set(["canal46"]);

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
  const pixId = (body.pix_id as string) ?? null;
  const amount = (body.amount as number) ?? null;
  const payerName = (body.payer_name as string) ?? null;
  const confidence = (body.confidence as number) ?? null;
  const ocrText = (body.ocr_text as string) ?? null;
  const receivedAt =
    (body.received_at as string) ?? new Date().toISOString();
  const isReceipt = (body.is_receipt as boolean) ?? null;

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

  const { error } = await supabase.from("purchase_audit").insert(row);
  if (error) {
    const code = (error as { code?: string }).code;
    if (code === "23505" || /duplicate key/i.test(error.message)) {
      return json(200, { ok: true, duplicate: true });
    }
    return json(500, { ok: false, error: error.message });
  }

  return json(200, { ok: true, inserted: true });
});
