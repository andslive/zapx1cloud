import type { FastifyInstance } from "fastify";
import { waInboundQueue } from "../queues.js";
import { logger } from "../logger.js";

export async function registerUazapiWebhookRoute(app: FastifyInstance) {
  app.post("/webhooks/uazapi", async (req, reply) => {
    const payload = (req.body ?? {}) as Record<string, unknown>;

    // Try to extract a stable provider message id for idempotency
    const extractId = (p: any): string | undefined => {
      return (
        p?.message?.id ||
        p?.message?.key?.id ||
        p?.id ||
        p?.messageId ||
        p?.key?.id ||
        undefined
      );
    };
    const providerId = extractId(payload);
    const jobId = providerId ? `uazapi:${providerId}` : undefined;

    const job = await waInboundQueue.add(
      "uazapi",
      { receivedAt: new Date().toISOString(), payload },
      jobId ? { jobId } : undefined,
    );

    logger.info(
      { jobId: job.id, providerId, event: (payload as any)?.event },
      "[webhook:uazapi] queued",
    );
    return reply.code(202).send({ queued: true, jobId: job.id });
  });
}
