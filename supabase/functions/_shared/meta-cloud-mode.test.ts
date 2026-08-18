import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { evaluateModeGate, resolveCanaryConnectionIds, resolveMetaCloudApiMode } from "./meta-cloud-mode.ts";

function fakeEnv(vars: Record<string, string>) {
  return { get: (k: string) => vars[k] };
}

Deno.test("resolveMetaCloudApiMode: ausente -> off (default seguro)", () => {
  assertEquals(resolveMetaCloudApiMode(fakeEnv({})), "off");
});

Deno.test("resolveMetaCloudApiMode: valor desconhecido -> off, nunca active por engano", () => {
  assertEquals(resolveMetaCloudApiMode(fakeEnv({ META_CLOUD_API_MODE: "turbo" })), "off");
});

Deno.test("resolveMetaCloudApiMode: valores validos, case-insensitive", () => {
  assertEquals(resolveMetaCloudApiMode(fakeEnv({ META_CLOUD_API_MODE: "SHADOW" })), "shadow");
  assertEquals(resolveMetaCloudApiMode(fakeEnv({ META_CLOUD_API_MODE: "canary" })), "canary");
  assertEquals(resolveMetaCloudApiMode(fakeEnv({ META_CLOUD_API_MODE: "active" })), "active");
});

Deno.test("resolveCanaryConnectionIds: parse de lista separada por virgula, com espacos", () => {
  const ids = resolveCanaryConnectionIds(fakeEnv({ META_CLOUD_CANARY_CONNECTION_IDS: "a, b ,c" }));
  assertEquals(ids.has("a"), true);
  assertEquals(ids.has("b"), true);
  assertEquals(ids.has("c"), true);
  assertEquals(ids.has("d"), false);
});

Deno.test("resolveCanaryConnectionIds: ausente -> conjunto vazio", () => {
  const ids = resolveCanaryConnectionIds(fakeEnv({}));
  assertEquals(ids.size, 0);
});

Deno.test("evaluateModeGate: off nega sempre", () => {
  const r = evaluateModeGate("off", "conn-1", new Set());
  assertEquals(r.allowed, false);
  assertEquals(r.dryRun, false);
});

Deno.test("evaluateModeGate: shadow permite e marca dryRun", () => {
  const r = evaluateModeGate("shadow", "conn-1", new Set());
  assertEquals(r.allowed, true);
  assertEquals(r.dryRun, true);
});

Deno.test("evaluateModeGate: canary nega conexao fora da allowlist", () => {
  const r = evaluateModeGate("canary", "conn-x", new Set(["conn-1"]));
  assertEquals(r.allowed, false);
});

Deno.test("evaluateModeGate: canary permite conexao na allowlist, sem dryRun", () => {
  const r = evaluateModeGate("canary", "conn-1", new Set(["conn-1"]));
  assertEquals(r.allowed, true);
  assertEquals(r.dryRun, false);
});

Deno.test("evaluateModeGate: active permite qualquer conexao, sem dryRun", () => {
  const r = evaluateModeGate("active", "qualquer-conexao", new Set());
  assertEquals(r.allowed, true);
  assertEquals(r.dryRun, false);
});
