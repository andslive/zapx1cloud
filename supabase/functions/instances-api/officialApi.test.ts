// FASE 20D — testes da lógica pura de autorização/projeção do DTO de API
// Oficial, escritos do zero nesta fase. Cobre especificamente o núcleo do
// defeito de segurança corrigido: falha fechada por role, allowlist de
// colunas (nenhuma credencial pode sair), e simetria com a policy RLS real
// confirmada por consulta direta ao banco nesta fase.

import { assertEquals, assertNotEquals } from "https://deno.land/std@0.203.0/testing/asserts.ts";
import {
  isAuthorizedForOfficialApiOrgScoped,
  isAuthorizedForOfficialApiPlatformWide,
  isProfileActiveForAdminAccess,
  OFFICIAL_API_ALLOWED_COLUMNS,
  projectOfficialApiRow,
  projectOfficialApiRows,
  type OfficialApiDbRow,
} from "./officialApi.ts";

// ---------------------------------------------------------------------------
// Perfil desativado — falha fechada
// ---------------------------------------------------------------------------

Deno.test("perfil desativado (is_active: false) explicitamente falha fechado", () => {
  assertEquals(isProfileActiveForAdminAccess({ is_active: false }), false);
});

Deno.test("perfil ativo (is_active: true) autorizado", () => {
  assertEquals(isProfileActiveForAdminAccess({ is_active: true }), true);
});

Deno.test("is_active null (linha legada) tratado como ativo — mesma retrocompatibilidade de connection-authorization.ts", () => {
  assertEquals(isProfileActiveForAdminAccess({ is_active: null }), true);
});

Deno.test("is_active undefined (campo ausente) tratado como ativo", () => {
  assertEquals(isProfileActiveForAdminAccess({}), true);
});

Deno.test("perfil null/undefined (não deveria ocorrer após a checagem de user, mas por segurança) não lança e não autentica magicamente como ativo por acidente de tipo — profile ausente é tratado como ativo aqui porque a checagem de existência do profile é feita SEPARADAMENTE (linha seguinte do handler, `!profile?.organization_id`)", () => {
  // Nota: esta função só decide is_active — a ausência de profile inteiro
  // (sem organization_id) já é rejeitada por outra checagem no handler
  // (`if (!profile?.organization_id)`), então não é responsabilidade desta
  // função pura sozinha.
  assertEquals(isProfileActiveForAdminAccess(null), true);
  assertEquals(isProfileActiveForAdminAccess(undefined), true);
});

// ---------------------------------------------------------------------------
// Autorização — ação org-scoped (`officialApi`)
// ---------------------------------------------------------------------------

Deno.test("org-scoped: super_admin autorizado", () => {
  assertEquals(isAuthorizedForOfficialApiOrgScoped(new Set(["super_admin"])), true);
});

Deno.test("org-scoped: admin autorizado", () => {
  assertEquals(isAuthorizedForOfficialApiOrgScoped(new Set(["admin"])), true);
});

Deno.test("org-scoped: manager autorizado", () => {
  assertEquals(isAuthorizedForOfficialApiOrgScoped(new Set(["manager"])), true);
});

Deno.test("org-scoped: usuário sem nenhuma role falha fechado", () => {
  assertEquals(isAuthorizedForOfficialApiOrgScoped(new Set([])), false);
});

Deno.test("org-scoped: role desconhecida/inventada falha fechado", () => {
  assertEquals(isAuthorizedForOfficialApiOrgScoped(new Set(["member", "viewer", "editor"])), false);
});

Deno.test("org-scoped: role com capitalização diferente falha fechado (nunca case-insensitive por acidente)", () => {
  assertEquals(isAuthorizedForOfficialApiOrgScoped(new Set(["Admin", "SUPER_ADMIN"])), false);
});

// ---------------------------------------------------------------------------
// Autorização — ação platform-wide (`officialApiAll`) — só super_admin
// ---------------------------------------------------------------------------

Deno.test("platform-wide: super_admin autorizado", () => {
  assertEquals(isAuthorizedForOfficialApiPlatformWide(new Set(["super_admin"])), true);
});

Deno.test("platform-wide: admin comum NUNCA autorizado (mesmo sendo suficiente para a ação org-scoped)", () => {
  assertEquals(isAuthorizedForOfficialApiPlatformWide(new Set(["admin"])), false);
});

Deno.test("platform-wide: manager NUNCA autorizado", () => {
  assertEquals(isAuthorizedForOfficialApiPlatformWide(new Set(["manager"])), false);
});

Deno.test("platform-wide: admin+manager juntos (sem super_admin) ainda falha fechado", () => {
  assertEquals(isAuthorizedForOfficialApiPlatformWide(new Set(["admin", "manager"])), false);
});

// ---------------------------------------------------------------------------
// Allowlist / projeção do DTO — núcleo da Parte 3/10: nenhuma credencial
// pode sair, mesmo que a linha crua do banco contenha campos sensíveis.
// ---------------------------------------------------------------------------

