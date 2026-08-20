// deno test --no-check --allow-read --allow-env src/lib/hookcloud/hookcloudProvisioning.test.ts
// (--no-check necessário pelo mesmo motivo documentado em
// src/config/integrationsCatalog.test.ts — arquivo de frontend fora de
// supabase/functions, sem a lib "deno.ns" implícita nesse contexto.)
//
// Fase 18A — cobre a lógica pura do onboarding manual HookCloud: validação
// de campos como strings opacas, corpo da requisição sem organization/
// provider/onboarding_source, validação estrita da forma da resposta de
// sucesso (nunca finge sucesso), classificação de erro (rede/timeout
// tratado como AMBÍGUO, nunca "falhou"), mensagens públicas seguras.

import { assert, assertEquals, assertFalse } from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  buildHookCloudProvisionRequestBody,
  classifyProvisionInvokeResult,
  hasFieldErrors,
  isPlausibleOpaqueId,
  isTrustedHookCloudCallbackUrl,
  parseHookCloudProvisionSuccessBody,
  publicErrorMessageForCode,
  validateHookCloudOnboardingForm,
  type HookCloudOnboardingFormValues,
} from "./hookcloudProvisioning.ts";

function validValues(overrides: Partial<HookCloudOnboardingFormValues> = {}): HookCloudOnboardingFormValues {
  return {
    connectionName: "WhatsApp Loja Centro",
    wabaId: "9876543210",
    phoneNumberId: "1234567890",
    displayPhoneNumber: "+55 11 99999-9999",
    accessToken: "token-sintetico-nunca-real-para-teste",
    ...overrides,
  };
}

// ── Validação de campos (strings opacas) ─────────────────────────────

Deno.test("isPlausibleOpaqueId: string não vazia e curta é aceita", () => {
  assert(isPlausibleOpaqueId("1234567890"));
});

Deno.test("isPlausibleOpaqueId: string vazia ou só espaços é rejeitada", () => {
  assertFalse(isPlausibleOpaqueId(""));
  assertFalse(isPlausibleOpaqueId("   "));
});

Deno.test("isPlausibleOpaqueId: string absurdamente longa (>64) é rejeitada", () => {
  assertFalse(isPlausibleOpaqueId("9".repeat(200)));
});

Deno.test("isPlausibleOpaqueId: string numérica longa (30 dígitos) continua sendo string válida — nunca convertida para number", () => {
  const longNumericId = "123456789012345678901234567890";
  assert(isPlausibleOpaqueId(longNumericId));
  assertEquals(typeof longNumericId, "string");
});

Deno.test("validateHookCloudOnboardingForm: valores válidos não geram erro", () => {
  const errors = validateHookCloudOnboardingForm(validValues());
  assertFalse(hasFieldErrors(errors));
});

Deno.test("validateHookCloudOnboardingForm: WABA ID ausente gera erro específico", () => {
  const errors = validateHookCloudOnboardingForm(validValues({ wabaId: "" }));
  assert(errors.wabaId !== undefined);
});

Deno.test("validateHookCloudOnboardingForm: Phone Number ID ausente gera erro específico", () => {
  const errors = validateHookCloudOnboardingForm(validValues({ phoneNumberId: "" }));
  assert(errors.phoneNumberId !== undefined);
});

Deno.test("validateHookCloudOnboardingForm: token ausente gera erro específico", () => {
  const errors = validateHookCloudOnboardingForm(validValues({ accessToken: "" }));
  assert(errors.accessToken !== undefined);
});

Deno.test("validateHookCloudOnboardingForm: nome de conexão ausente gera erro específico", () => {
  const errors = validateHookCloudOnboardingForm(validValues({ connectionName: "" }));
  assert(errors.connectionName !== undefined);
});

// ── Corpo da requisição — nunca organization/provider/onboarding_source ─

