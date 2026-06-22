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
});

export const env = schema.parse(process.env);

export const corsOrigins = env.CORS_ALLOWED_ORIGINS.split(",")
  .map((s) => s.trim())
  .filter(Boolean);
