// deno test --no-check --allow-read --allow-env src/lib/hookcloud/hookcloudProvisioning.test.ts
// (--no-check necessário pelo mesmo motivo documentado em
// src/config/integrationsCatalog.test.ts — arquivo de frontend fora de
// supabase/functions, sem a lib "deno.ns" implícita nesse contexto.)
//
// Fase 18A: cobre a lógica pura do onboarding manual HookCloud: validação
// de campos como strings opacas, corpo da requisição sem organization/
// provider/onboarding_source, validação estrita da forma da resposta de
// sucesso (nunca finge sucesso), classificação de erro (rede/timeout
// tratado como AMBÍGUO, nunca "falhou"), mensagens públicas seguras.
//
// Fase 18B: adiciona cobertura dos 5 achados da revisão independente do
// PR #20 — callback URL presa ao origin exato do projeto (achado 4) e
// classificação de erro fiel ao comportamento REAL do SDK instalado,
// incluindo leitura única do corpo JSON de `FunctionsHttpError` (achado 5).
// Os achados 1-3 (token fora do React Query, limpeza em todo resultado,
// lifecycle do drawer) não têm lógica pura própria além do que já é
// coberto aqui (build do corpo da requisição, nunca reenvio automático) —
// são verificados por auditoria estrutural do componente, registrada no
// relatório da Fase 18B, já que não há infraestrutura de teste de
// componente React neste repositório.

import { assert, assertEquals, assertFalse } from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  buildHookCloudProvisionRequestBody,
  classifyProvisionInvokeResult,
  hasFieldErrors,
  hookCloudLifecycleBlockMessage,
  isPlausibleOpaqueId,
  isTrustedHookCloudCallbackUrl,
  parseHookCloudProvisionSuccessBody,
  publicErrorMessageForCode,
  validateHookCloudOnboardingForm,
  type HookCloudOnboardingFormValues,
} from "./hookcloudProvisioning.ts";

const EXPECTED_ORIGIN = "https://ydunpoqdhijhnrarohiz.supabase.co";
const VALID_CALLBACK = `${EXPECTED_ORIGIN}/functions/v1/meta-cloud-webhook?hcs=abc123`;

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

// ── Validação da URL de callback confiável — presa ao origin exato (Fase 18B, achado 4) ─

Deno.test("isTrustedHookCloudCallbackUrl: URL HTTPS real do projeto, com hcs, é aceita", () => {
  assert(isTrustedHookCloudCallbackUrl(VALID_CALLBACK, EXPECTED_ORIGIN));
});

Deno.test("isTrustedHookCloudCallbackUrl: HTTP é rejeitado mesmo com origin certo", () => {
  assertFalse(isTrustedHookCloudCallbackUrl(VALID_CALLBACK.replace("https://", "http://"), EXPECTED_ORIGIN));
});

Deno.test("isTrustedHookCloudCallbackUrl: caminho errado é rejeitado", () => {
  assertFalse(isTrustedHookCloudCallbackUrl(`${EXPECTED_ORIGIN}/functions/v1/outra-funcao?hcs=abc123`, EXPECTED_ORIGIN));
});

Deno.test("isTrustedHookCloudCallbackUrl: sem parâmetro hcs é rejeitado", () => {
  assertFalse(isTrustedHookCloudCallbackUrl(`${EXPECTED_ORIGIN}/functions/v1/meta-cloud-webhook`, EXPECTED_ORIGIN));
});

Deno.test("isTrustedHookCloudCallbackUrl: URL malformada é rejeitada sem lançar exceção", () => {
  assertFalse(isTrustedHookCloudCallbackUrl("nao-e-uma-url", EXPECTED_ORIGIN));
});

Deno.test("isTrustedHookCloudCallbackUrl: domínio completamente externo é rejeitado", () => {
  assertFalse(isTrustedHookCloudCallbackUrl("https://dominio-falso.example/functions/v1/meta-cloud-webhook?hcs=abc123", EXPECTED_ORIGIN));
});

Deno.test("isTrustedHookCloudCallbackUrl: subdomínio malicioso do projeto real é rejeitado (nunca aceito por sufixo)", () => {
  assertFalse(isTrustedHookCloudCallbackUrl("https://evil.ydunpoqdhijhnrarohiz.supabase.co/functions/v1/meta-cloud-webhook?hcs=abc123", EXPECTED_ORIGIN));
});

Deno.test("isTrustedHookCloudCallbackUrl: domínio com sufixo malicioso é rejeitado", () => {
  assertFalse(isTrustedHookCloudCallbackUrl("https://ydunpoqdhijhnrarohiz.supabase.co.evil.example/functions/v1/meta-cloud-webhook?hcs=abc123", EXPECTED_ORIGIN));
});

Deno.test("isTrustedHookCloudCallbackUrl: credenciais embutidas na URL (user:pass@) são rejeitadas mesmo com origin idêntico", () => {
  assertFalse(isTrustedHookCloudCallbackUrl("https://user:pass@ydunpoqdhijhnrarohiz.supabase.co/functions/v1/meta-cloud-webhook?hcs=abc123", EXPECTED_ORIGIN));
});

