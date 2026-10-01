// Reivindicação ATÔMICA de uma espera ("Aguarda resposta"/pergunta).
//
// Antes: a resposta do lead e o timeout (cron/manual) decidiam "avançar" em
// memória e só persistiam o resultado no FIM da execução, depois de enviar as
// mensagens. Duas execuções simultâneas sobre a mesma espera podiam avançar por
// caminhos diferentes (e mandar as duas mensagens).
//
// Agora, ANTES de qualquer envio, quem vai avançar a espera a reivindica gravando
// `__waiting_input.claimed_by` com checagem otimista por `updated_at` (a coluna é
// mantida por trigger a cada UPDATE). Só um dos dois vence; o outro recua sem
// enviar nada. O marcador é transitório: a persistência normal ao fim do avanço
// regrava `flow_variables` sem ele. Se a execução cair no meio, o marcador expira
// (ttl) e a espera volta a poder ser reivindicada.
//
// Pura em relação ao cliente (injetado) — testável sem rede.

import { waitKeyOf } from "./funnel-resume.ts";

export type ClaimBy = "answer" | "timeout";
export type ClaimResult =
  | { won: true }
  | { won: false; reason: "stale" | "already_claimed" | "conflict" | "error" | "not_found" };

export interface ClaimArgs {
  conversationId: string;
  /** bloco em que a conversa deve estar (sempre exigido) */
  expectedBlockId: string | null | undefined;
  /** chave completa da espera (fluxo|bloco|pergunta); quando ausente, só o bloco é exigido */
  expectedWaitKey?: string | null;
  by: ClaimBy;
  nowMs: number;
  ttlMs?: number;
  maxTries?: number;
  /** colunas extras gravadas NA MESMA escrita atômica, só se a reivindicação vencer (ex.: last_message_at) */
  extra?: Record<string, unknown>;
}

export const CLAIM_TTL_MS = 5 * 60_000;

// deno-lint-ignore no-explicit-any
type Client = any;

export async function claimWait(supabase: Client, a: ClaimArgs): Promise<ClaimResult> {
  const ttl = a.ttlMs ?? CLAIM_TTL_MS;
  const tries = a.maxTries ?? 3;
  for (let i = 0; i < tries; i++) {
    const { data: fresh, error } = await supabase
      .from("webchat_conversations")
      .select("id, current_flow_id, current_block_id, flow_variables, updated_at")
      .eq("id", a.conversationId)
      .maybeSingle();
    if (error) return { won: false, reason: "error" };
    if (!fresh) return { won: false, reason: "not_found" };
    if ((fresh.current_block_id ?? null) !== (a.expectedBlockId ?? null)) return { won: false, reason: "stale" };
    if (a.expectedWaitKey && waitKeyOf(fresh) !== a.expectedWaitKey) return { won: false, reason: "stale" };
    const wi = fresh.flow_variables?.__waiting_input;
    if (!wi) return { won: false, reason: "stale" };
    if (wi.claimed_by && a.nowMs - Date.parse(wi.claimed_at ?? "") < ttl) return { won: false, reason: "already_claimed" };

    const next = {
      ...fresh.flow_variables,
      __waiting_input: { ...wi, claimed_by: a.by, claimed_at: new Date(a.nowMs).toISOString() },
    };
    const { data: rows, error: upErr } = await supabase
      .from("webchat_conversations")
      .update({ flow_variables: next, ...(a.extra ?? {}) })
      .eq("id", a.conversationId)
      .eq("updated_at", fresh.updated_at)
      .select("id");
    if (upErr) return { won: false, reason: "error" };
    if (Array.isArray(rows) && rows.length > 0) return { won: true };
    // 0 linhas: alguém gravou entre a leitura e a escrita — relê e decide de novo
  }
  return { won: false, reason: "conflict" };
}

export type ReleaseResult = "released" | "stale" | "already_claimed" | "conflict" | "error";

/**
 * Timeout vencido numa espera SEM saída de timeout conectada: não há o que
 * executar. Libera o timer (bot_locked_until = null) e marca a espera como
 * tratada, SEM enviar nada, SEM avançar bloco e SEM tocar em last_message_at.
 * A espera continua aberta para uma resposta futura do lead.
 */
export async function releaseTimeoutWithoutPath(
  supabase: Client,
  a: { conversationId: string; expectedBlockId: string | null | undefined; expectedWaitKey?: string | null; nowMs: number; ttlMs?: number },
): Promise<ReleaseResult> {
  const ttl = a.ttlMs ?? CLAIM_TTL_MS;
  for (let i = 0; i < 3; i++) {
    const { data: fresh, error } = await supabase
      .from("webchat_conversations")
      .select("id, current_flow_id, current_block_id, flow_variables, updated_at")
      .eq("id", a.conversationId)
      .maybeSingle();
    if (error || !fresh) return "error";
    if ((fresh.current_block_id ?? null) !== (a.expectedBlockId ?? null)) return "stale";
    if (a.expectedWaitKey && waitKeyOf(fresh) !== a.expectedWaitKey) return "stale";
    const wi = fresh.flow_variables?.__waiting_input;
    if (!wi) return "stale";
    if (wi.claimed_by && a.nowMs - Date.parse(wi.claimed_at ?? "") < ttl) return "already_claimed";
    const next = {
      ...fresh.flow_variables,
      __waiting_input: { ...wi, timeout_handled_at: new Date(a.nowMs).toISOString(), timeout_handled_reason: "no_timeout_path" },
    };
    const { data: rows, error: upErr } = await supabase
      .from("webchat_conversations")
      .update({ bot_locked_until: null, flow_variables: next })
      .eq("id", a.conversationId)
      .eq("updated_at", fresh.updated_at)
      .select("id");
    if (upErr) return "error";
    if (Array.isArray(rows) && rows.length > 0) return "released";
  }
  return "conflict";
}

/**
 * A perda da reivindicação é DEFINITIVA (a execução deve recuar)?
 *  - timeout: sempre. Se falhou por qualquer motivo, o cron tenta de novo no ciclo seguinte.
 *  - resposta do lead: só quando OUTRA execução comprovadamente já reivindicou a espera
 *    ("already_claimed") ou a espera mudou ("stale"). Em erro de infraestrutura
 *    ("error", "not_found", "conflict") a resposta NÃO se repete, então mantém o
 *    comportamento anterior (segue sem a proteção) em vez de descartar a mensagem do lead.
 */
export function claimLossIsFinal(by: ClaimBy, r: ClaimResult): boolean {
  if (r.won) return false;
  if (by === "timeout") return true;
  return r.reason === "already_claimed" || r.reason === "stale";
}
