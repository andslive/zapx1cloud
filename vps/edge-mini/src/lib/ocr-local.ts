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

const getTimeoutMs = (): number => Number(env.OCR_LOCAL_TIMEOUT_MS || 30000);

const tesseractOcr = async (file: string): Promise<string> => {
  const bin = env.OCR_LOCAL_TESSERACT_BIN || "tesseract";
  const langs = env.OCR_LOCAL_LANGS || "por+eng";
  const timeoutMs = getTimeoutMs();
  const r = await exec(
    bin,
    [file, "stdout", "-l", langs, "--psm", "6"],
    timeoutMs,
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
  const timeoutMs = getTimeoutMs();
  const r = await exec(
    bin,
    ["-r", "200", "-png", pdfFile, outBase],
    timeoutMs,
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

export interface LocalOcrResult {
  text: string;
  originalPageCount: number | null;
  truncatedPages: boolean;
  tooLarge: boolean;
  fileBytes: number | null;
}

export const runLocalOcr = async (media: {
  url: string | null;
  mime: string | null;
  localPath?: string | null;
}): Promise<LocalOcrResult> => {
  const mime = media.mime ?? "";
  const hasLocal = !!media.localPath;
  if (!media.url && !hasLocal) throw new Error("missing_media_url");

  if (process.env.OCR_LOCAL_DEBUG === "1") {
    // eslint-disable-next-line no-console
    console.log("[ocr-local] config", {
      timeout_ms: getTimeoutMs(),
      max_pdf_pages: Number(env.OCR_LOCAL_MAX_PDF_PAGES) || null,
      max_file_mb: Number(env.OCR_LOCAL_MAX_FILE_MB) || null,
      mime: media.mime,
    });
  }

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
    const maxMb = Number(env.OCR_LOCAL_MAX_FILE_MB) || 0;
    let fileBytes: number | null = null;
    try {
      const st = await fsp.stat(downloaded);
      fileBytes = st.size;
      if (maxMb > 0 && st.size > maxMb * 1024 * 1024) {
        return {
          text: "",
          originalPageCount: null,
          truncatedPages: false,
          tooLarge: true,
          fileBytes,
        };
      }
    } catch {
      // se stat falhar, segue
    }

    if (isPdf) {
      const allPages = await pdfToImages(downloaded);
      const maxPages = Number(env.OCR_LOCAL_MAX_PDF_PAGES) || allPages.length;
      const pages = allPages.slice(0, Math.max(1, maxPages));
      const extras = allPages.slice(pages.length);
      try {
        const parts: string[] = [];
        for (let i = 0; i < pages.length; i++) {
          const txt = await tesseractOcr(pages[i]);
          parts.push(`--- page ${i + 1} ---\n${txt}`);
        }
        return {
          text: parts.join("\n\n"),
          originalPageCount: allPages.length,
          truncatedPages: extras.length > 0,
          tooLarge: false,
          fileBytes,
        };
      } finally {
        await Promise.all([...pages, ...extras].map(safeUnlink));
      }
    }
    const text = await tesseractOcr(downloaded);
    return {
      text,
      originalPageCount: 1,
      truncatedPages: false,
      tooLarge: false,
      fileBytes,
    };
  } finally {
    if (ownsFile) await safeUnlink(downloaded);
  }
};


