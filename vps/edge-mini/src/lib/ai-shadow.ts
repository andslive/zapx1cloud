// Fase E — IA Shadow (homologação paralela).
// Roda APÓS o Receipt Shadow produzir um resultado. Sem rede, sem Supabase,
// sem WhatsApp, sem Pixel/CAPI, sem Inbox/Leads/Conversations. Apenas
// classifica heuristicamente e persiste localmente para futura comparação
// com a produção (Lovable Cloud).

import {
  existsSync,
  mkdirSync,
  promises as fsp,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join, resolve } from "node:path";
import { env } from "../env.js";
import { logger } from "../logger.js";
import type { ReceiptClassification } from "./receipt-ai-shadow.js";

// ---------------- contadores ----------------
interface Counters {
  received: number;
  ignored: number;
  processed: number;
  duplicate: number;
  failed: number;
  lastOutcome: string | null;
  lastAt: string | null;
  lastError: string | null;
}

const emptyCounters = (): Counters => ({
  received: 0,
  ignored: 0,
  processed: 0,
  duplicate: 0,
  failed: 0,
  lastOutcome: null,
  lastAt: null,
  lastError: null,
});

const COUNTERS_FILE = resolve(
  env.RAW_STORAGE_DIR,
  "..",
  "ai-shadow-counters.json",
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
      "[ai-shadow] failed to persist counters",
    );
  }
};

const bump = (mutate: (c: Counters) => void): Counters => {
  const c = readCounters();
  mutate(c);
  writeCounters(c);
  return c;
};

export const getAiShadowCounters = (): Counters => readCounters();

// ---------------- paths ----------------
const AI_DIR = env.AI_SHADOW_DIR;
const INDEX_DIR = join(AI_DIR, "index");

const today = (): string => {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
};

const safe = (v: string): string =>
  v.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 200);

export const getTodayAiShadowFiles = async (): Promise<number> => {
  try {
    const dir = join(AI_DIR, today());
    const files = await fsp.readdir(dir).catch(() => [] as string[]);
    return files.length;
  } catch {
    return 0;
  }
};

// ---------------- classificação (provider=none, heurística) ----------------
type AiLabel =
  | "receipt_confirmed"
  | "receipt_suspect"
  | "not_receipt"
  | "unknown";

interface AiClassification {
  provider: string;
  label: AiLabel;
  confidence: number;
  reason: string;
  raw: unknown | null;
}

const classifyHeuristic = (
  receipt: ReceiptClassification,
  ocrText: string,
): AiClassification => {
  const hasText = String(ocrText || "").trim().length > 0;
  if (!hasText) {
    return {
      provider: "none",
      label: "unknown",
      confidence: 0,
      reason: "empty_ocr",
      raw: null,
    };
  }
  if (receipt.is_receipt && receipt.confidence >= 0.8) {
    return {
      provider: "none",
      label: "receipt_confirmed",
      confidence: receipt.confidence,
      reason: `heuristic:${receipt.reason}`,
      raw: null,
    };
  }
  if (receipt.amount && receipt.confidence >= 0.4) {
    return {
      provider: "none",
      label: "receipt_suspect",
      confidence: receipt.confidence,
      reason: `heuristic:${receipt.reason}`,
      raw: null,
    };
  }
  return {
    provider: "none",
    label: "not_receipt",
    confidence: 1 - receipt.confidence,
    reason: `heuristic:${receipt.reason || "no_signals"}`,
    raw: null,
  };
};

// ---------------- idempotência ----------------
const hashKey = (instance: string, messageId: string, ocrText: string) => {
  const basis =
    messageId && messageId !== "no-id"
      ? `${instance}|${messageId}`
      : `${instance}|${createHash("sha256").update(ocrText).digest("hex")}`;
  return createHash("sha256").update(basis).digest("hex");
};

const indexExists = async (hash: string): Promise<boolean> => {
  try {
    await fsp.access(join(INDEX_DIR, `${hash}.json`));
    return true;
  } catch {
    return false;
  }
};

