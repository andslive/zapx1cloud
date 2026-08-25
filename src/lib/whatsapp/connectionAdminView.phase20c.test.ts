// deno test --no-check --allow-read --allow-env src/lib/whatsapp/connectionAdminView.phase20c.test.ts
//
// Fase 20C: corrige a modelagem da tela Admin -> Conexões para TRÊS canais
// independentes (UazAPI, Sessão Web/Chromium, API Oficial/HookCloud-Meta).
// As Fases 20A/20B já garantiam que Chromium nunca determina o status de uma
// conexão UazAPI; faltava o terceiro eixo (API Oficial), que nem existia no
// view model, e a regra de "Status Geral" precisava ser generalizada para
// três canais opcionais em vez de dois. Estes testes cobrem exatamente a
// matriz de 11 linhas da Parte 7 do pedido, mais os cenários adicionais
// exigidos (unknown/QR/pending/tenant-aware/produção real/contadores).

import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  classifyOfficialApi,
  classifyOfficialApiSource,
  classifyWebSessionChannel,
  computeOverallStatus,
  classifyThreeChannelConnection,
  countThreeChannelConnections,
  type AdminConnectionRaw,
  type ChromiumAuxRaw,
  type OfficialApiRaw,
  type ThreeChannelRawInput,
} from "./connectionAdminView.ts";

// ── classifyOfficialApi ──────────────────────────────────────────────────

Deno.test("classifyOfficialApi: sem registro satélite -> Não configurada, nunca 'Não conectada'", () => {
  const r = classifyOfficialApi(null);
  assertEquals(r.status, "Não configurada");
  assertEquals(r.source, null);
});

Deno.test("classifyOfficialApi: onboarding_state 'active' -> Online", () => {
  const r = classifyOfficialApi({ onboarding_state: "active", onboarding_source: "hookcloud" });
  assertEquals(r.status, "Online");
  assertEquals(r.source, "hookcloud");
});

Deno.test("classifyOfficialApi: onboarding_state 'pending' -> Pendente", () => {
  const r = classifyOfficialApi({ onboarding_state: "pending", onboarding_source: "hookcloud" });
  assertEquals(r.status, "Pendente");
});

Deno.test("classifyOfficialApi: outros estados de onboarding em andamento também são Pendente", () => {
  for (const state of ["code_exchanged", "waba_linked", "webhook_subscribed"]) {
    assertEquals(classifyOfficialApi({ onboarding_state: state }).status, "Pendente", state);
  }
});

Deno.test("classifyOfficialApi: onboarding_state 'error' -> Erro", () => {
  assertEquals(classifyOfficialApi({ onboarding_state: "error" }).status, "Erro");
});

Deno.test("classifyOfficialApi: onboarding_state 'offboarded' -> Offline (nunca Online)", () => {
  assertEquals(classifyOfficialApi({ onboarding_state: "offboarded" }).status, "Offline");
});

Deno.test("classifyOfficialApi: onboarding_state desconhecido -> Offline, falha fechada (nunca Online)", () => {
  const r = classifyOfficialApi({ onboarding_state: "some_future_state_never_seen" } as OfficialApiRaw);
  assertEquals(r.status, "Offline");
});

Deno.test("classifyOfficialApiSource: distingue HookCloud de Meta direta", () => {
  assertEquals(classifyOfficialApiSource("hookcloud"), "hookcloud");
  assertEquals(classifyOfficialApiSource("direct_meta"), "direct_meta");
});

Deno.test("classifyOfficialApiSource: origem desconhecida (ex. legado 'evohub') falha fechada como 'unknown', nunca vira hookcloud/direct_meta por adivinhação", () => {
  assertEquals(classifyOfficialApiSource("evohub"), "unknown");
});

Deno.test("classifyOfficialApiSource: ausente -> null", () => {
  assertEquals(classifyOfficialApiSource(null), null);
  assertEquals(classifyOfficialApiSource(undefined), null);
});

// ── classifyWebSessionChannel ────────────────────────────────────────────

Deno.test("classifyWebSessionChannel: sem sessão -> Não configurada", () => {
  assertEquals(classifyWebSessionChannel(null).status, "Não configurada");
});

Deno.test("classifyWebSessionChannel: aguardando QR", () => {
  const cases: ChromiumAuxRaw[] = [
    { status: "qr_pending" },
    { chromium_status: "qr" },
    { chromiumStatus: "pairing" },
  ];
  for (const c of cases) {
    assertEquals(classifyWebSessionChannel(c).status, "Aguardando QR", JSON.stringify(c));
  }
});

