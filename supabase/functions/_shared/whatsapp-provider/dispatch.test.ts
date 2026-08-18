// deno test --allow-import dispatch.test.ts
//
// Correção 4 do ADENDO GATE 2A.1: testes de RUNTIME com spy (não busca
// textual) provando que `routeNormalizedEvent` só despacha
// `kind: "message"`, e que outbound/echo/history/contact_sync/status
// (sent/delivered/read/failed)/account_update/erro/desconhecido resultam
// em ZERO chamadas ao dispatcher — que é, nesta fase, o único "sistema de
// automação" que existe para medir (funil/IA/wait_response/ai_receipt/
// venda/purchase_audit/CAPI/envio de mensagem real ainda não existem
// como código nenhum; a porta é o ponto de estrangulamento por onde
// TODOS eles precisarão passar quando forem escritos na Fase 2B — provar
// que só "message" atravessa a porta é a mesma prova, transposta para o
// único artefato de runtime que já existe).

import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { routeNormalizedEvent, type CustomerInboundEvent, type InboundDispatchPort } from "./dispatch.ts";
import type { NormalizedInboundEvent, NormalizedInboundKind } from "./types.ts";

class SpyDispatcher implements InboundDispatchPort {
  calls: CustomerInboundEvent[] = [];
  async dispatchCustomerInbound(event: CustomerInboundEvent): Promise<void> {
    this.calls.push(event);
  }
}

function baseDeps(dispatcher: InboundDispatchPort, overrides: Partial<{
  resolveOrganizationAndConnection: (e: NormalizedInboundEvent) => Promise<{ organizationId: string; connectionId: string } | null>;
  wasAlreadyDispatched: (k: string) => Promise<boolean>;
}> = {}) {
  return {
    dispatcher,
    resolveOrganizationAndConnection: overrides.resolveOrganizationAndConnection ??
      (async () => ({ organizationId: "org-a", connectionId: "conn-1" })),
    wasAlreadyDispatched: overrides.wasAlreadyDispatched ?? (async () => false),
    computeIdempotencyKey: (e: NormalizedInboundEvent) => `key:${e.providerMessageId ?? "none"}`,
  };
}

function eventOf(kind: NormalizedInboundKind, automationForbidden: boolean, extra: Partial<NormalizedInboundEvent> = {}): NormalizedInboundEvent {
  return { kind, provider: "meta_cloud", automationForbidden, raw: {}, ...extra };
}

const ALL_NON_MESSAGE_KINDS: Array<{ kind: NormalizedInboundKind; automationForbidden: boolean; label: string; extra?: Partial<NormalizedInboundEvent> }> = [
  { kind: "message_echo", automationForbidden: true, label: "outbound/echo (smb_message_echoes)" },
  { kind: "history", automationForbidden: true, label: "history sync" },
  { kind: "contact_sync", automationForbidden: true, label: "contact/state sync (smb_app_state_sync)" },
  { kind: "status", automationForbidden: true, label: "status sent", extra: { status: "sent" } },
  { kind: "status", automationForbidden: true, label: "status delivered", extra: { status: "delivered" } },
  { kind: "status", automationForbidden: true, label: "status read", extra: { status: "read" } },
  { kind: "status", automationForbidden: true, label: "status failed", extra: { status: "failed" } },
  { kind: "account_update", automationForbidden: true, label: "account update" },
  { kind: "error", automationForbidden: true, label: "erro" },
  { kind: "unknown", automationForbidden: true, label: "evento desconhecido" },
  { kind: "message_delete", automationForbidden: true, label: "message_delete" },
  { kind: "connection", automationForbidden: true, label: "connection (kind herdado do contrato UazAPI)" },
  { kind: "qrcode", automationForbidden: true, label: "qrcode (kind herdado do contrato UazAPI)" },
];

for (const { kind, automationForbidden, label, extra } of ALL_NON_MESSAGE_KINDS) {
  Deno.test(`${label}: routeNormalizedEvent NUNCA chama o dispatcher (zero chamadas)`, async () => {
    const spy = new SpyDispatcher();
    const outcome = await routeNormalizedEvent(eventOf(kind, automationForbidden, extra), baseDeps(spy));
    assertEquals(outcome, "ignored_not_customer_inbound");
    assertEquals(spy.calls.length, 0);
  });
}

