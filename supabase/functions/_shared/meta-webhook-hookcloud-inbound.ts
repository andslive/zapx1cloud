// FASE 12A — extração pura de dados NÃO CONFIÁVEIS do payload bruto do
// webhook (antes de qualquer autenticação ter sido decidida), validação
// básica de schema, extração de timestamp, e construção do registro de
// quarentena redigido para o modo HookCloud.
//
// "Não confiável" aqui significa: estes valores só servem para LOCALIZAR
// uma configuração candidata (via phone_number_id) — nunca para tomar
// nenhuma decisão de autorização por si só. A decisão real acontece
// inteiramente em meta-webhook-hookcloud-gate.ts, depois que a conexão
// candidata (e seu onboarding_source real, vindo do banco) é conhecida.

/** Os dois únicos campos extraídos do payload ANTES de qualquer autenticação. */
export interface UntrustedWebhookIdentifiers {
  entryId: string | null;
  phoneNumberId: string | null;
}

function firstEntry(payload: unknown): any {
  const obj = payload as any;
  if (!obj || typeof obj !== "object") return undefined;
  return Array.isArray(obj.entry) ? obj.entry[0] : undefined;
}

function firstChange(entry: any): any {
  return entry && Array.isArray(entry.changes) ? entry.changes[0] : undefined;
}

export function peekUntrustedWebhookIdentifiers(payload: unknown): UntrustedWebhookIdentifiers {
  const entry = firstEntry(payload);
  const entryId = typeof entry?.id === "string" && entry.id.length > 0 ? entry.id : null;
  const change = firstChange(entry);
  const rawPhoneNumberId = change?.value?.metadata?.phone_number_id;
  const phoneNumberId = typeof rawPhoneNumberId === "string" && rawPhoneNumberId.length > 0 ? rawPhoneNumberId : null;
  return { entryId, phoneNumberId };
}

/**
 * Checagem de schema BÁSICA (item 12 do gate) — não é uma validação
 * exaustiva do contrato completo da Meta, só uma rejeição rápida de
 * payloads estruturalmente incompatíveis (não-objeto, sem `entry`
 * array não vazio, sem `entry[0].id` string, sem `entry[0].changes`
 * array). Payloads que passam aqui ainda podem falhar mais adiante no
 * gate (ex.: WABA/phone_number_id não corresponderem a nenhuma conexão).
 */
export function isValidMetaWebhookPayloadShape(payload: unknown): boolean {
  const obj = payload as any;
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return false;
  if (obj.object !== "whatsapp_business_account") return false;
  const entry = firstEntry(payload);
  if (!entry || typeof entry !== "object") return false;
  if (typeof entry.id !== "string" || entry.id.length === 0) return false;
  if (!Array.isArray(entry.changes)) return false;
  return true;
}

/**
 * Extrai o `timestamp` (segundos, unix) do primeiro evento de mensagem ou
 * status encontrado no payload — campo padrão da Meta em ambos os tipos.
 * `null` se ausente/inválido (o gate trata `null` como fora da janela —
 * falha fechada, nunca assume "recente" por omissão).
 */
export function extractEventTimestampSeconds(payload: unknown): number | null {
  const entry = firstEntry(payload);
  const change = firstChange(entry);
  const value = change?.value;
  const candidate = value?.messages?.[0]?.timestamp ?? value?.statuses?.[0]?.timestamp;
  if (candidate === undefined || candidate === null) return null;
  const parsed = typeof candidate === "string" ? Number(candidate) : candidate;
  if (typeof parsed !== "number" || !Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
}

export interface HookCloudQuarantineRecordInput {
  connectionId: string;
  organizationId: string;
  provider: "meta_cloud";
  onboardingSource: "hookcloud";
  eventKind: string;
  wabaId: string;
  phoneNumberId: string;
  reasonCode: string;
}

/**
 * Constrói o registro (redigido) armazenado em `raw_payload` para eventos
 * HookCloud aceitos. NUNCA inclui telefone do lead, conteúdo/corpo de
 * mensagem, mídia, token ou o payload bruto completo da Meta — só os
 * metadados mínimos permitidos (conexão/organização/provider/origem/tipo/
 * motivo), mais os dois identificadores já não-sensíveis que o ledger de
 * direct_meta também já armazena (waba_id, phone_number_id — ativos da
 * Meta, não dados do lead).
 */
export function buildHookCloudQuarantineRecord(input: HookCloudQuarantineRecordInput): Record<string, unknown> {
  return {
    quarantine: true,
    connection_id: input.connectionId,
    organization_id: input.organizationId,
    provider: input.provider,
    onboarding_source: input.onboardingSource,
    event_kind: input.eventKind,
    waba_id: input.wabaId,
    phone_number_id: input.phoneNumberId,
    reason: input.reasonCode,
  };
}
