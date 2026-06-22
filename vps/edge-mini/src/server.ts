import Fastify from "fastify";
import cors from "@fastify/cors";
import { env, corsOrigins } from "./env.js";
import { logger } from "./logger.js";
import { registerUazapiWebhookRoute } from "./routes/webhook-uazapi.js";
import { registerWaSendRoute } from "./routes/wa-send.js";

const app = Fastify({
  logger,
  bodyLimit: 10 * 1024 * 1024, // 10 MB (mídia base64 ocasional)
  trustProxy: true,
});

await app.register(cors, {
  origin: (origin, cb) => {
    if (!origin) return cb(null, true); // health, server-to-server
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

await registerUazapiWebhookRoute(app);
await registerWaSendRoute(app);

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
