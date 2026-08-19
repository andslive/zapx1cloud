// deno test --allow-import meta-webhook-hookcloud-mode.test.ts
//
// Fase 11A — flag global HookCloud e allowlist de conexões de piloto.
// Default sempre 'off'; valor desconhecido nunca é tratado como ligado.

import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { resolveHookCloudPilotConnectionIds, resolveHookCloudWebhookMode } from "./meta-webhook-hookcloud-mode.ts";

function fakeEnv(values: Record<string, string>) {
  return { get: (k: string) => values[k] };
}

Deno.test("sem env var: modo default é 'off'", () => {
  assertEquals(resolveHookCloudWebhookMode(fakeEnv({})), "off");
});

Deno.test("HOOKCLOUD_WEBHOOK_MODE=pilot é aceito", () => {
  assertEquals(resolveHookCloudWebhookMode(fakeEnv({ HOOKCLOUD_WEBHOOK_MODE: "pilot" })), "pilot");
});

Deno.test("HOOKCLOUD_WEBHOOK_MODE=off explícito continua 'off'", () => {
  assertEquals(resolveHookCloudWebhookMode(fakeEnv({ HOOKCLOUD_WEBHOOK_MODE: "off" })), "off");
});

Deno.test("valor desconhecido nunca é tratado como ligado — cai em 'off' (falha fechada)", () => {
  assertEquals(resolveHookCloudWebhookMode(fakeEnv({ HOOKCLOUD_WEBHOOK_MODE: "active" })), "off");
  assertEquals(resolveHookCloudWebhookMode(fakeEnv({ HOOKCLOUD_WEBHOOK_MODE: "ON" })), "off");
  assertEquals(resolveHookCloudWebhookMode(fakeEnv({ HOOKCLOUD_WEBHOOK_MODE: "1" })), "off");
});

Deno.test("case-insensitive e com espaços: ' Pilot ' é aceito como 'pilot'", () => {
  assertEquals(resolveHookCloudWebhookMode(fakeEnv({ HOOKCLOUD_WEBHOOK_MODE: " Pilot " })), "pilot");
});

Deno.test("sem env var: allowlist de piloto vazia", () => {
  const ids = resolveHookCloudPilotConnectionIds(fakeEnv({}));
  assertEquals(ids.size, 0);
});

Deno.test("allowlist de piloto: parseia lista separada por vírgula, remove espaços e entradas vazias", () => {
  const ids = resolveHookCloudPilotConnectionIds(
    fakeEnv({ HOOKCLOUD_WEBHOOK_PILOT_CONNECTION_IDS: " conn-1, conn-2 ,,conn-3" }),
  );
  assertEquals([...ids].sort(), ["conn-1", "conn-2", "conn-3"]);
});

Deno.test("allowlist de piloto e canary de saída são independentes (env vars distintas)", () => {
  const ids = resolveHookCloudPilotConnectionIds(
    fakeEnv({ META_CLOUD_CANARY_CONNECTION_IDS: "conn-outra" }),
  );
  assertEquals(ids.size, 0, "HOOKCLOUD_WEBHOOK_PILOT_CONNECTION_IDS não deve ler a env var de canary de saída");
});
