// Fase F — Receipt Production Write (piloto controlado)
// Atua APENAS para instâncias presentes em RECEIPT_PRODUCTION_ALLOWED_INSTANCES.
// Default OFF (ENABLE_RECEIPT_PRODUCTION_WRITE=false).
//
// Escreve uma linha em public.purchase_audit equivalente ao reconhecimento
// operacional feito hoje pela Edge `uazapi-webhook`. Idempotência dupla por
// message_id (event_id) e pix_id, ambos restritos a purchase_source='vps2-pilot'
// para nunca colidir com registros já gravados pela Lovable.
//
// NÃO escreve em leads, conversations, webchat_*, pixel_event_logs, deals,
// funnels. NÃO envia mensagem WhatsApp. NÃO chama CAPI.

import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, resolve } from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "../env.js";
import { logger } from "../logger.js";

export type ReceiptProductionOutcome =
  | "DISABLED"
  | "OK"
  | "DUPLICATE"
  | "IGNORED"
  | "FAILED";

interface Counters {
  ok: number;
  duplicate: number;
  ignored: number;
  failed: number;
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
  ...readCounters(),
});

let client: SupabaseClient | null = null;
const getClient = (): SupabaseClient | null => {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return null;
  if (client) return client;
  client = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return client;
};

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
}

const PILOT_SOURCE = "vps2-pilot";

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

  const messageId = input.message_id ?? null;
  const pixId = input.pix_id ?? null;

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

  const c = getClient();
  if (!c) {
    bump((x) => {
      x.failed++;
      x.lastOutcome = "FAILED";
      x.lastError = "missing_supabase_credentials";
      x.lastAt = now;
      x.lastInstance = instance;
      x.lastMessageId = messageId;
    });
    logger.error("[receipt-production-write] FAILED missing_credentials");
    return { outcome: "FAILED", error: "missing_supabase_credentials" };
  }

  // Idempotência 1 — message_id (event_id) já gravado por nós OU pela Lovable.
  try {
    const { data: dupByEvent, error: e1 } = await c
      .from("purchase_audit")
      .select("id, purchase_source")
      .eq("event_id", messageId)
      .limit(1);
    if (e1) throw e1;
    if (dupByEvent && dupByEvent.length > 0) {
      bump((x) => {
        x.duplicate++;
        x.lastOutcome = "DUPLICATE";
        x.lastError = null;
        x.lastAt = now;
        x.lastInstance = instance;
        x.lastMessageId = messageId;
      });
      logger.info(
        { instance, message_id: messageId, reason: "message_id" },
        "[receipt-production-write] DUPLICATE",
      );
      return { outcome: "DUPLICATE" };
    }

    // Idempotência 2 — pix_id (gravado no raw_payload como receipt_pix_id).
    if (pixId) {
      const { data: dupByPix, error: e2 } = await c
        .from("purchase_audit")
        .select("id")
        .filter("raw_payload->>receipt_pix_id", "eq", pixId)
        .limit(1);
      if (e2) throw e2;
      if (dupByPix && dupByPix.length > 0) {
        bump((x) => {
          x.duplicate++;
          x.lastOutcome = "DUPLICATE";
          x.lastError = null;
          x.lastAt = now;
          x.lastInstance = instance;
          x.lastMessageId = messageId;
        });
        logger.info(
          { instance, message_id: messageId, pix_id: pixId, reason: "pix_id" },
          "[receipt-production-write] DUPLICATE",
        );
        return { outcome: "DUPLICATE" };
      }
    }
  } catch (err) {
    const msg = (err as Error).message;
    bump((x) => {
      x.failed++;
      x.lastOutcome = "FAILED";
      x.lastError = `idempotency_check: ${msg}`;
      x.lastAt = now;
      x.lastInstance = instance;
      x.lastMessageId = messageId;
    });
    logger.error(
      { err: msg, instance, message_id: messageId },
      "[receipt-production-write] FAILED idempotency check",
    );
    return { outcome: "FAILED", error: msg };
  }

  // INSERT operacional.
  const row = {
    connection_id: instance,
    customer_name: input.payer_name ?? null,
    purchase_value: input.amount ?? null,
    currency: "BRL",
    event_id: messageId,
    purchase_source: PILOT_SOURCE,
    purchase_status: "recognized",
    raw_payload: {
      receipt_message_id: messageId,
      receipt_pix_id: pixId,
      receipt_confidence: input.confidence ?? null,
      receipt_ocr_text: input.ocr_text ?? null,
      receipt_received_at: input.received_at ?? now,
      pilot: PILOT_SOURCE,
    } as Record<string, unknown>,
  };

  const { error } = await c.from("purchase_audit").insert(row);
  if (error) {
    const code = (error as { code?: string }).code;
    if (code === "23505" || /duplicate key/i.test(error.message)) {
      bump((x) => {
        x.duplicate++;
        x.lastOutcome = "DUPLICATE";
        x.lastError = null;
        x.lastAt = now;
        x.lastInstance = instance;
        x.lastMessageId = messageId;
      });
      logger.info(
        { instance, message_id: messageId, reason: "db_conflict" },
        "[receipt-production-write] DUPLICATE",
      );
      return { outcome: "DUPLICATE" };
    }
    bump((x) => {
      x.failed++;
      x.lastOutcome = "FAILED";
      x.lastError = error.message;
      x.lastAt = now;
      x.lastInstance = instance;
      x.lastMessageId = messageId;
    });
    logger.error(
      { err: error.message, code, instance, message_id: messageId },
      "[receipt-production-write] FAILED",
    );
    return { outcome: "FAILED", error: error.message };
  }

  bump((x) => {
    x.ok++;
    x.lastOutcome = "OK";
    x.lastError = null;
    x.lastAt = now;
    x.lastInstance = instance;
    x.lastMessageId = messageId;
  });
  logger.info(
    {
      instance,
      message_id: messageId,
      pix_id: pixId,
      amount: input.amount,
    },
    "[receipt-production-write] OK",
  );
  return { outcome: "OK" };
};
