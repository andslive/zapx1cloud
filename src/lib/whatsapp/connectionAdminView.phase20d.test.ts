// deno test --no-check --allow-read --allow-env src/lib/whatsapp/connectionAdminView.phase20d.test.ts
//
// Fase 20D — revisão independente e correção segura da fonte de dados da
// coluna "API Oficial" no Draft PR #27. Núcleo do defeito corrigido: uma
// falha de CONSULTA (permission denied / rede / backend) ao buscar a API
// Oficial nunca pode virar silenciosamente "Não configurada" — precisa
// aparecer como "Dados indisponíveis", um estado distinto que NUNCA reduz
// o Status Geral nem contamina UazAPI/Sessão Web da mesma linha.

import { assertEquals, assertNotEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  classifyOfficialApiFromFetch,
  computeOverallStatus,
  classifyThreeChannelConnection,
  type OfficialApiFetchResult,
  type OfficialApiRaw,
  type ThreeChannelRawInput,
  type AdminConnectionRaw,
} from "./connectionAdminView.ts";

// ── classifyOfficialApiFromFetch — o teste que "força permission denied" ──

Deno.test("classifyOfficialApiFromFetch: fetch falhou (ok:false) -> 'Dados indisponíveis', NUNCA 'Não configurada'", () => {
  const failed: OfficialApiFetchResult = { ok: false };
  const r = classifyOfficialApiFromFetch(failed, null);
  assertEquals(r.status, "Dados indisponíveis");
  assertNotEquals(r.status, "Não configurada");
  assertEquals(r.source, null);
});

Deno.test("classifyOfficialApiFromFetch: fetchResult ausente (undefined) também é 'Dados indisponíveis', nunca silenciosamente 'Não configurada'", () => {
  const r = classifyOfficialApiFromFetch(undefined, null);
  assertEquals(r.status, "Dados indisponíveis");
});

Deno.test("classifyOfficialApiFromFetch: fetchResult null também é 'Dados indisponíveis'", () => {
  const r = classifyOfficialApiFromFetch(null, null);
  assertEquals(r.status, "Dados indisponíveis");
});

Deno.test("classifyOfficialApiFromFetch: fetch OK e zero linhas -> 'Não configurada' de verdade (sucesso, não falha)", () => {
  const ok: OfficialApiFetchResult = { ok: true, rows: [] };
  const r = classifyOfficialApiFromFetch(ok, null);
  assertEquals(r.status, "Não configurada");
});

Deno.test("classifyOfficialApiFromFetch: fetch OK e linha HookCloud pending -> 'Pendente'", () => {
  const ok: OfficialApiFetchResult = { ok: true, rows: [] };
  const row: OfficialApiRaw = { onboarding_state: "pending", onboarding_source: "hookcloud" };
  const r = classifyOfficialApiFromFetch(ok, row);
  assertEquals(r.status, "Pendente");
  assertEquals(r.source, "hookcloud");
});

Deno.test("classifyOfficialApiFromFetch: fetch OK e linha HookCloud active -> 'Online'", () => {
  const ok: OfficialApiFetchResult = { ok: true, rows: [] };
  const row: OfficialApiRaw = { onboarding_state: "active", onboarding_source: "hookcloud" };
  const r = classifyOfficialApiFromFetch(ok, row);
  assertEquals(r.status, "Online");
  assertEquals(r.source, "hookcloud");
});

Deno.test("classifyOfficialApiFromFetch: fetch OK e linha Meta direta active -> 'Online', source direct_meta", () => {
  const ok: OfficialApiFetchResult = { ok: true, rows: [] };
  const row: OfficialApiRaw = { onboarding_state: "active", onboarding_source: "direct_meta" };
  const r = classifyOfficialApiFromFetch(ok, row);
  assertEquals(r.status, "Online");
  assertEquals(r.source, "direct_meta");
});

Deno.test("classifyOfficialApiFromFetch: resposta malformada (linha sem onboarding_state) tratada sem crash -> 'Não configurada'", () => {
  const ok: OfficialApiFetchResult = { ok: true, rows: [] };
  const malformed = {} as OfficialApiRaw;
  const r = classifyOfficialApiFromFetch(ok, malformed);
  assertEquals(r.status, "Não configurada");
});

Deno.test("classifyOfficialApiFromFetch: onboarding_source desconhecido falha fechado (nunca 'Online' por adivinhação)", () => {
  const ok: OfficialApiFetchResult = { ok: true, rows: [] };
  const row: OfficialApiRaw = { onboarding_state: "active", onboarding_source: "evohub" };
  const r = classifyOfficialApiFromFetch(ok, row);
  // O estado ainda é 'active' -> Online (onboarding_source só afeta o
  // rótulo de origem, nunca o status), mas a origem cai em 'unknown',
  // nunca inventa 'hookcloud'/'direct_meta' por adivinhação.
  assertEquals(r.status, "Online");
  assertEquals(r.source, "unknown");
});

