// deno test --no-check --allow-read --allow-env src/lib/hookcloud/hookcloudRotation.test.ts
//
// Fase 18G: cobre a lógica pura da UI de rotação de credenciais
// HookCloud (Alternativa B — recuperação segura, já que o bloqueio de
// navegação SPA para `navigate()` programático não é alcançável sem
// mudança estrutural do roteador). Mesmo rigor de
// `hookcloudProvisioning.test.ts`: nunca envia organizationId, nunca
// finge sucesso, erro de rede é sempre ambíguo, nunca ecoa código bruto.

import { assert, assertEquals, assertFalse } from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  buildRotateHookCloudRequestBody,
  classifyRotateInvokeResult,
  parseRotateHookCloudSuccessBody,
  publicRotateErrorMessageForCode,
} from "./hookcloudRotation.ts";

const EXPECTED_ORIGIN = "https://ydunpoqdhijhnrarohiz.supabase.co";
const VALID_CALLBACK = `${EXPECTED_ORIGIN}/functions/v1/meta-cloud-webhook?hcs=novo-secret-123`;

// ── buildRotateHookCloudRequestBody ────────────────────────────────────

Deno.test("buildRotateHookCloudRequestBody: nunca inclui organizationId/organization_id", () => {
  const body = buildRotateHookCloudRequestBody({ connectionId: "conn-1", rotateCallbackSecret: true, rotateVerifyToken: false });
  assertFalse("organizationId" in body);
  assertFalse("organization_id" in body);
});

Deno.test("buildRotateHookCloudRequestBody: contém exatamente os 3 campos esperados pelo contrato real do backend", () => {
  const body = buildRotateHookCloudRequestBody({ connectionId: "conn-1", rotateCallbackSecret: true, rotateVerifyToken: true });
  assertEquals(Object.keys(body).sort(), ["connectionId", "rotateCallbackSecret", "rotateVerifyToken"]);
});

Deno.test("buildRotateHookCloudRequestBody: aplica trim no connectionId", () => {
  const body = buildRotateHookCloudRequestBody({ connectionId: "  conn-1  ", rotateCallbackSecret: false, rotateVerifyToken: true });
  assertEquals(body.connectionId, "conn-1");
});

// ── parseRotateHookCloudSuccessBody ────────────────────────────────────

function validRotateBody(overrides: Record<string, unknown> = {}) {
  return {
    connection_id: "conn-1",
    onboarding_state: "pending",
    callback_url: VALID_CALLBACK,
    verify_token: "verify-token-novo",
    warnings: [],
    ...overrides,
  };
}

Deno.test("parseRotateHookCloudSuccessBody: só callback pedido, resposta válida, é aceita", () => {
  const result = parseRotateHookCloudSuccessBody(validRotateBody(), EXPECTED_ORIGIN, { rotateCallbackSecret: true, rotateVerifyToken: false });
  assertEquals(result.kind, "success");
  if (result.kind === "success") {
    assertEquals(result.data.callbackUrl, VALID_CALLBACK);
    assertEquals(result.data.verifyToken, null); // não foi pedido, nunca reaproveita
  }
});

Deno.test("parseRotateHookCloudSuccessBody: só verify token pedido, resposta válida, é aceita", () => {
  const result = parseRotateHookCloudSuccessBody(validRotateBody(), EXPECTED_ORIGIN, { rotateCallbackSecret: false, rotateVerifyToken: true });
  assertEquals(result.kind, "success");
  if (result.kind === "success") {
    assertEquals(result.data.callbackUrl, null);
    assertEquals(result.data.verifyToken, "verify-token-novo");
  }
});

Deno.test("parseRotateHookCloudSuccessBody: ambos pedidos, resposta com só um dos dois, é inesperada", () => {
  const { verify_token, ...rest } = validRotateBody();
  const result = parseRotateHookCloudSuccessBody(rest, EXPECTED_ORIGIN, { rotateCallbackSecret: true, rotateVerifyToken: true });
  assertEquals(result.kind, "unexpected_response");
});

Deno.test("parseRotateHookCloudSuccessBody: onboarding_state != 'pending' NUNCA é sucesso, mesmo com segredos válidos", () => {
  const result = parseRotateHookCloudSuccessBody(
    validRotateBody({ onboarding_state: "active" }),
    EXPECTED_ORIGIN,
    { rotateCallbackSecret: true, rotateVerifyToken: true },
  );
  assertEquals(result.kind, "not_pending");
});

Deno.test("parseRotateHookCloudSuccessBody: callback_url de domínio externo é rejeitada mesmo com o resto válido", () => {
  const result = parseRotateHookCloudSuccessBody(
    validRotateBody({ callback_url: "https://dominio-falso.example/functions/v1/meta-cloud-webhook?hcs=x" }),
    EXPECTED_ORIGIN,
    { rotateCallbackSecret: true, rotateVerifyToken: false },
  );
  assertEquals(result.kind, "unexpected_response");
});

