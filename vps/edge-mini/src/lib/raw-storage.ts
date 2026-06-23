import { promises as fs } from "node:fs";
import path from "node:path";
import { env } from "../env.js";
import { logger } from "../logger.js";

const ROOT = env.RAW_STORAGE_DIR;
const MAX_PER_DAY = env.RAW_STORAGE_MAX_PER_DAY;
const RETENTION_DAYS = env.RAW_STORAGE_RETENTION_DAYS;

const safe = (v: string): string =>
  v.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 200);

const today = (): string => {
  const d = new Date();
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

const dayDir = (day: string): string => path.join(ROOT, day);

export const shouldStore = (payload: unknown): boolean => {
  if (!payload || typeof payload !== "object") return false;
  const origin = (payload as Record<string, unknown>).origin;
  return origin === "lovable-uazapi-webhook-shadow";
};

export interface RawRecord {
  receivedAt: string;
  source: string;
  jobId: string;
  payload: unknown;
}

export const saveRawPayload = async (
  record: RawRecord,
): Promise<{ saved: boolean; reason?: string; file?: string }> => {
  if (!shouldStore(record.payload)) {
    return { saved: false, reason: "origin_mismatch" };
  }
  const day = today();
  const dir = dayDir(day);
  await fs.mkdir(dir, { recursive: true });

  const entries = await fs.readdir(dir).catch(() => []);
  if (entries.length >= MAX_PER_DAY) {
    logger.warn(
      { day, count: entries.length, max: MAX_PER_DAY },
      "[raw-storage] daily cap reached — skipping",
    );
    return { saved: false, reason: "daily_cap" };
  }

  const filename = `${Date.now()}-${safe(record.jobId || "no-job")}.json`;
  const file = path.join(dir, filename);
  await fs.writeFile(file, JSON.stringify(record, null, 2), "utf8");
  return { saved: true, file };
};

const isDateDir = (name: string): boolean =>
  /^\d{4}-\d{2}-\d{2}$/.test(name);

export const rotateOldDays = async (): Promise<{ removed: string[] }> => {
  const removed: string[] = [];
  await fs.mkdir(ROOT, { recursive: true });
  const entries = await fs.readdir(ROOT).catch(() => []);
  const cutoff = Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000;
  for (const name of entries) {
    if (!isDateDir(name)) continue;
    const ts = Date.parse(`${name}T00:00:00Z`);
    if (!Number.isFinite(ts)) continue;
    if (ts < cutoff) {
      await fs.rm(dayDir(name), { recursive: true, force: true });
      removed.push(name);
    }
  }
  if (removed.length > 0) {
    logger.info({ removed }, "[raw-storage] rotated old days");
  }
  return { removed };
};

export interface RawStorageStats {
  todayFiles: number;
  totalFiles: number;
  diskUsageMb: number;
}

export const getStats = async (): Promise<RawStorageStats> => {
  await fs.mkdir(ROOT, { recursive: true });
  const days = await fs.readdir(ROOT).catch(() => []);
  let totalFiles = 0;
  let totalBytes = 0;
  let todayFiles = 0;
  const t = today();
  for (const name of days) {
    if (!isDateDir(name)) continue;
    const dir = dayDir(name);
    const files = await fs.readdir(dir).catch(() => []);
    if (name === t) todayFiles = files.length;
    for (const f of files) {
      totalFiles++;
      try {
        const st = await fs.stat(path.join(dir, f));
        totalBytes += st.size;
      } catch {
        // ignore
      }
    }
  }
  return {
    todayFiles,
    totalFiles,
    diskUsageMb: Math.round((totalBytes / (1024 * 1024)) * 100) / 100,
  };
};

let rotateTimer: NodeJS.Timeout | null = null;
export const startRotationTimer = (): void => {
  if (rotateTimer) return;
  // roda agora e depois a cada 6h
  rotateOldDays().catch((err) =>
    logger.error({ err: err.message }, "[raw-storage] initial rotate failed"),
  );
  rotateTimer = setInterval(
    () => {
      rotateOldDays().catch((err) =>
        logger.error({ err: err.message }, "[raw-storage] rotate failed"),
      );
    },
    6 * 60 * 60 * 1000,
  );
};
