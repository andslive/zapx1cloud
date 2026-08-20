// deno test --allow-import hookcloud-admin-http.test.ts
//
// Fase 16B — testes das primitivas de endurecimento HTTP compartilhadas
// pelos dois endpoints administrativos HookCloud.

import { assert, assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  buildCorsDecision,
  CREDENTIAL_RESPONSE_HEADERS,
  HOOKCLOUD_ADMIN_MAX_BODY_BYTES,
  isAcceptableJsonContentType,
  isSyntacticallyValidJson,
  NO_STORE_HEADERS,
  readJsonBodyWithLimit,
  resolveHookCloudAdminAllowedOrigins,
} from "./hookcloud-admin-http.ts";

function fakeEnv(value: string | undefined): { get(key: string): string | undefined } {
  return { get: (k) => (k === "HOOKCLOUD_ADMIN_ALLOWED_ORIGINS" ? value : undefined) };
}

// ── Allowlist de origens ──────────────────────────────────────────────

Deno.test("resolveHookCloudAdminAllowedOrigins: variável ausente => allowlist vazia", () => {
  const origins = resolveHookCloudAdminAllowedOrigins(fakeEnv(undefined));
  assertEquals(origins.size, 0);
});

Deno.test("resolveHookCloudAdminAllowedOrigins: lista separada por vírgula, espaços externos normalizados", () => {
  const origins = resolveHookCloudAdminAllowedOrigins(fakeEnv(" https://admin.x1zap.com , https://outra.exemplo.com "));
  assertEquals(origins.has("https://admin.x1zap.com"), true);
  assertEquals(origins.has("https://outra.exemplo.com"), true);
  assertEquals(origins.size, 2);
});

Deno.test("resolveHookCloudAdminAllowedOrigins: entrada literal '*' é descartada — nunca interpretada como wildcard", () => {
  const origins = resolveHookCloudAdminAllowedOrigins(fakeEnv("https://admin.x1zap.com,*"));
  assertEquals(origins.has("*"), false);
  assertEquals(origins.size, 1);
});

Deno.test("resolveHookCloudAdminAllowedOrigins: espaço interno na origem não é normalizado (a origem inteira precisa bater exatamente)", () => {
  const origins = resolveHookCloudAdminAllowedOrigins(fakeEnv("https://admin.x1zap.com"));
  assertEquals(origins.has("https://admin.x1zap.com "), false);
  assertEquals(origins.has(" https://admin.x1zap.com"), false);
});

// ── Decisão CORS ──────────────────────────────────────────────────────

Deno.test("buildCorsDecision: sem header Origin => allowed=true, sem cabeçalhos CORS (contexto servidor-servidor)", () => {
  const decision = buildCorsDecision(null, new Set(["https://admin.x1zap.com"]));
  assertEquals(decision.allowed, true);
  assertEquals(Object.keys(decision.headers).length, 0);
});

Deno.test("buildCorsDecision: origem exata permitida => allowed=true, Access-Control-Allow-Origin igual à origem recebida", () => {
  const decision = buildCorsDecision("https://admin.x1zap.com", new Set(["https://admin.x1zap.com"]));
  assertEquals(decision.allowed, true);
  assertEquals(decision.headers["Access-Control-Allow-Origin"], "https://admin.x1zap.com");
  assertEquals(decision.headers["Vary"], "Origin");
  assertEquals(decision.headers["Access-Control-Allow-Methods"], "POST, OPTIONS");
});

Deno.test("buildCorsDecision: origem semelhante/maliciosa (subdomínio, prefixo, sufixo) é rejeitada — só comparação exata", () => {
  const allowed = new Set(["https://admin.x1zap.com"]);
  for (
    const malicious of [
      "https://admin.x1zap.com.attacker.com",
      "https://attacker.com/https://admin.x1zap.com",
      "http://admin.x1zap.com", // esquema diferente
      "https://evil-admin.x1zap.com",
      "https://admin.x1zap.com:8443", // porta diferente
    ]
  ) {
    const decision = buildCorsDecision(malicious, allowed);
    assertEquals(decision.allowed, false, `origem maliciosa aceita indevidamente: ${malicious}`);
    assertEquals(Object.keys(decision.headers).length, 0);
  }
});

Deno.test("buildCorsDecision: wildcard '*' recebido como Origin real nunca é aceito, mesmo que a allowlist (por engano) contenha '*'", () => {
  // Construção direta do Set (bypassando resolveHookCloudAdminAllowedOrigins,
  // que já filtra "*") para provar que buildCorsDecision também não trata
  // "*" como coringa mesmo se ele chegasse até aqui por outra via.
  const decision = buildCorsDecision("https://qualquer-origem.example.com", new Set(["*"]));
  assertEquals(decision.allowed, false);
});

Deno.test("buildCorsDecision: nunca inclui Access-Control-Allow-Credentials (autenticação é só Bearer, nunca cookie)", () => {
  const decision = buildCorsDecision("https://admin.x1zap.com", new Set(["https://admin.x1zap.com"]));
  assertEquals("Access-Control-Allow-Credentials" in decision.headers, false);
});

// ── Content-Type ──────────────────────────────────────────────────────

Deno.test("isAcceptableJsonContentType: application/json puro é aceito", () => {
  assertEquals(isAcceptableJsonContentType("application/json"), true);
});

Deno.test("isAcceptableJsonContentType: application/json; charset=utf-8 é aceito", () => {
  assertEquals(isAcceptableJsonContentType("application/json; charset=utf-8"), true);
});