Deno.test("classifyWebSessionChannel: online", () => {
  assertEquals(classifyWebSessionChannel({ connected: true }).status, "Online");
  assertEquals(classifyWebSessionChannel({ status: "authenticated" }).status, "Online");
});

Deno.test("classifyWebSessionChannel: sem status conhecido -> Sem resposta atual", () => {
  assertEquals(classifyWebSessionChannel({ status: "" }).status, "Sem resposta atual");
});

Deno.test("classifyWebSessionChannel: status textual desconhecido -> Offline", () => {
  assertEquals(classifyWebSessionChannel({ status: "disconnected" }).status, "Offline");
});

// ── computeOverallStatus: matriz completa da Parte 7 (11 linhas) ────────

Deno.test("matriz Status Geral: Online/Online/Não configurada -> Online (10 conexões operacionais reais)", () => {
  const r = computeOverallStatus("Online", "Online", "Não configurada");
  assertEquals(r.status, "Online");
});

Deno.test("matriz Status Geral: Online/Offline/Não configurada -> Parcial", () => {
  assertEquals(computeOverallStatus("Online", "Offline", "Não configurada").status, "Parcial");
});

Deno.test("matriz Status Geral: Offline/Online/Não configurada -> Parcial", () => {
  assertEquals(computeOverallStatus("Offline", "Online", "Não configurada").status, "Parcial");
});

Deno.test("matriz Status Geral: Offline/Offline/Não configurada -> Offline", () => {
  assertEquals(computeOverallStatus("Offline", "Offline", "Não configurada").status, "Offline");
});

Deno.test("matriz Status Geral: Online/Online/Online -> Online", () => {
  assertEquals(computeOverallStatus("Online", "Online", "Online").status, "Online");
});

Deno.test("matriz Status Geral: Online/Online/Pendente -> Online, com nota 'API Oficial pendente'", () => {
  const r = computeOverallStatus("Online", "Online", "Pendente");
  assertEquals(r.status, "Online");
  assertEquals(r.reason.includes("API Oficial pendente"), true, r.reason);
});

Deno.test("matriz Status Geral: Não configurada/Online/Online -> Online", () => {
  assertEquals(computeOverallStatus("Não configurada", "Online", "Online").status, "Online");
});

Deno.test("matriz Status Geral: Não configurada/Online/Não configurada -> Somente Sessão Web", () => {
  assertEquals(computeOverallStatus("Não configurada", "Online", "Não configurada").status, "Somente Sessão Web");
});

Deno.test("matriz Status Geral: Online/Não configurada/Não configurada -> Somente UazAPI", () => {
  assertEquals(computeOverallStatus("Online", "Não configurada", "Não configurada").status, "Somente UazAPI");
});

Deno.test("matriz Status Geral: Não configurada/Não configurada/Online -> Somente API Oficial", () => {
  assertEquals(computeOverallStatus("Não configurada", "Não configurada", "Online").status, "Somente API Oficial");
});

Deno.test("matriz Status Geral: Não configurada/Não configurada/Não configurada -> Sem canais configurados", () => {
  assertEquals(computeOverallStatus("Não configurada", "Não configurada", "Não configurada").status, "Sem canais configurados");
});

// ── cenários adicionais exigidos ─────────────────────────────────────────

Deno.test("UazAPI 'Offline — sem resposta atual' (heartbeat UNKNOWN) nunca conta como online no Status Geral", () => {
  const r = computeOverallStatus("Offline — sem resposta atual", "Não configurada", "Não configurada");
  assertEquals(r.status, "Offline");
});

Deno.test("Web Session 'Aguardando QR' não é tratada como online (não promove Status Geral a Online)", () => {
  const r = computeOverallStatus("Não configurada", "Aguardando QR", "Não configurada");
  assertEquals(r.status, "Offline");
});

Deno.test("API Oficial ausente NUNCA reduz o Status Geral mesmo quando UazAPI+WebSession estão ambos online", () => {
  const withOfficial = computeOverallStatus("Online", "Online", "Online");
  const withoutOfficial = computeOverallStatus("Online", "Online", "Não configurada");
  assertEquals(withOfficial.status, "Online");
  assertEquals(withoutOfficial.status, "Online");
});