const SENSITIVE_ROW_FIXTURE = {
  id: "11111111-1111-1111-1111-111111111111",
  evolution_instance_id: "22222222-2222-2222-2222-222222222222",
  organization_id: "33333333-3333-3333-3333-333333333333",
  meta_business_id: "biz-123",
  waba_id: "waba-456",
  phone_number_id: "phone-789",
  display_phone_number: "+55 11 91234-5678",
  graph_api_version: "v21.0",
  coexistence_enabled: true,
  onboarding_state: "active",
  // Colunas que NUNCA podem sair do backend — o teste abaixo prova
  // estruturalmente que `projectOfficialApiRow` não as repassa, mesmo que
  // o objeto de entrada as contenha (simulando um `select` futuro alterado
  // por engano para incluir mais colunas).
  access_token_secret_ref: "44444444-4444-4444-4444-444444444444",
  token_expires_at: "2099-01-01T00:00:00Z",
  quality_rating: "GREEN",
  messaging_limit_tier: "TIER_1K",
  last_health_check_at: "2026-08-25T00:00:00Z",
  last_error_code: "ERR_TOKEN_EXPIRED",
  last_error_message: "Token expirou em 2026-08-01 — detalhe interno que não deve vazar",
  history_sync_status: "pending",
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-08-25T00:00:00Z",
  onboarding_source: "hookcloud",
  hookcloud_webhook_secret_hash: "sha256:deadbeef...",
  hookcloud_webhook_secret_rotated_at: "2026-08-01T00:00:00Z",
  hookcloud_verify_token_hash: "sha256:cafebabe...",
  hookcloud_verify_token_rotated_at: "2026-08-01T00:00:00Z",
} satisfies Record<string, unknown>;

const FORBIDDEN_KEYS = [
  "id",
  "access_token_secret_ref",
  "token_expires_at",
  "hookcloud_webhook_secret_hash",
  "hookcloud_webhook_secret_rotated_at",
  "hookcloud_verify_token_hash",
  "hookcloud_verify_token_rotated_at",
  "meta_business_id",
  "waba_id",
  "display_phone_number",
  "graph_api_version",
  "coexistence_enabled",
  "quality_rating",
  "messaging_limit_tier",
  "last_health_check_at",
  "last_error_code",
  "last_error_message",
  "history_sync_status",
  "created_at",
  "updated_at",
];

Deno.test("DTO: allowlist declarada é exatamente a esperada (evita expansão silenciosa)", () => {
  assertEquals(
    [...OFFICIAL_API_ALLOWED_COLUMNS].sort(),
    ["evolution_instance_id", "organization_id", "onboarding_state", "onboarding_source", "phone_number_id"].sort(),
  );
});

Deno.test("DTO: varredura de chaves — nenhuma coluna sensível presente na projeção, mesmo vinda de uma linha crua completa", () => {
  const dto = projectOfficialApiRow(SENSITIVE_ROW_FIXTURE as unknown as OfficialApiDbRow);
  const keys = Object.keys(dto).sort();
  assertEquals(keys, ["evolution_instance_id", "onboarding_source", "onboarding_state", "organization_id", "phone_number_id"].sort());
  for (const forbidden of FORBIDDEN_KEYS) {
    assertEquals((dto as unknown as Record<string, unknown>)[forbidden], undefined, `campo proibido "${forbidden}" vazou no DTO`);
  }
});

Deno.test("DTO: valores dos campos permitidos são preservados corretamente", () => {
  const dto = projectOfficialApiRow(SENSITIVE_ROW_FIXTURE as unknown as OfficialApiDbRow);
  assertEquals(dto.evolution_instance_id, SENSITIVE_ROW_FIXTURE.evolution_instance_id);
  assertEquals(dto.organization_id, SENSITIVE_ROW_FIXTURE.organization_id);
  assertEquals(dto.onboarding_state, "active");
  assertEquals(dto.onboarding_source, "hookcloud");
  assertEquals(dto.phone_number_id, "phone-789");
});

Deno.test("DTO: campos nulos (null) preservados como null, nunca undefined silencioso viram outro valor", () => {
  const row = { ...SENSITIVE_ROW_FIXTURE, onboarding_source: null, phone_number_id: null } as unknown as OfficialApiDbRow;
  const dto = projectOfficialApiRow(row);
  assertEquals(dto.onboarding_source, null);
  assertEquals(dto.phone_number_id, null);
});

Deno.test("DTO: JSON serializado da lista completa nunca contém nenhuma substring sensível conhecida", () => {
  const rows = projectOfficialApiRows([SENSITIVE_ROW_FIXTURE as unknown as OfficialApiDbRow]);
  const serialized = JSON.stringify(rows);
  const forbiddenSubstrings = [
    "access_token_secret_ref",
    "44444444-4444-4444-4444-444444444444",
    "hookcloud_webhook_secret_hash",
    "deadbeef",
    "hookcloud_verify_token_hash",
    "cafebabe",
    "Token expirou",
    "+55 11 91234-5678",
  ];
  for (const s of forbiddenSubstrings) {
    assertEquals(serialized.includes(s), false, `DTO serializado contém dado sensível: "${s}"`);
  }
});

Deno.test("DTO: projeção de lista vazia devolve lista vazia (não undefined/null)", () => {
  assertEquals(projectOfficialApiRows([]), []);
});

Deno.test("DTO: duplicatas de evolution_instance_id não são deduplicadas silenciosamente pela projeção (responsabilidade do caller/UNIQUE constraint, não desta função pura)", () => {
  const dupe = { ...SENSITIVE_ROW_FIXTURE } as unknown as OfficialApiDbRow;
  const rows = projectOfficialApiRows([dupe, dupe]);
  assertEquals(rows.length, 2);
  assertNotEquals(rows[0], undefined);
});
