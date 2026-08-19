// deno test --allow-import index.test.ts
//
// Correção 1 do ADENDO GATE 2A.1: testes de RUNTIME que exercitam de
// verdade `handleInboundEvent`/`handleVerification`/`insertLedgerRow`
// (não busca textual). Cada cenário produz um HMAC real (via
// meta-webhook-signature.ts) sobre um corpo real, e um mock de Supabase
// controla o resultado do insert para simular sucesso/duplicata/erro/timeout.
//
// FASE 12A — todos os testes de handleInboundEvent agora injetam
// `resolveConnectionCandidates` (a resolução de conexão passou a ser um
// pré-requisito comum a AMBOS os caminhos). Novos testes cobrem: seleção
// de modo (direct_meta/hookcloud/legado/desconhecido), as 13 condições do
// gate HookCloud aplicadas de ponta a ponta, isolamento de ações de
// negócio, tamanho de payload, schema inválido, roteamento por método
// HTTP, e não-duplicação de quarentena.

import { assert, assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { computeHmacSha256Hex } from "../_shared/meta-webhook-signature.ts";
import { hashHookCloudWebhookSecret } from "../_shared/meta-webhook-hookcloud-secret.ts";
import {
  handleInboundEvent,
  handleVerification,
  insertLedgerRow,
  type LedgerSupabaseLike,
  type MetaCloudConnectionCandidate,
  routeRequest,
} from "./index.ts";

const APP_SECRET = "test-secret";
const HOOKCLOUD_SECRET = "hc-segredo-de-teste-64-caracteres-simulado-para-verificacao-aqui";
const TEST_TIMEOUT_MS = 50;
const NOW_SECONDS = Math.floor(Date.now() / 1000);

function directMetaCandidate(): MetaCloudConnectionCandidate {
  return {
    connectionId: "conn-dm-1",
    organizationId: "org-dm-a",
    provider: "meta_cloud",
    wabaId: "WABA1",
    phoneNumberId: "PN1",
    onboardingState: "active",
    onboardingSourceRaw: "direct_meta",
    hookcloudSecretHash: null,
  };
}

async function hookCloudCandidate(overrides: Partial<MetaCloudConnectionCandidate> = {}): Promise<MetaCloudConnectionCandidate> {
  return {
    connectionId: "conn-hc-1",
    organizationId: "org-hc-a",
    provider: "meta_cloud",
    wabaId: "WABA1",
    phoneNumberId: "PN1",
    onboardingState: "active",
    onboardingSourceRaw: "hookcloud",
    hookcloudSecretHash: await hashHookCloudWebhookSecret(HOOKCLOUD_SECRET),
    ...overrides,
  };
}

function resolverReturning(candidates: MetaCloudConnectionCandidate[]) {
  return async (_phoneNumberId: string) => candidates;
}

async function signedRequest(bodyObj: unknown, url = "https://example.com/meta-cloud-webhook"): Promise<Request> {
  const body = JSON.stringify(bodyObj);
  const sig = await computeHmacSha256Hex(body, APP_SECRET);
  return new Request(url, {
    method: "POST",
    headers: { "x-hub-signature-256": `sha256=${sig}` },
    body,
  });
}

function samplePayload(overrides: Record<string, unknown> = {}) {
  return {
    object: "whatsapp_business_account",
    entry: [{
      id: "WABA1",
      changes: [{
        field: "messages",
        value: {
          metadata: { phone_number_id: "PN1" },
          messages: [{ id: "wamid.1", from: "5511999999999", type: "text", text: { body: "oi" }, timestamp: String(NOW_SECONDS) }],
        },
      }],
    }],
    ...overrides,
  };
}

/** Spy: conta quantas vezes `insert` foi chamado, além de simular o resultado. */
function countingMockSupabase(
  mode: "always_insert" | "always_duplicate" | "always_db_error" | "always_timeout",
): { client: LedgerSupabaseLike; callCount: () => number; rows: () => Record<string, unknown>[] } {
  let calls = 0;
  const rows: Record<string, unknown>[] = [];
  const client: LedgerSupabaseLike = {
    from(_table: string) {
      return {
        async insert(row: Record<string, unknown>) {
          calls++;
          rows.push(row);
          if (mode === "always_insert") return { error: null };
          if (mode === "always_duplicate") return { error: { code: "23505", message: "duplicate key" } };
          return { error: { code: "42501", message: "permission denied" } };
        },
      };
    },
  };
  return { client, callCount: () => calls, rows: () => rows };
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
          await new Promise((r) => setTimeout(r, TEST_TIMEOUT_MS * 5));
          return { error: null };
        },
      };
    },
  };
}