Deno.test("isTrustedHookCloudCallbackUrl: porta divergente é rejeitada", () => {
  assertFalse(isTrustedHookCloudCallbackUrl("https://ydunpoqdhijhnrarohiz.supabase.co:8443/functions/v1/meta-cloud-webhook?hcs=abc123", EXPECTED_ORIGIN));
});

Deno.test("isTrustedHookCloudCallbackUrl: parâmetro adicional além de hcs é rejeitado", () => {
  assertFalse(isTrustedHookCloudCallbackUrl(`${VALID_CALLBACK}&extra=1`, EXPECTED_ORIGIN));
});

Deno.test("isTrustedHookCloudCallbackUrl: dois parâmetros hcs são rejeitados", () => {
  assertFalse(isTrustedHookCloudCallbackUrl(`${VALID_CALLBACK}&hcs=outro`, EXPECTED_ORIGIN));
});

Deno.test("isTrustedHookCloudCallbackUrl: fragmento (#) é rejeitado", () => {
  assertFalse(isTrustedHookCloudCallbackUrl(`${VALID_CALLBACK}#fragmento`, EXPECTED_ORIGIN));
});

Deno.test("isTrustedHookCloudCallbackUrl: pathname com sufixo extra (não é match exato) é rejeitado", () => {
  assertFalse(isTrustedHookCloudCallbackUrl(`${EXPECTED_ORIGIN}/functions/v1/meta-cloud-webhook/extra?hcs=abc123`, EXPECTED_ORIGIN));
});

// ── Validação estrita da resposta de sucesso — nunca finge sucesso ────

function validSuccessBody(overrides: Record<string, unknown> = {}) {
  return {
    connection_id: "conn-123",
    onboarding_state: "pending",
    callback_url: VALID_CALLBACK,
    verify_token: "verify-token-sintetico",
    warnings: [],
    ...overrides,
  };
}

Deno.test("parseHookCloudProvisionSuccessBody: resposta válida é aceita", () => {
  const result = parseHookCloudProvisionSuccessBody(validSuccessBody(), EXPECTED_ORIGIN);
  assertEquals(result.kind, "success");
  if (result.kind === "success") {
    assertEquals(result.data.onboardingState, "pending");
  }
});

Deno.test("parseHookCloudProvisionSuccessBody: onboarding_state != 'pending' NUNCA é tratado como sucesso, mesmo com todo o resto válido", () => {
  const result = parseHookCloudProvisionSuccessBody(validSuccessBody({ onboarding_state: "active" }), EXPECTED_ORIGIN);
  assertEquals(result.kind, "not_pending");
});

Deno.test("parseHookCloudProvisionSuccessBody: connection_id ausente => resposta inesperada", () => {
  const { connection_id, ...rest } = validSuccessBody();
  const result = parseHookCloudProvisionSuccessBody(rest, EXPECTED_ORIGIN);
  assertEquals(result.kind, "unexpected_response");
});

Deno.test("parseHookCloudProvisionSuccessBody: verify_token ausente => resposta inesperada, nunca finge sucesso", () => {
  const { verify_token, ...rest } = validSuccessBody();
  const result = parseHookCloudProvisionSuccessBody(rest, EXPECTED_ORIGIN);
  assertEquals(result.kind, "unexpected_response");
});

Deno.test("parseHookCloudProvisionSuccessBody: callback_url insegura (http) => resposta inesperada", () => {
  const result = parseHookCloudProvisionSuccessBody(
    validSuccessBody({ callback_url: VALID_CALLBACK.replace("https://", "http://") }),
    EXPECTED_ORIGIN,
  );
  assertEquals(result.kind, "unexpected_response");
});

Deno.test("parseHookCloudProvisionSuccessBody: callback_url de domínio externo => resposta inesperada, mesmo com o resto válido", () => {
  const result = parseHookCloudProvisionSuccessBody(
    validSuccessBody({ callback_url: "https://dominio-falso.example/functions/v1/meta-cloud-webhook?hcs=abc123" }),
    EXPECTED_ORIGIN,
  );
  assertEquals(result.kind, "unexpected_response");
});

Deno.test("parseHookCloudProvisionSuccessBody: corpo nulo/não-objeto => resposta inesperada, sem lançar exceção", () => {
  assertEquals(parseHookCloudProvisionSuccessBody(null, EXPECTED_ORIGIN).kind, "unexpected_response");
  assertEquals(parseHookCloudProvisionSuccessBody(undefined, EXPECTED_ORIGIN).kind, "unexpected_response");
  assertEquals(parseHookCloudProvisionSuccessBody("string qualquer", EXPECTED_ORIGIN).kind, "unexpected_response");
  assertEquals(parseHookCloudProvisionSuccessBody(42, EXPECTED_ORIGIN).kind, "unexpected_response");
});

