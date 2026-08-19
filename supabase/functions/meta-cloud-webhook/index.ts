// FASE 2A — webhook dedicado da Meta Cloud API. Edge Function SEPARADA do
// webhook UazAPI (`uazapi-webhook`) — nunca reaproveita a mesma URL.
//
// FASE 2A.2 — Correção 1 do ADENDO GATE 2A.1: o gate confirmou que esta
// função respondia HTTP 200 mesmo quando a gravação no ledger falhava
// (`insertLedgerRow(...).catch(console.error)` engolia o erro). Isso
// impedia a Meta de reenviar um evento genuinamente perdido. Reescrito
// abaixo: a resposta só é 200 quando cada evento foi (a) persistido com
// sucesso, OU (b) confirmado como duplicata pela constraint de
// idempotência do banco (`23505` em `idempotency_key`) — qualquer outro
// resultado (erro de banco, timeout, exceção) responde 500/503, para a
// Meta tentar de novo.
//
// FASE 12A — dois caminhos independentes, decididos pela CONEXÃO
// resolvida (nunca por parâmetro do cliente):
//   `direct_meta`  → caminho HMAC original, byte a byte preservado
//                     (algoritmo, header, App Secret, comparação, códigos
//                     de rejeição, ações posteriores, idempotência —
//                     nada disso mudou; só passou a exigir, ANTES do
//                     HMAC, que exista exatamente uma conexão candidata
//                     com onboarding_source='direct_meta').
//   `hookcloud`    → gate de 13 condições (meta-webhook-hookcloud-gate.ts)
//                     substitui HMAC (impossível de validar nesse modo —
//                     ver auditoria HookCloud, Fase 8B). Evento aceito só
//                     alcança ledger + quarentena redigida (MESMA tabela,
//                     `raw_payload` redigido em vez do payload completo) +
//                     log seguro + ACK — NUNCA funil, resposta automática,
//                     comprovante, venda, CAPI ou IA. Estruturalmente
//                     impossível de continuar além disso: a função que
//                     processa este caminho (`processHookCloudEvent`)
//                     termina sempre em `return` logo após a
//                     inserção no ledger — não existe nenhuma chamada,
//                     direta ou indireta, a partir dela, para funil, IA,
//                     `ai_receipt`, `purchase_audit` ou qualquer Edge
//                     Function de negócio.
//   `NULL`/legado/desconhecido, provider != meta_cloud, ou zero/múltiplas
//   conexões candidatas → falha fechada, resposta uniforme (nunca revela
//   qual dos motivos específicos causou a rejeição — evita enumeração de
//   Phone Number ID, WABA ou organização).
//
// FASE 14A — GET individual por conexão HookCloud: quando a query string
// traz `hcs`, o GET deixa de usar o verify token GLOBAL
// (META_WEBHOOK_VERIFY_TOKEN) e passa a localizar exatamente uma conexão
// pelo hash do `hcs` recebido, validando um `hookcloud_verify_token_hash`
// PRÓPRIO dessa conexão (segredo independente do callback secret usado no
// POST). `handleVerification` (o caminho global) continua byte a byte
// inalterado e é o único caminho quando `hcs` está ausente — nunca
// removido, porque pode haver consumidor legado/direct_meta.
//
// Responsabilidades desta fase, e SOMENTE estas:
//   1) GET  → verificação do webhook (hub.mode/hub.verify_token/hub.challenge)
//             — via verify token global (sem `hcs`) OU via verify token
//             individual por conexão (com `hcs`, Fase 14A). Nenhum dos
//             dois caminhos executa ação de negócio.
//   2) POST → capturar o corpo BRUTO antes de qualquer parse; extrair só
//      os dois identificadores mínimos não confiáveis (entry.id,
//      metadata.phone_number_id) para localizar a conexão candidata;
//      então, e só então, decidir entre os dois caminhos acima.
//
// O QUE ESTE ARQUIVO DELIBERADAMENTE NÃO FAZ NESTA FASE:
//   - Não chama funil, IA, wait_response, ai_receipt, venda, purchase_audit
//     ou CAPI — não há worker de produção promovido ainda. O ledger fica
//     com `processing_status = 'pending'`; um worker assíncrono real é
//     trabalho de fase futura própria.
//   - Nunca loga o corpo bruto, o App Secret, o segredo opaco HookCloud,
//     o verify token, telefone do lead ou conteúdo de mensagem em
//     `console.*` — só códigos/mensagens redigidas e não sensíveis.
//
// A separação entre normalização (`meta-webhook-normalize.ts`, pura) e
// processamento de negócio é estrutural: este handler só normaliza e
// grava — não existe nenhum caminho de código aqui que chame outra Edge
// Function ou tabela de negócio (leads, webchat_messages, purchase_audit,
// etc.). Ver também `_shared/whatsapp-provider/dispatch.ts`: a porta de
// dispatch tipada existe como contrato separado, mas DELIBERADAMENTE não
// é chamada por este arquivo nesta fase.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { verifyMetaWebhookSignature } from "../_shared/meta-webhook-signature.ts";
import { normalizeMetaWebhookPayload } from "../_shared/meta-webhook-normalize.ts";
import { computeMetaEventIdempotencyKey } from "../_shared/meta-webhook-idempotency.ts";
import type { NormalizedInboundEvent } from "../_shared/whatsapp-provider/types.ts";
import { isMetaCloudApiEnabled } from "../_shared/meta-cloud-flags.ts";
import {
  parseMetaCloudOnboardingSource,
  UnknownMetaCloudOnboardingSourceError,
} from "../_shared/whatsapp-provider/meta-onboarding-source.ts";
import {
  hashHookCloudWebhookSecret,
  verifyHookCloudVerifyToken,
  verifyHookCloudWebhookSecret,
} from "../_shared/meta-webhook-hookcloud-secret.ts";
import { resolveHookCloudPilotConnectionIds, resolveHookCloudWebhookMode } from "../_shared/meta-webhook-hookcloud-mode.ts";
import { evaluateHookCloudWebhookGate } from "../_shared/meta-webhook-hookcloud-gate.ts";
import {
  buildHookCloudQuarantineRecord,
  extractEventTimestampSeconds,
  isValidMetaWebhookPayloadShape,
  peekUntrustedWebhookIdentifiers,
} from "../_shared/meta-webhook-hookcloud-inbound.ts";
import { logMetaCloudConnectionResolved } from "../_shared/whatsapp-provider/meta-onboarding-source.ts";

