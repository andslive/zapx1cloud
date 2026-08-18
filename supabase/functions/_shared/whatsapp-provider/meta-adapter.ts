// FASE 2A — adapter Meta Cloud API do contrato WhatsAppProvider.
//
// Esqueleto funcional: implementa o contrato usando meta-cloud-client.ts,
// mas SEM nenhum caminho de fallback para UazAPI e SEM segredo em texto
// plano — o token é obtido por uma interface injetada
// (`MetaAccessTokenProvider`), nunca lido de coluna. Nesta fase não há
// implementação real dessa interface (isso depende do Supabase Vault, cuja
// aplicação remota não está autorizada — ver relatório, §10 segurança de
// secrets); qualquer chamada real sem essa dependência injetada falha
// explicitamente com PROVIDER_NOT_CONFIGURED.

import type {
  ConnectionRef,
  HealthStatus,
  MediaBlob,
  MediaRef,
  SendResult,
  TemplateRef,
  WhatsAppProvider,
} from "./types.ts";
import { createWhatsAppProviderError } from "./errors.ts";
import {
  downloadMetaMediaBytes,
  getMetaMediaMetadata,
  markMetaMessageAsRead,
  MetaGraphApiError,
  MetaGraphInvalidResponseError,
  MetaGraphTimeoutError,
  sendMetaMessage,
  type MetaAccessTokenProvider,
  type MetaCloudClientDeps,
  type MetaCloudRequestContext,
} from "../meta-cloud-client.ts";
import type { SupabaseLike } from "./resolve.ts";

export interface MetaCloudAdapterDeps extends MetaCloudClientDeps {
  accessTokenProvider?: MetaAccessTokenProvider;
}

interface MetaCloudInstanceRow {
  phone_number_id: string;
  waba_id: string;
  onboarding_state: string;
}

async function loadMetaCloudConnectionRow(
  supabase: SupabaseLike,
  conn: ConnectionRef,
): Promise<MetaCloudInstanceRow> {
  const { data, error } = await (supabase as any)
    .from("evolution_instances_meta_cloud")
    .select("phone_number_id, waba_id, onboarding_state")
    .eq("evolution_instance_id", conn.connectionId)
    .maybeSingle();

  if (error) {
    throw createWhatsAppProviderError(
      "UPSTREAM_HTTP_ERROR",
      `Falha ao ler config Meta Cloud da conexão ${conn.connectionId}: ${error.message ?? error}`,
      { cause: error },
    );
  }
  if (!data) {
    throw createWhatsAppProviderError(
      "PROVIDER_NOT_CONFIGURED",
      `Conexão ${conn.connectionId} está marcada como meta_cloud mas não tem linha em evolution_instances_meta_cloud`,
    );
  }
  if (data.onboarding_state !== "active") {
    throw createWhatsAppProviderError(
      "PROVIDER_NOT_CONFIGURED",
      `Conexão ${conn.connectionId} (Meta Cloud) não está ativa (onboarding_state=${data.onboarding_state})`,
    );
  }
  return data as MetaCloudInstanceRow;
}

async function buildRequestContext(
  supabase: SupabaseLike,
  conn: ConnectionRef,
  deps: MetaCloudAdapterDeps,
): Promise<MetaCloudRequestContext> {
  const row = await loadMetaCloudConnectionRow(supabase, conn);
  if (!deps.accessTokenProvider) {
    throw createWhatsAppProviderError(
      "MISSING_CREDENTIALS",
      "Nenhum MetaAccessTokenProvider configurado — o adapter Meta Cloud API não obtém token de coluna nenhuma",
    );
  }
  const accessToken = await deps.accessTokenProvider.getAccessToken(conn.connectionId, conn.organizationId);
  if (!accessToken) {
    throw createWhatsAppProviderError(
      "MISSING_CREDENTIALS",
      `Token vazio retornado pelo provider de credenciais para a conexão ${conn.connectionId}`,
    );
  }
  return { phoneNumberId: row.phone_number_id, accessToken };
}

