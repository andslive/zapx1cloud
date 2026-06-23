import { createHash } from "node:crypto";
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  existsSync,
} from "node:fs";
import { dirname, resolve } from "node:path";
import { env } from "../env.js";
import { logger } from "../logger.js";
import { buildSummary } from "./supabase-writer.js";

export const computePayloadHash = (payload: unknown): string =>
  createHash("sha256").update(JSON.stringify(payload ?? null)).digest("hex");

export type IngestOutcome =
  | "DISABLED"
  | "OK"
  | "DUPLICATE"
  | "FAILED"
  | "SKIPPED_ORIGIN"
  | "MISCONFIGURED";

interface Counters {
  ok: number;
  duplicate: number;
  failed: number;
  disabled: number;
  skipped_origin: number;
  misconfigured: number;
  lastOutcome: IngestOutcome | null;
  lastAt: string | null;
  lastError: string | null;
}

const emptyCounters = (): Counters => ({
  ok: 0,
  duplicate: 0,
  failed: 0,
  disabled: 0,
  skipped_origin: 0,
  misconfigured: 0,
  lastOutcome: null,
  lastAt: null,
  lastError: null,
});

// Contadores são compartilhados entre processos (edge-api lê, wa-inbound escreve)
// via arquivo JSON em disco. Caminho mora ao lado do raw-storage.
const COUNTERS_FILE = resolve(
  env.RAW_STORAGE_DIR,
  "..",
  "shadow-ingest-counters.json",
);

const ensureDir = () => {
  const dir = dirname(COUNTERS_FILE);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
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

const writeCounters = (c: Counters): void => {
  try {
    ensureDir();
    writeFileSync(COUNTERS_FILE, JSON.stringify(c), "utf8");
  } catch (err) {
    logger.error(
      { err: (err as Error).message, file: COUNTERS_FILE },
      "[shadow-ingest] failed to persist counters",
    );
  }
};

const bump = (mutate: (c: Counters) => void): Counters => {
  const c = readCounters();
  mutate(c);
  writeCounters(c);
  return c;
};

export const getIngestCounters = (): Counters => readCounters();


export interface IngestArgs {
  receivedAt: string;
  source: string;
  rawFilePath?: string | null;
  payload: unknown;
}

export const sendShadowIngest = async (
  args: IngestArgs,
): Promise<{ outcome: IngestOutcome; error?: string }> => {
  const now = new Date().toISOString();

  const summary = buildSummary(args.source, args.payload);

  if (summary.origin !== "lovable-uazapi-webhook-shadow") {
    bump((c) => {
      c.skipped_origin++;
      c.lastOutcome = "SKIPPED_ORIGIN";
      c.lastAt = now;
    });
    return { outcome: "SKIPPED_ORIGIN" };
  }

  if (!env.ENABLE_SHADOW_INGEST) {
    bump((c) => {
      c.disabled++;
      c.lastOutcome = "DISABLED";
      c.lastAt = now;
    });
    logger.info({ source: args.source }, "[shadow-ingest] DISABLED");
    return { outcome: "DISABLED" };
  }

  if (!env.SHADOW_INGEST_URL || !env.SHADOW_INGEST_TOKEN) {
    bump((c) => {
      c.misconfigured++;
      c.lastOutcome = "MISCONFIGURED";
      c.lastError = "missing_url_or_token";
      c.lastAt = now;
    });
    logger.error("[shadow-ingest] MISCONFIGURED missing url/token");
    return { outcome: "MISCONFIGURED", error: "missing_url_or_token" };
  }

  const payload_hash = computePayloadHash(args.payload);

  const body = {
    origin: summary.origin,
    source: summary.source,
    event: summary.event,
    instance_id: summary.instance_id,
    instance_name: summary.instance_name,
    message_id: summary.message_id,
    chat_id: summary.chat_id,
    remote_jid: summary.remote_jid,
    from_me: summary.from_me,
    message_type: summary.message_type,
    payload_hash,
    raw_file_path: args.rawFilePath ?? null,
    payload_summary: summary.payload_summary,
    received_at: args.receivedAt,
  };

  try {
    const res = await fetch(env.SHADOW_INGEST_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "X-Shadow-Token": env.SHADOW_INGEST_TOKEN,
      },
      body: JSON.stringify(body),
    });

    const text = await res.text();
    let json: Record<string, unknown> = {};
    try {
      json = text ? (JSON.parse(text) as Record<string, unknown>) : {};
    } catch {
      // ignore parse error
    }

    if (!res.ok) {
      const errMsg = `http_${res.status}: ${text.slice(0, 200)}`;
      bump((c) => {
        c.failed++;
        c.lastOutcome = "FAILED";
        c.lastError = errMsg;
        c.lastAt = now;
      });
      logger.error(
        { status: res.status, body: text.slice(0, 200) },
        "[shadow-ingest] FAILED",
      );
      return { outcome: "FAILED", error: errMsg };
    }

    if (json.duplicate === true) {
      bump((c) => {
        c.duplicate++;
        c.lastOutcome = "DUPLICATE";
        c.lastError = null;
        c.lastAt = now;
      });
      logger.info({ payload_hash }, "[shadow-ingest] DUPLICATE");
      return { outcome: "DUPLICATE" };
    }

    bump((c) => {
      c.ok++;
      c.lastOutcome = "OK";
      c.lastError = null;
      c.lastAt = now;
    });
    logger.info({ payload_hash }, "[shadow-ingest] OK");
    return { outcome: "OK" };
  } catch (err) {
    const msg = (err as Error).message;
    bump((c) => {
      c.failed++;
      c.lastOutcome = "FAILED";
      c.lastError = msg;
      c.lastAt = now;
    });
    logger.error({ err: msg }, "[shadow-ingest] FAILED network");
    return { outcome: "FAILED", error: msg };
  }

};
