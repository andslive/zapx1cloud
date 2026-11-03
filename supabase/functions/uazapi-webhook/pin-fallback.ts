// K8: recusa de pin (P0001 do trigger de histórico) ou deadlock (40P01) ao fixar o funil.
// Regras: (1) deadlock é repetido de forma limitada — o UPDATE/INSERT foi revertido, repetir é
// seguro e não reenvia nada; (2) recusa ou deadlock esgotado NÃO podem perder a mensagem recebida
// nem deixar a linha 'running' do gate órfã: o chamador libera o gate e segue SEM funil.

export const DEADLOCK_SQLSTATE = "40P01";
export const PIN_MAX_ATTEMPTS = 3;

export function isDeadlockError(err: any): boolean {
  if (!err) return false;
  return err.code === DEADLOCK_SQLSTATE || /deadlock detected/i.test(String(err.message ?? ""));
}

/** Recusa do trigger de histórico (funnel_already_active) ou outro P0001 levantado pelo banco. */
export function isPinRefusal(err: any): boolean {
  if (!err) return false;
  return err.code === "P0001" || /funnel_already_active/i.test(String(err.message ?? ""));
}

export type PinAttempt<T> =
  | { ok: true; value: T; attempts: number }
  | { ok: false; kind: "deadlock_exhausted" | "refused" | "error"; error: unknown; attempts: number };

export function pinBackoffMs(attempt: number): number {
  return 40 * attempt + Math.floor(Math.random() * 80 * attempt);
}

/**
 * Executa `op`; repete só em deadlock (até `maxAttempts`). Nunca lança: devolve o desfecho para o
 * chamador decidir o fallback (liberar o gate e seguir sem funil).
 */
export async function runPinWithFallback<T>(
  op: (attempt: number) => Promise<T>,
  opts: { label: string; maxAttempts?: number; sleepFn?: (ms: number) => Promise<void> } = { label: "pin" },
): Promise<PinAttempt<T>> {
  const max = opts.maxAttempts ?? PIN_MAX_ATTEMPTS;
  const sleep = opts.sleepFn ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  let lastError: unknown = null;
  for (let attempt = 1; attempt <= max; attempt++) {
    try {
      const value = await op(attempt);
      if (attempt > 1) console.log("[FUNNEL_ENTRY] pin_recovery_outcome", JSON.stringify({ label: opts.label, outcome: "recovered", attempts: attempt }));
      return { ok: true, value, attempts: attempt };
    } catch (e: any) {
      lastError = e;
      if (!isDeadlockError(e)) {
        const kind = isPinRefusal(e) ? "refused" : "error";
        console.warn("[FUNNEL_ENTRY] pin_failed_no_retry", JSON.stringify({ label: opts.label, kind, code: e?.code ?? null, attempts: attempt }));
        return { ok: false, kind, error: e, attempts: attempt };
      }
      console.warn("[FUNNEL_ENTRY] pin_deadlock_retry", JSON.stringify({ label: opts.label, attempt, max }));
      if (attempt < max) await sleep(pinBackoffMs(attempt));
    }
  }
  console.error("[FUNNEL_ENTRY] pin_recovery_exhausted", JSON.stringify({ label: opts.label, attempts: max }));
  return { ok: false, kind: "deadlock_exhausted", error: lastError, attempts: max };
}
