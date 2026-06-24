import type { FastifyPluginAsync } from "fastify";
import { env } from "../env.js";
import { getReceiptIngestCounters } from "../lib/receipt-shadow-ingest.js";

export const statsReceiptShadowIngestRoute: FastifyPluginAsync = async (app) => {
  app.get("/stats/receipt-shadow-ingest", async () => {
    const c = getReceiptIngestCounters();
    return {
      enabled: env.ENABLE_RECEIPT_SHADOW_INGEST,
      urlConfigured: Boolean(env.RECEIPT_SHADOW_INGEST_URL),
      tokenConfigured: Boolean(env.RECEIPT_SHADOW_INGEST_TOKEN),
      ok: c.ok,
      duplicate: c.duplicate,
      failed: c.failed,
      misconfigured: c.misconfigured,
      lastOutcome: c.lastOutcome,
      lastAt: c.lastAt,
      lastError: c.lastError,
    };
  });
};
