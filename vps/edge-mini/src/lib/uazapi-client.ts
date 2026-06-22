/**
 * UazAPI client — stub Fase A.
 *
 * Enquanto DRY_RUN=true os workers NÃO chamam esta função.
 * Mantido aqui apenas para a Fase B habilitar o envio real
 * substituindo a Edge Function `uazapi-send` sem mudar contratos.
 */
import { env } from "../env.js";
import { logger } from "../logger.js";

export interface UazapiSendArgs {
  instanceToken: string;
  to: string;
  type: "text" | "media";
  payload: Record<string, unknown>;
}

export interface UazapiSendResult {
  ok: boolean;
  status: number;
  body: unknown;
}

export async function uazapiSend(args: UazapiSendArgs): Promise<UazapiSendResult> {
  if (env.DRY_RUN) {
    logger.warn({ to: args.to, type: args.type }, "[uazapi-client] DRY_RUN — chamada NÃO executada");
    return { ok: true, status: 0, body: { dry_run: true } };
  }

  if (!env.UAZAPI_URL) {
    throw new Error("UAZAPI_URL não configurado");
  }

  const endpoint =
    args.type === "media"
      ? `${env.UAZAPI_URL.replace(/\/$/, "")}/send/media`
      : `${env.UAZAPI_URL.replace(/\/$/, "")}/send/text`;

  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      token: args.instanceToken,
    },
    body: JSON.stringify({ number: args.to, ...args.payload }),
  });

  const text = await res.text();
  let body: unknown = text;
  try {
    body = JSON.parse(text);
  } catch {
    /* keep raw text */
  }

  return { ok: res.ok, status: res.status, body };
}
