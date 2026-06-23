import type { FastifyPluginAsync } from "fastify";
import { promises as fs } from "node:fs";
import path from "node:path";
import { env } from "../env.js";

const ROOT = env.RAW_STORAGE_DIR;

const isDateDir = (name: string): boolean => /^\d{4}-\d{2}-\d{2}$/.test(name);

const today = (): string => {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
};

interface EventStats {
  totalFiles: number;
  todayFiles: number;
  invalidFiles: number;
  byEvent: Record<string, number>;
  bySource: Record<string, number>;
  byHour: Record<string, number>;
  latestReceivedAt: string | null;
  diskUsageMb: number;
}

const collect = async (): Promise<EventStats> => {
  await fs.mkdir(ROOT, { recursive: true });
  const stats: EventStats = {
    totalFiles: 0,
    todayFiles: 0,
    invalidFiles: 0,
    byEvent: {},
    bySource: {},
    byHour: {},
    latestReceivedAt: null,
    diskUsageMb: 0,
  };
  let totalBytes = 0;
  const t = today();
  const days = await fs.readdir(ROOT).catch(() => []);
  for (const day of days) {
    if (!isDateDir(day)) continue;
    const dir = path.join(ROOT, day);
    const files = await fs.readdir(dir).catch(() => []);
    if (day === t) stats.todayFiles = files.length;
    for (const f of files) {
      stats.totalFiles++;
      const full = path.join(dir, f);
      try {
        const st = await fs.stat(full);
        totalBytes += st.size;
      } catch {
        // ignore
      }
      try {
        const raw = await fs.readFile(full, "utf8");
        const parsed = JSON.parse(raw) as {
          receivedAt?: string;
          source?: string;
          payload?: { event?: unknown };
        };
        const source = typeof parsed.source === "string" ? parsed.source : "unknown";
        stats.bySource[source] = (stats.bySource[source] ?? 0) + 1;

        const eventRaw = parsed.payload?.event;
        const event = typeof eventRaw === "string" && eventRaw.length > 0 ? eventRaw : "unknown";
        stats.byEvent[event] = (stats.byEvent[event] ?? 0) + 1;

        const receivedAt = typeof parsed.receivedAt === "string" ? parsed.receivedAt : null;
        if (receivedAt) {
          const d = new Date(receivedAt);
          if (!Number.isNaN(d.getTime())) {
            const hour = `${d.toISOString().slice(0, 13)}:00`;
            stats.byHour[hour] = (stats.byHour[hour] ?? 0) + 1;
            if (!stats.latestReceivedAt || receivedAt > stats.latestReceivedAt) {
              stats.latestReceivedAt = receivedAt;
            }
          }
        }
      } catch {
        stats.invalidFiles++;
      }
    }
  }
  stats.diskUsageMb = Math.round((totalBytes / (1024 * 1024)) * 100) / 100;
  return stats;
};

export const statsEventsRoute: FastifyPluginAsync = async (app) => {
  app.get("/stats/events", async () => collect());
};
