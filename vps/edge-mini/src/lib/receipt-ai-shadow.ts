// Fase D.3 — IA Receipt Shadow (homologação)
// Reproduz a extração determinística do bloco "Reconhecer Comprovante" (ai_receipt)
// usada hoje em supabase/functions/uazapi-webhook/index.ts, mas atua APENAS sobre
// os arquivos JSON gerados pelo OCR Shadow (Fase D.2.x). Não toca produção, Inbox,
// Leads, Conversations, Pixel, Purchase Audit, OCR, Funis, WhatsApp ou Supabase.

import {
  existsSync,
  mkdirSync,
  promises as fsp,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { env } from "../env.js";
import { logger } from "../logger.js";
import { writeReceiptShadow } from "./receipt-shadow-writer.js";
import { sendReceiptShadowIngest } from "./receipt-shadow-ingest.js";

// --------------------------- contadores ----------------------------------
interface Counters {
  processed: number;
  success: number;
  failed: number;
  lastAt: string | null;
  lastOutcome: string | null;
  lastError: string | null;
}

const emptyCounters = (): Counters => ({
  processed: 0,
  success: 0,
  failed: 0,
  lastAt: null,
  lastOutcome: null,
  lastError: null,
});

const COUNTERS_FILE = resolve(
  env.RAW_STORAGE_DIR,
  "..",
  "receipt-shadow-counters.json",
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
      "[receipt-shadow] failed to persist counters",
    );
  }
};

const bump = (mutate: (c: Counters) => void): Counters => {
  const c = readCounters();
  mutate(c);
  writeCounters(c);
  return c;
};

export const getReceiptCounters = (): Counters => readCounters();

// --------------------------- extração determinística ---------------------
// Espelho 1:1 de normalizeDeterministicReceiptValue / extractDeterministicReceiptFromOcr
// de supabase/functions/uazapi-webhook/index.ts (linhas ~7083-7134).
const normalizeReceiptValue = (rawValue: string): number | null => {
  let cleaned = String(rawValue || "").replace(/[^\d.,]/g, "").trim();
  if (!cleaned) return null;
  const lastComma = cleaned.lastIndexOf(",");
  const lastDot = cleaned.lastIndexOf(".");
  if (lastComma >= 0 && lastDot >= 0) {
    cleaned = lastComma > lastDot
      ? cleaned.replace(/\./g, "").replace(",", ".")
      : cleaned.replace(/,/g, "");
  } else if (lastComma >= 0) {
    cleaned = cleaned.replace(",", ".");
  }
  const parsed = parseFloat(cleaned);
  return Number.isFinite(parsed) && parsed > 0 ? Number(parsed.toFixed(2)) : null;
};

export interface ReceiptClassification {
  is_receipt: boolean;
  amount: number | null;
  payer_name: string | null;
  pix_id: string | null;
  confidence: number;
  reason: string;
}

const VALUE_RE =
  /(?:^|\n|\b)(?:[-•*]\s*)?(?:\d+[.)]\s*)?\*{0,2}\s*Valor(?:\s+(?:pago|total|do\s+pagamento))?\s*\*{0,2}\s*[:\-]\s*\*{0,2}\s*(?:R\$\s*)?([0-9][0-9.,]*)\s*\*{0,2}/i;
const NAME_RE =
  /(?:^|\n)\s*(?:[-•*]\s*)?(?:\d+[.)]\s*)?\*{0,2}\s*(?:Nome\s+do\s+Pagador|Pagador|Nome)\s*\*{0,2}\s*[:\-]\s*\*{0,2}\s*([^\n\r]+)/i;
const SIGNALS_RE =
  /COMPROVANTE IDENTIFICADO|Valor\s*:|Nome do Pagador|Pagador\s*:|Pix Enviado|Efetivada|ID transa[cç][aã]o|Institui[cç][aã]o/i;
const PIX_ID_RE =
  /(?:ID\s+(?:da\s+)?transa[cç][aã]o|E2E\s*ID|End[- ]?to[- ]?End|Identificador)\s*[:\-]?\s*([A-Za-z0-9._-]{8,})/i;

