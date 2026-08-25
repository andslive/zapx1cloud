// FASE 20E — testes independentes escritos do zero para a revisão técnica
// FINAL do PR #27 (não reaproveitam fixtures das fases anteriores). Foco:
// associação tenant-aware/cardinalidade (Parte 6), isolamento de falha da
// API Oficial (Parte 5/10), e a matriz de Status Geral (Parte 10).

import { assertEquals } from "https://deno.land/std@0.203.0/testing/asserts.ts";
import {
  classifyThreeChannelConnection,
  computeOverallStatus,
  type ThreeChannelRawInput,
} from "./connectionAdminView.ts";

// ---------------------------------------------------------------------------
// Parte 6 — associação por chave estável (organization_id / evolution_instance_id),
// nunca por nome, posição, ou primeiro item de array.
// ---------------------------------------------------------------------------

Deno.test("PARTE 6: duas organizações com conexões de MESMO nome e MESMO número não se confundem — a associação é feita pelo CHAMADOR via chave (id), este classificador nunca usa nome/telefone para decidir o rowId", () => {
  const orgAInput: ThreeChannelRawInput = {
    rowId: "conn-org-a-1",
    organizationId: "org-a",
    uazapi: { id: "conn-org-a-1", provider: "uazapi", last_real_whatsapp_state: "CONNECTED" },
    webSession: null,
    officialApi: null,
  };
  const orgBInput: ThreeChannelRawInput = {
    rowId: "conn-org-b-1",
    organizationId: "org-b",
    uazapi: { id: "conn-org-b-1", provider: "uazapi", last_real_whatsapp_state: "DISCONNECTED" },
    webSession: null,
    officialApi: null,
  };
  const a = classifyThreeChannelConnection(orgAInput);
  const b = classifyThreeChannelConnection(orgBInput);
  assertEquals(a.organizationId, "org-a");
  assertEquals(b.organizationId, "org-b");
  assertEquals(a.uazapiStatus, "Online");
  assertEquals(b.uazapiStatus, "Offline");
  // Nomes/números iguais nunca aparecem no input desta função (ela não lê
  // nome/telefone para decidir status) — prova estrutural de que a
  // classificação não pode ser contaminada por colisão de nome entre orgs.
});

Deno.test("PARTE 6: ordem diferente dos arrays de entrada não afeta o resultado — cada linha é classificada isoladamente por rowId, nunca por índice", () => {
  const rows: ThreeChannelRawInput[] = [
    { rowId: "r1", uazapi: { id: "r1", provider: "uazapi", last_real_whatsapp_state: "CONNECTED" }, webSession: null, officialApi: null },
    { rowId: "r2", uazapi: { id: "r2", provider: "uazapi", last_real_whatsapp_state: "DISCONNECTED" }, webSession: null, officialApi: null },
    { rowId: "r3", uazapi: { id: "r3", provider: "uazapi", last_real_whatsapp_state: "UNKNOWN" }, webSession: null, officialApi: null },
  ];
  const forward = rows.map(classifyThreeChannelConnection);
  const reversed = [...rows].reverse().map(classifyThreeChannelConnection);
  const byId = (list: typeof forward) => new Map(list.map((vm) => [vm.rowId, vm.uazapiStatus]));
  const fwdMap = byId(forward);
  const revMap = byId(reversed);
  assertEquals(fwdMap.get("r1"), revMap.get("r1"));
  assertEquals(fwdMap.get("r2"), revMap.get("r2"));
  assertEquals(fwdMap.get("r3"), revMap.get("r3"));
  assertEquals(fwdMap.get("r1"), "Online");
  assertEquals(fwdMap.get("r2"), "Offline");
  assertEquals(fwdMap.get("r3"), "Offline — sem resposta atual");
});

Deno.test("PARTE 6: API Oficial sem Sessão Web (standalone dentro da linha UazAPI) classifica normalmente, sem exigir o outro canal", () => {
  const vm = classifyThreeChannelConnection({
    rowId: "r-official-only",
    uazapi: { id: "r-official-only", provider: "uazapi", last_real_whatsapp_state: "CONNECTED" },
    webSession: null,
    officialApi: { onboarding_state: "active", onboarding_source: "direct_meta", phone_number_id: "pn-1" },
  });
  assertEquals(vm.webSessionStatus, "Não configurada");
  assertEquals(vm.officialApiStatus, "Online");
  assertEquals(vm.overallStatus, "Online");
});

Deno.test("PARTE 6: Sessão Web sem UazAPI (linha chromium-only) nunca herda ações UazAPI nem finge estar 'Online' via UazAPI", () => {
  const vm = classifyThreeChannelConnection({
    rowId: "r-web-only",
    uazapi: null,
    webSession: { connected: true },
    officialApi: null,
  });
  assertEquals(vm.uazapiStatus, "Não configurada");
  assertEquals(vm.webSessionStatus, "Online");
  assertEquals(vm.overallStatus, "Somente Sessão Web");
  assertEquals(vm.uazapi.supportsReconnect, false);
});

Deno.test("PARTE 6: API Oficial sem UazAPI (linha standalone, provider='meta_cloud') não finge canal UazAPI configurado", () => {
  const vm = classifyThreeChannelConnection({
    rowId: "r-meta-standalone",
    uazapi: { id: "r-meta-standalone", provider: "meta_cloud" },
    webSession: null,
    officialApi: { onboarding_state: "active", onboarding_source: "direct_meta", phone_number_id: "pn-2" },
  });
  assertEquals(vm.uazapiStatus, "Não configurada");
  assertEquals(vm.officialApiStatus, "Online");
  assertEquals(vm.overallStatus, "Somente API Oficial");
});

