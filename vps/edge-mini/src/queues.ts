import { Queue } from "bullmq";
import { connection } from "./redis.js";

const defaultJobOptions = {
  removeOnComplete: { count: 1000, age: 60 * 60 * 24 },
  removeOnFail: { count: 5000, age: 60 * 60 * 24 * 7 },
  attempts: 5,
  backoff: { type: "exponential" as const, delay: 2000 },
};

export const waInboundQueue = new Queue("wa:inbound", {
  connection,
  defaultJobOptions,
});

export const waOutboundQueue = new Queue("wa:outbound", {
  connection,
  defaultJobOptions,
});
