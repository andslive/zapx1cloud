// FASE 2A — adapter UazAPI do contrato WhatsAppProvider.
//
// DELIBERADAMENTE não reimplementa a chamada HTTP à UazAPI. Em vez disso,
// chama o endpoint já em produção `whatsapp-send` (proxy fino que repassa
// para `uazapi-send`), reproduzindo exatamente o mesmo corpo de requisição
// (`{organization_id, instance_id, type, to, payload}`) que os pontos de
// envio reais já usam hoje — ver supabase/functions/uazapi-send/index.ts:10-16
// (interface SendBody) e :241-380 (switch de `type`).
//
// Isso é intencional: qualquer reimplementação direta da chamada à UazAPI
// arriscaria divergir do comportamento real (retries, fallback de
// endpoints, humanLikeSendPipeline, etc. já implementados em
// uazapi-send/index.ts) — o pedido explícito é "preserve o comportamento
// atual", e a forma mais segura de garantir isso é reusar o endpoint real,
// não duplicar sua lógica.
//
// `downloadMedia` e `sendTemplate` NÃO são implementados aqui nesta fase —
// ver comentários nos respectivos métodos.

import type {
  ConnectionHealthStatus,
  ConnectionRef,
  HealthStatus,
  MediaBlob,
  MediaRef,
  SendResult,
  TemplateRef,
  WhatsAppProvider,
} from "./types.ts";
import { createWhatsAppProviderError } from "./errors.ts";

export interface UazapiAdapterDeps {
  fetchImpl?: typeof fetch;
  supabaseUrl?: string;
  /** Nunca logar este valor. Usado só no header Authorization da chamada interna. */
  supabaseServiceRoleKey?: string;
  timeoutMs?: number;
}

interface WhatsappSendResponseBody {
  success: boolean;
  message?: string;
  error_code?: string | null;
  debug?: {
    uazapi_response_json?: { id?: string; key?: { id?: string } } | null;
    uazapi_status?: number;
    [k: string]: unknown;
  };
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
  } finally {
    clearTimeout(timer);
  }
}

