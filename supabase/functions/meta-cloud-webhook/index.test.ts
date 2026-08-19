// deno test --allow-import index.test.ts
//
// Correção 1 do ADENDO GATE 2A.1: testes de RUNTIME que exercitam de
// verdade `handleInboundEvent`/`handleVerification`/`insertLedgerRow`
// (não busca textual). Cada cenário produz um HMAC real (via
// meta-webhook-signature.ts) sobre um corpo real, e um mock de Supabase
// controla o resultado do insert para simular sucesso/duplicata/erro/timeout.

import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { computeHmacSha256Hex } from "../_shared/meta-webhook-signature.ts";
import { handleInboundEvent, handleVerification, insertLedgerRow, type LedgerSupabaseLike } from "./index.ts";

const APP_SECRET = "test-secret";
// Timeout curto só para os testes de timeout não esperarem os 8s reais de
// produção — o mecanismo testado (withTimeout em insertLedgerRow) é o
// mesmo, só o valor numérico muda via `ledgerTimeoutMs`/3º parâmetro.
const TEST_TIMEOUT_MS = 50;

async function signedRequest(bodyObj: unknown): Promise<Request> {
  const body = JSON.stringify(bodyObj);
  const sig = await computeHmacSha256Hex(body, APP_SECRET);
  return new Request("https://example.com/meta-cloud-webhook", {
    method: "POST",
    headers: { "x-hub-signature-256": `sha256=${sig}` },
    body,
  });
}

function samplePayload() {
  return {
    object: "whatsapp_business_account",
    entry: [{
      id: "WABA1",
      changes: [{
        field: "messages",
        value: {
          metadata: { phone_number_id: "PN1" },
          messages: [{ id: "wamid.1", from: "5511999999999", type: "text", text: { body: "oi" } }],
        },
      }],
    }],
  };
}

/** Spy: conta quantas vezes `insert` foi chamado, além de simular o resultado. */
function countingMockSupabase(
  mode: "always_insert" | "always_duplicate" | "always_db_error" | "always_timeout",
): { client: LedgerSupabaseLike; callCount: () => number } {
  let calls = 0;
  const client: LedgerSupabaseLike = {
    from(_table: string) {
      return {
        async insert(_row: Record<string, unknown>) {
          calls++;
          if (mode === "always_insert") return { error: null };
          if (mode === "always_duplicate") return { error: { code: "23505", message: "duplicate key" } };
          return { error: { code: "42501", message: "permission denied" } };
        },
      };
    },
  };
  return { client, callCount: () => calls };
}

/** Mock de Supabase — `mode` controla o comportamento do insert. */
function mockSupabase(mode: "always_insert" | "always_duplicate" | "always_db_error" | "always_timeout"): LedgerSupabaseLike {
  return {
    from(_table: string) {
      return {
        async insert(_row: Record<string, unknown>) {
          if (mode === "always_insert") return { error: null };
          if (mode === "always_duplicate") return { error: { code: "23505", message: "duplicate key" } };
          if (mode === "always_db_error") return { error: { code: "42501", message: "permission denied" } };
          // always_timeout: resolve depois do timeout de teste (ver TEST_TIMEOUT_MS
          // abaixo, passado explicitamente para não depender do default de produção de 8s).
          await new Promise((r) => setTimeout(r, TEST_TIMEOUT_MS * 5));
          return { error: null };
        },
      };
    },
  };
}

// ── insertLedgerRow — resultado tipado, nunca engole erro ──────────────

const SAMPLE_ROW = {
  waba_id: "W", phone_number_id: "PN1", event_type: "message", status: null,
  wamid: "wamid.1", idempotency_key: "message:PN1:wamid.1", raw_payload: {}, signature_valid: true,
  processing_status: "pending",
};

Deno.test("insertLedgerRow: insert bem-sucedido => outcome inserted", async () => {
  const outcome = await insertLedgerRow(mockSupabase("always_insert"), SAMPLE_ROW);
  assertEquals(outcome, { outcome: "inserted" });
});

Deno.test("insertLedgerRow: 23505 => outcome duplicate_confirmed (não é 'erro')", async () => {
  const outcome = await insertLedgerRow(mockSupabase("always_duplicate"), SAMPLE_ROW);
  assertEquals(outcome, { outcome: "duplicate_confirmed" });
});

Deno.test("insertLedgerRow: erro de banco (não-23505) => outcome error, NUNCA duplicate_confirmed", async () => {
  const outcome = await insertLedgerRow(mockSupabase("always_db_error"), SAMPLE_ROW);
  assertEquals(outcome.outcome, "error");
  if (outcome.outcome === "error") assertEquals(outcome.reason, "db_error_42501");
});

Deno.test("insertLedgerRow: timeout de persistência => outcome error", async () => {
  const outcome = await insertLedgerRow(mockSupabase("always_timeout"), SAMPLE_ROW, TEST_TIMEOUT_MS);
  assertEquals(outcome.outcome, "error");
  if (outcome.outcome === "error") assertEquals(outcome.reason, "timeout");
});

// ── handleInboundEvent — comportamento HTTP fim a fim ───────────────────

