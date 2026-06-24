import type { FastifyPluginAsync } from "fastify";
import {
  getReceiptCounters,
  getTodayReceiptFiles,
} from "../lib/receipt-ai-shadow.js";

export const statsReceiptShadowRoute: FastifyPluginAsync = async (app) => {
  app.get("/stats/receipt-shadow", async () => {
    const c = getReceiptCounters();
    const todayFiles = await getTodayReceiptFiles();
    return {
      processed: c.processed,
      success: c.success,
      failed: c.failed,
      todayFiles,
      lastOutcome: c.lastOutcome,
      lastAt: c.lastAt,
      lastError: c.lastError,
    };
  });
};
