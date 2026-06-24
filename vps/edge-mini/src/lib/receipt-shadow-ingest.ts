// Fase D.3 — Receipt Shadow Ingest (HTTP proxy → Edge Function)
// Envia o resultado classificado para a Edge Function `receipt-shadow-ingest`.
// Não usa service_role na VPS2. Default OFF.

import { env } from "../env.js";
import { logger } from "../logger.js";

export type ReceiptIngestOutcome =
  | "DISABLED"
  | "OK"
  | "DUPLICATE"
  | "FAILED"
  | "MISCONFIGURED";

interface Counters {
  enabled: boolean;
  ok: number;
  duplicate: number;
  failed: number;
  misconfigured: number;
  lastOutcome: ReceiptIngestOutcome | null;
  lastAt: string | null;
  lastError: string | null;
}

const counters: Counters = {
  enabled: env.ENABLE_RECEIPT_SHADOW_INGEST,
  ok: 0,
  duplicate: 0,
  failed: 0,
  misconfigured: 0,
  lastOutcome: null,
  lastAt: null,
  lastError: null,
};

export const getReceiptIngestCounters = (): Counters => ({
  ...counters,
  enabled: env.ENABLE_RECEIPT_SHADOW_INGEST,
});

export interface ReceiptIngestRow {
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

export const sendReceiptShadowIngest = async (
  row: ReceiptIngestRow,
): Promise<{ outcome: ReceiptIngestOutcome; error?: string }> => {
  const now = new Date().toISOString();
  counters.lastAt = now;

  if (!env.ENABLE_RECEIPT_SHADOW_INGEST) {
    counters.lastOutcome = "DISABLED";
    return { outcome: "DISABLED" };
  }

  if (!env.RECEIPT_SHADOW_INGEST_URL || !env.RECEIPT_SHADOW_INGEST_TOKEN) {
    counters.misconfigured++;
    counters.lastOutcome = "MISCONFIGURED";
    counters.lastError = "missing_url_or_token";
    logger.error("[receipt-shadow-ingest] MISCONFIGURED missing url/token");
    return { outcome: "MISCONFIGURED", error: "missing_url_or_token" };
  }

  try {
    const res = await fetch(env.RECEIPT_SHADOW_INGEST_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "X-Receipt-Shadow-Token": env.RECEIPT_SHADOW_INGEST_TOKEN,
      },
      body: JSON.stringify({
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
      }),
    });

    const text = await res.text();
    let body: Record<string, unknown> = {};
    try {
      body = text ? (JSON.parse(text) as Record<string, unknown>) : {};
    } catch {
      // ignore
    }

    if (!res.ok) {
      const msg = `http_${res.status}: ${text.slice(0, 200)}`;
      counters.failed++;
      counters.lastOutcome = "FAILED";
      counters.lastError = msg;
      logger.error(
        { status: res.status, body: text.slice(0, 200) },
        "[receipt-shadow-ingest] FAILED",
      );
      return { outcome: "FAILED", error: msg };
    }

    if (body.duplicate === true) {
      counters.duplicate++;
      counters.lastOutcome = "DUPLICATE";
      counters.lastError = null;
      logger.info(
        { message_id: row.message_id },
        "[receipt-shadow-ingest] DUPLICATE",
      );
      return { outcome: "DUPLICATE" };
    }

    counters.ok++;
    counters.lastOutcome = "OK";
    counters.lastError = null;
    logger.info(
      { message_id: row.message_id, is_receipt: row.is_receipt, amount: row.amount },
      "[receipt-shadow-ingest] OK",
    );
    return { outcome: "OK" };
  } catch (err) {
    const msg = (err as Error).message;
    counters.failed++;
    counters.lastOutcome = "FAILED";
    counters.lastError = msg;
    logger.error({ err: msg }, "[receipt-shadow-ingest] FAILED network");
    return { outcome: "FAILED", error: msg };
  }
};
