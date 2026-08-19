// deno test --allow-import meta-webhook-hookcloud-gate.test.ts
//
// Fase 11A — prova as 13 condições do gate HookCloud, a simetria com
// direct_meta (HMAC intocado), a política de ações permitidas/bloqueadas,
// e a ausência de qualquer fallback para UazAPI.

import { assert, assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  evaluateDirectMetaWebhookGate,
  evaluateHookCloudWebhookGate,
  type HookCloudGateInput,
  type HookCloudPilotAction,
  isHookCloudPilotActionPermitted,
} from "./meta-webhook-hookcloud-gate.ts";
import { verifyMetaWebhookSignature } from "./meta-webhook-signature.ts";

const NOW = 1_800_000_000;

function validInput(overrides: Partial<HookCloudGateInput> = {}): HookCloudGateInput {
  return {
    mode: "pilot",
    organizationAllowed: true,
    connectionId: "conn-1",
    pilotConnectionIds: new Set(["conn-1"]),
    onboardingState: "active",
    provider: "meta_cloud",
    onboardingSource: "hookcloud",
    secretValid: true,
    payloadEntryId: "WABA1",
    connectionWabaId: "WABA1",
    payloadPhoneNumberId: "PN1",
    connectionPhoneNumberId: "PN1",
    matchedConnectionCount: 1,
    eventTimestampSeconds: NOW,
    nowSeconds: NOW,
    maxAgeSeconds: 300,
    payloadSchemaValid: true,
    isDuplicateInLedger: false,
    ...overrides,
  };
}

Deno.test("caminho feliz: todas as 13 condições verdadeiras => quarantine/OK", () => {
  const decision = evaluateHookCloudWebhookGate(validInput());
  assertEquals(decision, { outcome: "quarantine", reasonCode: "OK" });
});

Deno.test("1) HookCloud com flag/modo desligado rejeita", () => {
  const decision = evaluateHookCloudWebhookGate(validInput({ mode: "off" }));
  assertEquals(decision, { outcome: "reject", reasonCode: "HOOKCLOUD_MODE_OFF" });
});

Deno.test("2) organização fora da allowlist rejeita", () => {
  const decision = evaluateHookCloudWebhookGate(validInput({ organizationAllowed: false }));
  assertEquals(decision, { outcome: "reject", reasonCode: "ORGANIZATION_NOT_ALLOWED" });
});

Deno.test("3) conexão fora da allowlist de piloto rejeita", () => {
  const decision = evaluateHookCloudWebhookGate(validInput({ pilotConnectionIds: new Set(["outra-conexao"]) }));
  assertEquals(decision, { outcome: "reject", reasonCode: "CONNECTION_NOT_IN_PILOT_ALLOWLIST" });
});

Deno.test("4) conexão não ativa rejeita", () => {
  const decision = evaluateHookCloudWebhookGate(validInput({ onboardingState: "pending" }));
  assertEquals(decision, { outcome: "reject", reasonCode: "CONNECTION_NOT_ACTIVE" });
});

Deno.test("5) provider UazAPI rejeita (nunca avança para uma conexão uazapi)", () => {
  const decision = evaluateHookCloudWebhookGate(validInput({ provider: "uazapi" }));
  assertEquals(decision, { outcome: "reject", reasonCode: "PROVIDER_MISMATCH" });
});

Deno.test("6) onboarding_source diferente de 'hookcloud' rejeita (inclui 'direct_meta' e null)", () => {
  assertEquals(
    evaluateHookCloudWebhookGate(validInput({ onboardingSource: "direct_meta" })).reasonCode,
    "ONBOARDING_SOURCE_MISMATCH",
  );
  assertEquals(
    evaluateHookCloudWebhookGate(validInput({ onboardingSource: null })).reasonCode,
    "ONBOARDING_SOURCE_MISMATCH",
  );
});

Deno.test("7) segredo ausente/incorreto rejeita", () => {
  const decision = evaluateHookCloudWebhookGate(validInput({ secretValid: false }));
  assertEquals(decision, { outcome: "reject", reasonCode: "SECRET_INVALID" });
});

Deno.test("8) WABA (entry.id) divergente rejeita", () => {
  const decision = evaluateHookCloudWebhookGate(validInput({ payloadEntryId: "WABA-OUTRO" }));
  assertEquals(decision, { outcome: "reject", reasonCode: "WABA_MISMATCH" });
});

Deno.test("9) Phone Number ID divergente rejeita", () => {
  const decision = evaluateHookCloudWebhookGate(validInput({ payloadPhoneNumberId: "PN-OUTRO" }));
  assertEquals(decision, { outcome: "reject", reasonCode: "PHONE_NUMBER_ID_MISMATCH" });
});

Deno.test("10a) zero conexões encontradas rejeita", () => {
  const decision = evaluateHookCloudWebhookGate(validInput({ matchedConnectionCount: 0 }));
  assertEquals(decision, { outcome: "reject", reasonCode: "ZERO_CONNECTIONS_MATCHED" });
});

