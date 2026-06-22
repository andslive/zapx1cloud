import type { FastifyPluginAsync } from "fastify";
import { waInboundQueue } from "../queues.js";
import { logger } from "../logger.js";

export const uazapiWebhookRoute: FastifyPluginAsync = async (app) => {
  app.post("/webhooks/uazapi", async (req, reply) => {
    const payload = (req.body ?? {}) as Record<string, unknown>;

    const safeJobId = (value: string): string =>
      value.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 200);

    const extractId = (p: Record<string, unknown>): string | undefined => {
      const message = p?.message as Record<string, unknown> | undefined;
      const key = (message?.key ?? p?.key) as Record<string, unknown> | undefined;
      return (
        (message?.id as string | undefined) ||
        (key?.id as string | undefined) ||
        (p?.id as string | undefined) ||
        (p?.messageId as string | undefined) ||
        undefined
      );
    };
    const providerId = extractId(payload);
    const jobId = providerId ? safeJobId(`uazapi-${providerId}`) : undefined;

    const job = await waInboundQueue.add(
      "uazapi",
      { receivedAt: new Date().toISOString(), payload },
      jobId ? { jobId } : undefined,
    );

    logger.info(
      { jobId: job.id, providerId, event: payload?.event },
      "[webhook:uazapi] queued",
    );
    return reply.code(202).send({ queued: true, jobId: job.id });
  });
};