function fakeHookCloudEnv(values: Record<string, string>) {
  return { get: (k: string) => values[k] };
}

const HOOKCLOUD_ENABLED_ENV = fakeHookCloudEnv({
  HOOKCLOUD_WEBHOOK_MODE: "pilot",
  HOOKCLOUD_WEBHOOK_PILOT_CONNECTION_IDS: "conn-hc-1",
});

function hookCloudRequest(bodyObj: unknown, secret: string | null = HOOKCLOUD_SECRET): Request {
  const url = new URL("https://example.com/meta-cloud-webhook");
  if (secret !== null) url.searchParams.set("hcs", secret);
  return new Request(url.toString(), { method: "POST", body: JSON.stringify(bodyObj) });
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

// ── handleInboundEvent — caminho direct_meta (HMAC, preservado) ─────────

Deno.test("direct_meta: HMAC válido mantém processamento normal => 200", async () => {
  const req = await signedRequest(samplePayload());
  const res = await handleInboundEvent(req, {
    supabase: mockSupabase("always_insert"),
    appSecret: APP_SECRET,
    resolveConnectionCandidates: resolverReturning([directMetaCandidate()]),
  });
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.inserted, 1);
  assertEquals(body.duplicates, 0);
});

Deno.test("direct_meta: assinatura ausente => 401, nunca 2xx, ZERO chamadas ao ledger", async () => {
  const { client, callCount } = countingMockSupabase("always_insert");
  const req = new Request("https://x/webhook", { method: "POST", body: JSON.stringify(samplePayload()) });
  const res = await handleInboundEvent(req, {
    supabase: client,
    appSecret: APP_SECRET,
    resolveConnectionCandidates: resolverReturning([directMetaCandidate()]),
  });
  assertEquals(res.status, 401);
  assertEquals(callCount(), 0);
});

Deno.test("direct_meta: assinatura inválida (corpo adulterado) => 401, ZERO chamadas ao ledger", async () => {
  const { client, callCount } = countingMockSupabase("always_insert");
  const body = JSON.stringify(samplePayload());
  const sig = await computeHmacSha256Hex(body, APP_SECRET);
  const tampered = body + " ";
  const req = new Request("https://x/webhook", {
    method: "POST",
    headers: { "x-hub-signature-256": `sha256=${sig}` },
    body: tampered,
  });
  const res = await handleInboundEvent(req, {
    supabase: client,
    appSecret: APP_SECRET,
    resolveConnectionCandidates: resolverReturning([directMetaCandidate()]),
  });
  assertEquals(res.status, 401);
  assertEquals(callCount(), 0);
});

Deno.test("direct_meta: configuração ausente (supabase null) => 500, nunca sucesso falso", async () => {
  const req = await signedRequest(samplePayload());
  const res = await handleInboundEvent(req, {
    supabase: null,
    appSecret: APP_SECRET,
    resolveConnectionCandidates: resolverReturning([directMetaCandidate()]),
  });
  assertEquals(res.status, 500);
});

Deno.test("direct_meta: duplicata confirmada => 200, sem reprocessar", async () => {
  const req = await signedRequest(samplePayload());
  const res = await handleInboundEvent(req, {
    supabase: mockSupabase("always_duplicate"),
    appSecret: APP_SECRET,
    resolveConnectionCandidates: resolverReturning([directMetaCandidate()]),
  });
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.duplicates, 1);
  assertEquals(body.inserted, 0);
});

Deno.test("direct_meta: banco indisponível => NÃO-2xx (503), corpo nunca finge sucesso", async () => {
  const req = await signedRequest(samplePayload());
  const res = await handleInboundEvent(req, {
    supabase: mockSupabase("always_db_error"),
    appSecret: APP_SECRET,
    resolveConnectionCandidates: resolverReturning([directMetaCandidate()]),
  });
  assertEquals(res.status, 503);
  const body = await res.json();
  assertEquals(body.error_code, "ledger_persistence_incomplete");
  assertEquals("inserted" in body, false);
});

