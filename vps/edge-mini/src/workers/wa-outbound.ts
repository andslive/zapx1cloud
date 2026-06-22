import { Worker } from "bullmq";
import { connection } from "../redis.js";
import { env } from "../env.js";
import { logger } from "../logger.js";
import { WA_OUTBOUND_QUEUE, QUEUE_PREFIX } from "../queues.js";

const worker = new Worker(
  WA_OUTBOUND_QUEUE,
  async (job) => {
    if (env.DRY_RUN) {
      logger.info(
        {
          jobId: job.id,
          org: (job.data as any)?.organization_id,
          to: (job.data as any)?.to,
          type: (job.data as any)?.type,
        },
        "[wa:outbound] DRY_RUN — envio NÃO disparado",
      );
      return { ok: true, dry_run: true };
    }

    // ===== Bloco desativado na Fase A =====
    // Aqui entrará a chamada real à UazAPI (substituirá uazapi-send).
    throw new Error(
      "DRY_RUN está desativado mas a lógica real ainda não foi habilitada nesta fase.",
    );
  },
  { connection, prefix: QUEUE_PREFIX, concurrency: 4 },
);

worker.on("failed", (job, err) => {
  logger.error({ jobId: job?.id, err: err.message }, "[wa:outbound] failed");
});

worker.on("ready", () => {
  logger.info("[wa:outbound] worker ready");
});