function toSendResult(fn: () => Promise<{ messageId?: string; raw: Record<string, unknown> }>): Promise<SendResult> {
  return fn()
    .then((r) => ({ ok: true, providerMessageId: r.messageId, raw: r.raw }))
    .catch((err) => {
      if (err instanceof MetaGraphApiError) {
        return {
          ok: false,
          errorCode: err.detail.code !== undefined ? String(err.detail.code) : undefined,
          errorSubcode: err.detail.errorSubcode !== undefined ? String(err.detail.errorSubcode) : undefined,
          errorMessage: err.detail.message,
          raw: { fbtrace_id: err.detail.fbtraceId, http_status: err.httpStatus },
        };
      }
      if (err instanceof MetaGraphTimeoutError || err instanceof MetaGraphInvalidResponseError) {
        return { ok: false, errorMessage: err.message };
      }
      throw err;
    });
}

export function createMetaCloudAdapter(supabase: SupabaseLike, deps: MetaCloudAdapterDeps = {}): WhatsAppProvider {
  return {
    name: "meta_cloud",

    async sendText(conn: ConnectionRef, to: string, text: string): Promise<SendResult> {
      const ctx = await buildRequestContext(supabase, conn, deps);
      return toSendResult(() => sendMetaMessage(deps, ctx, to, { type: "text", text: { body: text } }));
    },

    async sendMedia(conn: ConnectionRef, to: string, media: MediaRef): Promise<SendResult> {
      const ctx = await buildRequestContext(supabase, conn, deps);
      return toSendResult(() =>
        sendMetaMessage(deps, ctx, to, {
          type: "image",
          image: { link: media.url, caption: media.caption },
        })
      );
    },

    async sendAudio(conn: ConnectionRef, to: string, audio: MediaRef): Promise<SendResult> {
      const ctx = await buildRequestContext(supabase, conn, deps);
      return toSendResult(() => sendMetaMessage(deps, ctx, to, { type: "audio", audio: { link: audio.url } }));
    },

    async sendDocument(conn: ConnectionRef, to: string, doc: MediaRef): Promise<SendResult> {
      const ctx = await buildRequestContext(supabase, conn, deps);
      return toSendResult(() =>
        sendMetaMessage(deps, ctx, to, {
          type: "document",
          document: { link: doc.url, filename: doc.fileName, caption: doc.caption },
        })
      );
    },

    async sendTemplate(conn: ConnectionRef, to: string, template: TemplateRef): Promise<SendResult> {
      const ctx = await buildRequestContext(supabase, conn, deps);
      return toSendResult(() =>
        sendMetaMessage(deps, ctx, to, {
          type: "template",
          template: {
            name: template.name,
            language: { code: template.language },
            components: template.components as unknown[] | undefined,
          },
        })
      );
    },

    async markAsRead(conn: ConnectionRef, providerMessageId: string): Promise<void> {
      const ctx = await buildRequestContext(supabase, conn, deps);
      await markMetaMessageAsRead(deps, ctx, providerMessageId);
    },

    async downloadMedia(conn: ConnectionRef, mediaRef: string): Promise<MediaBlob> {
      const ctx = await buildRequestContext(supabase, conn, deps);
      const meta = await getMetaMediaMetadata(deps, ctx, mediaRef);
      const bytes = await downloadMetaMediaBytes(deps, ctx.accessToken, meta.url);
      return { bytes, mimeType: meta.mimeType, byteLength: bytes.byteLength };
    },

    async getConnectionHealth(conn: ConnectionRef): Promise<HealthStatus> {
      // Leitura pura de evolution_instances_meta_cloud — nenhuma chamada à
      // Meta aqui (quality_rating/messaging_limit_tier vêm de webhooks
      // account_update já persistidos, não de polling ativo).
      const { data, error } = await (supabase as any)
        .from("evolution_instances_meta_cloud")
        .select("onboarding_state, last_health_check_at, last_error_code, last_error_message")
        .eq("evolution_instance_id", conn.connectionId)
        .maybeSingle();

      if (error || !data) {
        return { status: "unknown" };
      }

      return {
        status: data.onboarding_state === "active" ? "healthy" : "down",
        lastActivityAt: data.last_health_check_at ?? null,
        lastErrorMessage: data.last_error_message ?? null,
        details: { onboarding_state: data.onboarding_state, last_error_code: data.last_error_code },
      };
    },
  };
}
