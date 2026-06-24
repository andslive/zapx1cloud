// Fase D.2 — OCR Shadow (homologação chip46)
// Executa OCR apenas em payloads shadow (source=uazapi-shadow) contendo mídia
// imagem/PDF. NUNCA toca produção, Supabase, Inbox, Leads, Funis, Pixel ou IA.
// Resultado é gravado somente em storage/ocr-shadow/YYYY-MM-DD/.

import {
  existsSync,
  mkdirSync,
  promises as fsp,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, resolve, join } from "node:path";
import { env } from "../env.js";
import { logger } from "../logger.js";

// --------------------------- contadores ----------------------------------
interface Counters {
  processed: number;
  success: number;
  failed: number;
  skipped: number;
  totalDurationMs: number;
  lastAt: string | null;
  lastOutcome: string | null;
  lastError: string | null;
}

const emptyCounters = (): Counters => ({
  processed: 0,
  success: 0,
  failed: 0,
  skipped: 0,
  totalDurationMs: 0,
  lastAt: null,
  lastOutcome: null,
  lastError: null,
});

const COUNTERS_FILE = resolve(
  env.RAW_STORAGE_DIR,
  "..",
  "ocr-shadow-counters.json",
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
      "[ocr-shadow] failed to persist counters",
    );
  }
};

const bump = (mutate: (c: Counters) => void): Counters => {
  const c = readCounters();
  mutate(c);
  writeCounters(c);
  return c;
};

export const getOcrCounters = (): Counters => readCounters();

// --------------------------- filtros -------------------------------------
const IMAGE_RE = /^image\//i;
const PDF_RE = /^application\/pdf$/i;

const isOcrCandidate = (mime: string | null, url: string | null): boolean => {
  if (!url) return false;
  if (mime && (IMAGE_RE.test(mime) || PDF_RE.test(mime))) return true;
  // fallback por extensão
  if (!mime && /\.(png|jpe?g|webp|gif|bmp|tiff?|pdf)(\?|$)/i.test(url))
    return true;
  return false;
};

interface MediaInfo {
  url: string | null;
  mime: string | null;
  messageId: string | null;
  instance: string | null;
}

const pickStr = (
  obj: Record<string, unknown> | undefined,
  ...keys: string[]
): string | null => {
  if (!obj) return null;
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "string" && v.length > 0) return v;
  }
  return null;
};

const extractMedia = (payload: unknown): MediaInfo => {
  const p = (payload ?? {}) as Record<string, unknown>;
  const message = (p.message ?? {}) as Record<string, unknown>;
  const key = (message.key ?? p.key ?? {}) as Record<string, unknown>;
  const instance = (p.instance ?? {}) as Record<string, unknown>;
  return {
    url:
      pickStr(message, "mediaUrl", "url", "fileUrl") ??
      pickStr(p, "mediaUrl", "url"),
    mime:
      pickStr(message, "mimetype", "mediaType", "mime") ??
      pickStr(p, "mimetype", "mediaType"),
    messageId:
      pickStr(message, "id") ??
      pickStr(key, "id") ??
      pickStr(p, "messageId", "id"),
    instance:
      pickStr(instance, "name") ??
      pickStr(instance, "id") ??
      pickStr(p, "instance_name", "instanceId"),
  };
};