Deno.test("buildHookCloudProvisionRequestBody: corpo NUNCA inclui organizationId, provider ou onboardingSource", () => {
  const body = buildHookCloudProvisionRequestBody(validValues());
  assertFalse("organizationId" in body);
  assertFalse("organization_id" in body);
  assertFalse("provider" in body);
  assertFalse("onboardingSource" in body);
  assertFalse("onboarding_source" in body);
});

Deno.test("buildHookCloudProvisionRequestBody: contém exatamente os 5 campos esperados pelo contrato real do backend", () => {
  const body = buildHookCloudProvisionRequestBody(validValues());
  assertEquals(Object.keys(body).sort(), [
    "accessToken",
    "connectionName",
    "displayPhoneNumber",
    "phoneNumberId",
    "wabaId",
  ]);
});

Deno.test("buildHookCloudProvisionRequestBody: aplica trim externo, nunca converte para número", () => {
  const body = buildHookCloudProvisionRequestBody(validValues({ wabaId: "  9876543210  " }));
  assertEquals(body.wabaId, "9876543210");
  assertEquals(typeof body.wabaId, "string");
});

// ── Validação da URL de callback confiável ───────────────────────────

Deno.test("isTrustedHookCloudCallbackUrl: URL HTTPS real com hcs é aceita", () => {
  assert(isTrustedHookCloudCallbackUrl("https://ydunpoqdhijhnrarohiz.supabase.co/functions/v1/meta-cloud-webhook?hcs=abc123"));
});

Deno.test("isTrustedHookCloudCallbackUrl: HTTP é rejeitado", () => {
  assertFalse(isTrustedHookCloudCallbackUrl("http://ydunpoqdhijhnrarohiz.supabase.co/functions/v1/meta-cloud-webhook?hcs=abc123"));
});

Deno.test("isTrustedHookCloudCallbackUrl: caminho errado é rejeitado", () => {
  assertFalse(isTrustedHookCloudCallbackUrl("https://ydunpoqdhijhnrarohiz.supabase.co/functions/v1/outra-funcao?hcs=abc123"));
});

Deno.test("isTrustedHookCloudCallbackUrl: sem parâmetro hcs é rejeitado", () => {
  assertFalse(isTrustedHookCloudCallbackUrl("https://ydunpoqdhijhnrarohiz.supabase.co/functions/v1/meta-cloud-webhook"));
});

Deno.test("isTrustedHookCloudCallbackUrl: URL malformada é rejeitada sem lançar exceção", () => {
  assertFalse(isTrustedHookCloudCallbackUrl("nao-e-uma-url"));
});

// ── Validação estrita da resposta de sucesso — nunca finge sucesso ────

function validSuccessBody(overrides: Record<string, unknown> = {}) {
  return {
    connection_id: "conn-123",
    onboarding_state: "pending",
    callback_url: "https://ydunpoqdhijhnrarohiz.supabase.co/functions/v1/meta-cloud-webhook?hcs=abc123",
    verify_token: "verify-token-sintetico",
    warnings: [],
    ...overrides,
  };
}

Deno.test("parseHookCloudProvisionSuccessBody: resposta válida é aceita", () => {
  const result = parseHookCloudProvisionSuccessBody(validSuccessBody());
  assertEquals(result.kind, "success");
  if (result.kind === "success") {
    assertEquals(result.data.onboardingState, "pending");
  }
});

Deno.test("parseHookCloudProvisionSuccessBody: onboarding_state != 'pending' NUNCA é tratado como sucesso, mesmo com todo o resto válido", () => {
  const result = parseHookCloudProvisionSuccessBody(validSuccessBody({ onboarding_state: "active" }));
  assertEquals(result.kind, "not_pending");
});

Deno.test("parseHookCloudProvisionSuccessBody: connection_id ausente => resposta inesperada", () => {
  const { connection_id, ...rest } = validSuccessBody();
  const result = parseHookCloudProvisionSuccessBody(rest);
  assertEquals(result.kind, "unexpected_response");
});

