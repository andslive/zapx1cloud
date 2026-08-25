// deno test --no-check --allow-read --allow-env src/lib/whatsapp/connectionAdminView.test.ts
//
// Fase 20A: corrige a tela Admin -> Conexões, que hoje calcula "Status
// Geral" com um XOR entre UazAPI e Chromium (uma UazAPI saudável sem
// Chromium virava "Parcial") e conta "Ativas" como o total de linhas
// cadastradas, não as realmente online. Estes testes provam a nova regra:
// Chromium nunca determina o status de uma conexão UazAPI, contadores e
// tabela vêm sempre do mesmo array de view models, e provider
// desconhecido/ausente-mas-diferente de uazapi falha fechado.

import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  classifyAdminConnection,
  classifyChromiumAuxStatus,
  countAdminConnections,
  type AdminConnectionRaw,
  type ChromiumAuxRaw,
} from "./connectionAdminView.ts";

// ── classifyChromiumAuxStatus ────────────────────────────────────────────

Deno.test("classifyChromiumAuxStatus: null/undefined é 'unknown'", () => {
  assertEquals(classifyChromiumAuxStatus(null), "unknown");
  assertEquals(classifyChromiumAuxStatus(undefined), "unknown");
});

Deno.test("classifyChromiumAuxStatus: connected:true é 'online'", () => {
  assertEquals(classifyChromiumAuxStatus({ connected: true }), "online");
});

Deno.test("classifyChromiumAuxStatus: status textual online/authenticated/ready é 'online'", () => {
  assertEquals(classifyChromiumAuxStatus({ status: "online" }), "online");
  assertEquals(classifyChromiumAuxStatus({ chromium_status: "authenticated" }), "online");
  assertEquals(classifyChromiumAuxStatus({ chromiumStatus: "ready" }), "online");
});

Deno.test("classifyChromiumAuxStatus: qr_pending/qr/pairing é 'connecting'", () => {
  assertEquals(classifyChromiumAuxStatus({ status: "qr_pending" }), "connecting");
  assertEquals(classifyChromiumAuxStatus({ status: "qr" }), "connecting");
  assertEquals(classifyChromiumAuxStatus({ status: "pairing" }), "connecting");
});

Deno.test("classifyChromiumAuxStatus: qualquer outro texto é 'offline'", () => {
  assertEquals(classifyChromiumAuxStatus({ status: "disconnected" }), "offline");
});

// ── classifyAdminConnection: núcleo do bug corrigido ─────────────────────

const ONLINE_UAZAPI: AdminConnectionRaw = { id: "conn-1", provider: "uazapi", last_real_whatsapp_state: "CONNECTED" };
const OFFLINE_CHROMIUM: ChromiumAuxRaw = { status: "offline" };
const ONLINE_CHROMIUM: ChromiumAuxRaw = { status: "online" };

Deno.test("UazAPI online SEM Chromium nunca é 'Parcial' — é 'Online' (bug original: XOR virava Parcial)", () => {
  const vm = classifyAdminConnection(ONLINE_UAZAPI, null);
  assertEquals(vm.displayStatus, "Online");
  assertEquals(vm.technicalStatus, "online");
});

Deno.test("UazAPI online COM Chromium offline continua 'Online' — Chromium nunca rebaixa o status geral", () => {
  const vm = classifyAdminConnection(ONLINE_UAZAPI, OFFLINE_CHROMIUM);
  assertEquals(vm.displayStatus, "Online");
});

Deno.test("UazAPI online COM Chromium online continua 'Online' (não é um terceiro estado combinado)", () => {
  const vm = classifyAdminConnection(ONLINE_UAZAPI, ONLINE_CHROMIUM);
  assertEquals(vm.displayStatus, "Online");
});

Deno.test("UazAPI offline é 'Offline', com ou sem Chromium online — Chromium nunca promove UazAPI a Online/Parcial", () => {
  const offlineUaz: AdminConnectionRaw = { id: "conn-2", provider: "uazapi", last_real_whatsapp_state: "CLOSED" };
  assertEquals(classifyAdminConnection(offlineUaz, null).displayStatus, "Offline");
  assertEquals(classifyAdminConnection(offlineUaz, ONLINE_CHROMIUM).displayStatus, "Offline");
});

Deno.test("UazAPI sem heartbeat nenhum (last_real_whatsapp_state ausente) é 'Offline', nunca 'Desconhecido' silencioso", () => {
  const neverSynced: AdminConnectionRaw = { id: "conn-3", provider: "uazapi" };
  const vm = classifyAdminConnection(neverSynced, null);
  assertEquals(vm.displayStatus, "Offline");
  assertEquals(vm.technicalStatus, "offline");
});

