// FASE 2A — cliente HTTP isolado para a WhatsApp Cloud API (Meta), separado
// de qualquer lógica de negócio do CRM. Nenhuma chamada real é feita nesta
// fase (sem token real, sem número real, sem deploy) — este módulo só é
// exercitado por testes com fetch mockado.
//
// Versão do Graph API: NUNCA hardcoded em múltiplos lugares. Uma única
// configuração central (`META_GRAPH_API_VERSION`, com fallback para a
// constante `DEFAULT_GRAPH_API_VERSION` abaixo). O valor default aqui
// (`v26.0`) é documentado como valor de DESENVOLVIMENTO/TESTE — decisão
// registrada em 2026-08-10 (v26.0, lançada em 2026-07-29, segundo pesquisa
// da Fase 1). Confirmar no App Dashboard da Meta antes de qualquer uso
// real (ver relatório Fase 1, pergunta 6, e checklist externo do relatório
// desta fase).

export const DEFAULT_GRAPH_API_VERSION = "v26.0";

export function resolveGraphApiVersion(env: { get(key: string): string | undefined } = Deno.env): string {
  return env.get("META_GRAPH_API_VERSION") || DEFAULT_GRAPH_API_VERSION;
}

export function buildGraphApiBaseUrl(version: string): string {
  return `https://graph.facebook.com/${version}`;
}

export interface MetaGraphErrorDetail {
  message: string;
  type?: string;
  code?: number;
  errorSubcode?: number;
  fbtraceId?: string;
  errorData?: unknown;
}

export class MetaGraphApiError extends Error {
  readonly detail: MetaGraphErrorDetail;
  readonly httpStatus: number;
  readonly retryable: boolean;

  constructor(detail: MetaGraphErrorDetail, httpStatus: number, retryable: boolean) {
    super(detail.message);
    this.name = "MetaGraphApiError";
    this.detail = detail;
    this.httpStatus = httpStatus;
    this.retryable = retryable;
  }
}

export class MetaGraphTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`Meta Graph API request excedeu ${timeoutMs}ms`);
    this.name = "MetaGraphTimeoutError";
  }
}

export class MetaGraphInvalidResponseError extends Error {
  readonly httpStatus: number;
  readonly rawBody: string;
  constructor(httpStatus: number, rawBody: string) {
    super(`Resposta não-JSON da Meta Graph API (status ${httpStatus})`);
    this.name = "MetaGraphInvalidResponseError";
    this.httpStatus = httpStatus;
    // Corpo truncado — nunca logar/propagar corpo bruto ilimitado (pode conter dados sensíveis).
    this.rawBody = rawBody.slice(0, 500);
  }
}

/**
 * Interface de obtenção de token — deliberadamente desacoplada de QUALQUER
 * mecanismo de storage concreto.
 *
 * FASE 2B.0.EVOHUB-1 — implementação real (`meta-access-token-provider.ts`)
 * adicionada, sobre `meta-vault-secrets.ts`/Supabase Vault. `organizationId`
 * é exigido explicitamente aqui (não apenas `connectionId`) por decisão de
 * segurança deliberada: a implementação NUNCA deve re-resolver a
 * organização por conta própria a partir do `connectionId` — isso
 * reintroduziria o mesmo padrão de risco cross-tenant já corrigido em
 * outras funções deste projeto (confiar em um id sem validar o vínculo
 * apresentado pelo chamador). Quem implementa esta interface é responsável
 * por nunca deixar o token vazar em log, resposta de API, ou coluna plana.
 */
export interface MetaAccessTokenProvider {
  getAccessToken(connectionId: string, organizationId: string): Promise<string>;
}

export interface MetaCloudClientDeps {
  fetchImpl?: typeof fetch;
  graphApiVersion?: string;
  timeoutMs?: number;
  env?: { get(key: string): string | undefined };
}

export interface MetaCloudRequestContext {
  phoneNumberId: string;
  accessToken: string;
}

