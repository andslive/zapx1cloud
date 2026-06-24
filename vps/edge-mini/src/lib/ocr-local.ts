// Fase D.2.1 — OCR local (sem dependências externas).
// Usa binários presentes na VPS2:
//   tesseract (apt install tesseract-ocr tesseract-ocr-por)
//   pdftoppm  (apt install poppler-utils)
// Nenhuma chamada a serviços externos, Lovable, Supabase ou WhatsApp.

import { spawn } from "node:child_process";
import { promises as fsp } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { env } from "../env.js";

const PDF_RE = /^application\/pdf$/i;
const IMAGE_RE = /^image\/(jpeg|jpg|png|webp|bmp|tiff?|gif)$/i;

const extFromMime = (mime: string | null, url: string | null): string => {
  if (mime) {
    if (PDF_RE.test(mime)) return "pdf";
    const m = /^image\/(\w+)$/i.exec(mime);
    if (m) return m[1].toLowerCase().replace("jpeg", "jpg");
  }
  if (url) {
    const m = /\.(pdf|png|jpe?g|webp|bmp|tiff?|gif)(\?|$)/i.exec(url);
    if (m) return m[1].toLowerCase().replace("jpeg", "jpg");
  }
  return "bin";
};

interface ExecResult {
  code: number;
  stdout: string;
  stderr: string;
}

const exec = (
  bin: string,
  args: string[],
  timeoutMs = 60_000,
): Promise<ExecResult> =>
  new Promise((resolveP, rejectP) => {
    const child = spawn(bin, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    const to = setTimeout(() => {
      child.kill("SIGKILL");
      rejectP(new Error(`timeout:${bin}`));
    }, timeoutMs);
    child.stdout.on("data", (d) => {
      stdout += d.toString("utf8");
    });
    child.stderr.on("data", (d) => {
      stderr += d.toString("utf8");
    });
    child.on("error", (err) => {
      clearTimeout(to);
      rejectP(err);
    });
    child.on("close", (code) => {
      clearTimeout(to);
      resolveP({ code: code ?? -1, stdout, stderr });
    });
  });

const downloadToTmp = async (
  url: string,
  ext: string,
): Promise<string> => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download_http_${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const file = join(tmpdir(), `ocr-${randomUUID()}.${ext}`);
  await fsp.writeFile(file, buf);
  return file;
};

const tesseractOcr = async (file: string): Promise<string> => {
  const bin = env.OCR_LOCAL_TESSERACT_BIN || "tesseract";
  const langs = env.OCR_LOCAL_LANGS || "por+eng";
  const r = await exec(
    bin,
    [file, "stdout", "-l", langs, "--psm", "6"],
    Number(env.OCR_LOCAL_TIMEOUT_MS) || 60_000,
  );
  if (r.code !== 0) {
    throw new Error(
      `tesseract_failed:${r.code}:${r.stderr.slice(0, 200) || r.stdout.slice(0, 200)}`,
    );
  }
  return r.stdout.trim();
};

const pdfToImages = async (pdfFile: string): Promise<string[]> => {
  const bin = env.OCR_LOCAL_PDFTOPPM_BIN || "pdftoppm";
  const outBase = join(tmpdir(), `ocr-${randomUUID()}`);
  const r = await exec(
    bin,
    ["-r", "200", "-png", pdfFile, outBase],
    Number(env.OCR_LOCAL_TIMEOUT_MS) || 60_000,
  );
  if (r.code !== 0) {
    throw new Error(
      `pdftoppm_failed:${r.code}:${r.stderr.slice(0, 200)}`,
    );
  }
  // pdftoppm gera outBase-1.png, outBase-2.png ...
  const dir = tmpdir();
  const prefix = outBase.split("/").pop() ?? "";
  const all = await fsp.readdir(dir);
  return all
    .filter((f) => f.startsWith(prefix) && f.endsWith(".png"))
    .sort()
    .map((f) => join(dir, f));
};

const safeUnlink = async (file: string) => {
  try {
    await fsp.unlink(file);
  } catch {
    // ignore
  }
};

export const runLocalOcr = async (media: {
  url: string | null;
  mime: string | null;
  localPath?: string | null;
}): Promise<string> => {
  const mime = media.mime ?? "";
  const hasLocal = !!media.localPath;
  if (!media.url && !hasLocal) throw new Error("missing_media_url");

  const refForExt = media.localPath ?? media.url ?? "";
  const isPdf = PDF_RE.test(mime) || /\.pdf(\?|$)/i.test(refForExt);
  const isImage =
    IMAGE_RE.test(mime) ||
    /\.(png|jpe?g|webp|bmp|tiff?|gif)(\?|$)/i.test(refForExt);

  if (!isPdf && !isImage) throw new Error("unsupported_mime");

  const ext = extFromMime(mime, refForExt);
  const downloaded = hasLocal
    ? (media.localPath as string)
    : await downloadToTmp(media.url as string, ext);
  const ownsFile = !hasLocal;

  try {
    if (isPdf) {
      const pages = await pdfToImages(downloaded);
      try {
        const parts: string[] = [];
        for (let i = 0; i < pages.length; i++) {
          const txt = await tesseractOcr(pages[i]);
          parts.push(`--- page ${i + 1} ---\n${txt}`);
        }
        return parts.join("\n\n");
      } finally {
        await Promise.all(pages.map(safeUnlink));
      }
    }
    return await tesseractOcr(downloaded);
  } finally {
    if (ownsFile) await safeUnlink(downloaded);
  }
};