Deno.test("HTTP: assinatura ausente => 401, nunca 2xx, ZERO chamadas ao ledger (Correção 2, Fase 2A.3)", async () => {
  const { client, callCount } = countingMockSupabase("always_insert");
  const req = new Request("https://x/webhook", { method: "POST", body: JSON.stringify(samplePayload()) });
  const res = await handleInboundEvent(req, { supabase: client, appSecret: APP_SECRET });
  assertEquals(res.status, 401);
  assertEquals(callCount(), 0);
});

Deno.test("HTTP: assinatura inválida (corpo adulterado) => 401, ZERO chamadas ao ledger", async () => {
  const { client, callCount } = countingMockSupabase("always_insert");
  const body = JSON.stringify(samplePayload());
  const sig = await computeHmacSha256Hex(body, APP_SECRET);
  const tampered = body + " ";
  const req = new Request("https://x/webhook", {
    method: "POST",
    headers: { "x-hub-signature-256": `sha256=${sig}` },
    body: tampered,
  });
  const res = await handleInboundEvent(req, { supabase: client, appSecret: APP_SECRET });
  assertEquals(res.status, 401);
  assertEquals(callCount(), 0);
});

Deno.test("HTTP: JSON inválido com assinatura válida => 400, NUNCA sucesso, ZERO chamadas ao ledger (não faz parse do JSON para tentar normalizar)", async () => {
  const { client, callCount } = countingMockSupabase("always_insert");
  const body = "{ isso não é json";
  const sig = await computeHmacSha256Hex(body, APP_SECRET);
  const req = new Request("https://x/webhook", {
    method: "POST",
    headers: { "x-hub-signature-256": `sha256=${sig}` },
    body,
  });
  const res = await handleInboundEvent(req, { supabase: client, appSecret: APP_SECRET });
  assertEquals(res.status, 400);
  assertEquals(callCount(), 0);
});

Deno.test("HTTP: configuração ausente (supabase null) => 500, nunca sucesso falso", async () => {
  const req = await signedRequest(samplePayload());
  const res = await handleInboundEvent(req, { supabase: null, appSecret: APP_SECRET });
  assertEquals(res.status, 500);
});

Deno.test("HTTP: insert bem-sucedido => 200", async () => {
  const req = await signedRequest(samplePayload());
  const res = await handleInboundEvent(req, { supabase: mockSupabase("always_insert"), appSecret: APP_SECRET });
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.inserted, 1);
  assertEquals(body.duplicates, 0);
});

Deno.test("HTTP: duplicata confirmada => 200, sem reprocessar (outcome duplicate, não error)", async () => {
  const req = await signedRequest(samplePayload());
  const res = await handleInboundEvent(req, { supabase: mockSupabase("always_duplicate"), appSecret: APP_SECRET });
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.duplicates, 1);
  assertEquals(body.inserted, 0);
});

Deno.test("HTTP: banco indisponível (erro em todo insert) => NÃO-2xx (503)", async () => {
  const req = await signedRequest(samplePayload());
  const res = await handleInboundEvent(req, { supabase: mockSupabase("always_db_error"), appSecret: APP_SECRET });
  assertEquals(res.status, 503);
  assertEquals(res.status >= 200 && res.status < 300, false);
});

Deno.test("HTTP: timeout de persistência => NÃO-2xx (503)", async () => {
  const req = await signedRequest(samplePayload());
  const res = await handleInboundEvent(req, {
    supabase: mockSupabase("always_timeout"),
    appSecret: APP_SECRET,
    ledgerTimeoutMs: TEST_TIMEOUT_MS,
  });
  assertEquals(res.status, 503);
});

Deno.test("HTTP: falha não é engolida por .catch(console.error) — resposta reflete o erro real, não um 200 disfarçado", async () => {
  // Mesma asserção do teste anterior, reforçada: o corpo da resposta em
  // caso de erro nunca contém `received`/`inserted` como se tivesse dado certo.
  const req = await signedRequest(samplePayload());
  const res = await handleInboundEvent(req, { supabase: mockSupabase("always_db_error"), appSecret: APP_SECRET });
  const body = await res.json();
  assertEquals(body.error_code, "ledger_persistence_incomplete");
  assertEquals("inserted" in body, false);
});

// ── GET de verificação ───────────────────────────────────────────────────

Deno.test("GET: verify_token correto => 200 com o challenge", () => {
  const req = new Request("https://x/webhook?hub.mode=subscribe&hub.verify_token=tok123&hub.challenge=abc");
  const res = handleVerification(req, { get: (k) => (k === "META_WEBHOOK_VERIFY_TOKEN" ? "tok123" : undefined) });
  assertEquals(res.status, 200);
});

Deno.test("GET: verify_token incorreto => 403", () => {
  const req = new Request("https://x/webhook?hub.mode=subscribe&hub.verify_token=errado&hub.challenge=abc");
  const res = handleVerification(req, { get: (k) => (k === "META_WEBHOOK_VERIFY_TOKEN" ? "tok123" : undefined) });
  assertEquals(res.status, 403);
});
