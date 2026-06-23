import type { FastifyPluginAsync } from "fastify";
import { env } from "../env.js";
import { getCounters } from "../lib/supabase-writer.js";

export const statsSupabaseWriteRoute: FastifyPluginAsync = async (app) => {
  app.get("/stats/supabase-write", async () => {
    const c = getCounters();
    return {
      enabled: env.ENABLE_SUPABASE_WRITE,
      hasCredentials: Boolean(
        env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY,
      ),
      dryRun: env.DRY_RUN,
      counters: {
        ok: c.ok,
        duplicate: c.duplicate,
        failed: c.failed,
        disabled: c.disabled,
        skipped_origin: c.skipped_origin,
      },
      lastOutcome: c.lastOutcome,
      lastAt: c.lastAt,
      lastError: c.lastError,
    };
  });
};