async function invokeWhatsappSend(
  deps: UazapiAdapterDeps,
  body: { organization_id: string; instance_id: string; type: string; to: string; payload: Record<string, unknown> },
): Promise<SendResult> {
  const supabaseUrl = deps.supabaseUrl ?? Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = deps.supabaseServiceRoleKey ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const fetchImpl = deps.fetchImpl ?? fetch;
  const timeoutMs = deps.timeoutMs ?? 15_000;

  if (!supabaseUrl) {
    throw createWhatsAppProviderError("PROVIDER_NOT_CONFIGURED", "SUPABASE_URL ausente para o adapter UazAPI");
  }

  let res: Response;
  try {
    res = await fetchWithTimeout(
      fetchImpl,
      `${supabaseUrl}/functions/v1/whatsapp-send`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${serviceKey}`,
        },
        body: JSON.stringify(body),
      },
      timeoutMs,
    );
  } catch (err: any) {
    if (err?.name === "AbortError") {
      throw createWhatsAppProviderError("UPSTREAM_TIMEOUT", `whatsapp-send excedeu ${timeoutMs}ms`, { cause: err });
    }
    throw createWhatsAppProviderError("UPSTREAM_HTTP_ERROR", `Falha ao chamar whatsapp-send: ${err?.message ?? err}`, {
      cause: err,
    });
  }

  let parsed: WhatsappSendResponseBody | null = null;
  const text = await res.text();
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    throw createWhatsAppProviderError(
      "UPSTREAM_INVALID_RESPONSE",
      `whatsapp-send retornou corpo não-JSON (status ${res.status})`,
    );
  }

  const providerMessageId = parsed?.debug?.uazapi_response_json?.id ??
    parsed?.debug?.uazapi_response_json?.key?.id ?? undefined;

  return {
    ok: !!parsed?.success,
    providerMessageId,
    errorCode: parsed?.error_code ?? undefined,
    errorMessage: parsed?.success ? undefined : (parsed?.message ?? `HTTP ${res.status}`),
    raw: parsed,
  };
}

export function createUazapiAdapter(deps: UazapiAdapterDeps = {}): WhatsAppProvider {
  return {
    name: "uazapi",

    async sendText(conn: ConnectionRef, to: string, text: string): Promise<SendResult> {
      return invokeWhatsappSend(deps, {
        organization_id: conn.organizationId,
        instance_id: conn.connectionId,
        type: "text",
        to,
        payload: { text },
      });
    },

    async sendMedia(conn: ConnectionRef, to: string, media: MediaRef): Promise<SendResult> {
      return invokeWhatsappSend(deps, {
        organization_id: conn.organizationId,
        instance_id: conn.connectionId,
        type: "media",
        to,
        payload: {
          url: media.url,
          media: media.base64,
          mediatype: media.mimeType,
          caption: media.caption,
          fileName: media.fileName,
        },
      });
    },

    async sendAudio(conn: ConnectionRef, to: string, audio: MediaRef): Promise<SendResult> {
      return invokeWhatsappSend(deps, {
        organization_id: conn.organizationId,
        instance_id: conn.connectionId,
        type: "audio",
        to,
        payload: {
          url: audio.url,
          audio: audio.base64,
          mimetype: audio.mimeType || "audio/ogg; codecs=opus",
        },
      });
    },

    async sendDocument(conn: ConnectionRef, to: string, doc: MediaRef): Promise<SendResult> {
      // UazAPI não distingue "documento" de "mídia" como tipo de payload
      // separado — é o mesmo endpoint `type: "media"` com `docName`/mimetype
      // de documento (ver uazapi-send/index.ts:271-292, campo `docName`).
      return invokeWhatsappSend(deps, {
        organization_id: conn.organizationId,
        instance_id: conn.connectionId,
        type: "media",
        to,
        payload: {
          url: doc.url,
          media: doc.base64,
          mediatype: doc.mimeType,
          caption: doc.caption,
          fileName: doc.fileName,
          docName: doc.fileName,
        },
      });
    },

    async sendTemplate(_conn: ConnectionRef, _to: string, _template: TemplateRef): Promise<SendResult> {
      // A UazAPI não tem conceito de "template aprovado pela Meta" — não
      // existe endpoint equivalente. Falha explícita, nunca finge sucesso
      // nem reescreve o template como texto livre silenciosamente (isso
      // mudaria o comportamento de negócio sem autorização).
      throw createWhatsAppProviderError(
        "TEMPLATE_NOT_SUPPORTED",
        "UazAPI não suporta templates — use sendText/sendMedia diretamente",
      );
    },

    async markAsRead(conn: ConnectionRef, providerMessageId: string): Promise<void> {
      await invokeWhatsappSend(deps, {
        organization_id: conn.organizationId,
        instance_id: conn.connectionId,
        type: "markRead",
        to: providerMessageId,
        payload: {},
      });
    },

    async downloadMedia(_conn: ConnectionRef, _mediaRef: string): Promise<MediaBlob> {
      // Deliberadamente não implementado nesta fase. O download de mídia da
      // UazAPI hoje vive dentro de uazapi-webhook/index.ts
      // (`downloadMediaBase64()`, função não exportada, ~850 linhas de
      // contexto ao redor) — duplicar essa lógica aqui arriscaria divergir
      // do comportamento real. Ver relatório Fase 2A, limitações conhecidas.
      throw createWhatsAppProviderError(
        "NOT_IMPLEMENTED_FASE_2A",
        "downloadMedia do adapter UazAPI não implementado nesta fase — ver uazapi-webhook/index.ts downloadMediaBase64()",
      );
    },

    async getConnectionHealth(conn: ConnectionRef): Promise<HealthStatus> {
      // Leitura pura de evolution_instances — não chama a UazAPI diretamente.
      // Reaproveita os mesmos campos já usados pelo heartbeat existente
      // (last_health_at, is_stable, last_real_whatsapp_state).
      const supabaseUrl = deps.supabaseUrl ?? Deno.env.get("SUPABASE_URL") ?? "";
      const serviceKey = deps.supabaseServiceRoleKey ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
      const fetchImpl = deps.fetchImpl ?? fetch;
      const timeoutMs = deps.timeoutMs ?? 10_000;

      if (!supabaseUrl) {
        throw createWhatsAppProviderError("PROVIDER_NOT_CONFIGURED", "SUPABASE_URL ausente para getConnectionHealth");
      }

      let res: Response;
      try {
        res = await fetchWithTimeout(
          fetchImpl,
          `${supabaseUrl}/rest/v1/evolution_instances?id=eq.${encodeURIComponent(conn.connectionId)}&select=status,is_stable,last_health_at,last_real_whatsapp_state`,
          {
            method: "GET",
            headers: {
              apikey: serviceKey,
              Authorization: `Bearer ${serviceKey}`,
            },
          },
          timeoutMs,
        );
      } catch (err: any) {
        throw createWhatsAppProviderError("UPSTREAM_HTTP_ERROR", `Falha ao ler saúde da conexão: ${err?.message ?? err}`, {
          cause: err,
        });
      }

      const rows = await res.json().catch(() => []);
      const row = Array.isArray(rows) ? rows[0] : undefined;
      if (!row) {
        return { status: "unknown" as ConnectionHealthStatus };
      }

      const status: ConnectionHealthStatus = row.is_stable && row.status === "connected"
        ? "healthy"
        : row.status === "connected"
        ? "degraded"
        : "down";

      return {
        status,
        lastActivityAt: row.last_health_at ?? null,
        details: { raw_status: row.status, raw_whatsapp_state: row.last_real_whatsapp_state },
      };
    },
  };
}
