// deno test --allow-import uazapi-safe-log.test.ts
//
// Cobre o achado de segurança: GET /instance/status da UazAPI ecoa o token
// em texto puro no corpo da resposta; estes helpers garantem que nenhum
// log do heartbeat inclua esse (ou qualquer outro) secret.

import { assertEquals, assertMatch } from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  buildSafeStatusSummary,
  buildSafeProfileSyncSummary,
  buildSafeErrorSummary,
  sanitizeErrorMessage,
  maskPhone,
} from "./uazapi-safe-log.ts";

// Payload realista com token em vários pontos: raiz, instance.token,
// headers, request config, objeto aninhado — igual ao pedido no teste 1.
const REALISTIC_LEAKY_PAYLOAD = {
  token: "388fbbac-3fc2-4df7-984c-5ad19b53e6a1", // raiz
  apikey: "388fbbac-3fc2-4df7-984c-5ad19b53e6a1",
  headers: {
    token: "388fbbac-3fc2-4df7-984c-5ad19b53e6a1",
    Authorization: "Bearer 388fbbac-3fc2-4df7-984c-5ad19b53e6a1",
  },
  requestConfig: {
    headers: { admintoken: "AbC123Def456GhI789JkL012MnO345PqR678StU901VwX234Yz" },
  },
  instance: {
    id: "re30e50ef75f0b9",
    token: "388fbbac-3fc2-4df7-984c-5ad19b53e6a1", // instance.token
    status: "connected",
    name: "MEU CHIP P/ CLONE",
    owner: "558796509687",
    current_presence: "unavailable",
    pushName: "Ana",
    profilePicUrl: "https://pps.whatsapp.net/v/secret-path-token=abc123",
    nested: {
      deeper: {
        instance_token: "388fbbac-3fc2-4df7-984c-5ad19b53e6a1", // aninhado
      },
    },
  },
  status: { connected: true, jid: "558796509687:1@s.whatsapp.net", loggedIn: true, resetting: false },
};

const SECRET_STRINGS = [
  "388fbbac-3fc2-4df7-984c-5ad19b53e6a1",
  "AbC123Def456GhI789JkL012MnO345PqR678StU901VwX234Yz",
];

function assertNoSecrets(obj: unknown) {
  const json = JSON.stringify(obj);
  for (const secret of SECRET_STRINGS) {
    assertEquals(json.includes(secret), false, `vazou: ${secret.slice(0, 6)}...`);
  }
  // Verificações negativas por nome de campo (item 2 dos testes obrigatórios).
  for (const forbidden of ["token", "instance_token", "admintoken", "apikey", "Authorization", "authorization"]) {
    assertEquals(
      (json.match(new RegExp(`"${forbidden}"\\s*:`, "i")) || []).length,
      0,
      `chave proibida presente: ${forbidden}`,
    );
  }
}

// --- 1/2: payload realista com token em raiz/instance/headers/request config/aninhado ---

Deno.test("1/2: buildSafeStatusSummary nunca inclui nenhum token do payload realista (raiz, instance, headers, request config, aninhado)", () => {
  const summary = buildSafeStatusSummary(REALISTIC_LEAKY_PAYLOAD, {
    instanceId: "inst-1",
    instanceName: "MEU CHIP P/ CLONE",
    organizationId: "org-1",
    provider: "uazapi",
    operation: "health_check",
    httpStatus: 200,
  });
  assertNoSecrets(summary);
});

Deno.test("1/2: buildSafeProfileSyncSummary nunca inclui nenhum token do payload realista", () => {
  const summary = buildSafeProfileSyncSummary(REALISTIC_LEAKY_PAYLOAD, {
    instanceId: "inst-1",
    instanceName: "MEU CHIP P/ CLONE",
  });
  assertNoSecrets(summary);
});

Deno.test("1/2: buildSafeErrorSummary/sanitizeErrorMessage nunca incluem token embutido em mensagem de erro", () => {
  const err = new Error(
    "request failed: https://crmx1.uazapi.com/instance/status?token=388fbbac-3fc2-4df7-984c-5ad19b53e6a1 timeout",
  );
  const summary = buildSafeErrorSummary(err);
  assertNoSecrets(summary);
  assertEquals(summary.error_message.includes("388fbbac"), false);
});

Deno.test("sanitizeErrorMessage: redige token=... em query string", () => {
  const s = sanitizeErrorMessage("GET /x?token=388fbbac-3fc2-4df7-984c-5ad19b53e6a1&other=1 failed");
  assertEquals(s.includes("388fbbac"), false);
  assertMatch(s, /token=<redacted>/);
});

Deno.test("sanitizeErrorMessage: redige qualquer sequência alfanumérica longa (30+), mesmo sem nome de campo", () => {
  const s = sanitizeErrorMessage("unexpected value AbC123Def456GhI789JkL012MnO345PqR678StU901VwX234Yz in response");
  assertEquals(s.includes("AbC123Def456"), false);
});

// --- 3: campos operacionais preservados ---

Deno.test("3: buildSafeStatusSummary preserva connected/loggedIn/current_presence/status/instance_id", () => {
  const summary = buildSafeStatusSummary(REALISTIC_LEAKY_PAYLOAD, { instanceId: "inst-1", instanceName: "X" });
  assertEquals(summary.instance_id, "inst-1");
  assertEquals(summary.status, "connected");
  assertEquals(summary.connected, true);
  assertEquals(summary.loggedIn, true);
  assertEquals(summary.resetting, false);
  assertEquals(summary.current_presence, "unavailable");
});

Deno.test("3: buildSafeErrorSummary preserva categoria (error_name) do erro", () => {
  const summary = buildSafeErrorSummary(new TypeError("algo quebrou"));
  assertEquals(summary.error_name, "TypeError");
});

// --- owner mascarado, nunca completo ---

Deno.test("owner_masked nunca contém o telefone completo, só os últimos 4 dígitos", () => {
  const summary = buildSafeStatusSummary(REALISTIC_LEAKY_PAYLOAD, {});
  assertEquals(summary.owner_masked, "***9687");
  assertEquals(JSON.stringify(summary).includes("558796509687"), false);
});

Deno.test("maskPhone: valores nulos/curtos tratados com segurança", () => {
  assertEquals(maskPhone(null), null);
  assertEquals(maskPhone(undefined), null);
  assertEquals(maskPhone(""), null);
  assertEquals(maskPhone("12"), "***");
});

// --- resumo de profile sync não vaza telefone/nome bruto ---

Deno.test("buildSafeProfileSyncSummary: nunca inclui o valor bruto de push_name/avatar/telefone, só booleans + telefone mascarado", () => {
  const summary = buildSafeProfileSyncSummary(REALISTIC_LEAKY_PAYLOAD, {});
  assertEquals(summary.has_push_name, true);
  assertEquals(summary.has_avatar, true);
  assertEquals(summary.phone_masked, "***9687");
  const json = JSON.stringify(summary);
  assertEquals(json.includes("Ana"), false);
  assertEquals(json.includes("pps.whatsapp.net"), false);
  assertEquals(json.includes("558796509687"), false);
});

// --- objeto malformado / ausente ---

Deno.test("buildSafeStatusSummary: raw null/undefined/primitivo não lança, retorna campos undefined com segurança", () => {
  const s1 = buildSafeStatusSummary(null);
  const s2 = buildSafeStatusSummary(undefined);
  const s3 = buildSafeStatusSummary("string inesperada");
  assertEquals(s1.status, undefined);
  assertEquals(s2.status, undefined);
  assertEquals(s3.status, undefined);
});
