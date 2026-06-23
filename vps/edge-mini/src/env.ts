import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.string().default("production"),
  PORT: z.coerce.number().default(8787),
  HOST: z.string().default("127.0.0.1"),
  TZ: z.string().default("America/Sao_Paulo"),
  LOG_LEVEL: z.string().default("info"),
  DRY_RUN: z
    .string()
    .default("true")
    .transform((v) => v.toLowerCase() !== "false"),
  SUPABASE_URL: z.string().optional().default(""),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional().default(""),
  UAZAPI_URL: z.string().optional().default(""),
  UAZAPI_ADMIN_TOKEN: z.string().optional().default(""),
  REDIS_URL: z.string().default("redis://127.0.0.1:6379/0"),
  X1ZAP_INTERNAL_TOKEN: z.string().min(8, "X1ZAP_INTERNAL_TOKEN obrigatório"),
  CORS_ALLOWED_ORIGINS: z.string().default(""),
  RAW_STORAGE_DIR: z
    .string()
    .default("/opt/x1zap/edge-mini/storage/raw-payloads"),
  RAW_STORAGE_MAX_PER_DAY: z.coerce.number().default(10000),
  RAW_STORAGE_RETENTION_DAYS: z.coerce.number().default(7),
  ENABLE_SUPABASE_WRITE: z
    .string()
    .default("false")
    .transform((v) => v.toLowerCase() === "true"),
  ENABLE_SHADOW_INGEST: z
    .string()
    .default("true")
    .transform((v) => v.toLowerCase() === "true"),
  SHADOW_INGEST_URL: z.string().optional().default(""),
  SHADOW_INGEST_TOKEN: z.string().optional().default(""),
});

export const env = schema.parse(process.env);

export const corsOrigins = env.CORS_ALLOWED_ORIGINS.split(",")
  .map((s) => s.trim())
  .filter(Boolean);
