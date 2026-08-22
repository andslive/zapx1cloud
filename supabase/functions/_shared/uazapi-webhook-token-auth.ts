// Fase 18K — autenticação por segredo compartilhado por instância no
// webhook inbound da UazAPI.
//
// MODELO DE SEGURANÇA (documentar explicitamente, não superestimar):
// - O campo `token` que chega no corpo de cada evento UazAPI é o MESMO
//   segredo por instância já usado hoje para autenticar chamadas de
//   SAÍDA (`evolution_instances.instance_token`, ver
//   `whatsapp-proxy/index.ts`, header `token` em `waFetch`).
// - Isto é um segredo compartilhado (shared secret) por instância — NÃO
//   é uma assinatura HMAC sobre o corpo da requisição. Não prova
//   integridade criptográfica de cada campo do payload, e não protege
//   contra replay se o próprio token vazar. Classificação correta:
//   SHARED_SECRET_INSTANCE_AUTHENTICATION (nunca "assinatura oficial" ou
//   "equivalente a HMAC").
// - Nunca deve ser logado, nunca deve aparecer em resposta HTTP, e nunca
//   deve ser usado como filtro `.eq()` de uma query SQL (evitar
//   enumeração/timing via índice do banco) — a comparação acontece em
//   memória, em tempo constante, sobre candidatos já buscados pelo
//   identificador textual (nome/instance_id), exatamente como antes da
//   Fase 18K.
//
// Funções puras, sem I/O de rede — testáveis isoladamente via `deno test`.

/**
 * Comparação em tempo constante entre duas strings arbitrárias (não
 * necessariamente hex/tamanho fixo, ao contrário de
 * `timingSafeEqualHex` em `meta-webhook-signature.ts`, feita para o
 * caso de tokens opacos da UazAPI).
 */
export function timingSafeEqualString(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const aBytes = enc.encode(a);
  const bBytes = enc.encode(b);
  if (aBytes.length !== bBytes.length) {
    // Ainda percorre `b` inteiro comparando contra `a` (módulo do
    // tamanho de `a`) para não vazar o tamanho de forma óbvia via
    // contagem de iterações — proteção best-effort, não uma prova
    // formal de constant-time em JS/V8.
    let dummy = 0;
    for (let i = 0; i < bBytes.length; i++) {
      dummy |= bBytes[i] ^ (aBytes[i % Math.max(aBytes.length, 1)] || 0);
    }
    return false;
  }
  let diff = 0;
  for (let i = 0; i < aBytes.length; i++) diff |= aBytes[i] ^ bBytes[i];
  return diff === 0;
}

/**
 * Extrai o campo `token` do corpo bruto do webhook, validando tipo e
 * não-vacuidade. Nunca loga o valor. Retorna `null` para qualquer
 * formato inesperado (payload não-objeto, campo ausente, tipo errado,
 * string vazia) — falha fechada por padrão.
 */
export function extractUazapiWebhookToken(payload: unknown): string | null {
  if (payload === null || typeof payload !== "object") return null;
  const raw = (payload as Record<string, unknown>).token;
  if (typeof raw !== "string") return null;
  if (raw.length === 0) return null;
  return raw;
}

export interface UazapiTokenCandidate {
  id: string;
  instance_token?: string | null;
}

export type UazapiTokenResolution<T extends UazapiTokenCandidate> =
  | { outcome: "matched"; instance: T }
  | {
    outcome: "rejected";
    reason: "no_receivable_token" | "no_match" | "ambiguous_match";
    matchCount: number;
  };

/**
 * Resolve exatamente UM candidato cujo `instance_token` armazenado bate,
 * em tempo constante, com o `token` recebido no payload. Nunca escolhe
 * "o primeiro" nem "o mais recente" em caso de zero ou mais de uma
 * correspondência — falha fechada nos dois casos. A organização e todos
 * os dados derivados devem vir exclusivamente da linha retornada aqui
 * quando `outcome === "matched"`; nunca do payload.
 */
export function resolveUazapiInstanceByToken<T extends UazapiTokenCandidate>(
  candidates: readonly T[],
  receivedToken: string | null,
): UazapiTokenResolution<T> {
  if (!receivedToken) {
    return { outcome: "rejected", reason: "no_receivable_token", matchCount: 0 };
  }
  const matches = candidates.filter((c) => {
    const stored = c.instance_token;
    if (typeof stored !== "string" || stored.length === 0) return false;
    return timingSafeEqualString(stored, receivedToken);
  });
  if (matches.length === 0) {
    return { outcome: "rejected", reason: "no_match", matchCount: 0 };
  }
  if (matches.length > 1) {
    return { outcome: "rejected", reason: "ambiguous_match", matchCount: matches.length };
  }
  return { outcome: "matched", instance: matches[0] };
}

/**
 * Retorna uma cópia rasa do payload com o campo `token` redigido, para
 * uso em qualquer `console.log`/`console.warn`/`console.error` que
 * inclua o corpo bruto do webhook. Nunca deve ser pulado antes de logar
 * o payload inbound da UazAPI.
 */
export function redactUazapiWebhookPayloadForLog(payload: unknown): unknown {
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) {
    return payload;
  }
  const clone: Record<string, unknown> = { ...(payload as Record<string, unknown>) };
  if ("token" in clone) clone.token = "[REDACTED]";
  return clone;
}
