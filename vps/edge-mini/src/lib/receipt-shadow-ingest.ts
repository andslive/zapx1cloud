// Fase D.3 — Receipt Shadow Ingest (HTTP proxy → Edge Function)
// Envia o resultado classificado para a Edge Function `receipt-shadow-ingest`.
// Não usa service_role na VPS2. Default OFF.
//
// Telemetria persistida em arquivo (igual a receipt-ai-shadow.ts), para que
// múltiplos workers (PM2 cluster) compartilhem os mesmos contadores. Sem isso,
// o worker que processa o OCR incrementa contadores locais que NÃO aparecem
// para o worker que atende GET /stats/receipt-shadow-ingest.

import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, resolve } from "node:path";
import { env } from "../env.js";
import { logger } from "../logger.js";

export type ReceiptIngestOutcome =
  | "DISABLED"
  | "OK"
  | "DUPLICATE"
  | "FAILED"
  | "MISCONFIGURED";

interface Counters {
  ok: number;
  duplicate: number;
  failed: number;
  misconfigured: number;
  lastOutcome: ReceiptIngestOutcome | null;
  lastAt: string | null;
  lastError: string | null;
}

const emptyCounters = (): Counters => ({
  ok: 0,
  duplicate: 0,
  failed: 0,
  misconfigured: 0,
  lastOutcome: null,
  lastAt: null,
  lastError: null,
});

const COUNTERS_FILE = resolve(
  env.RAW_STORAGE_DIR,
  "..",
  "receipt-shadow-ingest-counters.json",
);

const ensureDir = (file: string) => {
  const dir = dirname(file);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
};

const readCounters = (): Counters => {
  try {
    if (!existsSync(COUNTERS_FILE)) return emptyCounters();
    const raw = readFileSync(COUNTERS_FILE, "utf8");
    if (!raw.trim()) return emptyCounters();
    return { ...emptyCounters(), ...(JSON.parse(raw) as Partial<Counters>) };
  } catch {
    return emptyCounters();
  }
};

const writeCounters = (c: Counters) => {
  try {
    ensureDir(COUNTERS_FILE);
    writeFileSync(COUNTERS_FILE, JSON.stringify(c), "utf8");
  } catch (err) {
    logger.error(
      { err: (err as Error).message },
      "[receipt-shadow-ingest] failed to persist counters",
    );
  }
};

const bump = (mutate: (c: Counters) => void): Counters => {
  const c = readCounters();
  mutate(c);
  writeCounters(c);
  return c;
};

export const getReceiptIngestCounters = (): Counters & { enabled: boolean } => ({
  enabled: env.ENABLE_RECEIPT_SHADOW_INGEST,
  ...readCounters(),
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

  if (!env.ENABLE_RECEIPT_SHADOW_INGEST) {
    bump((c) => {
      c.lastOutcome = "DISABLED";
      c.lastAt = now;
    });
    return { outcome: "DISABLED" };
  }

  if (!env.RECEIPT_SHADOW_INGEST_URL || !env.RECEIPT_SHADOW_INGEST_TOKEN) {
    bump((c) => {
      c.misconfigured++;
      c.lastOutcome = "MISCONFIGURED";
      c.lastError = "missing_url_or_token";
      c.lastAt = now;
    });
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
      bump((c) => {
        c.failed++;
        c.lastOutcome = "FAILED";
        c.lastError = msg;
        c.lastAt = now;
      });
      logger.error(
        { status: res.status, body: text.slice(0, 200) },
        "[receipt-shadow-ingest] FAILED",
      );
      return { outcome: "FAILED", error: msg };
    }

    if (body.duplicate === true) {
      bump((c) => {
        c.duplicate++;
        c.lastOutcome = "DUPLICATE";
        c.lastError = null;
        c.lastAt = now;
      });
      logger.info(
        { message_id: row.message_id },
        "[receipt-shadow-ingest] DUPLICATE",
      );
      return { outcome: "DUPLICATE" };
    }

    bump((c) => {
      c.ok++;
      c.lastOutcome = "OK";
      c.lastError = null;
      c.lastAt = now;
    });
    logger.info(
      { message_id: row.message_id, is_receipt: row.is_receipt, amount: row.amount },
      "[receipt-shadow-ingest] OK",
    );
    return { outcome: "OK" };
  } catch (err) {
    const msg = (err as Error).message;
    bump((c) => {
      c.failed++;
      c.lastOutcome = "FAILED";
      c.lastError = msg;
      c.lastAt = now;
    });
    logger.error({ err: msg }, "[receipt-shadow-ingest] FAILED network");
    return { outcome: "FAILED", error: msg };
  }
};
