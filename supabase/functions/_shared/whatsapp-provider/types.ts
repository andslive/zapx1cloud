// FASE 2A — contrato comum entre providers de WhatsApp (UazAPI, Meta Cloud
// API). Fundação local, DESATIVADA: nenhum dos ~15 pontos de envio reais
// (uazapi-webhook, webchat-inbox, ai-followup-cron, etc. — ver relatório
// Fase 2A, §15) foi migrado para consumir este contrato ainda. Isso fica
// para a Fase 2B, ponto a ponto, com autorização explícita.
//
// Modelo: cada conexão (`evolution_instances`) resolve para exatamente um
// provider, nunca dois ao mesmo tempo. Quem decide o provider é sempre
// `resolveWhatsAppProvider(connectionId, organizationId)` em resolve.ts —
// nenhum outro lugar deve inferir provider por número de telefone.

export type WhatsAppProviderName = "uazapi" | "meta_cloud";

export interface ConnectionRef {
  connectionId: string;
  organizationId: string;
  provider: WhatsAppProviderName;
}

export interface MediaRef {
  /** URL pública já hospedada (ex.: Supabase Storage) — preferencial. */
  url?: string;
  /** Alternativa quando não há URL pública ainda (base64 puro, sem prefixo data:). */
  base64?: string;
  mimeType: string;
  fileName?: string;
  caption?: string;
}

export interface TemplateComponentParam {
  type: "text" | "currency" | "date_time" | "image" | "document" | "video";
  value: string;
}

export interface TemplateComponent {
  type: "header" | "body" | "button";
  parameters: TemplateComponentParam[];
}

export interface TemplateRef {
  name: string;
  language: string;
  components?: TemplateComponent[];
}

export interface SendResult {
  ok: boolean;
  providerMessageId?: string;
  errorCode?: string;
  errorSubcode?: string;
  errorMessage?: string;
  /** Resposta bruta do provider, só para auditoria/debug — nunca logar isto com token dentro. */
  raw?: unknown;
}

export interface MediaBlob {
  bytes: Uint8Array;
  mimeType: string;
  byteLength: number;
}

export type ConnectionHealthStatus = "healthy" | "degraded" | "down" | "unknown";

export interface HealthStatus {
  status: ConnectionHealthStatus;
  lastActivityAt?: string | null;
  lastErrorAt?: string | null;
  lastErrorMessage?: string | null;
  details?: Record<string, unknown>;
}

/**
 * União normalizada de eventos inbound. Forma paralela e compatível com o
 * `Normalized` interno de uazapi-webhook/index.ts (kind: message |
 * message_delete | connection | qrcode | ack | unknown), estendida com os
 * eventos exclusivos de Coexistência da Meta (history, contact_sync,
 * message_echo explícito). Não importa o tipo interno do uazapi-webhook
 * (não é exportado por aquele arquivo, e não deve ser — este módulo não
 * toca uazapi-webhook/index.ts nesta fase).
 */
export type NormalizedInboundKind =
  | "message" // inbound real, do lead/cliente
  | "message_echo" // enviado pelo próprio negócio (fromMe da UazAPI / smb_message_echoes da Meta)
  | "message_delete"
  | "status" // sent | delivered | read | failed
  | "connection"
  | "qrcode"
  | "account_update"
  | "history" // Coexistência: histórico importado — nunca aciona automação
  | "contact_sync" // Coexistência: smb_app_state_sync — nunca aciona automação
  | "error"
  | "unknown";

export interface NormalizedInboundEvent {
  kind: NormalizedInboundKind;
  provider: WhatsAppProviderName;
  /** wamid (Meta) ou evolution_message_id (UazAPI) — chave de idempotência. */
  providerMessageId?: string;
  remotePhone?: string;
  fromMe?: boolean;
  content?: string;
  media?: MediaRef;
  status?: "sent" | "delivered" | "read" | "failed";
  errorCode?: string;
  errorMessage?: string;
  /** true quando o evento nunca deve alcançar funil/IA/wait_response/venda/CAPI. */
  automationForbidden: boolean;
  raw: unknown;
}

export interface WhatsAppProviderError extends Error {
  code: string;
  providerErrorCode?: string;
  providerErrorSubcode?: string;
  providerTraceId?: string;
  retryable: boolean;
}

/** Contrato comum — cada provider concreto implementa exatamente este shape. */
export interface WhatsAppProvider {
  readonly name: WhatsAppProviderName;
  sendText(conn: ConnectionRef, to: string, text: string): Promise<SendResult>;
  sendMedia(conn: ConnectionRef, to: string, media: MediaRef): Promise<SendResult>;
  sendAudio(conn: ConnectionRef, to: string, audio: MediaRef): Promise<SendResult>;
  sendDocument(conn: ConnectionRef, to: string, doc: MediaRef): Promise<SendResult>;
  sendTemplate(conn: ConnectionRef, to: string, template: TemplateRef): Promise<SendResult>;
  markAsRead(conn: ConnectionRef, providerMessageId: string): Promise<void>;
  downloadMedia(conn: ConnectionRef, mediaRef: string): Promise<MediaBlob>;
  getConnectionHealth(conn: ConnectionRef): Promise<HealthStatus>;
}
