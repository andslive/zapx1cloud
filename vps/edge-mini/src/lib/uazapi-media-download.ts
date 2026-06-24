// Fase D.2.2 — Download de mídia descriptografada via UazAPI.
// Usa POST {base}/message/download com header `token: <instance-token>`
// e body { id, return_base64: true, return_link: false }.
// NÃO envia WhatsApp. NÃO altera Supabase. Apenas baixa bytes para OCR Shadow.

import { promises as fsp } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { env } from "../env.js";
import { logger } from "../logger.js";

const extFromMime = (mime: string | null): string => {
  if (!mime) return "bin";
  if (/^application\/pdf$/i.test(mime)) return "pdf";
  const m = /^image\/(\w+)$/i.exec(mime);
  if (m) return m[1].toLowerCase().replace("jpeg", "jpg");
  return "bin";
};

export interface UazapiDownloadInput {
  messageId: string;
  instanceToken: string | null;
  mime: string | null;
}

export interface UazapiDownloadResult {
  filePath: string;
  mime: string | null;
}

export const downloadUazapiMedia = async (
  input: UazapiDownloadInput,
): Promise<UazapiDownloadResult> => {
  const base = (env.UAZAPI_BASE_URL || env.UAZAPI_URL || "").replace(/\/$/, "");
  if (!base) throw new Error("uazapi_base_url_missing");
  const token = input.instanceToken || env.UAZAPI_ADMIN_TOKEN || "";
  if (!token) throw new Error("uazapi_token_missing");
  if (!input.messageId) throw new Error("missing_message_id");

  const res = await fetch(`${base}/message/download`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      token,
    },
    body: JSON.stringify({
      id: input.messageId,
      return_base64: true,
      return_link: false,
    }),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`uazapi_download_http_${res.status}:${text.slice(0, 200)}`);
  }
  let json: Record<string, unknown> = {};
  try {
    json = JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new Error("uazapi_download_invalid_json");
  }
  const b64 =
    (typeof json.base64Data === "string" && json.base64Data) ||
    (typeof json.base64 === "string" && (json.base64 as string)) ||
    "";
  if (!b64) {
    // Fallback: maybe only fileURL is returned — caller can retry via plain URL,
    // but for now we treat as failure.
    throw new Error("uazapi_download_no_base64");
  }
  const mime =
    (typeof json.mimetype === "string" && json.mimetype) ||
    input.mime ||
    null;
  const ext = extFromMime(mime);
  const buf = Buffer.from(b64.replace(/^data:[^;]+;base64,/, ""), "base64");
  const file = join(tmpdir(), `ocr-uaz-${randomUUID()}.${ext}`);
  await fsp.writeFile(file, buf);
  logger.info(
    { messageId: input.messageId, mime, bytes: buf.length },
    "[uazapi-download] mídia baixada",
  );
  return { filePath: file, mime };
};