async function fetchWithTimeout(
  fetchImpl: typeof fetch,
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchImpl(url, { ...init, signal: controller.signal });
  } catch (err: any) {
    if (err?.name === "AbortError") {
      throw new MetaGraphTimeoutError(timeoutMs);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/** true para erros que fazem sentido retentar (rede/instabilidade), nunca para 4xx de validação. */
function isRetryableGraphError(httpStatus: number, code?: number): boolean {
  if (httpStatus >= 500) return true;
  if (httpStatus === 429) return true;
  // Código 131060 documentado pela Meta ("usuário mensageia pela primeira
  // vez após onboarding") é tipicamente transitório — ver relatório Fase 1, §6.
  if (code === 131060) return true;
  return false;
}

async function parseGraphResponse(res: Response): Promise<Record<string, unknown>> {
  const text = await res.text();
  let parsed: unknown;
  try {
    parsed = text ? JSON.parse(text) : {};
  } catch {
    throw new MetaGraphInvalidResponseError(res.status, text);
  }
  return parsed as Record<string, unknown>;
}

/**
 * Chamada de baixo nível ao Graph API. NUNCA loga headers (o token vai só
 * no header Authorization, nunca em query string, nunca em log). Em caso de
 * erro, preserva fbtrace_id/code/subcode para auditoria — sem incluir o
 * token em nenhum campo do erro.
 */
export async function callMetaGraphApi(
  deps: MetaCloudClientDeps,
  ctx: MetaCloudRequestContext,
  path: string,
  init: { method: "GET" | "POST"; body?: Record<string, unknown> },
): Promise<Record<string, unknown>> {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const version = deps.graphApiVersion ?? resolveGraphApiVersion(deps.env);
  const timeoutMs = deps.timeoutMs ?? 15_000;
  const url = `${buildGraphApiBaseUrl(version)}/${path}`;

  const res = await fetchWithTimeout(
    fetchImpl,
    url,
    {
      method: init.method,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${ctx.accessToken}`,
      },
      body: init.method === "POST" ? JSON.stringify(init.body ?? {}) : undefined,
    },
    timeoutMs,
  );

  const body = await parseGraphResponse(res);

  if (!res.ok || (body as any).error) {
    const errObj = (body as any).error ?? {};
    const detail: MetaGraphErrorDetail = {
      message: errObj.message || `Meta Graph API retornou status ${res.status}`,
      type: errObj.type,
      code: errObj.code,
      errorSubcode: errObj.error_subcode,
      fbtraceId: errObj.fbtrace_id,
      errorData: errObj.error_data,
    };
    throw new MetaGraphApiError(detail, res.status, isRetryableGraphError(res.status, errObj.code));
  }

  return body;
}

// ── Envio de mensagens ──────────────────────────────────────────────────

export type MetaMessagePayload =
  | { type: "text"; text: { body: string; preview_url?: boolean } }
  | { type: "image"; image: { link?: string; id?: string; caption?: string } }
  | { type: "audio"; audio: { link?: string; id?: string } }
  | { type: "video"; video: { link?: string; id?: string; caption?: string } }
  | { type: "document"; document: { link?: string; id?: string; filename?: string; caption?: string } }
  | {
    type: "template";
    template: { name: string; language: { code: string }; components?: unknown[] };
  };

export interface MetaSendMessageResult {
  messageId?: string;
  raw: Record<string, unknown>;
}

export async function sendMetaMessage(
  deps: MetaCloudClientDeps,
  ctx: MetaCloudRequestContext,
  to: string,
  payload: MetaMessagePayload,
): Promise<MetaSendMessageResult> {
  const body = await callMetaGraphApi(deps, ctx, `${ctx.phoneNumberId}/messages`, {
    method: "POST",
    body: {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      ...payload,
    },
  });

  const messages = (body as any).messages as Array<{ id?: string }> | undefined;
  return { messageId: messages?.[0]?.id, raw: body };
}

export async function markMetaMessageAsRead(
  deps: MetaCloudClientDeps,
  ctx: MetaCloudRequestContext,
  messageId: string,
): Promise<void> {
  await callMetaGraphApi(deps, ctx, `${ctx.phoneNumberId}/messages`, {
    method: "POST",
    body: {
      messaging_product: "whatsapp",
      status: "read",
      message_id: messageId,
    },
  });
}

// ── Mídia ──────────────────────────────────────────────────────────────

export interface MetaMediaMetadata {
  url: string; // URL temporária, expira — nunca persistir esta URL, só o media_id.
  mimeType: string;
  sha256?: string;
  fileSize?: number;
  mediaId: string;
}

export async function getMetaMediaMetadata(
  deps: MetaCloudClientDeps,
  ctx: Pick<MetaCloudRequestContext, "accessToken">,
  mediaId: string,
): Promise<MetaMediaMetadata> {
  const body = await callMetaGraphApi(deps, { phoneNumberId: "", accessToken: ctx.accessToken }, mediaId, {
    method: "GET",
  });
  return {
    url: String((body as any).url ?? ""),
    mimeType: String((body as any).mime_type ?? ""),
    sha256: (body as any).sha256 as string | undefined,
    fileSize: (body as any).file_size as number | undefined,
    mediaId: String((body as any).id ?? mediaId),
  };
}

/**
 * Baixa os bytes de uma URL de mídia da Meta. A URL só é válida com o
 * mesmo Bearer token da conta — NUNCA persistir a URL em si (expira e é
 * específica da credencial); só o `media_id` e, após o download, os bytes
 * no storage próprio do CRM.
 */
export async function downloadMetaMediaBytes(
  deps: MetaCloudClientDeps,
  accessToken: string,
  mediaUrl: string,
): Promise<Uint8Array> {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const timeoutMs = deps.timeoutMs ?? 30_000;
  const res = await fetchWithTimeout(
    fetchImpl,
    mediaUrl,
    { method: "GET", headers: { Authorization: `Bearer ${accessToken}` } },
    timeoutMs,
  );
  if (!res.ok) {
    throw new MetaGraphApiError(
      { message: `Falha ao baixar mídia (status ${res.status})` },
      res.status,
      isRetryableGraphError(res.status),
    );
  }
  const buf = await res.arrayBuffer();
  return new Uint8Array(buf);
}
