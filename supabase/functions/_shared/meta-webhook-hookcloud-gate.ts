// FASE 11A — portão de segurança do webhook direto HookCloud (POST sem
// HMAC verificável). Função pura, sem I/O — todas as entradas já
// resolvidas/verificadas pelo chamador (allowlist, secret, contagem de
// conexões, etc.), o que a torna totalmente testável sem mock de rede ou
// banco. Ainda NÃO conectado a nenhum handler HTTP real nesta fase (ver
// nota de integração no fim do arquivo) — mantido isolado e testável,
// mesmo padrão incremental já usado para meta-cloud-mode.ts.
//
// Este gate é EXCLUSIVO do modo `onboarding_source = 'hookcloud'`. O modo
// `direct_meta` continua exigindo apenas HMAC válido
// (meta-webhook-signature.ts), sem nenhuma alteração e sem passar por
// este arquivo — ver evaluateDirectMetaWebhookGate() abaixo, que só
// documenta/testa essa política explicitamente para simetria visual com
// o gate HookCloud, sem mudar o mecanismo existente.
//
// As 13 condições (Fase 11A, pedido do usuário) são avaliadas em ordem;
// a primeira que falhar decide o resultado — nunca continua avaliando
// depois de uma falha (evita qualquer efeito colateral de checagens
// posteriores em cima de um estado já inválido).

import type { HookCloudWebhookMode } from "./meta-webhook-hookcloud-mode.ts";

export type HookCloudGateReasonCode =
  | "OK"
  | "HOOKCLOUD_MODE_OFF"
  | "ORGANIZATION_NOT_ALLOWED"
  | "CONNECTION_NOT_IN_PILOT_ALLOWLIST"
  | "CONNECTION_NOT_ACTIVE"
  | "PROVIDER_MISMATCH"
  | "ONBOARDING_SOURCE_MISMATCH"
  | "SECRET_INVALID"
  | "WABA_MISMATCH"
  | "PHONE_NUMBER_ID_MISMATCH"
  | "ZERO_CONNECTIONS_MATCHED"
  | "MULTIPLE_CONNECTIONS_MATCHED"
  | "TIMESTAMP_OUT_OF_WINDOW"
  | "INVALID_PAYLOAD_SCHEMA"
  | "DUPLICATE_ALREADY_PROCESSED";

export type HookCloudGateOutcome = "quarantine" | "reject" | "duplicate_skip";

export interface HookCloudGateDecision {
  outcome: HookCloudGateOutcome;
  reasonCode: HookCloudGateReasonCode;
}

export interface HookCloudGateInput {
  /** 1) flag global específica HookCloud (meta-webhook-hookcloud-mode.ts). */
  mode: HookCloudWebhookMode;
  /** 2) organização explicitamente liberada — reaproveita isMetaCloudApiEnabled(). */
  organizationAllowed: boolean;
  /** 3) conexão explicitamente na allowlist de piloto. */
  connectionId: string;
  pilotConnectionIds: ReadonlySet<string>;
  /** 4) conexão ativa — evolution_instances_meta_cloud.onboarding_state. */
  onboardingState: string;
  /** 5) provider = meta_cloud — evolution_instances.provider (já resolvido). */
  provider: string;
  /** 6) onboarding_source = hookcloud — já parseado (parseMetaCloudOnboardingSource). */
  onboardingSource: string | null;
  /** 7) segredo opaco válido — já verificado (verifyHookCloudWebhookSecret), nunca o valor bruto aqui. */
  secretValid: boolean;
  /** 8) entry.id (WABA do payload) corresponde ao WABA cadastrado na conexão. */
  payloadEntryId: string;
  connectionWabaId: string;
  /** 9) metadata.phone_number_id corresponde exatamente à conexão. */
  payloadPhoneNumberId: string;
  connectionPhoneNumberId: string;
  /** 10) a consulta por phone_number_id retorna exatamente uma conexão. */
  matchedConnectionCount: number;
  /** 11) timestamp do evento dentro da janela permitida. */
  eventTimestampSeconds: number | null;
  nowSeconds: number;
  maxAgeSeconds: number;
  /** 12) schema básico do payload é válido (já checado pelo chamador). */
  payloadSchemaValid: boolean;
  /** 13) messages[].id já passou pelo ledger idempotente — true = já processado antes. */
  isDuplicateInLedger: boolean;
}

