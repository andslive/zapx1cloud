import type { FastifyPluginAsync } from "fastify";
import { waInboundQueue } from "../queues.js";
import { logger } from "../logger.js";

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

export const uazapiShadowWebhookRoute: FastifyPluginAsync = async (app) => {
  app.post("/webhooks/uazapi-shadow", async (req, reply) => {
    const payload = (req.body ?? {}) as Record<string, unknown>;
    const providerId = extractId(payload);
    const receivedAt = new Date().toISOString();
    const jobId = providerId
      ? safeJobId(`uazapi-shadow-${providerId}`)
      : undefined;

    const job = await waInboundQueue.add(
      "uazapi-shadow",
      {
        receivedAt,
        source: "uazapi-shadow",
        shadow: true,
        payload,
      },
      jobId ? { jobId } : undefined,
    );

    logger.info(
      {
        jobId: job.id,
        shadow: true,
        providerId,
        event: payload?.event,
      },
      "[webhook:uazapi-shadow] queued",
    );

    return reply.code(202).send({ queued: true, shadow: true, jobId: job.id });
  });
};