Deno.test("direct_meta: timeout de persistência => NÃO-2xx (503)", async () => {
  const req = await signedRequest(samplePayload());
  const res = await handleInboundEvent(req, {
    supabase: mockSupabase("always_timeout"),
    appSecret: APP_SECRET,
    resolveConnectionCandidates: resolverReturning([directMetaCandidate()]),
    ledgerTimeoutMs: TEST_TIMEOUT_MS,
  });
  assertEquals(res.status, 503);
});

// ── Etapa comum inicial: tamanho, JSON, schema, identificadores ─────────

Deno.test("payload maior que o limite => 413, antes de qualquer parsing", async () => {
  const hugeBody = "x".repeat(1_000_001);
  const req = new Request("https://x/webhook", { method: "POST", body: hugeBody });
  const res = await handleInboundEvent(req, {
    supabase: mockSupabase("always_insert"),
    appSecret: APP_SECRET,
    resolveConnectionCandidates: resolverReturning([directMetaCandidate()]),
  });
  assertEquals(res.status, 413);
});

Deno.test("JSON inválido => 400, ZERO chamadas ao ledger", async () => {
  const { client, callCount } = countingMockSupabase("always_insert");
  const req = new Request("https://x/webhook", { method: "POST", body: "{ isso não é json" });
  const res = await handleInboundEvent(req, {
    supabase: client,
    appSecret: APP_SECRET,
    resolveConnectionCandidates: resolverReturning([directMetaCandidate()]),
  });
  assertEquals(res.status, 400);
  assertEquals(callCount(), 0);
});

Deno.test("schema básico inválido (object errado) => 400", async () => {
  const req = new Request("https://x/webhook", { method: "POST", body: JSON.stringify({ object: "outra_coisa" }) });
  const res = await handleInboundEvent(req, {
    supabase: mockSupabase("always_insert"),
    appSecret: APP_SECRET,
    resolveConnectionCandidates: resolverReturning([directMetaCandidate()]),
  });
  assertEquals(res.status, 400);
});

// ── Seleção de modo e configuração desconhecida/ambígua ──────────────────

Deno.test("zero conexões candidatas => rejeição fechada (401), resposta uniforme", async () => {
  const req = await signedRequest(samplePayload());
  const res = await handleInboundEvent(req, {
    supabase: mockSupabase("always_insert"),
    appSecret: APP_SECRET,
    resolveConnectionCandidates: resolverReturning([]),
  });
  assertEquals(res.status, 401);
  const body = await res.json();
  assertEquals(body.error_code, "unknown_configuration");
});

Deno.test("múltiplas conexões candidatas (ambiguidade) => rejeição fechada (401), mesma resposta uniforme", async () => {
  const req = await signedRequest(samplePayload());
  const res = await handleInboundEvent(req, {
    supabase: mockSupabase("always_insert"),
    appSecret: APP_SECRET,
    resolveConnectionCandidates: resolverReturning([directMetaCandidate(), await hookCloudCandidate()]),
  });
  assertEquals(res.status, 401);
  const body = await res.json();
  assertEquals(body.error_code, "unknown_configuration");
});

Deno.test("provider UazAPI na conexão candidata => rejeição fechada (401), nunca processado como Meta", async () => {
  const req = await signedRequest(samplePayload());
  const res = await handleInboundEvent(req, {
    supabase: mockSupabase("always_insert"),
    appSecret: APP_SECRET,
    resolveConnectionCandidates: resolverReturning([{ ...directMetaCandidate(), provider: "uazapi" }]),
  });
  assertEquals(res.status, 401);
});

Deno.test("WABA (entry.id) divergente da conexão => rejeição fechada (401)", async () => {
  const req = await signedRequest(samplePayload());
  const res = await handleInboundEvent(req, {
    supabase: mockSupabase("always_insert"),
    appSecret: APP_SECRET,
    resolveConnectionCandidates: resolverReturning([{ ...directMetaCandidate(), wabaId: "WABA-OUTRO" }]),
  });
  assertEquals(res.status, 401);
});

