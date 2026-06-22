import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { waOutboundQueue } from "../queues.js";
import { env } from "../env.js";
import { logger } from "../logger.js";

const bodySchema = z.object({
  organization_id: z.string().uuid(),
  instance_id: z.string().optional(),
  type: z.enum(["text", "media"]).default("text"),
  to: z.string().min(5),
  payload: z.record(z.any()).default({}),
});

export const waSendRoute: FastifyPluginAsync = async (app) => {
  app.post("/wa/send", async (req, reply) => {
    const token = req.headers["x-internal-token"];
    if (token !== env.X1ZAP_INTERNAL_TOKEN) {
      return reply.code(401).send({ error: "unauthorized" });
    }

    const parsed = bodySchema.safeParse(req.body);
    if (!parsed.success) {
      return reply
        .code(400)
        .send({ error: "invalid_body", details: parsed.error.flatten() });
    }

    const job = await waOutboundQueue.add("send", parsed.data);
    logger.info(
      {
        jobId: job.id,
        org: parsed.data.organization_id,
        to: parsed.data.to,
        type: parsed.data.type,
      },
      "[wa:send] queued",
    );
    return reply.code(202).send({ queued: true, jobId: job.id });
  });
};