export function evaluateHookCloudWebhookGate(input: HookCloudGateInput): HookCloudGateDecision {
  // 1
  if (input.mode !== "pilot") {
    return { outcome: "reject", reasonCode: "HOOKCLOUD_MODE_OFF" };
  }
  // 2
  if (!input.organizationAllowed) {
    return { outcome: "reject", reasonCode: "ORGANIZATION_NOT_ALLOWED" };
  }
  // 3
  if (!input.pilotConnectionIds.has(input.connectionId)) {
    return { outcome: "reject", reasonCode: "CONNECTION_NOT_IN_PILOT_ALLOWLIST" };
  }
  // 4
  if (input.onboardingState !== "active") {
    return { outcome: "reject", reasonCode: "CONNECTION_NOT_ACTIVE" };
  }
  // 5
  if (input.provider !== "meta_cloud") {
    return { outcome: "reject", reasonCode: "PROVIDER_MISMATCH" };
  }
  // 6
  if (input.onboardingSource !== "hookcloud") {
    return { outcome: "reject", reasonCode: "ONBOARDING_SOURCE_MISMATCH" };
  }
  // 7
  if (!input.secretValid) {
    return { outcome: "reject", reasonCode: "SECRET_INVALID" };
  }
  // 8
  if (input.payloadEntryId !== input.connectionWabaId) {
    return { outcome: "reject", reasonCode: "WABA_MISMATCH" };
  }
  // 9
  if (input.payloadPhoneNumberId !== input.connectionPhoneNumberId) {
    return { outcome: "reject", reasonCode: "PHONE_NUMBER_ID_MISMATCH" };
  }
  // 10
  if (input.matchedConnectionCount === 0) {
    return { outcome: "reject", reasonCode: "ZERO_CONNECTIONS_MATCHED" };
  }
  if (input.matchedConnectionCount > 1) {
    return { outcome: "reject", reasonCode: "MULTIPLE_CONNECTIONS_MATCHED" };
  }
  // 11
  if (
    input.eventTimestampSeconds === null ||
    Math.abs(input.nowSeconds - input.eventTimestampSeconds) > input.maxAgeSeconds
  ) {
    return { outcome: "reject", reasonCode: "TIMESTAMP_OUT_OF_WINDOW" };
  }
  // 12
  if (!input.payloadSchemaValid) {
    return { outcome: "reject", reasonCode: "INVALID_PAYLOAD_SCHEMA" };
  }
  // 13
  if (input.isDuplicateInLedger) {
    return { outcome: "duplicate_skip", reasonCode: "DUPLICATE_ALREADY_PROCESSED" };
  }

  return { outcome: "quarantine", reasonCode: "OK" };
}

/**
 * Política do caminho `direct_meta`, documentada/testada aqui só por
 * simetria — NÃO é um mecanismo novo, NÃO substitui
 * verifyMetaWebhookSignature() (meta-webhook-signature.ts, intocado). O
 * caminho HMAC não foi, e não pode ser, flexibilizado por esta fase.
 */
export function evaluateDirectMetaWebhookGate(hmacValid: boolean): HookCloudGateDecision {
  if (!hmacValid) {
    return { outcome: "reject", reasonCode: "SECRET_INVALID" };
  }
  return { outcome: "quarantine", reasonCode: "OK" };
}

// ─── Política explícita de ações permitidas no piloto HookCloud ──────────
//
// Um evento aceito (outcome "quarantine") SÓ pode acionar as 4 ações
// abaixo. Nenhuma ação de negócio é permitida enquanto o webhook direto
// HookCloud não tiver autenticação forte (ver auditoria HookCloud, Fase
// 8B, seção 21.9 — condição de GO para piloto real).

export type HookCloudPilotAction =
  | "register_ledger_entry"
  | "store_quarantined_payload"
  | "emit_safe_log"
  | "respond_fast_ack"
  | "start_or_advance_funnel"
  | "send_automatic_reply"
  | "send_proactive_message"
  | "process_receipt"
  | "record_sale"
  | "trigger_capi_pixel"
  | "consume_ai"
  | "run_follow_up"
  | "modify_financial_data";

const PERMITTED_HOOKCLOUD_PILOT_ACTIONS: ReadonlySet<HookCloudPilotAction> = new Set([
  "register_ledger_entry",
  "store_quarantined_payload",
  "emit_safe_log",
  "respond_fast_ack",
]);

export function isHookCloudPilotActionPermitted(action: HookCloudPilotAction): boolean {
  return PERMITTED_HOOKCLOUD_PILOT_ACTIONS.has(action);
}

// ─── Nota de integração (deliberadamente NÃO feita nesta fase) ───────────
//
// Este módulo ainda não é chamado por supabase/functions/meta-cloud-webhook
// /index.ts. Fiel à correção de direção desta fase ("não tente deployar
// meta-adapter.ts isoladamente... registre a dependência, mas não faça
// deploy"), o mesmo princípio se aplica aqui: o gate é construído e
// testado isoladamente primeiro; a integração real no handler HTTP (que
// exigiria, no mínimo, extrair phone_number_id/entry.id do payload bruto,
// consultar a conexão, computar matchedConnectionCount, checar o ledger,
// e responder com o status HTTP apropriado) fica para uma fase futura
// própria, com sua própria revisão e autorização — mantendo esta fase
// pequena e estritamente sobre a POLÍTICA de decisão, não sobre o fluxo
// HTTP completo.