Deno.test("UazAPI PAIRING/OPENING é 'Conectando'", () => {
  assertEquals(
    classifyAdminConnection({ id: "c", provider: "uazapi", last_real_whatsapp_state: "PAIRING" }, null).displayStatus,
    "Conectando",
  );
  assertEquals(
    classifyAdminConnection({ id: "c", provider: "uazapi", last_real_whatsapp_state: "OPENING" }, null).displayStatus,
    "Conectando",
  );
});

Deno.test("status 'qr_pending' na própria linha (sem last_real_whatsapp_state) também é 'Conectando'", () => {
  const vm = classifyAdminConnection({ id: "c", provider: "uazapi", status: "qr_pending" }, null);
  assertEquals(vm.displayStatus, "Conectando");
});

Deno.test("provider ausente/null/vazio (legado de produção) é tratado como UazAPI — mesma retrocompatibilidade do backend", () => {
  const legacyNull: AdminConnectionRaw = { id: "c", provider: null, last_real_whatsapp_state: "CONNECTED" };
  const legacyUndefined: AdminConnectionRaw = { id: "c", last_real_whatsapp_state: "CONNECTED" };
  assertEquals(classifyAdminConnection(legacyNull, null).isUazapi, true);
  assertEquals(classifyAdminConnection(legacyUndefined, null).isUazapi, true);
  assertEquals(classifyAdminConnection(legacyNull, null).displayStatus, "Online");
});

Deno.test("provider desconhecido/diferente de uazapi falha fechado: nunca 'Online', nunca oferece ações UazAPI", () => {
  const metaCloud: AdminConnectionRaw = { id: "c", provider: "meta_cloud", last_real_whatsapp_state: "CONNECTED" };
  const vm = classifyAdminConnection(metaCloud, null);
  assertEquals(vm.isUazapi, false);
  assertEquals(vm.displayStatus, "Desconhecido");
  assertEquals(vm.supportsQr, false);
  assertEquals(vm.supportsReconnect, false);
  assertEquals(vm.supportsDelete, false);
});

Deno.test("linha ausente (null/undefined) — ex.: sessão Chromium órfã sem UazAPI — falha fechada, nunca lança exceção", () => {
  const vm = classifyAdminConnection(null, ONLINE_CHROMIUM);
  assertEquals(vm.isUazapi, false);
  assertEquals(vm.displayStatus, "Desconhecido");
  assertEquals(vm.chromiumAuxStatus, "online");
});

Deno.test("chromiumAuxStatus é sempre calculado e exposto à parte, mesmo quando não influencia o status geral", () => {
  const vm = classifyAdminConnection(ONLINE_UAZAPI, ONLINE_CHROMIUM);
  assertEquals(vm.chromiumAuxStatus, "online");
});

// ── countAdminConnections: contador canônico ──────────────────────────

Deno.test("10 online + 6 offline (cenário real de produção) -> contador correto, mesmo conjunto da tabela", () => {
  const rows: AdminConnectionRaw[] = [
    ...Array.from({ length: 10 }, (_, i) => ({ id: `online-${i}`, provider: "uazapi", last_real_whatsapp_state: "CONNECTED" })),
    ...Array.from({ length: 6 }, (_, i) => ({ id: `offline-${i}`, provider: "uazapi", last_real_whatsapp_state: "CLOSED" })),
  ];
  const viewModels = rows.map((r) => classifyAdminConnection(r, null));
  const counts = countAdminConnections(viewModels);
  assertEquals(counts.total, 16);
  assertEquals(counts.online, 10);
  assertEquals(counts.offline, 6);
  assertEquals(counts.connecting, 0);
});

Deno.test("countAdminConnections nunca conta linha 'unknown'/provider não suportado como online", () => {
  const unknown = classifyAdminConnection({ id: "x", provider: "chromium" } as AdminConnectionRaw, null);
  const counts = countAdminConnections([unknown]);
  assertEquals(counts.online, 0);
  assertEquals(counts.offline, 1);
});

Deno.test("lista vazia -> contador zerado, nunca lança exceção", () => {
  const counts = countAdminConnections([]);
  assertEquals(counts, { total: 0, online: 0, offline: 0, connecting: 0 });
});

Deno.test("cenário misto online/connecting/offline soma corretamente e total bate com o array de entrada", () => {
  const rows: AdminConnectionRaw[] = [
    { id: "a", provider: "uazapi", last_real_whatsapp_state: "CONNECTED" },
    { id: "b", provider: "uazapi", last_real_whatsapp_state: "PAIRING" },
    { id: "c", provider: "uazapi", last_real_whatsapp_state: "CLOSED" },
    { id: "d", provider: "uazapi" },
  ];
  const viewModels = rows.map((r) => classifyAdminConnection(r, null));
  const counts = countAdminConnections(viewModels);
  assertEquals(counts.total, 4);
  assertEquals(counts.online, 1);
  assertEquals(counts.connecting, 1);
  assertEquals(counts.offline, 2);
});
