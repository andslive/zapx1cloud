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
// resultado (erro de banco, timeout, exceção) responde 500, para a Meta
// tentar de novo.
//
// Responsabilidades desta fase, e SOMENTE estas:
//   1) GET  → verificação do webhook (hub.mode/hub.verify_token/hub.challenge)
//   2) POST → capturar o corpo BRUTO antes de qualquer parse, validar
//      X-Hub-Signature-256 (HMAC-SHA256, timing-safe), persistir cada
//      evento normalizado no ledger `meta_webhook_events` de forma
//      confirmada, só então responder.
//
// O QUE ESTE ARQUIVO DELIBERADAMENTE NÃO FAZ NESTA FASE:
//   - Não chama funil, IA, wait_response, ai_receipt, venda, purchase_audit
//     ou CAPI — não há worker de produção promovido ainda. O ledger fica
//     com `processing_status = 'pending'`; um worker assíncrono real é
//     trabalho de Fase 2B.
//   - Nunca loga o corpo bruto, o App Secret, o verify token nem detalhes
//     internos de erro de banco em `console.*` — só códigos/mensagens
//     redigidas e não sensíveis.
//
// A separação entre normalização (`meta-webhook-normalize.ts`, pura) e
// processamento de negócio é estrutural: este handler só normaliza e
// grava — não existe nenhum caminho de código aqui que chame outra Edge
// Function ou tabela de negócio (leads, webchat_messages, purchase_audit,
// etc.). Ver também `_shared/whatsapp-provider/dispatch.ts` (Correção 4):
// a porta de dispatch tipada existe como contrato separado, mas
// DELIBERADAMENTE não é chamada por este arquivo nesta fase.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { verifyMetaWebhookSignature } from "../_shared/meta-webhook-signature.ts";
import { normalizeMetaWebhookPayload } from "../_shared/meta-webhook-normalize.ts";
import { computeMetaEventIdempotencyKey } from "../_shared/meta-webhook-idempotency.ts";
import type { NormalizedInboundEvent } from "../_shared/whatsapp-provider/types.ts";

const LEDGER_INSERT_TIMEOUT_MS = 8_000;

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

// ── Verificação (GET) ────────────────────────────────────────────────────

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

// ── Evento inbound (POST) ────────────────────────────────────────────────

export interface HandleInboundEventDeps {
  supabase: LedgerSupabaseLike | null;
  appSecret: string | undefined;
  /** Só para teste — encurta o timeout de persistência sem esperar o valor real de produção. */
  ledgerTimeoutMs?: number;
}

function jsonError(status: number, code: string): Response {
  return new Response(JSON.stringify({ error_code: code }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function handleInboundEvent(req: Request, deps: HandleInboundEventDeps): Promise<Response> {
  // Corpo bruto capturado ANTES de qualquer JSON.parse — obrigatório para a
  // validação de assinatura ser sobre os bytes exatos recebidos.
  const rawBody = await req.text();
  const signatureHeader = req.headers.get("x-hub-signature-256");

  const verification = await verifyMetaWebhookSignature(rawBody, signatureHeader, deps.appSecret);

  if (!verification.valid) {
    // FASE 2A.3 — Correção 2 do Gate 2A.2: uma requisição com assinatura
    // ausente/malformada/inválida NUNCA é inserida no ledger de eventos
    // autenticados (`meta_webhook_events`) — nem sequer como tentativa
    // "best-effort". O gate anterior apontou a contradição entre a tabela
    // do relatório ("persistência best-effort") e os testes ("não
    // persiste"): a implementação real ATÉ AQUI inseria, o texto do
    // relatório estava certo sobre a INTENÇÃO, não sobre o código. Corrigido
    // removendo o insert por completo — só log com METADADOS SEGUROS (nunca
    // o corpo, nunca o header de assinatura, nunca o App Secret). Não é
    // criada nenhuma trilha de auditoria separada nesta fase (instrução
    // explícita: não criar essa trilha se ainda não existe).
    console.warn(
      "[meta-cloud-webhook] assinatura rejeitada",
      JSON.stringify({ reason: verification.reason, bodyLength: rawBody.length }),
    );
    return jsonError(401, "invalid_signature");
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    // Mesma correção: JSON inválido (mesmo com assinatura válida) NUNCA é
    // inserido no ledger autenticado — só log com metadados seguros
    // (nunca o corpo bruto).
    console.warn(
      "[meta-cloud-webhook] JSON malformado com assinatura válida",
      JSON.stringify({ bodyLength: rawBody.length }),
    );
    return jsonError(400, "malformed_json");
  }

  // "Configuração Meta inexistente" (aqui: impossibilidade de montar um
  // client Supabase, por env ausente) nunca retorna sucesso falso —
  // resposta 500, para a Meta tentar de novo depois que a configuração for
  // corrigida.
  if (!deps.supabase) {
    console.error("[meta-cloud-webhook] SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY ausentes — ledger indisponível");
    return jsonError(500, "ledger_unavailable");
  }

  const events: NormalizedInboundEvent[] = normalizeMetaWebhookPayload(payload);

  const outcomes: LedgerInsertOutcome[] = [];
  for (const event of events) {
    const wabaId = (event.raw as any)?.wabaId ?? "";
    const phoneNumberId = (event.raw as any)?.phoneNumberId ?? null;
    const idempotencyKey = await computeMetaEventIdempotencyKey(event);
    const outcome = await insertLedgerRow(deps.supabase, {
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
      // Não loga o conteúdo do evento — só a razão da falha (código de
      // classe de erro, nunca dado do payload).
      console.error("[meta-cloud-webhook] falha ao persistir evento no ledger:", outcome.reason);
    }
  }

  const anyFailed = outcomes.some((o) => o.outcome === "error");
  if (anyFailed) {
    // Pelo menos um evento não foi confirmadamente persistido nem
    // confirmadamente duplicado — resposta NÃO-2xx, para a Meta reenviar o
    // payload inteiro. Eventos que já foram persistidos com sucesso nesta
    // mesma tentativa não são reprocessados no reenvio: a constraint de
    // idempotência os trata como duplicata confirmada na próxima chamada.
    return jsonError(503, "ledger_persistence_incomplete");
  }

  const insertedCount = outcomes.filter((o) => o.outcome === "inserted").length;
  const duplicateCount = outcomes.filter((o) => o.outcome === "duplicate_confirmed").length;

  return new Response(
    JSON.stringify({ received: events.length, inserted: insertedCount, duplicates: duplicateCount }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

// ── Entry point real (não usado pelos testes, que chamam as funções acima
// diretamente) — `import.meta.main` evita que `Deno.serve` tente abrir uma
// porta de rede quando este arquivo é apenas IMPORTADO (ex.: pelos testes
// em index.test.ts), que rodam sem `--allow-net`.

if (import.meta.main) {
  Deno.serve(async (req) => {
    if (req.method === "GET") return handleVerification(req);
    if (req.method === "POST") {
      return handleInboundEvent(req, {
        supabase: buildRealSupabaseClient(),
        appSecret: Deno.env.get("META_APP_SECRET"),
      });
    }
    return new Response("Method Not Allowed", { status: 405 });
  });
}