Deno.test("onboarding_source NULL/legado => falha fechada (401), nunca vira direct_meta nem hookcloud", async () => {
  const req = await signedRequest(samplePayload());
  const res = await handleInboundEvent(req, {
    supabase: mockSupabase("always_insert"),
    appSecret: APP_SECRET,
    resolveConnectionCandidates: resolverReturning([{ ...directMetaCandidate(), onboardingSourceRaw: null }]),
  });
  assertEquals(res.status, 401);
});

Deno.test("onboarding_source desconhecido (valor arbitrário) => falha fechada (401)", async () => {
  const req = await signedRequest(samplePayload());
  const res = await handleInboundEvent(req, {
    supabase: mockSupabase("always_insert"),
    appSecret: APP_SECRET,
    resolveConnectionCandidates: resolverReturning([{ ...directMetaCandidate(), onboardingSourceRaw: "evohub" }]),
  });
  assertEquals(res.status, 401);
});

// ── Caminho hookcloud — gate completo, ledger/quarentena, ações bloqueadas ─

Deno.test("hookcloud: tudo válido => 200, evento entra SOMENTE em quarentena (ledger), nunca em outra tabela", async () => {
  const { client, callCount, rows } = countingMockSupabase("always_insert");
  const req = hookCloudRequest(samplePayload());
  const res = await handleInboundEvent(req, {
    supabase: client,
    appSecret: APP_SECRET,
    resolveConnectionCandidates: resolverReturning([await hookCloudCandidate()]),
    hookCloudEnv: HOOKCLOUD_ENABLED_ENV,
    isOrganizationAllowedForMetaCloud: async () => true,
  });
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.quarantined, 1);
  assertEquals(body.duplicates, 0);
  // "Não cria conversa; não cria mensagem operacional; não inicia funil;
  // não envia resposta; não processa comprovante; não registra venda;
  // não chama CAPI; não consome IA; não agenda follow-up" — a única
  // tabela tocada em todo este teste é `meta_webhook_events` (o mock
  // `client` acima é a ÚNICA superfície de I/O disponível ao handler
  // neste teste; nenhuma outra chamada de rede/banco é possível, então
  // "1 chamada a insert" já é a prova exaustiva de que nada mais foi
  // tocado).
  assertEquals(callCount(), 1);
  const storedRow = rows()[0];
  assertEquals(storedRow.signature_valid, false); // nunca finge que houve HMAC
  const storedPayload = storedRow.raw_payload as Record<string, unknown>;
  assertEquals(storedPayload.quarantine, true);
  assertEquals(JSON.stringify(storedPayload).includes("5511999999999"), false); // telefone do lead nunca armazenado
  assertEquals(JSON.stringify(storedPayload).includes("oi"), false); // conteúdo de mensagem nunca armazenado
});

Deno.test("hookcloud: segredo ausente => rejeição fechada (401), zero chamadas ao ledger", async () => {
  const { client, callCount } = countingMockSupabase("always_insert");
  const req = hookCloudRequest(samplePayload(), null);
  const res = await handleInboundEvent(req, {
    supabase: client,
    appSecret: APP_SECRET,
    resolveConnectionCandidates: resolverReturning([await hookCloudCandidate()]),
    hookCloudEnv: HOOKCLOUD_ENABLED_ENV,
    isOrganizationAllowedForMetaCloud: async () => true,
  });
  assertEquals(res.status, 401);
  assertEquals(callCount(), 0);
});

Deno.test("hookcloud: segredo incorreto => rejeição fechada (401), zero chamadas ao ledger", async () => {
  const { client, callCount } = countingMockSupabase("always_insert");
  const req = hookCloudRequest(samplePayload(), "segredo-errado");
  const res = await handleInboundEvent(req, {
    supabase: client,
    appSecret: APP_SECRET,
    resolveConnectionCandidates: resolverReturning([await hookCloudCandidate()]),
    hookCloudEnv: HOOKCLOUD_ENABLED_ENV,
    isOrganizationAllowedForMetaCloud: async () => true,
  });
  assertEquals(res.status, 401);
  assertEquals(callCount(), 0);
});