Deno.test("parseRotateHookCloudSuccessBody: connection_id ausente é inesperada", () => {
  const { connection_id, ...rest } = validRotateBody();
  const result = parseRotateHookCloudSuccessBody(rest, EXPECTED_ORIGIN, { rotateCallbackSecret: true, rotateVerifyToken: true });
  assertEquals(result.kind, "unexpected_response");
});

Deno.test("parseRotateHookCloudSuccessBody: corpo nulo/não-objeto é inesperada, sem lançar exceção", () => {
  assertEquals(parseRotateHookCloudSuccessBody(null, EXPECTED_ORIGIN, { rotateCallbackSecret: true, rotateVerifyToken: true }).kind, "unexpected_response");
  assertEquals(parseRotateHookCloudSuccessBody(undefined, EXPECTED_ORIGIN, { rotateCallbackSecret: true, rotateVerifyToken: true }).kind, "unexpected_response");
});

// ── classifyRotateInvokeResult — mesma fidelidade ao SDK real ─────────

function fakeJsonResponse(status: number, body: unknown) {
  return { status, json: () => Promise.resolve(body) };
}

Deno.test("classifyRotateInvokeResult: sem erro, corpo válido, é sucesso", async () => {
  const result = await classifyRotateInvokeResult(validRotateBody(), null, EXPECTED_ORIGIN, { rotateCallbackSecret: true, rotateVerifyToken: true });
  assertEquals(result.kind, "success");
});

Deno.test("classifyRotateInvokeResult: FunctionsFetchError (rede) é sempre ambíguo, nunca falha definitiva", async () => {
  const result = await classifyRotateInvokeResult(
    null,
    { name: "FunctionsFetchError", message: "Failed to fetch" },
    EXPECTED_ORIGIN,
    { rotateCallbackSecret: true, rotateVerifyToken: false },
  );
  assertEquals(result.kind, "network_or_timeout");
});

Deno.test("classifyRotateInvokeResult: AbortError de timeout é ambíguo", async () => {
  const result = await classifyRotateInvokeResult(
    null,
    { name: "AbortError", message: "aborted" },
    EXPECTED_ORIGIN,
    { rotateCallbackSecret: true, rotateVerifyToken: false },
  );
  assertEquals(result.kind, "network_or_timeout");
});

Deno.test("classifyRotateInvokeResult: FunctionsHttpError com código real é classificado corretamente", async () => {
  const result = await classifyRotateInvokeResult(
    null,
    { name: "FunctionsHttpError", message: "non-2xx", context: fakeJsonResponse(403, { error: "insufficient_role" }) },
    EXPECTED_ORIGIN,
    { rotateCallbackSecret: true, rotateVerifyToken: false },
  );
  assertEquals(result.kind, "http_error");
  if (result.kind === "http_error") {
    assertEquals(result.status, 403);
    assertEquals(result.code, "insufficient_role");
  }
});

Deno.test("classifyRotateInvokeResult: nunca lança exceção com corpo de erro não-JSON", async () => {
  const result = await classifyRotateInvokeResult(
    null,
    { name: "FunctionsHttpError", message: "x", context: { status: 500, json: () => Promise.reject(new Error("não é JSON")) } },
    EXPECTED_ORIGIN,
    { rotateCallbackSecret: true, rotateVerifyToken: false },
  );
  assertEquals(result.kind, "http_error");
  if (result.kind === "http_error") assertEquals(result.code, "unknown_error");
});

// ── publicRotateErrorMessageForCode — nunca texto interno ─────────────

Deno.test("publicRotateErrorMessageForCode: códigos conhecidos retornam mensagem curta e específica", () => {
  assertEquals(
    publicRotateErrorMessageForCode(403, "insufficient_role"),
    "Apenas administradores podem rotacionar credenciais HookCloud.",
  );
  assertEquals(publicRotateErrorMessageForCode(400, "nothing_to_rotate"), "Selecione pelo menos um valor para rotacionar.");
  assertEquals(publicRotateErrorMessageForCode(404, "connection_not_found"), "Conexão não encontrada.");
});

Deno.test("publicRotateErrorMessageForCode: nunca ecoa o código bruto na mensagem exibida", () => {
  for (const code of ["rotation_failed", "malformed_json", "server_misconfigured", "unknown_error"]) {
    const msg = publicRotateErrorMessageForCode(500, code);
    assertFalse(msg.includes(code));
  }
});

Deno.test("publicRotateErrorMessageForCode: código desconhecido com status 5xx vira mensagem genérica de falha interna", () => {
  const msg = publicRotateErrorMessageForCode(500, "nunca-visto-antes");
  assertFalse(msg.includes("nunca-visto-antes"));
  assert(msg.length > 0);
});