const writeIndex = async (hash: string, ref: { file: string }) => {
  await fsp.mkdir(INDEX_DIR, { recursive: true });
  await fsp.writeFile(
    join(INDEX_DIR, `${hash}.json`),
    JSON.stringify({ hash, ...ref, at: new Date().toISOString() }),
    "utf8",
  );
};

// ---------------- entrypoint ----------------
export interface AiShadowInput {
  received_at?: string;
  instance?: string | null;
  message_id?: string | null;
  phone?: string | null;
  conversation_ref?: string | null;
  ocr_text?: string;
  receipt: ReceiptClassification;
}

export type AiShadowOutcome = "OK" | "DUPLICATE" | "IGNORED" | "FAILED";

export const processAiShadow = async (
  input: AiShadowInput,
): Promise<{ outcome: AiShadowOutcome; file?: string; error?: string; hash?: string }> => {
  const now = new Date().toISOString();
  bump((c) => {
    c.received++;
    c.lastAt = now;
  });

  if (!env.ENABLE_AI_SHADOW) {
    bump((c) => {
      c.ignored++;
      c.lastOutcome = "IGNORED";
      c.lastAt = now;
    });
    logger.info({ reason: "disabled" }, "[ai-shadow] ignored");
    return { outcome: "IGNORED" };
  }

  try {
    const instance = String(input.instance ?? "unknown");
    const messageId = String(input.message_id ?? "no-id");
    const ocrText = input.ocr_text ?? "";

    if (env.AI_SHADOW_ONLY_RECEIPTS && !input.receipt.is_receipt) {
      bump((c) => {
        c.ignored++;
        c.lastOutcome = "IGNORED";
        c.lastAt = now;
      });
      logger.info(
        { message_id: messageId, instance, reason: "not_receipt" },
        "[ai-shadow] ignored",
      );
      return { outcome: "IGNORED" };
    }

    const hash = hashKey(instance, messageId, ocrText);
    if (await indexExists(hash)) {
      bump((c) => {
        c.duplicate++;
        c.lastOutcome = "DUPLICATE";
        c.lastAt = now;
      });
      logger.info(
        { message_id: messageId, instance, hash },
        "[ai-shadow] duplicate",
      );
      return { outcome: "DUPLICATE", hash };
    }

    let ai: AiClassification;
    if (env.AI_SHADOW_PROVIDER === "none") {
      ai = classifyHeuristic(input.receipt, ocrText);
    } else {
      // Providers externos serão habilitados em fase posterior.
      ai = classifyHeuristic(input.receipt, ocrText);
      ai.provider = env.AI_SHADOW_PROVIDER;
      ai.reason = `fallback_heuristic_for_${env.AI_SHADOW_PROVIDER}`;
    }

    const record = {
      received_at: input.received_at ?? now,
      processed_at: now,
      instance,
      message_id: messageId,
      phone: input.phone ?? null,
      conversation_ref: input.conversation_ref ?? null,
      ocr_text: ocrText,
      receipt: input.receipt,
      ai,
      hash: `sha256:${hash}`,
    };

    const dir = join(AI_DIR, today());
    await fsp.mkdir(dir, { recursive: true });
    const file = join(dir, `${Date.now()}-${safe(messageId)}.json`);
    await fsp.writeFile(file, JSON.stringify(record, null, 2), "utf8");
    await writeIndex(hash, { file });

    bump((c) => {
      c.processed++;
      c.lastOutcome = "OK";
      c.lastError = null;
      c.lastAt = now;
    });

    logger.info(
      {
        message_id: messageId,
        instance,
        label: ai.label,
        confidence: ai.confidence,
        hash,
      },
      "[ai-shadow] processed",
    );

    return { outcome: "OK", file, hash };
  } catch (err) {
    const msg = (err as Error).message;
    bump((c) => {
      c.failed++;
      c.lastOutcome = "FAILED";
      c.lastError = msg;
      c.lastAt = now;
    });
    logger.error({ err: msg }, "[ai-shadow] error");
    return { outcome: "FAILED", error: msg };
  }
};
