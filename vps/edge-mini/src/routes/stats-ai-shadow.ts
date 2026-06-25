import type { FastifyPluginAsync } from "fastify";
import { env } from "../env.js";
import {
  getAiShadowCounters,
  getTodayAiShadowFiles,
} from "../lib/ai-shadow.js";

export const statsAiShadowRoute: FastifyPluginAsync = async (app) => {
  app.get("/stats/ai-shadow", async () => {
    const c = getAiShadowCounters();
    const todayFiles = await getTodayAiShadowFiles();
    return {
      enabled: env.ENABLE_AI_SHADOW,
      provider: env.AI_SHADOW_PROVIDER,
      onlyReceipts: env.AI_SHADOW_ONLY_RECEIPTS,
      received: c.received,
      ignored: c.ignored,
      processed: c.processed,
      duplicate: c.duplicate,
      failed: c.failed,
      lastOutcome: c.lastOutcome,
      lastAt: c.lastAt,
      lastError: c.lastError,
      todayFiles,
    };
  });
};
