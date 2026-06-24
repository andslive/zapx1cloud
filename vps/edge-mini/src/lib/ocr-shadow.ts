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
  tooLarge: number;
  encrypted: number;
  downloaded: number;
  downloadFailed: number;
  decryptUnsupported: number;
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
  tooLarge: 0,
  encrypted: 0,
  downloaded: 0,
  downloadFailed: 0,
  decryptUnsupported: 0,
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
  instanceToken: string | null;
  chatId: string | null;
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
    instanceToken:
      pickStr(instance, "token") ??
      pickStr(p, "token", "instanceToken", "instance_token") ??
      pickStr(outer, "token"),
    chatId:
      pickStr(message, "chatid", "chatId", "remoteJid") ??
      pickStr(key, "remoteJid") ??
      pickStr(p, "chatid", "chatId"),
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
interface OcrRunResult {
  text: string;
  provider: string;
  originalPageCount: number | null;
  truncatedPages: boolean;
  tooLarge: boolean;
  fileBytes: number | null;
}

const runOcr = async (media: MediaInfo): Promise<OcrRunResult> => {
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
      return {
        text: text.slice(0, 50000),
        provider,
        originalPageCount: null,
        truncatedPages: false,
        tooLarge: false,
        fileBytes: null,
      };
    }
    const ocrText =
      (typeof json.text === "string" && json.text) ||
      (typeof json.ocr_text === "string" && json.ocr_text) ||
      "";
    return {
      text: String(ocrText),
      provider,
      originalPageCount: null,
      truncatedPages: false,
      tooLarge: false,
      fileBytes: null,
    };
  }

  if (provider === "local") {
    const { runLocalOcr } = await import("./ocr-local.js");
    const r = await runLocalOcr({
      url: media.url,
      mime: media.mime,
      localPath: (media as MediaInfo & { localPath?: string }).localPath ?? null,
    });
    return {
      text: r.text,
      provider,
      originalPageCount: r.originalPageCount,
      truncatedPages: r.truncatedPages,
      tooLarge: r.tooLarge,
      fileBytes: r.fileBytes,
    };
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
  original_page_count?: number | null;
  truncated_pages?: boolean;
  file_bytes?: number | null;
  outcome?: string;
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
  | "MEDIA_ENCRYPTED_UNSUPPORTED"
  | "MEDIA_DOWNLOAD_UNSUPPORTED"
  | "SKIPPED_TOO_LARGE"
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
  const encrypted = isEncryptedWaMedia(media);
  const downloadProvider = (env.OCR_MEDIA_DOWNLOAD_PROVIDER || "none").toLowerCase();
  const logCtx = {
    instanceName: media.instance,
    chatid: media.chatId,
    messageid: media.messageId,
    mediaUrl: media.url,
    mimetype: media.mime,
    messageType: media.messageType,
    mediaType: media.mediaType,
    encrypted,
    downloadProvider,
  };

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
    logger.info({ ...logCtx, outcome: "SKIPPED_NO_MEDIA" }, "[ocr-shadow] skip");
    return { outcome: "SKIPPED_NO_MEDIA" };
  }

  // Mídia criptografada (WhatsApp .enc) — tenta baixar descriptografada via provider.
  let localPath: string | null = null;
  if (encrypted) {
    bump((c) => {
      c.encrypted++;
      c.lastAt = now;
    });

    if (downloadProvider !== "uazapi" || !media.messageId) {
      bump((c) => {
        c.decryptUnsupported++;
        c.skipped++;
        c.lastOutcome = "MEDIA_DOWNLOAD_UNSUPPORTED";
        c.lastAt = now;
        c.lastError = null;
      });
      logger.warn(
        { ...logCtx, downloadOutcome: "UNSUPPORTED", outcome: "MEDIA_DOWNLOAD_UNSUPPORTED" },
        "[ocr-shadow] mídia criptografada sem provider de download",
      );
      return { outcome: "MEDIA_DOWNLOAD_UNSUPPORTED" };
    }

    try {
      const { downloadUazapiMedia } = await import("./uazapi-media-download.js");
      const dl = await downloadUazapiMedia({
        messageId: media.messageId,
        instanceToken: media.instanceToken,
        mime: media.mime,
      });
      localPath = dl.filePath;
      if (dl.mime && !media.mime) media.mime = dl.mime;
      bump((c) => {
        c.downloaded++;
        c.lastAt = now;
      });
      logger.info(
        { ...logCtx, downloadOutcome: "OK" },
        "[ocr-shadow] download uazapi OK",
      );
    } catch (err) {
      const msg = (err as Error).message;
      bump((c) => {
        c.downloadFailed++;
        c.failed++;
        c.processed++;
        c.lastOutcome = "FAILED";
        c.lastError = msg;
        c.lastAt = now;
      });
      logger.error(
        { ...logCtx, downloadOutcome: "FAILED", err: msg, outcome: "FAILED" },
        "[ocr-shadow] download uazapi falhou",
      );
      return { outcome: "FAILED", error: msg };
    }
  }

  const t0 = Date.now();
  try {
    const mediaForOcr = { ...media, localPath } as MediaInfo & {
      localPath: string | null;
    };
    const result = await runOcr(mediaForOcr);
    const duration = Date.now() - t0;

    if (result.tooLarge) {
      const file = await saveResult({
        received_at: job.receivedAt,
        instance: media.instance,
        message_id: media.messageId,
        ocr_text: "",
        provider: result.provider,
        duration_ms: duration,
        original_page_count: result.originalPageCount,
        truncated_pages: result.truncatedPages,
        file_bytes: result.fileBytes,
        outcome: "SKIPPED_TOO_LARGE",
      });
      bump((c) => {
        c.tooLarge++;
        c.skipped++;
        c.lastOutcome = "SKIPPED_TOO_LARGE";
        c.lastError = null;
        c.lastAt = now;
      });
      logger.warn(
        {
          ...logCtx,
          provider: result.provider,
          fileBytes: result.fileBytes,
          maxMb: env.OCR_LOCAL_MAX_FILE_MB,
          outcome: "SKIPPED_TOO_LARGE",
        },
        "[ocr-shadow] arquivo acima do limite — pulado",
      );
      return { outcome: "SKIPPED_TOO_LARGE", file };
    }

    const file = await saveResult({
      received_at: job.receivedAt,
      instance: media.instance,
      message_id: media.messageId,
      ocr_text: result.text,
      provider: result.provider,
      duration_ms: duration,
      original_page_count: result.originalPageCount,
      truncated_pages: result.truncatedPages,
      file_bytes: result.fileBytes,
      outcome: "OK",
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
      {
        ...logCtx,
        provider: result.provider,
        duration_ms: duration,
        message_id: media.messageId,
        originalPageCount: result.originalPageCount,
        truncatedPages: result.truncatedPages,
        fileBytes: result.fileBytes,
        outcome: "OK",
      },
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
    logger.error({ ...logCtx, err: msg, outcome: "FAILED" }, "[ocr-shadow] FAILED");
    return { outcome: "FAILED", error: msg };
  }
};
