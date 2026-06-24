// Fase D.3 — Receipt Shadow → Supabase Shadow
// Persiste APENAS em public.receipt_shadow_results.
// NÃO escreve em leads, conversations, purchase_audit, pixel_event_logs.
// Default OFF (ENABLE_RECEIPT_SHADOW_WRITE=false).

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "../env.js";
import { logger } from "../logger.js";

let client: SupabaseClient | null = null;

const getClient = (): SupabaseClient | null => {
  if (!env.ENABLE_RECEIPT_SHADOW_WRITE) return null;
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return null;
  if (client) return client;
  client = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return client;
};

export type ReceiptWriteOutcome =
  | "DISABLED"
  | "OK"
  | "DUPLICATE"
  | "FAILED";

interface Counters {
  enabled: boolean;
  ok: number;
  duplicate: number;
  failed: number;
  lastOutcome: ReceiptWriteOutcome | null;
  lastAt: string | null;
  lastError: string | null;
}

const counters: Counters = {
  enabled: env.ENABLE_RECEIPT_SHADOW_WRITE,
  ok: 0,
  duplicate: 0,
  failed: 0,
  lastOutcome: null,
  lastAt: null,
  lastError: null,
};

export const getReceiptWriteCounters = (): Counters => ({
  ...counters,
  enabled: env.ENABLE_RECEIPT_SHADOW_WRITE,
});

export interface ReceiptShadowRow {
  received_at?: string | null;
  instance?: string | null;
  message_id?: string | null;
  amount?: number | null;
  payer_name?: string | null;
  pix_id?: string | null;
  is_receipt?: boolean | null;
  confidence?: number | null;
  ocr_text?: string | null;
  provider?: string | null;
}

export const writeReceiptShadow = async (
  row: ReceiptShadowRow,
): Promise<{ outcome: ReceiptWriteOutcome; error?: string }> => {
  const now = new Date().toISOString();
  counters.lastAt = now;

  if (!env.ENABLE_RECEIPT_SHADOW_WRITE) {
    counters.lastOutcome = "DISABLED";
    return { outcome: "DISABLED" };
  }

  const c = getClient();
  if (!c) {
    counters.failed++;
    counters.lastOutcome = "FAILED";
    counters.lastError = "missing_supabase_credentials";
    logger.error(
      "[receipt-shadow-write] FAILED missing_credentials",
    );
    return { outcome: "FAILED", error: "missing_supabase_credentials" };
  }

  const payload = {
    received_at: row.received_at ?? now,
    instance: row.instance ?? null,
    message_id: row.message_id ?? null,
    amount: row.amount ?? null,
    payer_name: row.payer_name ?? null,
    pix_id: row.pix_id ?? null,
    is_receipt: row.is_receipt ?? null,
    confidence: row.confidence ?? null,
    ocr_text: row.ocr_text ?? null,
    provider: row.provider ?? "shadow",
  };

  const { error } = await c.from("receipt_shadow_results").insert(payload);

  if (error) {
    const code = (error as { code?: string }).code;
    if (code === "23505" || /duplicate key/i.test(error.message)) {
      counters.duplicate++;
      counters.lastOutcome = "DUPLICATE";
      logger.info(
        { message_id: row.message_id },
        "[receipt-shadow-write] DUPLICATE",
      );
      return { outcome: "DUPLICATE" };
    }
    counters.failed++;
    counters.lastOutcome = "FAILED";
    counters.lastError = error.message;
    logger.error(
      { err: error.message, code, message_id: row.message_id },
      "[receipt-shadow-write] FAILED",
    );
    return { outcome: "FAILED", error: error.message };
  }

  counters.ok++;
  counters.lastOutcome = "OK";
  counters.lastError = null;
  logger.info(
    {
      message_id: row.message_id,
      is_receipt: row.is_receipt,
      amount: row.amount,
    },
    "[receipt-shadow-write] OK",
  );
  return { outcome: "OK" };
};
