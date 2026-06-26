// Fase F — Receipt Production Write (HTTP proxy → Edge Function)
// Envia o resultado classificado para a Edge Function `receipt-production-write`.
// Não usa service_role na VPS2. Default OFF.
// Allowlist por instance é aplicada localmente (curto-circuito) e também
// re-validada pela Edge Function.
//
// NÃO escreve em leads, conversations, pixel_event_logs, inbox, funis,
// WhatsApp.

import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, resolve } from "node:path";
import { env } from "../env.js";
import { logger } from "../logger.js";

export type ReceiptProductionOutcome =
  | "DISABLED"
  | "OK"
  | "DUPLICATE"
  | "IGNORED"
  | "FAILED"
  | "MISCONFIGURED";

interface Counters {
  ok: number;
  duplicate: number;
  ignored: number;
  failed: number;
  misconfigured: number;
  lastOutcome: ReceiptProductionOutcome | null;
  lastAt: string | null;
  lastError: string | null;
  lastInstance: string | null;
  lastMessageId: string | null;
}

const empty = (): Counters => ({
  ok: 0,
  duplicate: 0,
  ignored: 0,
  failed: 0,
  misconfigured: 0,
  lastOutcome: null,
  lastAt: null,
  lastError: null,
  lastInstance: null,
  lastMessageId: null,
});

const COUNTERS_FILE = resolve(
  env.RAW_STORAGE_DIR,
  "..",
  "receipt-production-counters.json",
);

const ensureDir = (file: string) => {
  const dir = dirname(file);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
};

const readCounters = (): Counters => {
  try {
    if (!existsSync(COUNTERS_FILE)) return empty();
    const raw = readFileSync(COUNTERS_FILE, "utf8");
    if (!raw.trim()) return empty();
    return { ...empty(), ...(JSON.parse(raw) as Partial<Counters>) };
  } catch {
    return empty();
  }
};

const writeCountersFile = (c: Counters) => {
  try {
    ensureDir(COUNTERS_FILE);
    writeFileSync(COUNTERS_FILE, JSON.stringify(c), "utf8");
  } catch (err) {
    logger.error(
      { err: (err as Error).message },
      "[receipt-production-write] failed to persist counters",
    );
  }
};

const bump = (mutate: (c: Counters) => void): Counters => {
  const c = readCounters();
  mutate(c);
  writeCountersFile(c);
  return c;
};

export const getAllowedInstances = (): string[] =>
  env.RECEIPT_PRODUCTION_ALLOWED_INSTANCES.split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

export const getReceiptProductionCounters = () => ({
  enabled: env.ENABLE_RECEIPT_PRODUCTION_WRITE,
  allowed_instances: getAllowedInstances(),
  urlConfigured: Boolean(env.RECEIPT_PRODUCTION_WRITE_URL),
  tokenConfigured: Boolean(env.RECEIPT_PRODUCTION_WRITE_TOKEN),
  ...readCounters(),
});

export interface ReceiptProductionInput {
  received_at?: string | null;
  instance?: string | null;
  message_id?: string | null;
  amount?: number | null;
  payer_name?: string | null;
  pix_id?: string | null;
  is_receipt?: boolean | null;
  confidence?: number | null;
  ocr_text?: string | null;
  phone?: string;
  customer_name?: string;
}

export const processReceiptProductionWrite = async (
  input: ReceiptProductionInput,
): Promise<{ outcome: ReceiptProductionOutcome; error?: string }> => {
  const now = new Date().toISOString();
  const instance = (input.instance ?? "").toLowerCase();

  if (!env.ENABLE_RECEIPT_PRODUCTION_WRITE) {
    return { outcome: "DISABLED" };
  }

  if (!input.is_receipt) {
    return { outcome: "IGNORED" };
  }

  const allowed = getAllowedInstances();
  if (!instance || !allowed.includes(instance)) {
    bump((c) => {
      c.ignored++;
      c.lastOutcome = "IGNORED";
      c.lastAt = now;
      c.lastInstance = input.instance ?? null;
      c.lastMessageId = input.message_id ?? null;
    });
    return { outcome: "IGNORED" };
  }

  if (!env.RECEIPT_PRODUCTION_WRITE_URL || !env.RECEIPT_PRODUCTION_WRITE_TOKEN) {
    bump((c) => {
      c.misconfigured++;
      c.lastOutcome = "MISCONFIGURED";
      c.lastError = "missing_url_or_token";
      c.lastAt = now;
      c.lastInstance = instance;
      c.lastMessageId = input.message_id ?? null;
    });
    logger.error("[receipt-production-write] MISCONFIGURED missing url/token");
    return { outcome: "MISCONFIGURED", error: "missing_url_or_token" };
  }

  const messageId = input.message_id ?? null;
  if (!messageId) {
    bump((c) => {
      c.failed++;
      c.lastOutcome = "FAILED";
      c.lastError = "missing_message_id";
      c.lastAt = now;
      c.lastInstance = instance;
      c.lastMessageId = null;
    });
    logger.error({ instance }, "[receipt-production-write] FAILED missing_message_id");
    return { outcome: "FAILED", error: "missing_message_id" };
  }

  try {
    const res = await fetch(env.RECEIPT_PRODUCTION_WRITE_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "X-Receipt-Production-Token": env.RECEIPT_PRODUCTION_WRITE_TOKEN,
      },
      body: JSON.stringify({
        instance,
        message_id: messageId,
        purchase_value: input.amount ?? null,
        receipt_pix_id: input.pix_id ?? null,
        receipt_confidence: input.confidence ?? null,
        receipt_ocr_text: input.ocr_text ?? null,
        phone: input.phone ?? null,
        customer_name: input.customer_name ?? input.payer_name ?? null,
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
        c.lastInstance = instance;
        c.lastMessageId = messageId;
      });
      logger.error(
        { status: res.status, body: text.slice(0, 200), instance, message_id: messageId },
        "[receipt-production-write] FAILED",
      );
      return { outcome: "FAILED", error: msg };
    }

    if (body.duplicate === true) {
      bump((c) => {
        c.duplicate++;
        c.lastOutcome = "DUPLICATE";
        c.lastError = null;
        c.lastAt = now;
        c.lastInstance = instance;
        c.lastMessageId = messageId;
      });
      logger.info(
        { instance, message_id: messageId },
        "[receipt-production-write] DUPLICATE",
      );
      return { outcome: "DUPLICATE" };
    }

    if (body.ignored === true) {
      bump((c) => {
        c.ignored++;
        c.lastOutcome = "IGNORED";
        c.lastError = null;
        c.lastAt = now;
        c.lastInstance = instance;
        c.lastMessageId = messageId;
      });
      return { outcome: "IGNORED" };
    }

    bump((c) => {
      c.ok++;
      c.lastOutcome = "OK";
      c.lastError = null;
      c.lastAt = now;
      c.lastInstance = instance;
      c.lastMessageId = messageId;
    });
    logger.info(
      {
        instance,
        message_id: messageId,
        pix_id: input.pix_id ?? null,
        amount: input.amount ?? null,
      },
      "[receipt-production-write] OK",
    );
    return { outcome: "OK" };
  } catch (err) {
    const msg = (err as Error).message;
    bump((c) => {
      c.failed++;
      c.lastOutcome = "FAILED";
      c.lastError = msg;
      c.lastAt = now;
      c.lastInstance = instance;
      c.lastMessageId = messageId;
    });
    logger.error(
      { err: msg, instance, message_id: messageId },
      "[receipt-production-write] FAILED network",
    );
    return { outcome: "FAILED", error: msg };
  }
};
