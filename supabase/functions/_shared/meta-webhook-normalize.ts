// FASE 2A — normalização PURA de payloads do webhook da Meta Cloud API
// para o formato `NormalizedInboundEvent` (whatsapp-provider/types.ts).
// Nenhuma função aqui faz I/O — só interpreta a estrutura já parseada do
// JSON (o parse só deve acontecer DEPOIS de `verifyMetaWebhookSignature`
// aprovar o corpo bruto, no handler do Edge Function).
//
// Estrutura padrão de um webhook da Meta:
//   { object: "whatsapp_business_account",
//     entry: [{ id: <waba_id>, changes: [{ field, value }] }] }
//
// `field` observados (ver relatório Fase 1, §6, documentação oficial):
//   "messages"           → value.messages[] (inbound real) +
//                           value.statuses[] (sent/delivered/read/failed) +
//                           value.errors[]
//   "smb_message_echoes" → mensagens enviadas pelo WhatsApp Business App
//                           após Coexistência — NUNCA pode acionar automação
//   "smb_app_state_sync" → sincronização de contatos (Coexistência) —
//                           NUNCA pode criar campanha/funil
//   "history"             → histórico importado (Coexistência) — NUNCA
//                           pode acionar automação/venda
//   "account_update"      → mudanças de qualidade/limite/status da conta
//
// Regra central desta função: `automationForbidden` é `true` por padrão
// para QUALQUER coisa que não seja uma mensagem inbound genuína
// (`kind: "message"`) — inclusive para campos desconhecidos/não mapeados,
// que caem em `kind: "unknown"` com `automationForbidden: true`. Isso é
// deliberado: um campo novo que a Meta adicione no futuro nunca deve, por
// omissão, ser tratado como seguro para acionar funil/IA/venda.

import type { MediaRef, NormalizedInboundEvent, NormalizedInboundKind } from "./whatsapp-provider/types.ts";

// FASE 2A.2 — Correção 2 do Gate 2A.1: `phoneNumberId` agora é extraído de
// `value.metadata.phone_number_id` (quando presente) e embutido em
// `event.raw.phoneNumberId` de TODO evento, não só em `history`/etc. Isso é
// o "escopo" que `meta-webhook-idempotency.ts` usa para nunca colidir
// eventos de números diferentes que por acaso compartilhem `wamid` (o
// `wamid` sozinho não é garantidamente único entre contas/números
// distintos segundo a documentação da Meta consultada na Fase 1).

function extractMediaFromMessage(msg: any): MediaRef | undefined {
  const type = msg?.type;
  const node = msg?.[type];
  if (!node || typeof node !== "object") return undefined;
  if (!["image", "audio", "video", "document", "sticker"].includes(type)) return undefined;
  return {
    mimeType: node.mime_type ?? "application/octet-stream",
    fileName: node.filename,
    caption: node.caption,
    // `id` é o media_id da Meta — reaproveitamos o campo `url` do contrato
    // interno só como carregador de referência (não é uma URL de fato
    // aqui; o download real usa getMetaMediaMetadata(mediaId), ver
    // meta-cloud-client.ts). Deixado explícito para não confundir quem for
    // implementar o consumo na Fase 2B.
    url: node.id ? `meta-media-id:${node.id}` : undefined,
  };
}

function normalizeInboundMessage(msg: any, wabaId: string, phoneNumberId: string): NormalizedInboundEvent {
  return {
    kind: "message",
    provider: "meta_cloud",
    providerMessageId: msg?.id,
    remotePhone: msg?.from,
    fromMe: false,
    content: msg?.type === "text" ? msg?.text?.body : undefined,
    media: extractMediaFromMessage(msg),
    automationForbidden: false,
    raw: { wabaId, phoneNumberId, message: msg },
  };
}

function normalizeStatus(status: any, wabaId: string, phoneNumberId: string): NormalizedInboundEvent {
  const allowed = ["sent", "delivered", "read", "failed"];
  const mapped = allowed.includes(status?.status) ? status.status : undefined;
  return {
    kind: "status",
    provider: "meta_cloud",
    providerMessageId: status?.id,
    remotePhone: status?.recipient_id,
    status: mapped,
    errorCode: status?.errors?.[0]?.code !== undefined ? String(status.errors[0].code) : undefined,
    errorMessage: status?.errors?.[0]?.message,
    // status NUNCA vira mensagem — regra explícita testada em
    // meta-webhook-normalize.test.ts. `status` (o subtipo real, ver campo
    // `status` acima) é o que meta-webhook-idempotency.ts usa para nunca
    // colidir sent/delivered/read/failed do mesmo wamid entre si —
    // corrigido no Gate 2A.1, Correção 2.
    automationForbidden: true,
    raw: { wabaId, phoneNumberId, status },
  };
}

