import Fastify from "fastify";
import cors from "@fastify/cors";
import { env, corsOrigins } from "./env.js";
import { logger } from "./logger.js";
import { uazapiWebhookRoute } from "./routes/webhook-uazapi.js";
import { uazapiShadowWebhookRoute } from "./routes/webhook-uazapi-shadow.js";
import { waSendRoute } from "./routes/wa-send.js";
import { statsRawStorageRoute } from "./routes/stats-raw-storage.js";
import { startRotationTimer } from "./lib/raw-storage.js";

const app = Fastify({
  logger,
  bodyLimit: 10 * 1024 * 1024,
  trustProxy: true,
});

await app.register(cors, {
  origin: (origin, cb) => {
    if (!origin) return cb(null, true);
    if (corsOrigins.length === 0 || corsOrigins.includes(origin)) {
      return cb(null, true);
    }
    return cb(new Error("origin_not_allowed"), false);
  },
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["content-type", "x-internal-token", "authorization"],
});

app.get("/health", async () => ({
  ok: true,
  service: "edge-mini",
  dry_run: env.DRY_RUN,
  ts: new Date().toISOString(),
}));

await app.register(uazapiWebhookRoute);
await app.register(uazapiShadowWebhookRoute);
await app.register(waSendRoute);
await app.register(statsRawStorageRoute);

startRotationTimer();

const port = env.PORT;
const host = env.HOST;

app
  .listen({ port, host })
  .then(() => {
    logger.info({ port, host, dry_run: env.DRY_RUN }, "edge-mini listening");
  })
  .catch((err) => {
    logger.error({ err }, "failed to start");
    process.exit(1);
  });