Deno.test("provider nulo legado (sem provider persistido) é tratado como UazAPI dentro do compositor de 3 canais", () => {
  const raw: AdminConnectionRaw = { id: "c1", provider: null, last_real_whatsapp_state: "CONNECTED" };
  const input: ThreeChannelRawInput = {
    rowId: "row-1",
    uazapi: raw,
    webSession: null,
    officialApi: null,
  };
  const vm = classifyThreeChannelConnection(input);
  assertEquals(vm.uazapiStatus, "Online");
  assertEquals(vm.overallStatus, "Somente UazAPI");
});

Deno.test("provider desconhecido (nem uazapi nem meta_cloud) falha fechado — nunca 'Não configurada' (é distinto de ausência real)", () => {
  const raw: AdminConnectionRaw = { id: "c1", provider: "some_future_provider", last_real_whatsapp_state: "CONNECTED" };
  const input: ThreeChannelRawInput = { rowId: "row-2", uazapi: raw, webSession: null, officialApi: null };
  const vm = classifyThreeChannelConnection(input);
  assertEquals(vm.uazapiStatus, "Desconhecido");
  // connectionId ainda é reportado (para depuração/rastreio), mas nenhuma
  // capability de ação é liberada (ver teste de capabilities abaixo) — a
  // segurança nunca depende de `uazapiConnectionId` estar ou não presente.
  assertEquals(vm.uazapiConnectionId, "c1");
  assertEquals(vm.uazapi.supportsQr, false);
  assertEquals(vm.uazapi.supportsReconnect, false);
  assertEquals(vm.uazapi.supportsDelete, false);
});

Deno.test("linha com provider='meta_cloud' (standalone, sem UazAPI) -> UazAPI 'Não configurada', não 'Desconhecido'", () => {
  const raw: AdminConnectionRaw = { id: "c1", provider: "meta_cloud" };
  const metaCloud: OfficialApiRaw = { onboarding_state: "active", onboarding_source: "direct_meta" };
  const input: ThreeChannelRawInput = { rowId: "row-3", uazapi: raw, webSession: null, officialApi: metaCloud };
  const vm = classifyThreeChannelConnection(input);
  assertEquals(vm.uazapiStatus, "Não configurada");
  assertEquals(vm.officialApiStatus, "Online");
  assertEquals(vm.overallStatus, "Somente API Oficial");
});

Deno.test("associação tenant-aware: duas organizações com o mesmo offerLabel não se misturam — cada view model carrega organizationId próprio, nenhum campo é inferido de outra linha", () => {
  const orgA: ThreeChannelRawInput = {
    rowId: "org-a-row",
    organizationId: "org-a",
    offerLabel: "Receita Diabetes",
    uazapi: { id: "uaz-a", provider: "uazapi", last_real_whatsapp_state: "CONNECTED" },
    webSession: null,
    officialApi: null,
  };
  const orgB: ThreeChannelRawInput = {
    rowId: "org-b-row",
    organizationId: "org-b",
    offerLabel: "Receita Diabetes",
    uazapi: { id: "uaz-b", provider: "uazapi", last_real_whatsapp_state: "DISCONNECTED" },
    webSession: null,
    officialApi: null,
  };
  const vmA = classifyThreeChannelConnection(orgA);
  const vmB = classifyThreeChannelConnection(orgB);
  assertEquals(vmA.organizationId, "org-a");
  assertEquals(vmB.organizationId, "org-b");
  assertEquals(vmA.uazapiConnectionId, "uaz-a");
  assertEquals(vmB.uazapiConnectionId, "uaz-b");
  // Mesmo rótulo de oferta, organizações diferentes: status não colide.
  assertEquals(vmA.uazapiStatus, "Online");
  assertEquals(vmB.uazapiStatus, "Offline");
});

Deno.test("ausência de vínculo não usa 'primeiro registro disponível': linha sem uazapi e sem officialApi nunca herda dados de outra linha do array", () => {
  const rows: ThreeChannelRawInput[] = [
    { rowId: "r1", uazapi: { id: "u1", provider: "uazapi", last_real_whatsapp_state: "CONNECTED" }, webSession: null, officialApi: null },
    { rowId: "r2", uazapi: null, webSession: null, officialApi: null },
  ];
  const vms = rows.map(classifyThreeChannelConnection);
  assertEquals(vms[1].uazapiConnectionId, null);
  assertEquals(vms[1].uazapiStatus, "Não configurada");
  assertEquals(vms[1].overallStatus, "Sem canais configurados");
});