Deno.test("message válido: a porta é chamada EXATAMENTE uma vez, com os campos resolvidos pelo backend", async () => {
  const spy = new SpyDispatcher();
  const event = eventOf("message", false, { providerMessageId: "wamid.1", remotePhone: "5511999999999", content: "oi" });
  const outcome = await routeNormalizedEvent(event, baseDeps(spy));
  assertEquals(outcome, "dispatched");
  assertEquals(spy.calls.length, 1);
  assertEquals(spy.calls[0].kind, "customer_inbound");
  assertEquals(spy.calls[0].organizationId, "org-a");
  assertEquals(spy.calls[0].connectionId, "conn-1");
  assertEquals(spy.calls[0].content, "oi");
});

Deno.test("message com automationForbidden=true (dado inconsistente/defensivo) NUNCA é despachado — segunda trava independente do kind", async () => {
  const spy = new SpyDispatcher();
  const event = eventOf("message", true, { providerMessageId: "wamid.x" });
  const outcome = await routeNormalizedEvent(event, baseDeps(spy));
  assertEquals(outcome, "ignored_not_customer_inbound");
  assertEquals(spy.calls.length, 0);
});

Deno.test("repetição idempotente do MESMO evento resulta em zero chamada adicional", async () => {
  const spy = new SpyDispatcher();
  const dispatched = new Set<string>();
  const deps = baseDeps(spy, {
    wasAlreadyDispatched: async (k: string) => dispatched.has(k),
  });
  const event = eventOf("message", false, { providerMessageId: "wamid.1" });

  const first = await routeNormalizedEvent(event, deps);
  dispatched.add("key:wamid.1"); // simula persistência real registrando o despacho
  const second = await routeNormalizedEvent(event, deps);

  assertEquals(first, "dispatched");
  assertEquals(second, "ignored_duplicate");
  assertEquals(spy.calls.length, 1); // não 2
});

Deno.test("evento de organização não resolvida (ex.: outra organização / conexão desconhecida) NUNCA atravessa o dispatcher", async () => {
  const spy = new SpyDispatcher();
  const deps = baseDeps(spy, { resolveOrganizationAndConnection: async () => null });
  const event = eventOf("message", false, { providerMessageId: "wamid.foreign" });
  const outcome = await routeNormalizedEvent(event, deps);
  assertEquals(outcome, "ignored_unresolved");
  assertEquals(spy.calls.length, 0);
});

Deno.test("falha de persistência ao resolver (resolver rejeita) impede dispatch — erro propaga, não é engolido", async () => {
  const spy = new SpyDispatcher();
  const deps = baseDeps(spy, {
    resolveOrganizationAndConnection: async () => {
      throw new Error("db_unavailable");
    },
  });
  const event = eventOf("message", false, { providerMessageId: "wamid.1" });
  let threw = false;
  try {
    await routeNormalizedEvent(event, deps);
  } catch (e) {
    threw = true;
    assertEquals((e as Error).message, "db_unavailable");
  }
  assertEquals(threw, true);
  assertEquals(spy.calls.length, 0);
});

Deno.test("mídia repetida (mesmo evento com mídia, idempotencyKey igual) não provoca segunda chamada ao dispatcher — mesma garantia de idempotência cobre mídia", async () => {
  const spy = new SpyDispatcher();
  const dispatched = new Set<string>();
  const deps = baseDeps(spy, { wasAlreadyDispatched: async (k) => dispatched.has(k) });
  const event = eventOf("message", false, {
    providerMessageId: "wamid.media1",
    media: { mimeType: "image/jpeg", url: "meta-media-id:abc" },
  });

  await routeNormalizedEvent(event, deps);
  dispatched.add("key:wamid.media1");
  await routeNormalizedEvent(event, deps); // reenvio do mesmo evento com a mesma mídia

  assertEquals(spy.calls.length, 1);
});

Deno.test("nota explícita: pipeline real (funil/IA/wait_response/ai_receipt/venda/purchase_audit/CAPI/envio) NÃO está integrado nesta fase — não simulado como se estivesse", () => {
  // Este teste não afirma nada sobre funil/IA/etc porque não existe
  // nenhum código que os chame ainda (nem aqui, nem em meta-cloud-webhook).
  // A garantia provada pelos testes acima é: SE/QUANDO esses sistemas
  // forem conectados como implementação de InboundDispatchPort na Fase
  // 2B, a porta já impede que echo/history/status/sync/account_update/
  // erro/desconhecido cheguem até eles. Nenhuma chamada real a
  // funil/IA/wait_response/ai_receipt/venda/purchase_audit/CAPI existe
  // neste repositório associada a este módulo (grep confirmável).
  assertEquals(true, true);
});
