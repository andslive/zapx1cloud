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
  encrypted: number;
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
  encrypted: 0,
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

const isOcrCandidate = (
  mime: string | null,
  url: string | null,
  hints?: { messageType?: string | null; mediaType?: string | null; type?: string | null },
): boolean => {
  if (!url) return false;
  if (mime && (IMAGE_RE.test(mime) || PDF_RE.test(mime))) return true;
  if (hints) {
    const mt = (hints.messageType ?? "").toLowerCase();
    if (mt.includes("imagemessage") || mt.includes("documentmessage")) return true;
    const md = (hints.mediaType ?? "").toLowerCase();
    if (md === "image" || md === "document") return true;
    if ((hints.type ?? "").toLowerCase() === "media") return true;
  }
  if (!mime && /\.(png|jpe?g|webp|gif|bmp|tiff?|pdf)(\?|$)/i.test(url))
    return true;
  return false;
};

interface MediaInfo {
  url: string | null;
  mime: string | null;
  messageId: string | null;
  instance: string | null;
  messageType: string | null;
  mediaType: string | null;
  type: string | null;
  fileName: string | null;
  mediaKey: string | null;
  directPath: string | null;
  fileEncSHA256: string | null;
  fileSHA256: string | null;
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

const asObj = (v: unknown): Record<string, unknown> =>
  (v && typeof v === "object" ? (v as Record<string, unknown>) : {});

const extractMedia = (payload: unknown): MediaInfo => {
  const outer = asObj(payload);
  // UazAPI real: raw.payload.payload.message — o job já recebe raw.payload,
  // então aqui pode vir { payload: { message } } ou direto { message }.
  const inner = asObj(outer.payload);
  const p = Object.keys(inner).length ? inner : outer;
  const message = asObj(p.message ?? outer.message);
  const content = asObj(message.content);
  const key = asObj(message.key ?? p.key);
  const instance = asObj(p.instance ?? outer.instance);

  return {
    url:
      pickStr(content, "URL", "url", "fileUrl", "mediaUrl") ??
      pickStr(message, "mediaUrl", "url", "fileUrl") ??
      pickStr(p, "mediaUrl", "url"),
    mime:
      pickStr(content, "mimetype", "mime", "mimeType") ??
      pickStr(message, "mimetype", "mime") ??
      pickStr(p, "mimetype"),
    messageId:
      pickStr(message, "messageid", "id") ??
      pickStr(key, "id") ??
      pickStr(p, "messageId", "id"),
    instance:
      pickStr(p, "instanceName", "instance_name", "instanceId") ??
      pickStr(instance, "name", "id") ??
      pickStr(outer, "instanceName", "instance_name"),
    messageType: pickStr(message, "messageType"),
    mediaType: pickStr(message, "mediaType"),
    type: pickStr(message, "type"),
    fileName: pickStr(content, "fileName", "filename", "name"),
    mediaKey: pickStr(content, "mediaKey", "mediakey"),
    directPath: pickStr(content, "directPath", "directpath"),
    fileEncSHA256: pickStr(content, "fileEncSHA256", "fileEncSha256"),
    fileSHA256: pickStr(content, "fileSHA256", "fileSha256"),
  };
};

// Detecta mídia criptografada do WhatsApp (.enc) — não pode ir direto pro tesseract.
const isEncryptedWaMedia = (media: MediaInfo): boolean => {
  if (media.mediaKey) return true;
  const url = media.url ?? "";
  if (/\.enc(\?|$)/i.test(url)) return true;
  if (/mmg\.whatsapp\.net/i.test(url) && !/\.(png|jpe?g|webp|pdf|gif|bmp|tiff?)(\?|$)/i.test(url))
    return true;
  return false;
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

  if (provider === "local") {
    const { runLocalOcr } = await import("./ocr-local.js");
    const text = await runLocalOcr({ url: media.url, mime: media.mime });
    return { text, provider };
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
  if (!isOcrCandidate(media.mime, media.url, {
    messageType: media.messageType,
    mediaType: media.mediaType,
    type: media.type,
  })) {
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
