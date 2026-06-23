import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";
import { env } from "../env.js";
import { logger } from "../logger.js";

let client: SupabaseClient | null = null;

const getClient = (): SupabaseClient | null => {
  if (!env.ENABLE_SUPABASE_WRITE) return null;
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return null;
  if (client) return client;
  client = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return client;
};

export const computePayloadHash = (payload: unknown): string =>
  createHash("sha256").update(JSON.stringify(payload ?? null)).digest("hex");

const pickString = (
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

export interface ShadowSummary {
  source: string;
  origin: string | null;
  event: string | null;
  instance_id: string | null;
  instance_name: string | null;
  message_id: string | null;
  chat_id: string | null;
  remote_jid: string | null;
  from_me: boolean | null;
  message_type: string | null;
  payload_summary: Record<string, unknown>;
}

export const buildSummary = (
  source: string,
  payload: unknown,
): ShadowSummary => {
  const p = (payload ?? {}) as Record<string, unknown>;
  const message = (p.message ?? {}) as Record<string, unknown>;
  const key = (message.key ?? p.key ?? {}) as Record<string, unknown>;
  const instance = (p.instance ?? {}) as Record<string, unknown>;

  const fromMeRaw = (message.fromMe ?? key.fromMe ?? p.fromMe) as unknown;
  const from_me =
    typeof fromMeRaw === "boolean"
      ? fromMeRaw
      : typeof fromMeRaw === "string"
        ? fromMeRaw === "true"
        : null;

  return {
    source,
    origin: pickString(p, "origin"),
    event: pickString(p, "event", "type"),
    instance_id: pickString(instance, "id") ?? pickString(p, "instanceId"),
    instance_name:
      pickString(instance, "name") ?? pickString(p, "instance_name"),
    message_id:
      pickString(message, "id") ??
      pickString(key, "id") ??
      pickString(p, "messageId", "id"),
    chat_id: pickString(p, "chatId", "chat_id"),
    remote_jid:
      pickString(key, "remoteJid") ??
      pickString(message, "remoteJid") ??
      pickString(p, "remoteJid"),
    from_me,
    message_type:
      pickString(message, "type", "messageType") ??
      pickString(p, "messageType"),
    payload_summary: {
      keys: Object.keys(p),
      has_message: Boolean(p.message),
      has_media: Boolean((message as Record<string, unknown>).mediaUrl),
    },
  };
};

export type WriteOutcome =
  | "DISABLED"
  | "OK"
  | "DUPLICATE"
  | "FAILED"
  | "SKIPPED_ORIGIN";

interface Counters {
  disabled: number;
  ok: number;
  duplicate: number;
  failed: number;
  skipped_origin: number;
  lastOutcome: WriteOutcome | null;
  lastAt: string | null;
  lastError: string | null;
}

const counters: Counters = {
  disabled: 0,
  ok: 0,
  duplicate: 0,
  failed: 0,
  skipped_origin: 0,
  lastOutcome: null,
  lastAt: null,
  lastError: null,
};

export const getCounters = (): Counters => ({ ...counters });

export interface WriteArgs {
  receivedAt: string;
  source: string;
  rawFilePath?: string | null;
  payload: unknown;
}

export const writeShadowLog = async (
  args: WriteArgs,
): Promise<{ outcome: WriteOutcome; error?: string }> => {
  const now = new Date().toISOString();
  counters.lastAt = now;

  const summary = buildSummary(args.source, args.payload);

  if (summary.origin !== "lovable-uazapi-webhook-shadow") {
    counters.skipped_origin++;
    counters.lastOutcome = "SKIPPED_ORIGIN";
    return { outcome: "SKIPPED_ORIGIN" };
  }

  if (!env.ENABLE_SUPABASE_WRITE) {
    counters.disabled++;
    counters.lastOutcome = "DISABLED";
    logger.info(
      { source: args.source },
      "[supabase-write] SUPABASE_WRITE_DISABLED",
    );
    return { outcome: "DISABLED" };
  }

  const c = getClient();
  if (!c) {
    counters.failed++;
    counters.lastOutcome = "FAILED";
    counters.lastError = "missing_supabase_credentials";
    logger.error("[supabase-write] SUPABASE_WRITE_FAILED missing_credentials");
    return { outcome: "FAILED", error: "missing_supabase_credentials" };
  }

  const payload_hash = computePayloadHash(args.payload);

  const row = {
    received_at: args.receivedAt,
    source: summary.source,
    origin: summary.origin,
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
  };

  const { error } = await c
    .from("vps_shadow_webhook_logs")
    .insert(row);

  if (error) {
    // 23505 = unique_violation
    const code = (error as { code?: string }).code;
    if (code === "23505" || /duplicate key/i.test(error.message)) {
      counters.duplicate++;
      counters.lastOutcome = "DUPLICATE";
      logger.info(
        { payload_hash },
        "[supabase-write] SUPABASE_WRITE_DUPLICATE",
      );
      return { outcome: "DUPLICATE" };
    }
    counters.failed++;
    counters.lastOutcome = "FAILED";
    counters.lastError = error.message;
    logger.error(
      { err: error.message, code },
      "[supabase-write] SUPABASE_WRITE_FAILED",
    );
    return { outcome: "FAILED", error: error.message };
  }

  counters.ok++;
  counters.lastOutcome = "OK";
  counters.lastError = null;
  logger.info({ payload_hash }, "[supabase-write] SUPABASE_WRITE_OK");
  return { outcome: "OK" };
};
