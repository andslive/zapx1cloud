import IORedis from "ioredis";
import { env } from "./env.js";

export const connection = new IORedis(env.REDIS_URL, {
  maxRetriesPerRequest: null,
  enableReadyCheck: true,
});

connection.on("error", (e) => {
  // eslint-disable-next-line no-console
  console.error("[redis] error:", e.message);
});
