// deno test --no-check --allow-read --allow-env src/lib/whatsapp/connectionAdminView.phase20b.test.ts
//
// FASE 20B — revisão independente do PR #27. Estes testes foram escritos do
// zero nesta fase (não apenas reexecutam os da Fase 20A) para cobrir a
// nuance que a Fase 20A deixou sem tratamento: um heartbeat UazAPI
// persistido como "UNKNOWN" (ping não confirmou conexão nem desconexão)
// era, antes desta fase, classificado de forma IDÊNTICA a um "DISCONNECTED"
// confirmado — mesmo texto "Offline", mesmo `statusReason` afirmando que o
// heartbeat "reporta" o estado, o que falsifica uma confirmação que nunca
// existiu. Cenário de produção confirmado pelo dono do projeto: 16 conexões
// UazAPI cadastradas, 10 online (heartbeat CONNECTED), 6 offline
// intencionais — dessas 6, 5 com heartbeat DISCONNECTED e 1 com heartbeat
// UNKNOWN.

import { assertEquals, assertNotEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  classifyAdminConnection,
  countAdminConnections,
  type AdminConnectionRaw,
} from "./connectionAdminView.ts";

// ── O caso UNKNOWN especificamente ───────────────────────────────────────

Deno.test("heartbeat UNKNOWN nunca é tratado como saudável/online", () => {
  const vm = classifyAdminConnection(
    { id: "unk-1", provider: "uazapi", last_real_whatsapp_state: "UNKNOWN" },
    null,
  );
  assertNotEquals(vm.displayStatus, "Online");
  assertNotEquals(vm.technicalStatus, "online");
});

Deno.test("heartbeat UNKNOWN é marcado com isUnconfirmedOffline=true, distinto de DISCONNECTED confirmado", () => {
  const unknownVm = classifyAdminConnection(
    { id: "unk-1", provider: "uazapi", last_real_whatsapp_state: "UNKNOWN" },
    null,
  );
  const disconnectedVm = classifyAdminConnection(
    { id: "disc-1", provider: "uazapi", last_real_whatsapp_state: "DISCONNECTED" },
    null,
  );
  assertEquals(unknownVm.isUnconfirmedOffline, true);
  assertEquals(disconnectedVm.isUnconfirmedOffline, false);
  assertNotEquals(unknownVm.displayStatus, disconnectedVm.displayStatus);
});

Deno.test("heartbeat UNKNOWN: statusReason NUNCA afirma que o ping confirmou desconexão", () => {
  const vm = classifyAdminConnection(
    { id: "unk-1", provider: "uazapi", last_real_whatsapp_state: "UNKNOWN" },
    null,
  );
  const reasonLower = vm.statusReason.toLowerCase();
  // não pode conter frases que soem como confirmação de queda
  assertEquals(reasonLower.includes("confirma desconexão"), false);
  assertEquals(reasonLower.includes("reporta desconectad"), false);
  // deve comunicar explicitamente a ausência de confirmação
  assertEquals(vm.statusReason.toLowerCase().includes("não confirmou"), true);
});

Deno.test("heartbeat UNKNOWN entra no agregado operacional 'Offline' (nunca em 'online' nem 'connecting')", () => {
  const vm = classifyAdminConnection(
    { id: "unk-1", provider: "uazapi", last_real_whatsapp_state: "UNKNOWN" },
    null,
  );
  const counts = countAdminConnections([vm]);
  assertEquals(counts.online, 0);
  assertEquals(counts.connecting, 0);
  assertEquals(counts.offline, 1);
});

Deno.test("UNKNOWN não é hardcoded por id/nome/posição — qualquer linha com last_real_whatsapp_state='UNKNOWN' recebe o mesmo tratamento, qualquer outro id/nome não", () => {
  const a = classifyAdminConnection(
    { id: "chip-qualquer-nome-especial-99", provider: "uazapi", last_real_whatsapp_state: "UNKNOWN" },
    null,
  );
  const b = classifyAdminConnection(
    { id: "outro-id-completamente-diferente", provider: "uazapi", last_real_whatsapp_state: "UNKNOWN" },
    null,
  );
  assertEquals(a.isUnconfirmedOffline, true);
  assertEquals(b.isUnconfirmedOffline, true);
  assertEquals(a.displayStatus, b.displayStatus);
});

// ── Cenário exato de produção: 10 online / 5 disconnected / 1 unknown ────

Deno.test("cenário exato confirmado pelo dono: 10 CONNECTED + 5 DISCONNECTED + 1 UNKNOWN -> 10 online / 6 offline / 16 total, e exatamente 1 delas é isUnconfirmedOffline", () => {
  const rows: AdminConnectionRaw[] = [
    ...Array.from({ length: 10 }, (_, i) => ({
      id: `online-${i}`,
      provider: "uazapi",
      last_real_whatsapp_state: "CONNECTED",
    })),
    ...Array.from({ length: 5 }, (_, i) => ({
      id: `disc-${i}`,
      provider: "uazapi",
      last_real_whatsapp_state: "DISCONNECTED",
    })),
    { id: "unk-0", provider: "uazapi", last_real_whatsapp_state: "UNKNOWN" },
  ];
  const viewModels = rows.map((r) => classifyAdminConnection(r, null));
  const counts = countAdminConnections(viewModels);

  assertEquals(counts.total, 16);
  assertEquals(counts.online, 10);
  assertEquals(counts.offline, 6);
  assertEquals(counts.connecting, 0);

  const unconfirmed = viewModels.filter((vm) => vm.isUnconfirmedOffline);
  assertEquals(unconfirmed.length, 1);
  assertEquals(unconfirmed[0].connectionId, "unk-0");

  // Contador e "tabela" (viewModels) usam exatamente o mesmo conjunto —
  // nunca podem divergir.
  assertEquals(viewModels.length, counts.total);
});

// ── Falha fechada permanece intacta para provider desconhecido ──────────

Deno.test("provider desconhecido nunca aceita ação UazAPI, mesmo com heartbeat CONNECTED forjado no campo", () => {
  const spoofed: AdminConnectionRaw = {
    id: "spoof-1",
    provider: "meta_cloud",
    last_real_whatsapp_state: "CONNECTED",
  };
  const vm = classifyAdminConnection(spoofed, null);
  assertEquals(vm.isUazapi, false);
  assertEquals(vm.displayStatus, "Desconhecido");
  assertEquals(vm.supportsQr, false);
  assertEquals(vm.supportsReconnect, false);
  assertEquals(vm.supportsDelete, false);
  assertNotEquals(vm.displayStatus, "Online");
});

Deno.test("provider vazio-string é tratado como legado UazAPI (retrocompat), provider com espaço/caixa diferente de 'uazapi' falha fechado", () => {
  const emptyString: AdminConnectionRaw = { id: "e", provider: "", last_real_whatsapp_state: "CONNECTED" };
  const wrongCase: AdminConnectionRaw = { id: "w", provider: "UazAPI", last_real_whatsapp_state: "CONNECTED" };
  assertEquals(classifyAdminConnection(emptyString, null).isUazapi, true);
  assertEquals(classifyAdminConnection(wrongCase, null).isUazapi, false);
  assertEquals(classifyAdminConnection(wrongCase, null).displayStatus, "Desconhecido");
});
