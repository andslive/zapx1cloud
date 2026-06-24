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
import { sendShadowIngest } from "../lib/shadow-ingest.js";
import { processOcrShadow } from "../lib/ocr-shadow.js";

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

      // Fase D.1 — cópia controlada em vps_shadow_webhook_logs (legacy, default OFF).
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

      // Fase D.1.1 — envio via HTTP ingest proxy (Edge Function), sem service role key.
      try {
        await sendShadowIngest({
          receivedAt: data.receivedAt ?? new Date().toISOString(),
          source,
          rawFilePath,
          payload,
        });
      } catch (err) {
        logger.error(
          { jobId: job.id, err: (err as Error).message },
          "[wa:inbound] shadow-ingest falhou",
        );
      }

      // Fase D.2 — OCR shadow (default OFF). Apenas mídia imagem/PDF.
      try {
        const ocrRes = await processOcrShadow({
          receivedAt: data.receivedAt ?? new Date().toISOString(),
          source,
          payload,
        });

        // Fase D.3 — Receipt shadow: classifica o JSON gerado pelo OCR shadow.
        // Não toca produção, Supabase, Pixel, Purchase Audit, Inbox, Leads.
        if (ocrRes?.outcome === "OK" && ocrRes.file) {
          try {
            const fs = await import("node:fs/promises");
            const raw = await fs.readFile(ocrRes.file, "utf8");
            const parsed = JSON.parse(raw) as {
              received_at?: string;
              instance?: string | null;
              message_id?: string | null;
              ocr_text?: string;
            };
            const { processReceiptShadowFile } = await import(
              "../lib/receipt-ai-shadow.js"
            );
            await processReceiptShadowFile(parsed);
          } catch (err) {
            logger.error(
              { jobId: job.id, err: (err as Error).message },
              "[wa:inbound] receipt-shadow falhou",
            );
          }
        }
      } catch (err) {
        logger.error(
          { jobId: job.id, err: (err as Error).message },
          "[wa:inbound] ocr-shadow falhou",
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
