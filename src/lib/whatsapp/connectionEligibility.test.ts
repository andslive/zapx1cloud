// deno test --no-check --allow-read --allow-env src/lib/whatsapp/connectionEligibility.test.ts
//
// Fase 18D: garante que nenhuma conexão pendente/HookCloud/desconhecida
// vira uma opção "selecionável" em automações/funis/campanhas, que
// UazAPI mantém exatamente o mesmo critério de elegibilidade de sempre
// (status conectado/pareado), e que uma configuração já salva apontando
// para uma conexão inelegível é detectável pelo mesmo critério (usado
// pelos consumidores para decidir se pedem nova seleção humana).

import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  isManagementVisibleConnection,
  isMetaCloudOperationalConnection,
  isPendingHookCloudConnection,
  isSelectableMessagingConnection,
  isUazapiOperationalConnection,
  type EligibilityConnectionFields,
  type EligibilityMetaCloudFields,
} from "./connectionEligibility.ts";

const HOOKCLOUD_PENDING: EligibilityMetaCloudFields = {
  onboarding_source: "hookcloud",
  onboarding_state: "pending",
  phone_number_id: "123456",
};
const HOOKCLOUD_ACTIVE: EligibilityMetaCloudFields = {
  onboarding_source: "hookcloud",
  onboarding_state: "active",
  phone_number_id: "123456",
};

// ── isUazapiOperationalConnection — nenhuma mudança de comportamento ──

Deno.test("isUazapiOperationalConnection: uazapi conectado é elegível", () => {
  assertEquals(isUazapiOperationalConnection({ provider: "uazapi", status: "connected" }), true);
});

Deno.test("isUazapiOperationalConnection: uazapi pareado é elegível", () => {
  assertEquals(isUazapiOperationalConnection({ provider: "uazapi", status: "paired" }), true);
});

Deno.test("isUazapiOperationalConnection: uazapi desconectado/qr_pending NÃO é elegível — mesmo critério de sempre", () => {
  assertEquals(isUazapiOperationalConnection({ provider: "uazapi", status: "disconnected" }), false);
  assertEquals(isUazapiOperationalConnection({ provider: "uazapi", status: "qr_pending" }), false);
});

Deno.test("isUazapiOperationalConnection: provider ausente conectado continua elegível (retrocompatibilidade)", () => {
  assertEquals(isUazapiOperationalConnection({ status: "connected" }), true);
});

Deno.test("isUazapiOperationalConnection: meta_cloud nunca é elegível por este seletor, mesmo com status 'connected' fabricado", () => {
  assertEquals(isUazapiOperationalConnection({ provider: "meta_cloud", status: "connected" }), false);
});

// ── isPendingHookCloudConnection ───────────────────────────────────────

Deno.test("isPendingHookCloudConnection: meta_cloud + hookcloud + pending é true", () => {
  assertEquals(isPendingHookCloudConnection({ provider: "meta_cloud" }, HOOKCLOUD_PENDING), true);
});

Deno.test("isPendingHookCloudConnection: meta_cloud + hookcloud + active NÃO é 'pending'", () => {
  assertEquals(isPendingHookCloudConnection({ provider: "meta_cloud" }, HOOKCLOUD_ACTIVE), false);
});

// ── isMetaCloudOperationalConnection — estruturalmente false hoje ─────

Deno.test("isMetaCloudOperationalConnection: pending nunca é operacional, mesmo com flag habilitada", () => {
  assertEquals(
    isMetaCloudOperationalConnection({ provider: "meta_cloud" }, HOOKCLOUD_PENDING, { metaCloudEnabledForOrg: true }),
    false,
  );
});

Deno.test("isMetaCloudOperationalConnection: active + hookcloud + phone_number_id + flag ligada é elegível (estado futuro, hoje nunca produzido pelo backend)", () => {
  assertEquals(
    isMetaCloudOperationalConnection({ provider: "meta_cloud" }, HOOKCLOUD_ACTIVE, { metaCloudEnabledForOrg: true }),
    true,
  );
});

Deno.test("isMetaCloudOperationalConnection: active mas flag da organização desligada é falha fechada", () => {
  assertEquals(
    isMetaCloudOperationalConnection({ provider: "meta_cloud" }, HOOKCLOUD_ACTIVE, { metaCloudEnabledForOrg: false }),
    false,
  );
});

Deno.test("isMetaCloudOperationalConnection: active sem phone_number_id é falha fechada", () => {
  const { phone_number_id, ...rest } = HOOKCLOUD_ACTIVE;
  assertEquals(
    isMetaCloudOperationalConnection({ provider: "meta_cloud" }, rest, { metaCloudEnabledForOrg: true }),
    false,
  );
});

Deno.test("isMetaCloudOperationalConnection: onboarding_source diferente de hookcloud (ex.: direct_meta) é falha fechada — nenhum fluxo real o produz ainda", () => {
  assertEquals(
    isMetaCloudOperationalConnection(
      { provider: "meta_cloud" },
      { ...HOOKCLOUD_ACTIVE, onboarding_source: "direct_meta" },
      { metaCloudEnabledForOrg: true },
    ),
    false,
  );
});

Deno.test("isMetaCloudOperationalConnection: sem registro satélite (null) é falha fechada", () => {
  assertEquals(
    isMetaCloudOperationalConnection({ provider: "meta_cloud" }, null, { metaCloudEnabledForOrg: true }),
    false,
  );
});

// ── isSelectableMessagingConnection — a pergunta real dos seletores ───

Deno.test("isSelectableMessagingConnection: HookCloud pending NUNCA é selecionável", () => {
  assertEquals(
    isSelectableMessagingConnection({ provider: "meta_cloud" }, HOOKCLOUD_PENDING, { metaCloudEnabledForOrg: true }),
    false,
  );
});

Deno.test("isSelectableMessagingConnection: provider desconhecido nunca é selecionável", () => {
  assertEquals(
    isSelectableMessagingConnection({ provider: "chromium", status: "connected" }, null, { metaCloudEnabledForOrg: true }),
    false,
  );
});

Deno.test("isSelectableMessagingConnection: UazAPI conectada continua selecionável (nenhuma regressão)", () => {
  assertEquals(
    isSelectableMessagingConnection({ provider: "uazapi", status: "connected" }, null, { metaCloudEnabledForOrg: false }),
    true,
  );
});

// ── isManagementVisibleConnection — só para telas administrativas ────

Deno.test("isManagementVisibleConnection: HookCloud pending É visível em telas administrativas (painel de conexões continua mostrando pendentes)", () => {
  assertEquals(isManagementVisibleConnection({ provider: "meta_cloud" }), true);
});

Deno.test("isManagementVisibleConnection: provider desconhecido não é visível nem administrativamente — falha fechada", () => {
  assertEquals(isManagementVisibleConnection({ provider: "chromium" }), false);
});

Deno.test("isManagementVisibleConnection: nunca é o mesmo critério de isSelectableMessagingConnection para HookCloud pending (visível ≠ selecionável)", () => {
  const instance: EligibilityConnectionFields = { provider: "meta_cloud" };
  assertEquals(isManagementVisibleConnection(instance), true);
  assertEquals(isSelectableMessagingConnection(instance, HOOKCLOUD_PENDING, { metaCloudEnabledForOrg: true }), false);
});