Deno.test("isAcceptableJsonContentType: ausente é rejeitado", () => {
  assertEquals(isAcceptableJsonContentType(null), false);
});

Deno.test("isAcceptableJsonContentType: tipo incorreto é rejeitado", () => {
  assertEquals(isAcceptableJsonContentType("text/plain"), false);
  assertEquals(isAcceptableJsonContentType("multipart/form-data"), false);
  assertEquals(isAcceptableJsonContentType("application/json-patch+json"), false);
});

// ── Leitura do corpo com limite real ─────────────────────────────────

function requestWithBufferedBody(text: string, withContentLength = true): Request {
  const body = new TextEncoder().encode(text);
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (withContentLength) headers["content-length"] = String(body.byteLength);
  return new Request("https://x/endpoint", { method: "POST", headers, body });
}

function requestWithStreamedBodyNoContentLength(chunks: string[]): Request {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(new TextEncoder().encode(chunk));
      controller.close();
    },
  });
  // @ts-ignore: Deno permite Request com body ReadableStream + duplex.
  return new Request("https://x/endpoint", { method: "POST", headers: { "content-type": "application/json" }, body: stream, duplex: "half" });
}

Deno.test("readJsonBodyWithLimit: corpo dentro do limite é lido corretamente", async () => {
  const req = requestWithBufferedBody('{"a":1}');
  const result = await readJsonBodyWithLimit(req, HOOKCLOUD_ADMIN_MAX_BODY_BYTES);
  assert(result.ok);
  if (result.ok) assertEquals(result.text, '{"a":1}');
});

Deno.test("readJsonBodyWithLimit: corpo vazio => reason='empty'", async () => {
  const req = requestWithBufferedBody("", false);
  const result = await readJsonBodyWithLimit(req, HOOKCLOUD_ADMIN_MAX_BODY_BYTES);
  assertEquals(result.ok, false);
  if (!result.ok) assertEquals(result.reason, "empty");
});

Deno.test("readJsonBodyWithLimit: corpo exatamente no limite é aceito", async () => {
  const exact = "a".repeat(HOOKCLOUD_ADMIN_MAX_BODY_BYTES);
  const req = requestWithBufferedBody(exact);
  const result = await readJsonBodyWithLimit(req, HOOKCLOUD_ADMIN_MAX_BODY_BYTES);
  assert(result.ok);
});

Deno.test("readJsonBodyWithLimit: corpo acima do limite COM Content-Length correto => reason='too_large'", async () => {
  const oversized = "a".repeat(HOOKCLOUD_ADMIN_MAX_BODY_BYTES + 1);
  const req = requestWithBufferedBody(oversized);
  const result = await readJsonBodyWithLimit(req, HOOKCLOUD_ADMIN_MAX_BODY_BYTES);
  assertEquals(result.ok, false);
  if (!result.ok) assertEquals(result.reason, "too_large");
});

Deno.test("readJsonBodyWithLimit: corpo acima do limite SEM Content-Length (stream chunked) => ainda assim reason='too_large' — nunca confia só no header", async () => {
  const bigChunks = Array.from({ length: 20 }, () => "x".repeat(1000)); // 20.000 bytes > 16 KiB
  const req = requestWithStreamedBodyNoContentLength(bigChunks);
  assertEquals(req.headers.get("content-length"), null, "pré-condição do teste: nenhum Content-Length presente");
  const result = await readJsonBodyWithLimit(req, HOOKCLOUD_ADMIN_MAX_BODY_BYTES);
  assertEquals(result.ok, false);
  if (!result.ok) assertEquals(result.reason, "too_large");
});

Deno.test("readJsonBodyWithLimit: Content-Length mentiroso (declara menos do que o corpo real) não engana o limite — a leitura do stream real prevalece", async () => {
  const realBody = "b".repeat(HOOKCLOUD_ADMIN_MAX_BODY_BYTES + 500);
  const req = new Request("https://x/endpoint", {
    method: "POST",
    headers: { "content-type": "application/json", "content-length": "10" }, // mentira deliberada
    body: new TextEncoder().encode(realBody),
  });
  const result = await readJsonBodyWithLimit(req, HOOKCLOUD_ADMIN_MAX_BODY_BYTES);
  assertEquals(result.ok, false);
  if (!result.ok) assertEquals(result.reason, "too_large");
});

// ── Validação sintática de JSON ───────────────────────────────────────

Deno.test("isSyntacticallyValidJson: JSON válido", () => {
  assertEquals(isSyntacticallyValidJson('{"a":1}'), true);
});

Deno.test("isSyntacticallyValidJson: JSON inválido", () => {
  assertEquals(isSyntacticallyValidJson("{ nao e json"), false);
});

// ── Cabeçalhos anti-cache ─────────────────────────────────────────────

Deno.test("NO_STORE_HEADERS contém exatamente Cache-Control: no-store", () => {
  assertEquals(NO_STORE_HEADERS["Cache-Control"], "no-store");
});

Deno.test("CREDENTIAL_RESPONSE_HEADERS contém Cache-Control, Pragma e Expires", () => {
  assertEquals(CREDENTIAL_RESPONSE_HEADERS["Cache-Control"], "no-store");
  assertEquals(CREDENTIAL_RESPONSE_HEADERS["Pragma"], "no-cache");
  assertEquals(CREDENTIAL_RESPONSE_HEADERS["Expires"], "0");
});
