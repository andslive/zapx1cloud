import { Worker } from "bullmq";
import { connection } from "../redis.js";
import { env } from "../env.js";
import { logger } from "../logger.js";

const worker = new Worker(
  "wa:inbound",
  async (job) => {
    if (env.DRY_RUN) {
      logger.info(
        {
          jobId: job.id,
          attempts: job.attemptsMade,
          keys: Object.keys((job.data?.payload ?? {}) as object),
        },
        "[wa:inbound] DRY_RUN — payload descartado (sem escrita)",
      );
      return { ok: true, dry_run: true };
    }

    // ===== Bloco desativado na Fase A =====
    // Aqui entrará a lógica real (mesmas escritas que a Edge uazapi-webhook faz).
    // Mantido vazio de propósito: NÃO executar nada além de log enquanto DRY_RUN=true.
    throw new Error(
      "DRY_RUN está desativado mas a lógica real ainda não foi habilitada nesta fase.",
    );
  },
  { connection, concurrency: 8 },
);

worker.on("failed", (job, err) => {
  logger.error({ jobId: job?.id, err: err.message }, "[wa:inbound] failed");
});

worker.on("ready", () => {
  logger.info("[wa:inbound] worker ready");
});
