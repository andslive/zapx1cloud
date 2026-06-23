import { createHash } from "node:crypto";
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

const counters: Counters = {
  ok: 0,
  duplicate: 0,
  failed: 0,
  disabled: 0,
  skipped_origin: 0,
  misconfigured: 0,
  lastOutcome: null,
  lastAt: null,
  lastError: null,
};

export const getIngestCounters = (): Counters => ({ ...counters });

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
  counters.lastAt = now;

  const summary = buildSummary(args.source, args.payload);

  if (summary.origin !== "lovable-uazapi-webhook-shadow") {
    counters.skipped_origin++;
    counters.lastOutcome = "SKIPPED_ORIGIN";
    return { outcome: "SKIPPED_ORIGIN" };
  }

  if (!env.ENABLE_SHADOW_INGEST) {
    counters.disabled++;
    counters.lastOutcome = "DISABLED";
    logger.info({ source: args.source }, "[shadow-ingest] DISABLED");
    return { outcome: "DISABLED" };
  }

  if (!env.SHADOW_INGEST_URL || !env.SHADOW_INGEST_TOKEN) {
    counters.misconfigured++;
    counters.lastOutcome = "MISCONFIGURED";
    counters.lastError = "missing_url_or_token";
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
      counters.failed++;
      counters.lastOutcome = "FAILED";
      counters.lastError = `http_${res.status}: ${text.slice(0, 200)}`;
      logger.error(
        { status: res.status, body: text.slice(0, 200) },
        "[shadow-ingest] FAILED",
      );
      return { outcome: "FAILED", error: counters.lastError };
    }

    if (json.duplicate === true) {
      counters.duplicate++;
      counters.lastOutcome = "DUPLICATE";
      counters.lastError = null;
      logger.info({ payload_hash }, "[shadow-ingest] DUPLICATE");
      return { outcome: "DUPLICATE" };
    }

    counters.ok++;
    counters.lastOutcome = "OK";
    counters.lastError = null;
    logger.info({ payload_hash }, "[shadow-ingest] OK");
    return { outcome: "OK" };
  } catch (err) {
    const msg = (err as Error).message;
    counters.failed++;
    counters.lastOutcome = "FAILED";
    counters.lastError = msg;
    logger.error({ err: msg }, "[shadow-ingest] FAILED network");
    return { outcome: "FAILED", error: msg };
  }
};