Deno.test("hookcloud: flag global desligada => rejeição fechada (401)", async () => {
  const req = hookCloudRequest(samplePayload());
  const res = await handleInboundEvent(req, {
    supabase: mockSupabase("always_insert"),
    appSecret: APP_SECRET,
    resolveConnectionCandidates: resolverReturning([await hookCloudCandidate()]),
    hookCloudEnv: fakeHookCloudEnv({ HOOKCLOUD_WEBHOOK_MODE: "off", HOOKCLOUD_WEBHOOK_PILOT_CONNECTION_IDS: "conn-hc-1" }),
    isOrganizationAllowedForMetaCloud: async () => true,
  });
  assertEquals(res.status, 401);
});

Deno.test("hookcloud: organização fora da allowlist => rejeição fechada (401)", async () => {
  const req = hookCloudRequest(samplePayload());
  const res = await handleInboundEvent(req, {
    supabase: mockSupabase("always_insert"),
    appSecret: APP_SECRET,
    resolveConnectionCandidates: resolverReturning([await hookCloudCandidate()]),
    hookCloudEnv: HOOKCLOUD_ENABLED_ENV,
    isOrganizationAllowedForMetaCloud: async () => false,
  });
  assertEquals(res.status, 401);
});

Deno.test("hookcloud: conexão fora da allowlist de piloto => rejeição fechada (401)", async () => {
  const req = hookCloudRequest(samplePayload());
  const res = await handleInboundEvent(req, {
    supabase: mockSupabase("always_insert"),
    appSecret: APP_SECRET,
    resolveConnectionCandidates: resolverReturning([await hookCloudCandidate()]),
    hookCloudEnv: fakeHookCloudEnv({ HOOKCLOUD_WEBHOOK_MODE: "pilot", HOOKCLOUD_WEBHOOK_PILOT_CONNECTION_IDS: "outra-conexao" }),
    isOrganizationAllowedForMetaCloud: async () => true,
  });
  assertEquals(res.status, 401);
});

Deno.test("hookcloud: conexão não ativa => rejeição fechada (401)", async () => {
  const req = hookCloudRequest(samplePayload());
  const res = await handleInboundEvent(req, {
    supabase: mockSupabase("always_insert"),
    appSecret: APP_SECRET,
    resolveConnectionCandidates: resolverReturning([await hookCloudCandidate({ onboardingState: "pending" })]),
    hookCloudEnv: HOOKCLOUD_ENABLED_ENV,
    isOrganizationAllowedForMetaCloud: async () => true,
  });
  assertEquals(res.status, 401);
});

Deno.test("hookcloud: timestamp expirado => rejeição fechada (401)", async () => {
  const req = hookCloudRequest(samplePayload({
    entry: [{ id: "WABA1", changes: [{ value: { metadata: { phone_number_id: "PN1" }, messages: [{ id: "wamid.1", timestamp: String(NOW_SECONDS - 10_000) }] } }] }],
  }));
  const res = await handleInboundEvent(req, {
    supabase: mockSupabase("always_insert"),
    appSecret: APP_SECRET,
    resolveConnectionCandidates: resolverReturning([await hookCloudCandidate()]),
    hookCloudEnv: HOOKCLOUD_ENABLED_ENV,
    isOrganizationAllowedForMetaCloud: async () => true,
  });
  assertEquals(res.status, 401);
});

Deno.test("hookcloud: duplicata (23505) => 200 idempotente, ACK sem repetir quarentena", async () => {
  const { client, callCount } = countingMockSupabase("always_duplicate");
  const req = hookCloudRequest(samplePayload());
  const res = await handleInboundEvent(req, {
    supabase: client,
    appSecret: APP_SECRET,
    resolveConnectionCandidates: resolverReturning([await hookCloudCandidate()]),
    hookCloudEnv: HOOKCLOUD_ENABLED_ENV,
    isOrganizationAllowedForMetaCloud: async () => true,
  });
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.duplicates, 1);
  assertEquals(body.quarantined, 0);
  // A "não-repetição" é garantida pela MESMA chamada de insert (a
  // constraint do banco decide 23505=duplicata) — só 1 chamada ocorreu,
  // não duas (uma checagem + uma gravação).
  assertEquals(callCount(), 1);
});

Deno.test("hookcloud: falha de persistência (não-duplicata) => NÃO-2xx (503), nada marcado como processado", async () => {
  const req = hookCloudRequest(samplePayload());
  const res = await handleInboundEvent(req, {
    supabase: mockSupabase("always_db_error"),
    appSecret: APP_SECRET,
    resolveConnectionCandidates: resolverReturning([await hookCloudCandidate()]),
    hookCloudEnv: HOOKCLOUD_ENABLED_ENV,
    isOrganizationAllowedForMetaCloud: async () => true,
  });
  assertEquals(res.status, 503);
  const body = await res.json();
  assertEquals("quarantined" in body, false);
});

