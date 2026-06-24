import type { FastifyPluginAsync } from "fastify";
import { env } from "../env.js";
import { getOcrCounters, getTodayFiles } from "../lib/ocr-shadow.js";

export const statsOcrShadowRoute: FastifyPluginAsync = async (app) => {
  app.get("/stats/ocr-shadow", async () => {
    const c = getOcrCounters();
    const todayFiles = await getTodayFiles();
    const avgDurationMs =
      c.processed > 0 ? Math.round(c.totalDurationMs / c.processed) : 0;
    return {
      enabled: env.ENABLE_OCR_SHADOW,
      provider: env.OCR_PROVIDER,
      processed: c.processed,
      success: c.success,
      failed: c.failed,
      skipped: c.skipped,
      avgDurationMs,
      todayFiles,
      lastOutcome: c.lastOutcome,
      lastAt: c.lastAt,
      lastError: c.lastError,
    };
  });
};