export const classifyReceiptShadow = (ocrText: string): ReceiptClassification => {
  const text = String(ocrText || "");
  const valueMatch = text.match(VALUE_RE);
  const nameMatch = text.match(NAME_RE);
  const pixMatch = text.match(PIX_ID_RE);

  const amount = valueMatch ? normalizeReceiptValue(valueMatch[1]) : null;
  const payer = nameMatch
    ? String(nameMatch[1] || "")
        .replace(/\*{1,2}/g, "")
        .replace(/\s+(?:\d+[.)]\s*)?(?:Data(?:\s+e\s+Hora)?|Valor|CPF|CNPJ|Banco)\b.*$/i, "")
        .trim()
    : "";
  const hasSignals = SIGNALS_RE.test(text);

  const reasons: string[] = [];
  let score = 0;
  if (hasSignals) {
    score += 0.4;
    reasons.push("signals");
  }
  if (amount && amount > 0) {
    score += 0.35;
    reasons.push("amount");
  }
  if (payer && payer.length >= 3) {
    score += 0.2;
    reasons.push("payer");
  }
  if (pixMatch) {
    score += 0.05;
    reasons.push("pix_id");
  }
  const confidence = Math.min(1, Number(score.toFixed(2)));
  const is_receipt = hasSignals && !!amount && !!payer && payer.length >= 3;

  return {
    is_receipt,
    amount,
    payer_name: payer || null,
    pix_id: pixMatch ? pixMatch[1] : null,
    confidence,
    reason: reasons.join("+") || "no_signals",
  };
};

// --------------------------- persistência --------------------------------
const today = (): string => {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
};

const safe = (v: string): string =>
  v.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 200);

export const RECEIPT_DIR = resolve(env.OCR_SHADOW_DIR, "..", "receipt-shadow");

const saveResult = async (record: Record<string, unknown> & { message_id?: string | null }) => {
  const dir = join(RECEIPT_DIR, today());
  await fsp.mkdir(dir, { recursive: true });
  const file = join(
    dir,
    `${Date.now()}-${safe(String(record.message_id ?? "no-id"))}.json`,
  );
  await fsp.writeFile(file, JSON.stringify(record, null, 2), "utf8");
  return file;
};

export const getTodayReceiptFiles = async (): Promise<number> => {
  try {
    const dir = join(RECEIPT_DIR, today());
    const files = await fsp.readdir(dir).catch(() => [] as string[]);
    return files.length;
  } catch {
    return 0;
  }
};

// --------------------------- entrypoint ----------------------------------
export interface OcrShadowFile {
  received_at?: string;
  instance?: string | null;
  message_id?: string | null;
  ocr_text?: string;
}

export const processReceiptShadowFile = async (
  input: OcrShadowFile,
): Promise<{ outcome: "OK" | "FAILED"; file?: string; error?: string }> => {
  const now = new Date().toISOString();
  try {
    const classification = classifyReceiptShadow(input.ocr_text ?? "");
    const file = await saveResult({
      message_id: input.message_id ?? null,
      instance: input.instance ?? null,
      received_at: input.received_at ?? now,
      amount: classification.amount,
      payer_name: classification.payer_name,
      pix_id: classification.pix_id,
      is_receipt: classification.is_receipt,
      confidence: classification.confidence,
      reason: classification.reason,
      provider: "shadow",
    });
    bump((c) => {
      c.processed++;
      c.success++;
      c.lastOutcome = "OK";
      c.lastError = null;
      c.lastAt = now;
    });

    // Fase D.3 — persistência shadow opcional em Supabase (default OFF).
    // Não toca leads, conversations, purchase_audit, pixel_event_logs.
    try {
      await writeReceiptShadow({
        received_at: input.received_at ?? now,
        instance: input.instance ?? null,
        message_id: input.message_id ?? null,
        amount: classification.amount,
        payer_name: classification.payer_name,
        pix_id: classification.pix_id,
        is_receipt: classification.is_receipt,
        confidence: classification.confidence,
        ocr_text: input.ocr_text ?? null,
        provider: "shadow",
      });
    } catch (err) {
      logger.error(
        { err: (err as Error).message },
        "[receipt-shadow] supabase write threw",
      );
    }

    // Fase D.3 — envio via HTTP ingest proxy (Edge Function), sem service_role na VPS2.
    try {
      await sendReceiptShadowIngest({
        received_at: input.received_at ?? now,
        instance: input.instance ?? null,
        message_id: input.message_id ?? null,
        amount: classification.amount,
        payer_name: classification.payer_name,
        pix_id: classification.pix_id,
        is_receipt: classification.is_receipt,
        confidence: classification.confidence,
        ocr_text: input.ocr_text ?? null,
        provider: "shadow",
      });
    } catch (err) {
      logger.error(
        { err: (err as Error).message },
        "[receipt-shadow] ingest threw",
      );
    }

    logger.info(
      {
        message_id: input.message_id,
        instance: input.instance,
        is_receipt: classification.is_receipt,
        amount: classification.amount,
        confidence: classification.confidence,
      },
      "[receipt-shadow] OK",
    );
    return { outcome: "OK", file };
  } catch (err) {
    const msg = (err as Error).message;
    bump((c) => {
      c.processed++;
      c.failed++;
      c.lastOutcome = "FAILED";
      c.lastError = msg;
      c.lastAt = now;
    });
    logger.error({ err: msg }, "[receipt-shadow] FAILED");
    return { outcome: "FAILED", error: msg };
  }
};