// ── Falha da API Oficial NUNCA contamina o Status Geral ────────────────────

Deno.test("computeOverallStatus: API Oficial 'Dados indisponíveis' + UazAPI Online + Sessão Web não configurada -> continua 'Somente UazAPI' (nunca degrada)", () => {
  const r = computeOverallStatus("Online", "Não configurada", "Dados indisponíveis");
  assertEquals(r.status, "Somente UazAPI");
});

Deno.test("computeOverallStatus: todos os 3 canais Online exceto API Oficial 'Dados indisponíveis' -> ainda 'Online' (indisponibilidade é neutra, não 'down')", () => {
  const r = computeOverallStatus("Online", "Online", "Dados indisponíveis");
  assertEquals(r.status, "Online");
});

Deno.test("computeOverallStatus: API Oficial 'Dados indisponíveis' sozinha (UazAPI e Sessão Web não configuradas) -> 'Sem canais configurados', nunca 'Offline'", () => {
  const r = computeOverallStatus("Não configurada", "Não configurada", "Dados indisponíveis");
  assertEquals(r.status, "Sem canais configurados");
});

// ── Isolamento entre canais no compositor de 3 canais ──────────────────────

const ONLINE_UAZ: AdminConnectionRaw = { id: "uaz-1", last_real_whatsapp_state: "CONNECTED", provider: "uazapi" };

Deno.test("classifyThreeChannelConnection: officialApiUnavailable=true -> officialApiStatus 'Dados indisponíveis', mas uazapiStatus PERMANECE 'Online' (falha não contamina UazAPI)", () => {
  const input: ThreeChannelRawInput = {
    rowId: "row-1",
    organizationId: "org-1",
    uazapi: ONLINE_UAZ,
    webSession: null,
    officialApi: { onboarding_state: "active", onboarding_source: "hookcloud" }, // ignorado por causa da flag abaixo
    officialApiUnavailable: true,
  };
  const vm = classifyThreeChannelConnection(input);
  assertEquals(vm.officialApiStatus, "Dados indisponíveis");
  assertEquals(vm.uazapiStatus, "Online");
  assertEquals(vm.overallStatus, "Somente UazAPI");
});

Deno.test("classifyThreeChannelConnection: officialApiUnavailable=true -> webSessionStatus PERMANECE 'Não configurada' (falha não contamina Sessão Web)", () => {
  const input: ThreeChannelRawInput = {
    rowId: "row-2",
    organizationId: "org-1",
    uazapi: ONLINE_UAZ,
    webSession: null,
    officialApi: null,
    officialApiUnavailable: true,
  };
  const vm = classifyThreeChannelConnection(input);
  assertEquals(vm.webSessionStatus, "Não configurada");
  assertEquals(vm.officialApiStatus, "Dados indisponíveis");
});

Deno.test("classifyThreeChannelConnection: officialApiUnavailable=true nunca habilita ações de API Oficial (reconectar/excluir às cegas)", () => {
  const input: ThreeChannelRawInput = {
    rowId: "row-3",
    organizationId: "org-1",
    uazapi: ONLINE_UAZ,
    webSession: null,
    officialApi: null,
    officialApiUnavailable: true,
  };
  const vm = classifyThreeChannelConnection(input);
  assertEquals(vm.officialApi.supportsReconnect, false);
  assertEquals(vm.officialApi.supportsDelete, false);
  assertEquals(vm.officialApi.supportsQr, false);
});

Deno.test("classifyThreeChannelConnection: officialApiUnavailable ausente/false preserva comportamento anterior (fetch OK, zero linhas -> 'Não configurada')", () => {
  const input: ThreeChannelRawInput = {
    rowId: "row-4",
    organizationId: "org-1",
    uazapi: ONLINE_UAZ,
    webSession: null,
    officialApi: null,
  };
  const vm = classifyThreeChannelConnection(input);
  assertEquals(vm.officialApiStatus, "Não configurada");
});

Deno.test("classifyThreeChannelConnection: officialApiUnavailable=true com UazAPI offline e Sessão Web offline -> overallStatus 'Offline' baseado só nos canais confirmados (nunca 'Parcial' por causa da indisponibilidade)", () => {
  const offlineUaz: AdminConnectionRaw = { id: "uaz-2", last_real_whatsapp_state: "DISCONNECTED", provider: "uazapi" };
  const input: ThreeChannelRawInput = {
    rowId: "row-5",
    organizationId: "org-1",
    uazapi: offlineUaz,
    webSession: { connected: false, status: "offline" },
    officialApi: null,
    officialApiUnavailable: true,
  };
  const vm = classifyThreeChannelConnection(input);
  assertEquals(vm.overallStatus, "Offline");
  assertEquals(vm.officialApiStatus, "Dados indisponíveis");
});
