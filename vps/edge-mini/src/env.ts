import { z } from "zod";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

// Carrega .env explicitamente para não depender de PM2 --update-env.
// .env é a fonte de verdade. Variáveis já presentes em process.env têm precedência.
const candidates = [
  process.env.EDGE_MINI_ENV_FILE,
  resolve(process.cwd(), ".env"),
  "/opt/x1zap/edge-mini/.env",
].filter(Boolean) as string[];

for (const file of candidates) {
  if (existsSync(file)) {
    try {
      // Node >=20.6 / >=22: loadEnvFile não sobrescreve process.env existente.
      (process as unknown as { loadEnvFile: (p: string) => void }).loadEnvFile(file);
    } catch {
      // ignore — segue com process.env corrente
    }
    break;
  }
}


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
  ENABLE_OCR_SHADOW: z
    .string()
    .default("false")
    .transform((v) => v.toLowerCase() === "true"),
  OCR_SHADOW_DIR: z
    .string()
    .default("/opt/x1zap/edge-mini/storage/ocr-shadow"),
  OCR_PROVIDER: z.string().default("none"),
  OCR_SHADOW_URL: z.string().optional().default(""),
  OCR_SHADOW_TOKEN: z.string().optional().default(""),
  OCR_LOCAL_TESSERACT_BIN: z.string().default("tesseract"),
  OCR_LOCAL_PDFTOPPM_BIN: z.string().default("pdftoppm"),
  OCR_LOCAL_LANGS: z.string().default("por+eng"),
  OCR_LOCAL_TIMEOUT_MS: z.coerce.number().default(30000),
  OCR_LOCAL_MAX_PDF_PAGES: z.coerce.number().default(2),
  OCR_LOCAL_MAX_FILE_MB: z.coerce.number().default(5),
  OCR_MEDIA_DOWNLOAD_PROVIDER: z.string().default("none"),
  UAZAPI_BASE_URL: z.string().optional().default(""),
  ENABLE_RECEIPT_SHADOW_WRITE: z
    .string()
    .default("false")
    .transform((v) => v.toLowerCase() === "true"),
  ENABLE_RECEIPT_SHADOW_INGEST: z
    .string()
    .default("false")
    .transform((v) => v.toLowerCase() === "true"),
  RECEIPT_SHADOW_INGEST_URL: z.string().optional().default(""),
  RECEIPT_SHADOW_INGEST_TOKEN: z.string().optional().default(""),
  ENABLE_AI_SHADOW: z
    .string()
    .default("false")
    .transform((v) => v.toLowerCase() === "true"),
  AI_SHADOW_PROVIDER: z.string().default("none"),
  AI_SHADOW_DIR: z
    .string()
    .default("/opt/x1zap/edge-mini/storage/ai-shadow"),
  AI_SHADOW_ONLY_RECEIPTS: z
    .string()
    .default("true")
    .transform((v) => v.toLowerCase() !== "false"),
  ENABLE_RECEIPT_PRODUCTION_WRITE: z
    .string()
    .default("false")
    .transform((v) => v.toLowerCase() === "true"),
  RECEIPT_PRODUCTION_ALLOWED_INSTANCES: z.string().default(""),
});



export const env = schema.parse(process.env);

export const corsOrigins = env.CORS_ALLOWED_ORIGINS.split(",")
  .map((s) => s.trim())
  .filter(Boolean);