const LEDGER_INSERT_TIMEOUT_MS = 8_000;
// 1 MiB — generoso o bastante para qualquer payload real da Meta (mesmo
// com múltiplos eventos batched), pequeno o bastante para rejeitar um
// corpo absurdo antes de gastar tempo/memória fazendo JSON.parse nele.
const MAX_BODY_BYTES = 1_000_000;
// Janela de tolerância para o timestamp do evento no caminho HookCloud —
// mitigação de replay tardio (ver auditoria HookCloud, Fase 8B, seção
// 21.4). Não se aplica ao caminho direct_meta (autenticado por HMAC, que
// já garante integridade/origem sem depender de timestamp).
const HOOKCLOUD_MAX_TIMESTAMP_AGE_SECONDS = 300;

// ── Cliente Supabase (injetável para teste) ─────────────────────────────

/** Superfície mínima usada aqui — evita amarrar os testes ao tipo concreto do SDK. */
export interface LedgerSupabaseLike {
  from(table: string): {
    insert(row: Record<string, unknown>): Promise<{ error: { code?: string; message?: string } | null }>;
  };
}

// Tipado como `any` na fábrica real (mesmo padrão já usado em
// supabase/functions/_shared/ai-router.ts) — o generic estrito do
// supabase-js@2 servido via esm.sh não infere bem aqui, e este módulo não
// depende de tipagem de schema.
function buildRealSupabaseClient(): LedgerSupabaseLike | null {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return null;
  return createClient(url, key) as any;
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label}_timeout`)), ms);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

// ── Persistência do ledger, com resultado tipado (nunca engole erro) ────
// Usada IDENTICAMENTE pelos dois caminhos (direct_meta e hookcloud) — é a
// MESMA tabela, a MESMA constraint de idempotência (`idempotency_key`
// único), o mesmo tratamento de 23505 como duplicata confirmada. Para
// HookCloud, `raw_payload` recebe o registro de quarentena REDIGIDO (ver
// buildHookCloudQuarantineRecord), nunca o payload bruto da Meta, e
// `signature_valid: false` sinaliza honestamente que não houve HMAC.

export type LedgerInsertOutcome =
  | { outcome: "inserted" }
  | { outcome: "duplicate_confirmed" } // 23505 real na constraint de idempotency_key — nunca confundido com "erro ao consultar"
  | { outcome: "error"; reason: string }; // qualquer outra coisa: erro de banco, timeout, exceção — NUNCA vira 200

export interface LedgerRow {
  waba_id: string;
  phone_number_id: string | null;
  event_type: string;
  status: string | null;
  wamid: string | null;
  idempotency_key: string;
  raw_payload: unknown;
  signature_valid: boolean;
  processing_status: string;
  processing_error?: string | null;
}

export async function insertLedgerRow(
  supabase: LedgerSupabaseLike,
  row: LedgerRow,
  timeoutMs: number = LEDGER_INSERT_TIMEOUT_MS,
): Promise<LedgerInsertOutcome> {
  try {
    const { error } = await withTimeout(
      supabase.from("meta_webhook_events").insert(row as unknown as Record<string, unknown>),
      timeoutMs,
      "ledger_insert",
    );
    if (!error) return { outcome: "inserted" };
    // 23505 = violação de unicidade em `idempotency_key` — é a ÚNICA
    // condição que conta como "duplicata confirmada". Qualquer outro
    // código de erro (permissão, coluna ausente, conexão) é tratado como
    // falha real, nunca como duplicata — não confundir "erro ao consultar
    // duplicidade" com "duplicata confirmada" (exigência explícita da
    // Correção 1).
    if (error.code === "23505") return { outcome: "duplicate_confirmed" };
    // Nunca logar `error.message`/`error.details` brutos aqui (podem, em
    // tese, ecoar fragmentos do valor rejeitado) — só o código, que é um
    // identificador de classe de erro do Postgres, não um dado sensível.
    return { outcome: "error", reason: `db_error_${error.code ?? "unknown"}` };
  } catch (err: any) {
    const reason = err?.message === "ledger_insert_timeout" ? "timeout" : "exception";
    return { outcome: "error", reason };
  }
}

// ── Resolução de conexão candidata (por phone_number_id) ────────────────

export interface MetaCloudConnectionCandidate {
  connectionId: string;
  organizationId: string;
  provider: string;
  wabaId: string;
  phoneNumberId: string;
  onboardingState: string;
  onboardingSourceRaw: string | null;
  hookcloudSecretHash: string | null;
  /** FASE 14A — hash do verify token individual (autentica só o GET). Independente de hookcloudSecretHash (POST). */
  hookcloudVerifyTokenHash: string | null;
}

/** Superfície mínima para a consulta de lookup — separada de `LedgerSupabaseLike` (só insert). */
export interface MetaCloudLookupSupabaseLike {
  from(table: string): {
    select(columns: string): {
      eq(column: string, value: unknown): Promise<{ data: any[] | null; error: { code?: string; message?: string } | null }>;
    };
  };
}

/**
 * Localiza a(s) conexão(ões) cujo `phone_number_id` bate com o do
 * payload. `phone_number_id` é `UNIQUE` em `evolution_instances_meta_cloud`
 * (migration 20260810120000) — o array normalmente tem 0 ou 1 elemento,
 * mas o chamador NUNCA assume isso: conta o array explicitamente (defesa
 * em profundidade, mesmo padrão já usado em `resolve.ts` para
 * `organization_id`, nunca confiar só na constraint do banco).
 */
const META_CLOUD_CANDIDATE_COLUMNS =
  "evolution_instance_id, organization_id, waba_id, phone_number_id, onboarding_state, onboarding_source, hookcloud_webhook_secret_hash, hookcloud_verify_token_hash";

/**
 * Constrói candidatos a partir de linhas de `evolution_instances_meta_cloud`
 * já buscadas — compartilhado pelos dois lookups (por phone_number_id,
 * usado no POST, e por hookcloud_webhook_secret_hash, usado no GET
 * individual da Fase 14A), para nunca duplicar a lógica de resolução de
 * `provider`/retrocompatibilidade.
 */
async function hydrateCandidates(
  supabase: MetaCloudLookupSupabaseLike,
  metaRows: any[],
): Promise<MetaCloudConnectionCandidate[]> {
  const candidates: MetaCloudConnectionCandidate[] = [];
  for (const row of metaRows) {
    const { data: connRows, error: connError } = await supabase
      .from("evolution_instances")
      .select("provider")
      .eq("id", row.evolution_instance_id);
    if (connError) throw new Error(`lookup_error_${connError.code ?? "unknown"}`);
    const providerRaw = connRows?.[0]?.provider;
    // Mesmo idioma de retrocompatibilidade de resolve.ts: provider nulo/
    // vazio na conexão-pai resolve para 'uazapi' — nunca um default
    // silencioso para 'meta_cloud'.
    const provider = providerRaw === null || providerRaw === undefined || providerRaw === "" ? "uazapi" : String(providerRaw);
    candidates.push({
      connectionId: String(row.evolution_instance_id),
      organizationId: String(row.organization_id),
      provider,
      wabaId: String(row.waba_id),
      phoneNumberId: String(row.phone_number_id),
      onboardingState: String(row.onboarding_state),
      onboardingSourceRaw: row.onboarding_source ?? null,
      hookcloudSecretHash: row.hookcloud_webhook_secret_hash ?? null,
      hookcloudVerifyTokenHash: row.hookcloud_verify_token_hash ?? null,
    });
  }
  return candidates;
}

export async function resolveMetaCloudConnectionCandidates(
  supabase: MetaCloudLookupSupabaseLike,
  phoneNumberId: string,
): Promise<MetaCloudConnectionCandidate[]> {
  const { data: metaRows, error: metaError } = await supabase
    .from("evolution_instances_meta_cloud")
    .select(META_CLOUD_CANDIDATE_COLUMNS)
    .eq("phone_number_id", phoneNumberId);

  if (metaError) throw new Error(`lookup_error_${metaError.code ?? "unknown"}`);
  if (!metaRows || metaRows.length === 0) return [];
  return await hydrateCandidates(supabase, metaRows);
}

// ── FASE 14A — resolução por hash do callback secret (GET individual) ───
// O GET oficial da Meta não inclui nenhum identificador de conexão além
// da própria URL (não há phone_number_id/WABA no corpo — só
// hub.mode/hub.verify_token/hub.challenge). Por isso o `hcs` da query
// string é o ÚNICO identificador disponível para localizar exclusivamente
// a conexão HookCloud: em vez de comparar o segredo bruto em memória
// contra N candidatos, ele já FUNCIONA como chave de busca (hash SHA-256
// determinístico do segredo — mesmo princípio de um token de sessão
// opaco), reduzindo a zero ou exatamente uma conexão candidata antes de
// qualquer outra checagem.
export async function resolveMetaCloudConnectionByCallbackSecretHash(
  supabase: MetaCloudLookupSupabaseLike,
  callbackSecretHash: string,
): Promise<MetaCloudConnectionCandidate[]> {
  const { data: metaRows, error: metaError } = await supabase
    .from("evolution_instances_meta_cloud")
    .select(META_CLOUD_CANDIDATE_COLUMNS)
    .eq("hookcloud_webhook_secret_hash", callbackSecretHash);

  if (metaError) throw new Error(`lookup_error_${metaError.code ?? "unknown"}`);
  if (!metaRows || metaRows.length === 0) return [];
  return await hydrateCandidates(supabase, metaRows);
}

// ── Verificação (GET) ────────────────────────────────────────────────────
// Inalterada nesta fase. Não tem nenhuma consulta por conexão/Phone
// Number ID — só compara `hub.verify_token` contra um único valor global
// — por isso já satisfaz, por construção, "challenge não é retornado
// para conexão errada" e "nenhuma informação revela se um Phone Number ID
// existe": não há nenhum Phone Number ID envolvido neste caminho.

export function handleVerification(req: Request, env: { get(key: string): string | undefined } = Deno.env): Response {
  const url = new URL(req.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");
  const expectedToken = env.get("META_WEBHOOK_VERIFY_TOKEN");

  if (mode === "subscribe" && expectedToken && token === expectedToken) {
    return new Response(challenge ?? "", { status: 200 });
  }
  return new Response("Forbidden", { status: 403 });
}

// ── FASE 14A — GET individual por conexão HookCloud ──────────────────────
// Caminho NOVO, só alcançado quando a query string traz `hcs` (o mesmo
// parâmetro já usado no POST para o callback secret — nenhum segundo
// parâmetro inventado). `handleVerification` acima permanece
// BYTE A BYTE inalterada e continua sendo o único caminho para
// `direct_meta`/legado (ausência de `hcs`) — o verify token global
// (META_WEBHOOK_VERIFY_TOKEN) não foi removido nem por este caminho: ele
// só deixa de ser usado quando `hcs` está presente, nunca é substituído
// globalmente.
//
// Falha fechada, resposta UNIFORME em todo motivo de rejeição — nunca
// revela se: a conexão existe; o hcs está correto/incorreto; o verify
// token está correto/incorreto; a organização; o WABA ou o Phone Number
// ID. Nenhuma ação de negócio é executada aqui — só localizar a conexão,
// validar dois segredos independentes, e devolver o challenge.

const HOOKCLOUD_GET_COMPATIBLE_ONBOARDING_STATES = new Set(["pending", "active"]);

function hookCloudForbidden(): Response {
  return new Response("Forbidden", { status: 403 });
}

export interface HookCloudVerificationDeps {
  /** Localiza a(s) conexão(ões) cujo hookcloud_webhook_secret_hash bate com o hash do `hcs` recebido. */
  resolveConnectionByCallbackSecretHash: (callbackSecretHash: string) => Promise<MetaCloudConnectionCandidate[]>;
}

export async function handleHookCloudVerification(
  req: Request,
  hcs: string,
  deps: HookCloudVerificationDeps,
): Promise<Response> {
  const url = new URL(req.url);
  const mode = url.searchParams.get("hub.mode");
  const verifyToken = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");

  if (mode !== "subscribe" || !verifyToken) {
    return hookCloudForbidden();
  }

  // O hcs recebido JÁ É a chave de busca (hash determinístico) — não há
  // comparação byte a byte de segredo bruto aqui contra N candidatos; a
  // consulta ao banco por igualdade de hash reduz a zero ou exatamente
  // uma linha antes de qualquer outra checagem.
  const callbackSecretHash = await hashHookCloudWebhookSecret(hcs);

  let candidates: MetaCloudConnectionCandidate[];
  try {
    candidates = await deps.resolveConnectionByCallbackSecretHash(callbackSecretHash);
  } catch {
    return hookCloudForbidden();
  }
  // Resposta uniforme para zero OU múltiplas conexões — nunca distingue
  // as duas (mesma exigência de anti-enumeração já aplicada ao POST).
  if (candidates.length !== 1) {
    return hookCloudForbidden();
  }
  const candidate = candidates[0];

  if (candidate.provider !== "meta_cloud") {
    return hookCloudForbidden();
  }

  let onboardingSource: "hookcloud" | "direct_meta" | null;
  try {
    onboardingSource = parseMetaCloudOnboardingSource(candidate.onboardingSourceRaw);
  } catch {
    return hookCloudForbidden();
  }
  if (onboardingSource !== "hookcloud") {
    return hookCloudForbidden();
  }

  if (!HOOKCLOUD_GET_COMPATIBLE_ONBOARDING_STATES.has(candidate.onboardingState)) {
    return hookCloudForbidden();
  }

  // O verify token NUNCA autentica sozinho — o hcs já precisou localizar
  // exatamente 1 conexão antes de chegarmos aqui. E o callback secret
  // (hcs) sozinho também nunca basta: sem um hub.verify_token válido para
  // ESSA MESMA conexão, o GET continua sendo rejeitado.
  const verifyTokenValid = await verifyHookCloudVerifyToken(verifyToken, candidate.hookcloudVerifyTokenHash);
  if (!verifyTokenValid) {
    return hookCloudForbidden();
  }

  return new Response(challenge ?? "", { status: 200 });
}

/** Decide entre o GET individual HookCloud (`hcs` presente) e o GET global inalterado (`hcs` ausente). */
export async function handleGetRequest(req: Request, deps: HandleInboundEventDeps): Promise<Response> {
  const url = new URL(req.url);
  const hcs = url.searchParams.get("hcs");
  if (!hcs) {
    return handleVerification(req);
  }
  if (!deps.resolveConnectionByCallbackSecretHash) {
    // Dependência não injetada (ex.: ambiente real ainda sem wiring) —
    // falha fechada, mesma resposta uniforme, nunca cai para o verify
    // token global (isso misturaria os dois modos).
    return hookCloudForbidden();
  }
  return await handleHookCloudVerification(req, hcs, {
    resolveConnectionByCallbackSecretHash: deps.resolveConnectionByCallbackSecretHash,
  });
}

// ── Evento inbound (POST) ────────────────────────────────────────────────

export interface HandleInboundEventDeps {
  supabase: LedgerSupabaseLike | null;
  appSecret: string | undefined;
  /** Localiza conexão(ões) candidata(s) por phone_number_id — injetável para teste. */
  resolveConnectionCandidates: (phoneNumberId: string) => Promise<MetaCloudConnectionCandidate[]>;
  /** Só para teste — encurta o timeout de persistência sem esperar o valor real de produção. */
  ledgerTimeoutMs?: number;
  /** Só para teste — env alternativo para HOOKCLOUD_WEBHOOK_MODE/HOOKCLOUD_WEBHOOK_PILOT_CONNECTION_IDS, em vez de Deno.env real. */
  hookCloudEnv?: { get(key: string): string | undefined };
  /** Só para teste — substitui isMetaCloudApiEnabled (flag por organização) sem precisar mockar uma consulta completa. */
  isOrganizationAllowedForMetaCloud?: (organizationId: string) => Promise<boolean>;
  /** FASE 14A — localiza a conexão candidata pelo hash do callback secret, usado exclusivamente pelo GET individual HookCloud (`hcs` na query string). Opcional: ausente => GET com `hcs` falha fechado (nunca cai para o verify token global). */
  resolveConnectionByCallbackSecretHash?: (callbackSecretHash: string) => Promise<MetaCloudConnectionCandidate[]>;
}

function jsonError(status: number, code: string): Response {
  return new Response(JSON.stringify({ error_code: code }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * Etapa comum inicial (Fase 12A): valida tamanho, faz parsing JSON
 * estrito, valida schema básico, extrai só os 2 identificadores não
 * confiáveis, localiza exatamente 1 conexão candidata, e decide o modo —
 * NUNCA por parâmetro fornecido pelo cliente, sempre pelo
 * `onboarding_source` real da conexão resolvida no banco. Delega o
 * processamento real para `processDirectMetaEvent`/`processHookCloudEvent`.
 */
export async function handleInboundEvent(req: Request, deps: HandleInboundEventDeps): Promise<Response> {
  // Corpo bruto capturado ANTES de qualquer JSON.parse — obrigatório para a
  // validação de assinatura (caminho direct_meta) ser sobre os bytes
  // exatos recebidos.
  const rawBody = await req.text();

  if (rawBody.length > MAX_BODY_BYTES) {
    return jsonError(413, "payload_too_large");
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    console.warn("[meta-cloud-webhook] JSON malformado", JSON.stringify({ bodyLength: rawBody.length }));
    return jsonError(400, "malformed_json");
  }

  if (!isValidMetaWebhookPayloadShape(payload)) {
    return jsonError(400, "invalid_payload_shape");
  }

  // Identificadores NÃO CONFIÁVEIS — só servem para localizar uma conexão
  // candidata; nenhuma decisão de autorização é tomada com base neles
  // isoladamente.
  const { entryId, phoneNumberId } = peekUntrustedWebhookIdentifiers(payload);
  if (!entryId || !phoneNumberId) {
    return jsonError(400, "missing_identifiers");
  }

  if (!deps.supabase) {
    console.error("[meta-cloud-webhook] SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY ausentes — ledger indisponível");
    return jsonError(500, "ledger_unavailable");
  }

  let candidates: MetaCloudConnectionCandidate[];
  try {
    candidates = await deps.resolveConnectionCandidates(phoneNumberId);
  } catch {
    console.error("[meta-cloud-webhook] falha ao resolver conexão candidata");
    return jsonError(500, "connection_lookup_error");
  }

  // Resposta UNIFORME para todo motivo de configuração desconhecida/
  // ambígua abaixo (zero conexões, múltiplas conexões, provider errado,
  // WABA divergente, onboarding_source desconhecido) — nunca revela QUAL
  // desses motivos ocorreu, para não permitir enumerar Phone Number
  // IDs/WABAs válidos por diferença de resposta.
  if (candidates.length !== 1) {
    return jsonError(401, "unknown_configuration");
  }
  const candidate = candidates[0];

  if (candidate.provider !== "meta_cloud") {
    return jsonError(401, "unknown_configuration");
  }
  if (candidate.wabaId !== entryId) {
    return jsonError(401, "unknown_configuration");
  }

  let onboardingSource: "hookcloud" | "direct_meta" | null;
  try {
    onboardingSource = parseMetaCloudOnboardingSource(candidate.onboardingSourceRaw);
  } catch (err) {
    if (err instanceof UnknownMetaCloudOnboardingSourceError) {
      return jsonError(401, "unknown_configuration");
    }
    throw err;
  }

  // Seleção de modo — exclusivamente pelo dado real da conexão, nunca por
  // header/query param fornecido pelo cliente.
  if (onboardingSource === "direct_meta") {
    return await processDirectMetaEvent(rawBody, req, payload, deps);
  }
  if (onboardingSource === "hookcloud") {
    return await processHookCloudEvent(payload, entryId, phoneNumberId, candidate, req, deps);
  }
  // NULL/legado — falha fechada, mesma resposta uniforme.
  return jsonError(401, "unknown_configuration");
}

// ── Caminho direct_meta — HMAC, INALTERADO em relação à Fase 2A/2A.3 ────
// Único ponto de entrada agora é handleInboundEvent (que já garantiu, ANTES
// de chegar aqui, que existe exatamente 1 conexão meta_cloud/direct_meta
// candidata) — mas a lógica interna abaixo é BYTE A BYTE a mesma de antes:
// mesmo algoritmo HMAC, mesmo header, mesmo App Secret (global, via
// deps.appSecret — não passou a ser por conexão), mesma comparação em
// tempo constante, mesmos códigos de rejeição, mesmas ações posteriores
// (normalizar + gravar no ledger com signature_valid:true), mesma
// idempotência (23505 => duplicate_confirmed).

async function processDirectMetaEvent(
  rawBody: string,
  req: Request,
  payload: unknown,
  deps: HandleInboundEventDeps,
): Promise<Response> {
  const signatureHeader = req.headers.get("x-hub-signature-256");

  const verification = await verifyMetaWebhookSignature(rawBody, signatureHeader, deps.appSecret);

  if (!verification.valid) {
    // FASE 2A.3 — Correção 2 do Gate 2A.2: uma requisição com assinatura
    // ausente/malformada/inválida NUNCA é inserida no ledger de eventos
    // autenticados (`meta_webhook_events`) — nem sequer como tentativa
    // "best-effort". Só log com METADADOS SEGUROS (nunca o corpo, nunca o
    // header de assinatura, nunca o App Secret).
    console.warn(
      "[meta-cloud-webhook] assinatura rejeitada",
      JSON.stringify({ reason: verification.reason, bodyLength: rawBody.length }),
    );
    return jsonError(401, "invalid_signature");
  }

  // deps.supabase já confirmado não-nulo por handleInboundEvent antes de chamar este caminho.
  const supabase = deps.supabase as LedgerSupabaseLike;

  const events: NormalizedInboundEvent[] = normalizeMetaWebhookPayload(payload);

  const outcomes: LedgerInsertOutcome[] = [];
  for (const event of events) {
    const wabaId = (event.raw as any)?.wabaId ?? "";
    const phoneNumberId = (event.raw as any)?.phoneNumberId ?? null;
    const idempotencyKey = await computeMetaEventIdempotencyKey(event);
    const outcome = await insertLedgerRow(supabase, {
      waba_id: wabaId,
      phone_number_id: phoneNumberId,
      event_type: event.kind,
      status: event.status ?? null,
      wamid: event.providerMessageId ?? null,
      idempotency_key: idempotencyKey,
      raw_payload: event.raw as any,
      signature_valid: true,
      processing_status: "pending",
    }, deps.ledgerTimeoutMs);
    outcomes.push(outcome);
    if (outcome.outcome === "error") {
      console.error("[meta-cloud-webhook] falha ao persistir evento no ledger:", outcome.reason);
    }
  }

  const anyFailed = outcomes.some((o) => o.outcome === "error");
  if (anyFailed) {
    return jsonError(503, "ledger_persistence_incomplete");
  }

  const insertedCount = outcomes.filter((o) => o.outcome === "inserted").length;
  const duplicateCount = outcomes.filter((o) => o.outcome === "duplicate_confirmed").length;

  return new Response(
    JSON.stringify({ received: events.length, inserted: insertedCount, duplicates: duplicateCount }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

// ── Caminho hookcloud — gate de 13 condições, NUNCA processamento normal ─
// Termina SEMPRE em `return` logo após a inserção no ledger/quarentena —
// estruturalmente impossível de continuar para qualquer ação de negócio
// (não há nenhum código depois deste `return` que possa ser alcançado
// para este caminho; a próxima linha executada por
// `handleInboundEvent` para qualquer chamada futura é sempre o início de
// uma NOVA requisição HTTP, nunca uma continuação desta).

async function processHookCloudEvent(
  payload: unknown,
  entryId: string,
  phoneNumberId: string,
  candidate: MetaCloudConnectionCandidate,
  req: Request,
  deps: HandleInboundEventDeps,
): Promise<Response> {
  const supabase = deps.supabase as LedgerSupabaseLike;

  // Segredo opaco: query parameter (mesmo formato já usado para
  // hub.verify_token no GET — ver auditoria HookCloud, Fase 8B/11A).
  const secretFromRequest = new URL(req.url).searchParams.get("hcs");
  const secretValid = await verifyHookCloudWebhookSecret(secretFromRequest, candidate.hookcloudSecretHash);

  const mode = resolveHookCloudWebhookMode(deps.hookCloudEnv);
  const pilotConnectionIds = resolveHookCloudPilotConnectionIds(deps.hookCloudEnv);
  const organizationAllowed = deps.isOrganizationAllowedForMetaCloud
    ? await deps.isOrganizationAllowedForMetaCloud(candidate.organizationId)
    : await isMetaCloudApiEnabled(supabase as any, candidate.organizationId);
  const timestampSeconds = extractEventTimestampSeconds(payload);

  // As 13 condições avaliadas em bloco — `isDuplicateInLedger: false`
  // aqui NÃO é uma suposição: a duplicata real só é decidida de forma
  // atômica pela constraint UNIQUE do banco no insertLedgerRow abaixo
  // (nunca por uma pré-checagem separada, que criaria uma corrida entre
  // "checar" e "inserir" — exigência explícita de concorrência/
  // idempotência desta fase). Este gate decide apenas as condições 1–12
  // (autenticação/configuração); a condição 13 (duplicata) é resolvida
  // depois, pelo próprio insert.
  const decision = evaluateHookCloudWebhookGate({
    mode,
    organizationAllowed,
    connectionId: candidate.connectionId,
    pilotConnectionIds,
    onboardingState: candidate.onboardingState,
    provider: candidate.provider,
    onboardingSource: "hookcloud",
    secretValid,
    payloadEntryId: entryId,
    connectionWabaId: candidate.wabaId,
    payloadPhoneNumberId: phoneNumberId,
    connectionPhoneNumberId: candidate.phoneNumberId,
    matchedConnectionCount: 1,
    eventTimestampSeconds: timestampSeconds,
    nowSeconds: Math.floor(Date.now() / 1000),
    maxAgeSeconds: HOOKCLOUD_MAX_TIMESTAMP_AGE_SECONDS,
    payloadSchemaValid: true, // já validado em handleInboundEvent antes de chegar aqui
    isDuplicateInLedger: false,
  });

  if (decision.outcome === "reject") {
    return jsonError(401, "hookcloud_rejected");
  }
  // decision.outcome === "quarantine" (nunca "duplicate_skip" aqui, já
  // que isDuplicateInLedger sempre é passado como false nesta chamada).

  // emit_safe_log — só provider/onboarding_source/connection_id/organization_id.
  logMetaCloudConnectionResolved({
    provider: "meta_cloud",
    onboardingSource: "hookcloud",
    connectionId: candidate.connectionId,
    organizationId: candidate.organizationId,
  });

  const events: NormalizedInboundEvent[] = normalizeMetaWebhookPayload(payload);
  const outcomes: LedgerInsertOutcome[] = [];
  for (const event of events) {
    const idempotencyKey = await computeMetaEventIdempotencyKey(event);
    // store_quarantined_payload: registro REDIGIDO, nunca o payload bruto
    // (nunca telefone do lead, conteúdo/mídia da mensagem ou token).
    const quarantineRecord = buildHookCloudQuarantineRecord({
      connectionId: candidate.connectionId,
      organizationId: candidate.organizationId,
      provider: "meta_cloud",
      onboardingSource: "hookcloud",
      eventKind: event.kind,
      wabaId: candidate.wabaId,
      phoneNumberId: candidate.phoneNumberId,
      reasonCode: decision.reasonCode,
    });
    // register_ledger_entry — MESMA função/tabela/constraint do caminho
    // direct_meta; a mesma linha SERVE como ledger e como registro de
    // quarentena (não há uma segunda gravação separada — duplicata
    // detectada aqui é a MESMA duplicata do ledger, atomicamente, via
    // 23505 na constraint de idempotency_key).
    const outcome = await insertLedgerRow(supabase, {
      waba_id: candidate.wabaId,
      phone_number_id: candidate.phoneNumberId,
      event_type: event.kind,
      status: event.status ?? null,
      wamid: event.providerMessageId ?? null,
      idempotency_key: idempotencyKey,
      raw_payload: quarantineRecord,
      signature_valid: false, // nunca houve HMAC neste caminho — nunca finge que houve
      processing_status: "pending",
    }, deps.ledgerTimeoutMs);
    outcomes.push(outcome);
    if (outcome.outcome === "error") {
      console.error("[meta-cloud-webhook] falha ao persistir evento HookCloud no ledger:", outcome.reason);
    }
  }

  const anyFailed = outcomes.some((o) => o.outcome === "error");
  if (anyFailed) {
    // Falha após o gate ter aprovado, mas antes da persistência mínima
    // necessária — resposta NÃO-2xx (retry seguro), nunca ACK. Nada foi
    // marcado como processado.
    return jsonError(503, "ledger_persistence_incomplete");
  }

  // respond_fast_ack — única ação restante. insertedCount conta eventos
  // NOVOS colocados em quarentena nesta chamada; duplicateCount conta
  // eventos já vistos antes (ACK sem repetir a gravação de quarentena).
  const insertedCount = outcomes.filter((o) => o.outcome === "inserted").length;
  const duplicateCount = outcomes.filter((o) => o.outcome === "duplicate_confirmed").length;

  return new Response(
    JSON.stringify({ received: events.length, quarantined: insertedCount, duplicates: duplicateCount }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

// ── Roteamento por método HTTP (testável separadamente do entry point) ──

export async function routeRequest(req: Request, deps: HandleInboundEventDeps): Promise<Response> {
  if (req.method === "GET") return handleGetRequest(req, deps);
  if (req.method === "POST") return handleInboundEvent(req, deps);
  return new Response("Method Not Allowed", { status: 405 });
}

// ── Entry point real (não usado pelos testes, que chamam as funções acima
// diretamente) — `import.meta.main` evita que `Deno.serve` tente abrir uma
// porta de rede quando este arquivo é apenas IMPORTADO (ex.: pelos testes
// em index.test.ts), que rodam sem `--allow-net`.

if (import.meta.main) {
  const realSupabase = buildRealSupabaseClient();
  Deno.serve(async (req) => {
    return await routeRequest(req, {
      supabase: realSupabase,
      appSecret: Deno.env.get("META_APP_SECRET"),
      resolveConnectionCandidates: (phoneNumberId) =>
        resolveMetaCloudConnectionCandidates(realSupabase as unknown as MetaCloudLookupSupabaseLike, phoneNumberId),
      resolveConnectionByCallbackSecretHash: (callbackSecretHash) =>
        resolveMetaCloudConnectionByCallbackSecretHash(realSupabase as unknown as MetaCloudLookupSupabaseLike, callbackSecretHash),
    });
  });
}