Deno.test("parseHookCloudProvisionSuccessBody: verify_token ausente => resposta inesperada, nunca finge sucesso", () => {
  const { verify_token, ...rest } = validSuccessBody();
  const result = parseHookCloudProvisionSuccessBody(rest);
  assertEquals(result.kind, "unexpected_response");
});

Deno.test("parseHookCloudProvisionSuccessBody: callback_url insegura (http) => resposta inesperada", () => {
  const result = parseHookCloudProvisionSuccessBody(
    validSuccessBody({ callback_url: "http://ydunpoqdhijhnrarohiz.supabase.co/functions/v1/meta-cloud-webhook?hcs=abc" }),
  );
  assertEquals(result.kind, "unexpected_response");
});

Deno.test("parseHookCloudProvisionSuccessBody: corpo nulo/não-objeto => resposta inesperada, sem lançar exceção", () => {
  assertEquals(parseHookCloudProvisionSuccessBody(null).kind, "unexpected_response");
  assertEquals(parseHookCloudProvisionSuccessBody(undefined).kind, "unexpected_response");
  assertEquals(parseHookCloudProvisionSuccessBody("string qualquer").kind, "unexpected_response");
  assertEquals(parseHookCloudProvisionSuccessBody(42).kind, "unexpected_response");
});

// ── Classificação de erro — rede/timeout é AMBÍGUO, nunca "falhou" ────

Deno.test("classifyProvisionInvokeResult: erro sem status HTTP identificável => network_or_timeout (ambíguo, nunca falha definitiva)", () => {
  const result = classifyProvisionInvokeResult(null, { message: "Failed to fetch" });
  assertEquals(result.kind, "network_or_timeout");
});

Deno.test("classifyProvisionInvokeResult: erro HTTP com status conhecido é classificado com código", () => {
  const result = classifyProvisionInvokeResult({ error: "insufficient_role" }, { message: "x", context: { status: 403 } });
  assertEquals(result.kind, "http_error");
  if (result.kind === "http_error") {
    assertEquals(result.status, 403);
    assertEquals(result.code, "insufficient_role");
  }
});

Deno.test("classifyProvisionInvokeResult: sem erro, corpo válido => sucesso", () => {
  const result = classifyProvisionInvokeResult(validSuccessBody(), null);
  assertEquals(result.kind, "success");
});

Deno.test("classifyProvisionInvokeResult: erro HTTP sem corpo de erro reconhecível usa código genérico, nunca lança exceção", () => {
  const result = classifyProvisionInvokeResult(null, { message: "x", context: { status: 500 } });
  assertEquals(result.kind, "http_error");
  if (result.kind === "http_error") assertEquals(result.code, "unknown_error");
});

// ── Mensagens públicas — nunca texto interno do backend ──────────────

Deno.test("publicErrorMessageForCode: códigos conhecidos retornam mensagem curta e específica", () => {
  assertEquals(
    publicErrorMessageForCode(403, "insufficient_role"),
    "Apenas administradores podem provisionar conexões HookCloud.",
  );
  assertEquals(
    publicErrorMessageForCode(409, "phone_number_id_or_waba_conflict"),
    "Já existe uma conexão com este Phone Number ID ou WABA ID.",
  );
});

Deno.test("publicErrorMessageForCode: código desconhecido com status 5xx vira mensagem genérica de falha interna", () => {
  const msg = publicErrorMessageForCode(500, "algum-codigo-nunca-visto-antes");
  assertFalse(msg.includes("algum-codigo-nunca-visto-antes"));
});

Deno.test("publicErrorMessageForCode: nunca ecoa o código bruto na mensagem exibida", () => {
  for (const code of ["hookcloud_disabled", "malformed_json", "payload_too_large", "unknown_error"]) {
    const msg = publicErrorMessageForCode(400, code);
    assertFalse(msg.includes(code));
  }
});