Deno.test("cenário real de produção: 9 CONNECTED + 6 DISCONNECTED + 1 UNKNOWN, todos com Sessão Web Online e API Oficial Não configurada -> nenhum falso Parcial nas online", () => {
  const online = Array.from({ length: 9 }, (_, i) => ({
    rowId: `on-${i}`,
    uazapi: { id: `on-${i}`, provider: "uazapi", last_real_whatsapp_state: "CONNECTED" } as AdminConnectionRaw,
    webSession: { connected: true } as ChromiumAuxRaw,
    officialApi: null,
  }));
  const offline = Array.from({ length: 6 }, (_, i) => ({
    rowId: `off-${i}`,
    uazapi: { id: `off-${i}`, provider: "uazapi", last_real_whatsapp_state: "DISCONNECTED" } as AdminConnectionRaw,
    webSession: { connected: true } as ChromiumAuxRaw,
    officialApi: null,
  }));
  const unknown = [{
    rowId: "unk-0",
    uazapi: { id: "unk-0", provider: "uazapi", last_real_whatsapp_state: "UNKNOWN" } as AdminConnectionRaw,
    webSession: { connected: true } as ChromiumAuxRaw,
    officialApi: null,
  }];
  const vms = [...online, ...offline, ...unknown].map(classifyThreeChannelConnection);
  const onlineOverall = vms.slice(0, 9);
  for (const vm of onlineOverall) {
    assertEquals(vm.overallStatus, "Online", vm.rowId); // UazAPI Online + Web Online + Oficial não-configurada nunca é "Parcial"
  }
  const counts = countThreeChannelConnections(vms);
  assertEquals(counts.total, 16);
  assertEquals(counts.uazapiOnline, 9);
  assertEquals(counts.officialApiOnline, 0);
});

Deno.test("contadores: API Oficial online sempre 0 hoje (nenhuma linha real) sem reduzir 'operational'", () => {
  const vms = Array.from({ length: 3 }, (_, i) =>
    classifyThreeChannelConnection({
      rowId: `r${i}`,
      uazapi: { id: `r${i}`, provider: "uazapi", last_real_whatsapp_state: "CONNECTED" },
      webSession: null,
      officialApi: null,
    }),
  );
  const counts = countThreeChannelConnections(vms);
  assertEquals(counts.officialApiOnline, 0);
  assertEquals(counts.operational, 3);
});

Deno.test("falha de cache/snapshot desatualizado (todos os campos ausentes) não vira 'tudo offline' silenciosamente — vira 'Sem canais configurados', estado distinto e visível", () => {
  const vm = classifyThreeChannelConnection({ rowId: "stale", uazapi: undefined, webSession: undefined, officialApi: undefined });
  assertEquals(vm.overallStatus, "Sem canais configurados");
  assertEquals(vm.uazapiStatus, "Não configurada");
  assertEquals(vm.webSessionStatus, "Não configurada");
  assertEquals(vm.officialApiStatus, "Não configurada");
});

Deno.test("offerLabel vazio vira 'Sem oferta', nunca rótulo de canal (ex.: nunca 'Somente Chromium')", () => {
  const vm = classifyThreeChannelConnection({ rowId: "r1", uazapi: null, webSession: { connected: true }, officialApi: null, offerLabel: "" });
  assertEquals(vm.offerLabel, "Sem oferta");
  assertEquals(vm.offerLabel.includes("Chromium"), false);
});

Deno.test("capabilities por canal nunca se misturam: officialApi nunca ganha supportsQr; ações de cada canal usam o id do próprio canal", () => {
  const vm = classifyThreeChannelConnection({
    rowId: "r1",
    uazapi: { id: "uaz-1", provider: "uazapi", last_real_whatsapp_state: "CONNECTED" },
    webSession: { connected: true },
    webSessionId: "web-1",
    officialApi: { onboarding_state: "active", onboarding_source: "hookcloud" },
    officialApiConnectionId: "official-1",
  });
  assertEquals(vm.officialApi.supportsQr, false);
  assertEquals(vm.uazapiConnectionId, "uaz-1");
  assertEquals(vm.webSessionId, "web-1");
  assertEquals(vm.officialApiConnectionId, "official-1");
});
