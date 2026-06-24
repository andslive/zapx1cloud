// Fase D.3 — Receipt Shadow Ingest (proxy)
// Recebe POST da VPS2 e persiste APENAS em public.receipt_shadow_results.
// NÃO escreve em: leads, conversations, purchase_audit, pixel_event_logs, inbox.
// verify_jwt=false (default Lovable). Validação via header X-Receipt-Shadow-Token.

import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json(405, { ok: false, error: "method_not_allowed" });
  }

  const expected = Deno.env.get("RECEIPT_SHADOW_INGEST_TOKEN");
  if (!expected) {
    return json(500, { ok: false, error: "server_misconfigured" });
  }
  const provided = req.headers.get("x-receipt-shadow-token");
  if (provided !== expected) {
    return json(401, { ok: false, error: "unauthorized" });
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return json(400, { ok: false, error: "invalid_json" });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  const row = {
    received_at: (body.received_at as string) ?? new Date().toISOString(),
    instance: (body.instance as string) ?? null,
    message_id: (body.message_id as string) ?? null,
    amount: (body.amount as number) ?? null,
    payer_name: (body.payer_name as string) ?? null,
    pix_id: (body.pix_id as string) ?? null,
    is_receipt: (body.is_receipt as boolean) ?? null,
    confidence: (body.confidence as number) ?? null,
    ocr_text: (body.ocr_text as string) ?? null,
    provider: (body.provider as string) ?? "shadow",
  };

  // Dedup explícito por (instance, message_id) antes do insert.
  if (row.instance && row.message_id) {
    const { data: existing } = await supabase
      .from("receipt_shadow_results")
      .select("id")
      .eq("instance", row.instance)
      .eq("message_id", row.message_id)
      .maybeSingle();
    if (existing) {
      return json(200, { ok: true, duplicate: true });
    }
  }

  const { error } = await supabase
    .from("receipt_shadow_results")
    .insert(row);

  if (error) {
    const code = (error as { code?: string }).code;
    if (code === "23505" || /duplicate key/i.test(error.message)) {
      return json(200, { ok: true, duplicate: true });
    }
    return json(500, { ok: false, error: error.message });
  }

  return json(200, { ok: true, inserted: true });
});
