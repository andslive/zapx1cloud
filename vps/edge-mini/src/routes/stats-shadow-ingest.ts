import type { FastifyPluginAsync } from "fastify";
import { env } from "../env.js";
import { getIngestCounters } from "../lib/shadow-ingest.js";

export const statsShadowIngestRoute: FastifyPluginAsync = async (app) => {
  app.get("/stats/shadow-ingest", async () => {
    const c = getIngestCounters();
    return {
      enabled: env.ENABLE_SHADOW_INGEST,
      urlConfigured: Boolean(env.SHADOW_INGEST_URL),
      tokenConfigured: Boolean(env.SHADOW_INGEST_TOKEN),
      dryRun: env.DRY_RUN,
      ok: c.ok,
      duplicate: c.duplicate,
      failed: c.failed,
      disabled: c.disabled,
      skipped_origin: c.skipped_origin,
      misconfigured: c.misconfigured,
      lastOutcome: c.lastOutcome,
      lastAt: c.lastAt,
      lastError: c.lastError,
    };
  });
};