// ── Classificação de erro — fiel ao SDK real, rede/timeout é AMBÍGUO ──
//
// Fase 18B, achado 5: o comportamento real de `@supabase/supabase-js`
// (lido em `node_modules/@supabase/functions-js/src/FunctionsClient.ts`)
// é: `data` é sempre `null` quando há erro; o corpo JSON do erro só
// existe em `error.context` (o `Response` real) para `FunctionsHttpError`;
// `error.name` distingue as classes. Os testes abaixo simulam esse
// formato real sem precisar importar o SDK inteiro.

function fakeJsonResponse(status: number, body: unknown) {
  return { status, json: () => Promise.resolve(body) };
}

Deno.test("classifyProvisionInvokeResult: FunctionsFetchError (rede/DNS) => network_or_timeout, nunca falha definitiva", async () => {
  const result = await classifyProvisionInvokeResult(
    null,
    { name: "FunctionsFetchError", message: "Failed to fetch", context: new TypeError("Failed to fetch") },
    EXPECTED_ORIGIN,
  );
  assertEquals(result.kind, "network_or_timeout");
});

Deno.test("classifyProvisionInvokeResult: FunctionsRelayError (gateway não alcançou a função) => network_or_timeout, nunca interpretado como resposta da função", async () => {
  const result = await classifyProvisionInvokeResult(
    null,
    { name: "FunctionsRelayError", message: "Relay Error", context: fakeJsonResponse(503, { error: "algo_do_gateway" }) },
    EXPECTED_ORIGIN,
  );
  assertEquals(result.kind, "network_or_timeout");
});

Deno.test("classifyProvisionInvokeResult: AbortError de timeout => network_or_timeout, nunca falha definitiva", async () => {
  const result = await classifyProvisionInvokeResult(
    null,
    { name: "AbortError", message: "The operation was aborted" },
    EXPECTED_ORIGIN,
  );
  assertEquals(result.kind, "network_or_timeout");
});

Deno.test("classifyProvisionInvokeResult: FunctionsHttpError com corpo JSON reconhecível é classificado com o código real (lido de error.context, não de data)", async () => {
  const result = await classifyProvisionInvokeResult(
    null, // o SDK real sempre retorna data=null neste caminho — nunca lemos data aqui
    { name: "FunctionsHttpError", message: "non-2xx", context: fakeJsonResponse(403, { error: "insufficient_role" }) },
    EXPECTED_ORIGIN,
  );
  assertEquals(result.kind, "http_error");
  if (result.kind === "http_error") {
    assertEquals(result.status, 403);
    assertEquals(result.code, "insufficient_role");
  }
});

Deno.test("classifyProvisionInvokeResult: sem erro, corpo válido => sucesso", async () => {
  const result = await classifyProvisionInvokeResult(validSuccessBody(), null, EXPECTED_ORIGIN);
  assertEquals(result.kind, "success");
});

Deno.test("classifyProvisionInvokeResult: FunctionsHttpError cujo corpo não é JSON usa código genérico, nunca lança exceção", async () => {
  const result = await classifyProvisionInvokeResult(
    null,
    {
      name: "FunctionsHttpError",
      message: "non-2xx",
      context: { status: 500, json: () => Promise.reject(new Error("body não é JSON")) },
    },
    EXPECTED_ORIGIN,
  );
  assertEquals(result.kind, "http_error");
  if (result.kind === "http_error") assertEquals(result.code, "unknown_error");
});

Deno.test("classifyProvisionInvokeResult: FunctionsHttpError sem status identificável no context => network_or_timeout", async () => {
  const result = await classifyProvisionInvokeResult(
    null,
    { name: "FunctionsHttpError", message: "x", context: {} },
    EXPECTED_ORIGIN,
  );
  assertEquals(result.kind, "network_or_timeout");
});

Deno.test("classifyProvisionInvokeResult: erro sem name reconhecido (defensivo) => network_or_timeout, nunca tratado como sucesso ou falha definitiva", async () => {
  const result = await classifyProvisionInvokeResult(null, { message: "erro desconhecido" }, EXPECTED_ORIGIN);
  assertEquals(result.kind, "network_or_timeout");
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

// ── hookCloudLifecycleBlockMessage — Fase 18F, decisão única usada nos 3
// pontos de interceptação (fechar drawer, trocar de item, navegação interna) ──

Deno.test("hookCloudLifecycleBlockMessage: 'idle' nunca bloqueia", () => {
  assertEquals(hookCloudLifecycleBlockMessage("idle"), null);
});

Deno.test("hookCloudLifecycleBlockMessage: 'submitting' bloqueia com mensagem específica", () => {
  const msg = hookCloudLifecycleBlockMessage("submitting");
  assert(msg !== null);
  assert(msg!.length > 0);
});

Deno.test("hookCloudLifecycleBlockMessage: 'secret_unacknowledged' bloqueia com mensagem específica e diferente de 'submitting'", () => {
  const msg = hookCloudLifecycleBlockMessage("secret_unacknowledged");
  assert(msg !== null);
  assert(msg !== hookCloudLifecycleBlockMessage("submitting"));
});
