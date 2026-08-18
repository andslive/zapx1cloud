// FASE 2A.3 — Correção 4 do Gate 2A.2: função de refinamento EXPLÍCITA e
// EXAUSTIVA que classifica um `NormalizedInboundEvent` num rótulo de 13
// valores, e só then decide se ele pode virar um `CustomerInboundEvent`.
// O gate apontou que `routeNormalizedEvent` dependia só de
// `kind === "message" && !automationForbidden` — correto no resultado,
// mas implícito demais. Esta função é a ÚNICA fonte de verdade sobre "que
// tipo de evento é este", usada tanto pela porta de dispatch quanto por
// qualquer código futuro que precise da mesma classificação.

import type { NormalizedInboundEvent } from "./whatsapp-provider/types.ts";

export type MetaWebhookEventLabel =
  | "customer_inbound" // ÚNICO rótulo que pode atravessar a porta de dispatch
  | "outbound" // mensagem com fromMe=true vinda como `kind:"message"` (defensivo — normalizeInboundMessage sempre seta fromMe:false; existe para nunca deixar um dado inconsistente passar)
  | "smb_message_echo" // eco do WhatsApp Business App (Coexistência)
  | "history" // histórico importado (Coexistência)
  | "contact_sync" // sincronização de contatos (smb_app_state_sync)
  | "state_sync" // ver nota abaixo — ALIAS DOCUMENTADO de contact_sync, não uma rota de código separada
  | "sent"
  | "delivered"
  | "read"
  | "failed"
  | "account_update"
  | "error"
  | "unknown";

/**
 * NOTA SOBRE `state_sync`: o webhook `smb_app_state_sync` da Meta cobre,
 * num único campo de payload, tanto mudanças de contatos quanto mudanças
 * de estado de sessão/conexão do WhatsApp Business App — não há, nos
 * payloads documentados consultados na Fase 1, um campo separado que
 * distinga as duas coisas no nível de wire format. Por isso,
 * `meta-webhook-normalize.ts` produz um único `NormalizedInboundKind`
 * (`"contact_sync"`) para ambos. `state_sync` existe neste enum de rótulos
 * porque foi pedido explicitamente que ele apareça como tipo distinto e
 * seja coberto por teste — mas ele é, hoje, um ALIAS SEMÂNTICO de
 * `contact_sync`, nunca um valor de retorno real desta função (nenhum
 * `NormalizedInboundKind` mapeia para `"state_sync"`). Se a Meta expuser
 * no futuro uma forma de distinguir os dois no payload, a separação real
 * deve ser feita primeiro em `meta-webhook-normalize.ts` (um novo
 * `NormalizedInboundKind`), e só depois refletida aqui.
 */
export function classifyMetaWebhookEvent(event: NormalizedInboundEvent): MetaWebhookEventLabel {
  switch (event.kind) {
    case "message":
      // Segunda trava independente do `automationForbidden` calculado na
      // normalização — mesmo que ele estivesse errado, `fromMe===true`
      // aqui nunca vira "customer_inbound".
      return event.fromMe === true ? "outbound" : "customer_inbound";

    case "message_echo":
      return "smb_message_echo";

    case "history":
      return "history";

    case "contact_sync":
      // Ver nota da função acima — não existe wire-level split; sempre
      // classificado como "contact_sync", nunca "state_sync" nesta fase.
      return "contact_sync";

    case "status":
      switch (event.status) {
        case "sent":
          return "sent";
        case "delivered":
          return "delivered";
        case "read":
          return "read";
        case "failed":
          return "failed";
        default:
          // Subtipo de status não mapeado — nunca vira customer_inbound.
          return "unknown";
      }

    case "account_update":
      return "account_update";

    case "error":
      return "error";

    // message_delete/connection/qrcode: nenhum destes é produzido pela
    // Meta Cloud API (connection/qrcode existem no union só por
    // compatibilidade com o contrato UazAPI) — tratados como "unknown"
    // por segurança, nunca customer_inbound.
    case "message_delete":
    case "connection":
    case "qrcode":
    case "unknown":
    default:
      return "unknown";
  }
}

/** true apenas para o único rótulo que pode virar CustomerInboundEvent. */
export function isCustomerInboundLabel(label: MetaWebhookEventLabel): label is "customer_inbound" {
  return label === "customer_inbound";
}
