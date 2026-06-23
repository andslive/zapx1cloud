import { Worker } from "bullmq";
import { connection } from "../redis.js";
import { env } from "../env.js";
import { logger } from "../logger.js";
import { WA_INBOUND_QUEUE, QUEUE_PREFIX } from "../queues.js";
import {
  saveRawPayload,
  shouldStore,
  startRotationTimer,
} from "../lib/raw-storage.js";
import { writeShadowLog } from "../lib/supabase-writer.js";

startRotationTimer();

const worker = new Worker(
  WA_INBOUND_QUEUE,
  async (job) => {
    const data = (job.data ?? {}) as {
      receivedAt?: string;
      source?: string;
      shadow?: boolean;
      payload?: unknown;
    };
    const source = data.source ?? "unknown";
    const payload = data.payload ?? {};

    // Fase C.2 — armazenar apenas shadow + origin marcador, sem tocar produção.
    let rawFilePath: string | null = null;
    if (source === "uazapi-shadow" && shouldStore(payload)) {
      try {
        const r = await saveRawPayload({
          receivedAt: data.receivedAt ?? new Date().toISOString(),
          source,
          jobId: String(job.id ?? ""),
          payload,
        });
        rawFilePath = r.file ?? null;
        logger.info(
          { jobId: job.id, saved: r.saved, reason: r.reason },
          "[wa:inbound] raw-storage",
        );
      } catch (err) {
        logger.error(
          { jobId: job.id, err: (err as Error).message },
          "[wa:inbound] raw-storage falhou",
        );
      }

      // Fase D.1 — cópia controlada em vps_shadow_webhook_logs (tabela isolada).
      try {
        await writeShadowLog({
          receivedAt: data.receivedAt ?? new Date().toISOString(),
          source,
          rawFilePath,
          payload,
        });
      } catch (err) {
        logger.error(
          { jobId: job.id, err: (err as Error).message },
          "[wa:inbound] supabase-writer falhou",
        );
      }
    }

    if (env.DRY_RUN) {
      logger.info(
        {
          jobId: job.id,
          attempts: job.attemptsMade,
          source,
          keys: Object.keys(payload as object),
        },
        "[wa:inbound] DRY_RUN — payload descartado (sem escrita produção)",
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
  { connection, prefix: QUEUE_PREFIX, concurrency: 8 },
);

worker.on("failed", (job, err) => {
  logger.error({ jobId: job?.id, err: err.message }, "[wa:inbound] failed");
});

worker.on("ready", () => {
  logger.info("[wa:inbound] worker ready");
});