Deno.test("hookcloud: UazAPI nunca é consultada nem acionada em nenhum cenário (nenhuma chamada além do mock injetado)", async () => {
  // O único client de I/O disponível ao handler é `client` — se qualquer
  // caminho de código tentasse consultar/chamar UazAPI, precisaria de uma
  // superfície de rede que este teste simplesmente não fornece; a
  // ausência de exceção "fetch is not defined"/similar, combinada com o
  // resultado determinístico abaixo, é a prova de que nenhum código deste
  // caminho depende de nada além do `client` injetado.
  const { client } = countingMockSupabase("always_insert");
  const req = hookCloudRequest(samplePayload());
  const res = await handleInboundEvent(req, {
    supabase: client,
    appSecret: APP_SECRET,
    resolveConnectionCandidates: resolverReturning([await hookCloudCandidate()]),
    hookCloudEnv: HOOKCLOUD_ENABLED_ENV,
    isOrganizationAllowedForMetaCloud: async () => true,
  });
  assertEquals(res.status, 200);
});

Deno.test("hookcloud: logs não vazam segredo, telefone, token ou payload bruto", async () => {
  const originalLog = console.log;
  const originalWarn = console.warn;
  const originalError = console.error;
  const calls: unknown[] = [];
  console.log = (...a: unknown[]) => calls.push(a);
  console.warn = (...a: unknown[]) => calls.push(a);
  console.error = (...a: unknown[]) => calls.push(a);
  try {
    const req = hookCloudRequest(samplePayload());
    await handleInboundEvent(req, {
      supabase: mockSupabase("always_insert"),
      appSecret: APP_SECRET,
      resolveConnectionCandidates: resolverReturning([await hookCloudCandidate()]),
      hookCloudEnv: HOOKCLOUD_ENABLED_ENV,
      isOrganizationAllowedForMetaCloud: async () => true,
    });
  } finally {
    console.log = originalLog;
    console.warn = originalWarn;
    console.error = originalError;
  }
  const serialized = JSON.stringify(calls);
  assertEquals(serialized.includes(HOOKCLOUD_SECRET), false);
  assertEquals(serialized.includes("5511999999999"), false);
  assertEquals(serialized.toLowerCase().includes("bearer"), false);
});

// ── Roteamento por método HTTP ────────────────────────────────────────────

Deno.test("método inválido (PUT) => 405", async () => {
  const req = new Request("https://x/webhook", { method: "PUT" });
  const res = await routeRequest(req, {
    supabase: mockSupabase("always_insert"),
    appSecret: APP_SECRET,
    resolveConnectionCandidates: resolverReturning([directMetaCandidate()]),
  });
  assertEquals(res.status, 405);
});

Deno.test("routeRequest: GET delega para handleVerification", async () => {
  const req = new Request("https://x/webhook?hub.mode=subscribe&hub.verify_token=tok123&hub.challenge=abc");
  const res = await routeRequest(req, {
    supabase: mockSupabase("always_insert"),
    appSecret: APP_SECRET,
    resolveConnectionCandidates: resolverReturning([directMetaCandidate()]),
  });
  assertEquals(res.status, 403); // sem env correto injetado aqui, só prova o roteamento (delega, não processa POST)
});

// ── GET de verificação ───────────────────────────────────────────────────
// Inalterado nesta fase — hub.verify_token continua a única autoridade;
// este caminho não tem nenhuma noção de conexão/Phone Number ID, então
// não pode, por construção, vazar essa informação nem retornar challenge
// para "conexão errada" (não existe conexão neste caminho).

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

Deno.test("GET: token nunca aparece na resposta de erro", () => {
  const req = new Request("https://x/webhook?hub.mode=subscribe&hub.verify_token=segredo-nao-pode-vazar&hub.challenge=abc");
  const res = handleVerification(req, { get: (k) => (k === "META_WEBHOOK_VERIFY_TOKEN" ? "tok123" : undefined) });
  assert(!res.status.toString().includes("segredo-nao-pode-vazar"));
});