Deno.test("10b) múltiplas conexões encontradas rejeita (nunca escolhe uma arbitrariamente)", () => {
  const decision = evaluateHookCloudWebhookGate(validInput({ matchedConnectionCount: 2 }));
  assertEquals(decision, { outcome: "reject", reasonCode: "MULTIPLE_CONNECTIONS_MATCHED" });
});

Deno.test("11) timestamp fora da janela permitida rejeita", () => {
  const decision = evaluateHookCloudWebhookGate(validInput({ eventTimestampSeconds: NOW - 10_000 }));
  assertEquals(decision, { outcome: "reject", reasonCode: "TIMESTAMP_OUT_OF_WINDOW" });
});

Deno.test("11b) timestamp ausente (null) rejeita", () => {
  const decision = evaluateHookCloudWebhookGate(validInput({ eventTimestampSeconds: null }));
  assertEquals(decision, { outcome: "reject", reasonCode: "TIMESTAMP_OUT_OF_WINDOW" });
});

Deno.test("12) payload com schema inválido rejeita", () => {
  const decision = evaluateHookCloudWebhookGate(validInput({ payloadSchemaValid: false }));
  assertEquals(decision, { outcome: "reject", reasonCode: "INVALID_PAYLOAD_SCHEMA" });
});

Deno.test("13) duplicata (já no ledger) não reprocessa — outcome distinto de reject e de quarantine", () => {
  const decision = evaluateHookCloudWebhookGate(validInput({ isDuplicateInLedger: true }));
  assertEquals(decision, { outcome: "duplicate_skip", reasonCode: "DUPLICATE_ALREADY_PROCESSED" });
});

Deno.test("evento aceito nunca é 'reject' nem 'duplicate_skip' — só 'quarantine' quando as 13 condições passam", () => {
  const decision = evaluateHookCloudWebhookGate(validInput());
  assertEquals(decision.outcome, "quarantine");
});

// ─── Simetria com direct_meta: HMAC continua sendo a única exigência,     ───
//     nunca flexibilizado. ────────────────────────────────────────────────

Deno.test("direct_meta: gate simétrico rejeita sem HMAC válido", () => {
  assertEquals(evaluateDirectMetaWebhookGate(false), { outcome: "reject", reasonCode: "SECRET_INVALID" });
});

Deno.test("direct_meta: gate simétrico aceita com HMAC válido", () => {
  assertEquals(evaluateDirectMetaWebhookGate(true), { outcome: "quarantine", reasonCode: "OK" });
});

Deno.test("direct_meta: a função REAL de verificação HMAC (meta-webhook-signature.ts, intocada) continua rejeitando assinatura inválida", async () => {
  const result = await verifyMetaWebhookSignature("corpo-bruto", "sha256=assinatura-invalida-de-proposito", "segredo-app");
  assertEquals(result.valid, false);
});

Deno.test("direct_meta: a função REAL de verificação HMAC continua aceitando assinatura correta", async () => {
  const rawBody = '{"entry":[]}';
  const secret = "app-secret-de-teste";
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(rawBody));
  const hex = Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
  const result = await verifyMetaWebhookSignature(rawBody, `sha256=${hex}`, secret);
  assertEquals(result.valid, true);
});

// ─── Política de ações permitidas/bloqueadas ──────────────────────────────

const ALL_ACTIONS: HookCloudPilotAction[] = [
  "register_ledger_entry",
  "store_quarantined_payload",
  "emit_safe_log",
  "respond_fast_ack",
  "start_or_advance_funnel",
  "send_automatic_reply",
  "send_proactive_message",
  "process_receipt",
  "record_sale",
  "trigger_capi_pixel",
  "consume_ai",
  "run_follow_up",
  "modify_financial_data",
];

const EXPECTED_PERMITTED: ReadonlySet<HookCloudPilotAction> = new Set([
  "register_ledger_entry",
  "store_quarantined_payload",
  "emit_safe_log",
  "respond_fast_ack",
]);

Deno.test("política: SOMENTE as 4 ações de registro/log/ack são permitidas — todas as ações de negócio permanecem bloqueadas", () => {
  for (const action of ALL_ACTIONS) {
    const expected = EXPECTED_PERMITTED.has(action);
    assertEquals(isHookCloudPilotActionPermitted(action), expected, `ação '${action}' deveria ser permitida=${expected}`);
  }
});

Deno.test("política: início/avanço de funil é explicitamente bloqueado", () => {
  assert(!isHookCloudPilotActionPermitted("start_or_advance_funnel"));
});

Deno.test("política: envio de mensagem (automática ou proativa) é explicitamente bloqueado", () => {
  assert(!isHookCloudPilotActionPermitted("send_automatic_reply"));
  assert(!isHookCloudPilotActionPermitted("send_proactive_message"));
});

Deno.test("política: comprovante, venda, CAPI/Pixel, IA e follow-up são explicitamente bloqueados", () => {
  assert(!isHookCloudPilotActionPermitted("process_receipt"));
  assert(!isHookCloudPilotActionPermitted("record_sale"));
  assert(!isHookCloudPilotActionPermitted("trigger_capi_pixel"));
  assert(!isHookCloudPilotActionPermitted("consume_ai"));
  assert(!isHookCloudPilotActionPermitted("run_follow_up"));
  assert(!isHookCloudPilotActionPermitted("modify_financial_data"));
});
