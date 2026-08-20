// deno test --no-check --allow-read --allow-env src/lib/whatsapp/connectionProviderView.test.ts
//
// Fase 18C: garante que uma conexão Meta/HookCloud nunca é classificada
// como 'uazapi' (o que liberaria ações de transporte UazAPI na UI), que
// UazAPI continua classificada exatamente como antes (nenhuma regressão
// visual/funcional), e que qualquer combinação desconhecida falha fechado.

import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  classifyConnectionForDisplay,
  isUazapiProvider,
  type ConnectionProviderFields,
  type MetaCloudConfigFields,
} from "./connectionProviderView.ts";

// ── isUazapiProvider ──────────────────────────────────────────────────

Deno.test("isUazapiProvider: provider 'uazapi' explícito é true", () => {
  assertEquals(isUazapiProvider({ provider: "uazapi" }), true);
});

Deno.test("isUazapiProvider: provider ausente/null/vazio é true — retrocompatibilidade das conexões reais existentes", () => {
  assertEquals(isUazapiProvider({}), true);
  assertEquals(isUazapiProvider({ provider: null }), true);
  assertEquals(isUazapiProvider({ provider: "" }), true);
});

Deno.test("isUazapiProvider: 'meta_cloud' é false", () => {
  assertEquals(isUazapiProvider({ provider: "meta_cloud" }), false);
});

Deno.test("isUazapiProvider: instância nula/indefinida é false, nunca lança exceção", () => {
  assertEquals(isUazapiProvider(null), false);
  assertEquals(isUazapiProvider(undefined), false);
});

// ── classifyConnectionForDisplay ──────────────────────────────────────

const HOOKCLOUD_PENDING_CONFIG: MetaCloudConfigFields = { onboarding_source: "hookcloud", onboarding_state: "pending" };

Deno.test("classifyConnectionForDisplay: provider 'uazapi' explícito é 'uazapi'", () => {
  assertEquals(classifyConnectionForDisplay({ provider: "uazapi" }, null), "uazapi");
});

Deno.test("classifyConnectionForDisplay: provider ausente (conexão real de produção, sem coluna preenchida) é 'uazapi' — nenhuma regressão", () => {
  const instance: ConnectionProviderFields = {};
  assertEquals(classifyConnectionForDisplay(instance, null), "uazapi");
});

Deno.test("classifyConnectionForDisplay: meta_cloud + hookcloud + pending é 'hookcloud_pending'", () => {
  assertEquals(classifyConnectionForDisplay({ provider: "meta_cloud" }, HOOKCLOUD_PENDING_CONFIG), "hookcloud_pending");
});

Deno.test("classifyConnectionForDisplay: meta_cloud NUNCA é classificado como 'uazapi', mesmo sem config satélite carregada", () => {
  const result = classifyConnectionForDisplay({ provider: "meta_cloud" }, null);
  assertEquals(result === "uazapi", false);
});

Deno.test("classifyConnectionForDisplay: meta_cloud com onboarding_state diferente de 'pending' é 'unsupported', nunca inventa um estado ativo", () => {
  assertEquals(
    classifyConnectionForDisplay({ provider: "meta_cloud" }, { onboarding_source: "hookcloud", onboarding_state: "active" }),
    "unsupported",
  );
  assertEquals(
    classifyConnectionForDisplay({ provider: "meta_cloud" }, { onboarding_source: "hookcloud", onboarding_state: "error" }),
    "unsupported",
  );
});

Deno.test("classifyConnectionForDisplay: meta_cloud com onboarding_source diferente de 'hookcloud' é 'unsupported'", () => {
  assertEquals(
    classifyConnectionForDisplay({ provider: "meta_cloud" }, { onboarding_source: "direct_meta", onboarding_state: "pending" }),
    "unsupported",
  );
});

Deno.test("classifyConnectionForDisplay: provider totalmente desconhecido é 'unsupported', falha fechada", () => {
  assertEquals(classifyConnectionForDisplay({ provider: "chromium" }, null), "unsupported");
  assertEquals(classifyConnectionForDisplay({ provider: "evolution" }, null), "unsupported");
});

Deno.test("classifyConnectionForDisplay: 'unsupported' e 'hookcloud_pending' nunca são 'uazapi' — nenhuma ação de transporte UazAPI deve ser oferecida", () => {
  const cases: Array<[ConnectionProviderFields, MetaCloudConfigFields | null]> = [
    [{ provider: "meta_cloud" }, HOOKCLOUD_PENDING_CONFIG],
    [{ provider: "meta_cloud" }, null],
    [{ provider: "outro" }, null],
  ];
  for (const [instance, config] of cases) {
    const kind = classifyConnectionForDisplay(instance, config);
    assertEquals(kind === "uazapi", false);
  }
});