function normalizeError(err: any, wabaId: string, phoneNumberId: string): NormalizedInboundEvent {
  return {
    kind: "error",
    provider: "meta_cloud",
    errorCode: err?.code !== undefined ? String(err.code) : undefined,
    errorMessage: err?.message ?? err?.title,
    automationForbidden: true,
    raw: { wabaId, phoneNumberId, error: err },
  };
}

function normalizeEcho(echo: any, wabaId: string, phoneNumberId: string): NormalizedInboundEvent {
  return {
    kind: "message_echo",
    provider: "meta_cloud",
    providerMessageId: echo?.id,
    remotePhone: echo?.to ?? echo?.from,
    fromMe: true,
    content: echo?.type === "text" ? echo?.text?.body : undefined,
    media: extractMediaFromMessage(echo),
    // eco do WhatsApp Business App: grava como outbound, nunca aciona
    // automação — ver relatório, §9.1 (proteções de Coexistência).
    automationForbidden: true,
    raw: { wabaId, phoneNumberId, echo },
  };
}

function normalizeSingleFieldEvent(
  kind: NormalizedInboundKind,
  wabaId: string,
  phoneNumberId: string,
  value: unknown,
): NormalizedInboundEvent {
  return {
    kind,
    provider: "meta_cloud",
    automationForbidden: true,
    raw: { wabaId, phoneNumberId, value },
  };
}

/**
 * Normaliza um único `change` (`{field, value}`) em zero ou mais eventos.
 * Um change de `field: "messages"` pode conter várias mensagens/status/erros
 * simultaneamente — por isso retorna um array.
 */
export function normalizeMetaWebhookChange(
  change: { field?: string; value?: any },
  wabaId: string,
): NormalizedInboundEvent[] {
  const field = change?.field;
  const value = change?.value ?? {};
  // `metadata.phone_number_id` é o campo padrão da Meta em `messages`;
  // outros `field`s podem não trazer `metadata`, então cai em "" (o
  // idempotency key ainda assim usa `wabaId` como escopo de fallback —
  // ver meta-webhook-idempotency.ts).
  const phoneNumberId = String(value?.metadata?.phone_number_id ?? "");

  if (field === "messages") {
    const events: NormalizedInboundEvent[] = [];
    for (const msg of value.messages ?? []) events.push(normalizeInboundMessage(msg, wabaId, phoneNumberId));
    for (const status of value.statuses ?? []) events.push(normalizeStatus(status, wabaId, phoneNumberId));
    for (const err of value.errors ?? []) events.push(normalizeError(err, wabaId, phoneNumberId));
    if (events.length === 0) {
      events.push(normalizeSingleFieldEvent("unknown", wabaId, phoneNumberId, value));
    }
    return events;
  }

  if (field === "smb_message_echoes") {
    const echoes = value.message_echoes ?? value.messages ?? [];
    if (Array.isArray(echoes) && echoes.length > 0) {
      return echoes.map((e: any) => normalizeEcho(e, wabaId, phoneNumberId));
    }
    return [normalizeSingleFieldEvent("message_echo", wabaId, phoneNumberId, value)];
  }

  if (field === "smb_app_state_sync") {
    return [normalizeSingleFieldEvent("contact_sync", wabaId, phoneNumberId, value)];
  }

  if (field === "history") {
    return [normalizeSingleFieldEvent("history", wabaId, phoneNumberId, value)];
  }

  if (field === "account_update") {
    return [normalizeSingleFieldEvent("account_update", wabaId, phoneNumberId, value)];
  }

  // Campo desconhecido/futuro — falha fechado: nunca automationForbidden=false.
  return [normalizeSingleFieldEvent("unknown", wabaId, phoneNumberId, value)];
}

/**
 * Ponto de entrada: normaliza o payload inteiro do webhook (`{object, entry[]}`).
 * Payload malformado/inesperado nunca lança exceção — retorna um único
 * evento `kind: "unknown"` com o payload bruto anexado, para que o
 * chamador sempre possa gravar no ledger (`meta_webhook_events`) mesmo
 * quando não reconhece a forma.
 */
export function normalizeMetaWebhookPayload(payload: unknown): NormalizedInboundEvent[] {
  const p = payload as any;
  if (!p || typeof p !== "object" || !Array.isArray(p.entry)) {
    return [{ kind: "unknown", provider: "meta_cloud", automationForbidden: true, raw: payload }];
  }

  const events: NormalizedInboundEvent[] = [];
  for (const entry of p.entry) {
    const wabaId = String(entry?.id ?? "");
    const changes = Array.isArray(entry?.changes) ? entry.changes : [];
    if (changes.length === 0) {
      events.push({ kind: "unknown", provider: "meta_cloud", automationForbidden: true, raw: { wabaId, entry } });
      continue;
    }
    for (const change of changes) {
      events.push(...normalizeMetaWebhookChange(change, wabaId));
    }
  }
  return events;
}