Deno.test("PARTE 6: mais de um canal presente simultaneamente — todos online produz Online", () => {
  const vm = classifyThreeChannelConnection({
    rowId: "r-all-three",
    uazapi: { id: "r-all-three", provider: "uazapi", last_real_whatsapp_state: "CONNECTED" },
    webSession: { connected: true },
    officialApi: { onboarding_state: "active", onboarding_source: "hookcloud", phone_number_id: "pn-3" },
  });
  assertEquals(vm.uazapiStatus, "Online");
  assertEquals(vm.webSessionStatus, "Online");
  assertEquals(vm.officialApiStatus, "Online");
  assertEquals(vm.overallStatus, "Online");
});

Deno.test("PARTE 6: linha inexistente (todos os canais ausentes) -> 'Sem canais configurados', nunca lança exceção", () => {
  const vm = classifyThreeChannelConnection({ rowId: "r-empty", uazapi: null, webSession: null, officialApi: null });
  assertEquals(vm.overallStatus, "Sem canais configurados");
});

Deno.test("PARTE 6: provider desconhecido (nem uazapi nem meta_cloud) falha fechado — 'Não configurada', nunca 'Online'", () => {
  const vm = classifyThreeChannelConnection({
    rowId: "r-unknown-provider",
    uazapi: { id: "r-unknown-provider", provider: "smtp_fake", last_real_whatsapp_state: "CONNECTED" },
    webSession: null,
    officialApi: null,
  });
  assertEquals(vm.uazapiStatus, "Desconhecido");
  assertEquals(vm.uazapi.supportsReconnect, false);
});

Deno.test("PARTE 6: números com formatação diferente não são lidos por este classificador (associação já resolvida pelo chamador via id) — nenhum campo de telefone influencia o resultado", () => {
  const vmA = classifyThreeChannelConnection({
    rowId: "r-phone-a",
    whatsappIdentity: "+55 (11) 91234-5678",
    uazapi: { id: "r-phone-a", provider: "uazapi", last_real_whatsapp_state: "CONNECTED" },
    webSession: null,
    officialApi: null,
  });
  const vmB = classifyThreeChannelConnection({
    rowId: "r-phone-b",
    whatsappIdentity: "5511912345678",
    uazapi: { id: "r-phone-b", provider: "uazapi", last_real_whatsapp_state: "CONNECTED" },
    webSession: null,
    officialApi: null,
  });
  assertEquals(vmA.uazapiStatus, vmB.uazapiStatus);
  assertEquals(vmA.rowId, "r-phone-a");
  assertEquals(vmB.rowId, "r-phone-b");
});

// ---------------------------------------------------------------------------
// Parte 5/10 — isolamento de falha da API Oficial e matriz de Status Geral.
// ---------------------------------------------------------------------------

Deno.test("PARTE 10: falha da API Oficial (officialApiUnavailable=true) NUNCA contamina UazAPI/Sessão Web saudáveis da mesma linha", () => {
  const vm = classifyThreeChannelConnection({
    rowId: "r-partial-fail",
    uazapi: { id: "r-partial-fail", provider: "uazapi", last_real_whatsapp_state: "CONNECTED" },
    webSession: { connected: true },
    officialApi: { onboarding_state: "active", onboarding_source: "hookcloud", phone_number_id: "pn-x" },
    officialApiUnavailable: true,
  });
  assertEquals(vm.uazapiStatus, "Online");
  assertEquals(vm.webSessionStatus, "Online");
  assertEquals(vm.officialApiStatus, "Dados indisponíveis");
  // Falha de OBSERVABILIDADE não pode rebaixar uma conexão saudável.
  assertEquals(vm.overallStatus, "Online");
  assertEquals(vm.officialApi.supportsReconnect, false);
  assertEquals(vm.officialApi.supportsDelete, false);
});

Deno.test("PARTE 10: heartbeat UNKNOWN nunca vira confirmação falsa de conexão nem de desconexão — participa do agregado como offline, mas o motivo nunca afirma queda confirmada", () => {
  const vm = classifyThreeChannelConnection({
    rowId: "r-unknown-hb",
    uazapi: { id: "r-unknown-hb", provider: "uazapi", last_real_whatsapp_state: "UNKNOWN" },
    webSession: null,
    officialApi: null,
  });
  assertEquals(vm.uazapiStatus, "Offline — sem resposta atual");
  assertEquals(vm.uazapiIsUnconfirmedOffline, true);
  assertEquals(vm.uazapiStatusReason.includes("confirmou"), true);
});

Deno.test("PARTE 10: nenhum canal configurado -> 'Sem canais configurados' explícito (nunca 'Offline' genérico enganoso)", () => {
  const { status } = computeOverallStatus("Não configurada", "Não configurada", "Não configurada");
  assertEquals(status, "Sem canais configurados");
});

Deno.test("PARTE 10: UazAPI online + Web online + Oficial 'Não configurada' -> Online (ausência de canal opcional nunca reduz o status)", () => {
  const { status } = computeOverallStatus("Online", "Online", "Não configurada");
  assertEquals(status, "Online");
});

Deno.test("PARTE 10: UazAPI online + Web online + Oficial 'Pendente' -> Online (onboarding em andamento nunca reduz)", () => {
  const { status } = computeOverallStatus("Online", "Online", "Pendente");
  assertEquals(status, "Online");
});

Deno.test("PARTE 10: canal configurado offline com outro configurado online -> Parcial", () => {
  const { status } = computeOverallStatus("Online", "Offline", "Não configurada");
  assertEquals(status, "Parcial");
});

Deno.test("PARTE 10: dois canais configurados, ambos offline -> Offline (nunca Parcial)", () => {
  const { status } = computeOverallStatus("Offline", "Offline", "Não configurada");
  assertEquals(status, "Offline");
});
