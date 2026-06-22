import pino from "pino";
import { env } from "./env.js";

export const logger = pino({
  level: env.LOG_LEVEL,
  base: { service: "edge-mini", dry_run: env.DRY_RUN },
  timestamp: pino.stdTimeFunctions.isoTime,
});
