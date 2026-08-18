// FASE 2A.2 — Correção 4 do ADENDO GATE 2A.1: porta de dispatch tipada,
// exclusiva para inbound real do cliente. O gate confirmou que a única
// garantia existente de "echo/history/status/sync nunca chegam a
// automação" era estrutural (nenhum código de dispatch existia ainda) —
// não uma porta testada em runtime. Isto resolve isso.
//
// DELIBERADAMENTE NÃO conectado ao pipeline real nesta fase (nenhuma
// Edge Function importa/chama `routeNormalizedEvent` ainda) — é um
// contrato pronto para a Fase 2B ligar ao worker do ledger, com a
// garantia já provada por testes de runtime (dispatch.test.ts), não por
// busca textual.
//
// FASE 2A.3 — Correção 4 do Gate 2A.2: a porta não depende mais de um
// `if (kind !== "message" ...)` ad-hoc. `routeNormalizedEvent` delega a
// decisão a `classifyMetaWebhookEvent()` (`../meta-webhook-classify.ts`),
// uma função de refinamento exaustiva com 13 rótulos (incluindo
// `state_sync`, documentado ali como alias de `contact_sync`) — único
// ponto de verdade sobre "que tipo de evento é este" nesta fundação.

import type { NormalizedInboundEvent, WhatsAppProviderName, MediaRef } from "./types.ts";
import { classifyMetaWebhookEvent, isCustomerInboundLabel } from "../meta-webhook-classify.ts";

/**
 * Evento que JÁ passou por toda a triagem: `kind === "message"`,
 * `automationForbidden === false`, organização/conexão resolvidas pelo
 * BACKEND (nunca do payload — ver Correção 3), e ainda não despachado
 * antes (idempotência). É o ÚNICO shape que a porta aceita.
 */
export interface CustomerInboundEvent {
  readonly kind: "customer_inbound";
  provider: WhatsAppProviderName;
  organizationId: string;
  connectionId: string;
  providerMessageId: string | undefined;
  remotePhone: string | undefined;
  content: string | undefined;
  media: MediaRef | undefined;
  idempotencyKey: string;
}

/** Implementado pelo pipeline de negócio real na Fase 2B (funil/IA/etc). Não implementado aqui. */
export interface InboundDispatchPort {
  dispatchCustomerInbound(event: CustomerInboundEvent): Promise<void>;
}

export type RouteOutcome =
  | "dispatched"
  | "ignored_not_customer_inbound"
  | "ignored_unresolved"
  | "ignored_duplicate";

export interface RouteNormalizedEventDeps {
  dispatcher: InboundDispatchPort;
  /**
   * Resolve organização/conexão a partir do evento — SEMPRE pelo backend
   * (phone_number_id/WABA → evolution_instances_meta_cloud), NUNCA a
   * partir de um campo do payload da Meta (que não tem esse conceito).
   * Retorna `null` quando não resolvido (config ausente, evento de
   * conexão desconhecida, etc.) — nesse caso o evento NUNCA é despachado.
   * Se a implementação real (Fase 2B) reflete uma falha de persistência
   * ao tentar resolver, ela deve REJEITAR a Promise (nunca retornar um
   * valor inventado) — `routeNormalizedEvent` propaga o erro sem despachar.
   */
  resolveOrganizationAndConnection: (
    event: NormalizedInboundEvent,
  ) => Promise<{ organizationId: string; connectionId: string } | null>;
  /**
   * true se este evento (pela `idempotencyKey`) já foi despachado antes.
   * Backing real (Fase 2B) deve refletir estado persistido (ex.:
   * `processing_status='processed'` no ledger), nunca um cache em memória
   * isolado por instância de função.
   */
  wasAlreadyDispatched: (idempotencyKey: string) => Promise<boolean>;
  computeIdempotencyKey: (event: NormalizedInboundEvent) => string | Promise<string>;
}

/**
 * Roteamento EXAUSTIVO: a decisão de "isto pode virar customer_inbound?"
 * NÃO é mais um `if` ad-hoc sobre `kind`/`automationForbidden` — é
 * delegada inteiramente a `classifyMetaWebhookEvent()`
 * (`meta-webhook-classify.ts`), a única função de refinamento tipada e
 * exaustiva (13 rótulos, `switch` sobre todos os `NormalizedInboundKind`
 * conhecidos, incluindo os subtipos de status e o alias documentado
 * `state_sync`). `automationForbidden` continua checado aqui como segunda
 * trava independente — defesa em profundidade: mesmo que a classificação
 * e a normalização divergissem por algum bug futuro, esta linha ainda
 * bloqueia.
 */
export async function routeNormalizedEvent(
  event: NormalizedInboundEvent,
  deps: RouteNormalizedEventDeps,
): Promise<RouteOutcome> {
  const label = classifyMetaWebhookEvent(event);
  if (!isCustomerInboundLabel(label) || event.automationForbidden) {
    return "ignored_not_customer_inbound";
  }

  const resolved = await deps.resolveOrganizationAndConnection(event);
  if (!resolved) {
    return "ignored_unresolved";
  }

  const idempotencyKey = await deps.computeIdempotencyKey(event);
  const already = await deps.wasAlreadyDispatched(idempotencyKey);
  if (already) {
    return "ignored_duplicate";
  }

  await deps.dispatcher.dispatchCustomerInbound({
    kind: "customer_inbound",
    provider: event.provider,
    organizationId: resolved.organizationId,
    connectionId: resolved.connectionId,
    providerMessageId: event.providerMessageId,
    remotePhone: event.remotePhone,
    content: event.content,
    media: event.media,
    idempotencyKey,
  });

  return "dispatched";
}