// --------------------------- provider ------------------------------------
// Provider HTTP genérico: POST { url, mime } com bearer token; espera { text }.
// Default OCR_PROVIDER="none" => apenas conta skipped, não chama nada.
const runOcr = async (
  media: MediaInfo,
): Promise<{ text: string; provider: string }> => {
  const provider = (env.OCR_PROVIDER || "none").toLowerCase();

  if (provider === "none") {
    throw new Error("ocr_provider_not_configured");
  }

  if (provider === "http") {
    if (!env.OCR_SHADOW_URL) throw new Error("missing_ocr_url");
    const res = await fetch(env.OCR_SHADOW_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(env.OCR_SHADOW_TOKEN
          ? { authorization: `Bearer ${env.OCR_SHADOW_TOKEN}` }
          : {}),
      },
      body: JSON.stringify({ url: media.url, mime: media.mime }),
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`http_${res.status}: ${text.slice(0, 200)}`);
    let json: Record<string, unknown> = {};
    try {
      json = text ? (JSON.parse(text) as Record<string, unknown>) : {};
    } catch {
      // fallback: raw
      return { text: text.slice(0, 50000), provider };
    }
    const ocrText =
      (typeof json.text === "string" && json.text) ||
      (typeof json.ocr_text === "string" && json.ocr_text) ||
      "";
    return { text: String(ocrText), provider };
  }

  throw new Error(`unknown_provider:${provider}`);
};

// --------------------------- armazenamento -------------------------------
const today = (): string => {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
};

const safe = (v: string): string =>
  v.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 200);

export const OCR_DIR = env.OCR_SHADOW_DIR;

const saveResult = async (record: {
  received_at: string;
  instance: string | null;
  message_id: string | null;
  ocr_text: string;
  provider: string;
  duration_ms: number;
}) => {
  const dir = join(OCR_DIR, today());
  await fsp.mkdir(dir, { recursive: true });
  const file = join(
    dir,
    `${Date.now()}-${safe(record.message_id ?? "no-id")}.json`,
  );
  await fsp.writeFile(file, JSON.stringify(record, null, 2), "utf8");
  return file;
};

export const getTodayFiles = async (): Promise<number> => {
  try {
    const dir = join(OCR_DIR, today());
    const files = await fsp.readdir(dir).catch(() => [] as string[]);
    return files.length;
  } catch {
    return 0;
  }
};

// --------------------------- entrypoint ----------------------------------
export interface OcrJob {
  receivedAt: string;
  source: string;
  payload: unknown;
}

export type OcrOutcome =
  | "DISABLED"
  | "SKIPPED_SOURCE"
  | "SKIPPED_NO_MEDIA"
  | "OK"
  | "FAILED";

export const processOcrShadow = async (
  job: OcrJob,
): Promise<{ outcome: OcrOutcome; error?: string; file?: string }> => {
  const now = new Date().toISOString();

  if (!env.ENABLE_OCR_SHADOW) {
    return { outcome: "DISABLED" };
  }
  if (job.source !== "uazapi-shadow") {
    return { outcome: "SKIPPED_SOURCE" };
  }

  const media = extractMedia(job.payload);
  if (!isOcrCandidate(media.mime, media.url)) {
    bump((c) => {
      c.skipped++;
      c.lastOutcome = "SKIPPED_NO_MEDIA";
      c.lastAt = now;
    });
    return { outcome: "SKIPPED_NO_MEDIA" };
  }

  const t0 = Date.now();
  try {
    const { text, provider } = await runOcr(media);
    const duration = Date.now() - t0;
    const file = await saveResult({
      received_at: job.receivedAt,
      instance: media.instance,
      message_id: media.messageId,
      ocr_text: text,
      provider,
      duration_ms: duration,
    });
    bump((c) => {
      c.processed++;
      c.success++;
      c.totalDurationMs += duration;
      c.lastOutcome = "OK";
      c.lastError = null;
      c.lastAt = now;
    });
    logger.info(
      { provider, duration_ms: duration, message_id: media.messageId },
      "[ocr-shadow] OK",
    );
    return { outcome: "OK", file };
  } catch (err) {
    const duration = Date.now() - t0;
    const msg = (err as Error).message;
    bump((c) => {
      c.processed++;
      c.failed++;
      c.totalDurationMs += duration;
      c.lastOutcome = "FAILED";
      c.lastError = msg;
      c.lastAt = now;
    });
    logger.error({ err: msg }, "[ocr-shadow] FAILED");
    return { outcome: "FAILED", error: msg };
  }
};
