import type { FastifyPluginAsync } from "fastify";
import { env } from "../env.js";
import { getReceiptWriteCounters } from "../lib/receipt-shadow-writer.js";

export const statsReceiptShadowWriteRoute: FastifyPluginAsync = async (app) => {
  app.get("/stats/receipt-shadow-write", async () => {
    const c = getReceiptWriteCounters();
    return {
      enabled: env.ENABLE_RECEIPT_SHADOW_WRITE,
      ok: c.ok,
      duplicate: c.duplicate,
      failed: c.failed,
      lastOutcome: c.lastOutcome,
      lastAt: c.lastAt,
      lastError: c.lastError,
    };
  });
};
