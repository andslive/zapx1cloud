import { Queue } from "bullmq";
import { connection } from "./redis.js";

const defaultJobOptions = {
  removeOnComplete: { count: 1000, age: 60 * 60 * 24 },
  removeOnFail: { count: 5000, age: 60 * 60 * 24 * 7 },
  attempts: 5,
  backoff: { type: "exponential" as const, delay: 2000 },
};

export const QUEUE_PREFIX = "x1zap";
export const WA_INBOUND_QUEUE = "wa-inbound";
export const WA_OUTBOUND_QUEUE = "wa-outbound";

export const waInboundQueue = new Queue(WA_INBOUND_QUEUE, {
  connection,
  prefix: QUEUE_PREFIX,
  defaultJobOptions,
});

export const waOutboundQueue = new Queue(WA_OUTBOUND_QUEUE, {
  connection,
  prefix: QUEUE_PREFIX,
  defaultJobOptions,
});
