// FASE 2B.0.EVOHUB-2 — núcleo de despacho de envio Meta Cloud, extraído de
// `meta-cloud-send/index.ts` para ser reutilizado também pelo gate de
// roteamento multi-provider dentro de `uazapi-send/index.ts` (o chokepoint
// real por onde passam praticamente todos os envios do CRM — funis, chat
// manual, campanhas, cron de IA, catálogo, agendamento, etc.). Nenhuma
// lógica nova aqui além do que já existia em `meta-cloud-send`: mesmos
// dois portões (flag por organização + modo), mesmo shadow dry-run, mesmo
// isolamento cross-tenant via `resolveConnectionProvider`.

import { isMetaCloudApiEnabled } from "./meta-cloud-flags.ts";
import { evaluateModeGate, resolveCanaryConnectionIds, resolveMetaCloudApiMode } from "./meta-cloud-mode.ts";
import { resolveConnectionProvider, resolveWhatsAppProvider, type SupabaseLike } from "./whatsapp-provider/resolve.ts";
import { isWhatsAppProviderError } from "./whatsapp-provider/errors.ts";
import { createMetaAccessTokenProvider } from "./whatsapp-provider/meta-access-token-provider.ts";
import type { MediaRef, TemplateRef } from "./whatsapp-provider/types.ts";

export type MetaCloudSendType = "text" | "media" | "audio" | "document" | "template" | "markRead";

export interface MetaCloudDispatchParams {
  organizationId: string;
  connectionId: string;
  to: string;
  type: MetaCloudSendType;
  payload: Record<string, unknown>;
}

export interface MetaCloudDispatchDeps {
  supabase: (SupabaseLike & { rpc(fn: string, args: Record<string, unknown>): Promise<{ data: unknown; error: { message?: string; code?: string } | null }> });
  env?: { get(key: string): string | undefined };
}

export interface MetaCloudDispatchResult {
  status: number;
  body: {
    success: boolean;
    error_code: string | null;
    message: string;
    debug?: Record<string, unknown>;
  };
}

/**
 * Despacha um envio pelo provider Meta Cloud API, aplicando os dois
 * portões (flag por organização + modo off/shadow/canary/active) antes de
 * qualquer resolução. Retorna sempre um resultado tipado (nunca lança para
 * o chamador em caso de erro esperado) — exceções só escapam em caso de
 * bug real, e o chamador deve tratar isso como 500.
 */
export async function dispatchMetaCloudSend(
  params: MetaCloudDispatchParams,
  deps: MetaCloudDispatchDeps,
): Promise<MetaCloudDispatchResult> {
  const { organizationId, connectionId, to, type, payload } = params;
  const supabase = deps.supabase;
  const env = deps.env ?? Deno.env;

  const enabled = await isMetaCloudApiEnabled(supabase, organizationId);
  if (!enabled) {
    return {
      status: 403,
      body: { success: false, error_code: "FEATURE_DISABLED", message: "Meta Cloud API desligada para esta organização" },
    };
  }

  const mode = resolveMetaCloudApiMode(env);
  const canaryIds = resolveCanaryConnectionIds(env);
  const gate = evaluateModeGate(mode, connectionId, canaryIds);
  if (!gate.allowed) {
    console.info("[meta-cloud-dispatch] envio recusado pelo gate de modo:", gate.reason);
    return {
      status: 403,
      body: { success: false, error_code: "MODE_DISABLED", message: "Meta Cloud API não está habilitada para envio neste modo" },
    };
  }

  try {
    if (gate.dryRun) {
      const conn = await resolveConnectionProvider(supabase, connectionId, organizationId);
      if (conn.provider !== "meta_cloud") {
        return {
          status: 409,
          body: {
            success: false,
            error_code: "PROVIDER_MISMATCH",
            message: `Conexão ${connectionId} não está configurada para meta_cloud (provider resolvido: ${conn.provider})`,
          },
        };
      }
      await createMetaAccessTokenProvider(supabase).getAccessToken(conn.connectionId, conn.organizationId);
      return {
        status: 200,
        body: { success: true, error_code: null, message: "Shadow: conexão e token resolvidos, nenhuma mensagem enviada", debug: { shadow: true } },
      };
    }

    const provider = await resolveWhatsAppProvider(supabase, connectionId, organizationId, {
      metaCloud: { accessTokenProvider: createMetaAccessTokenProvider(supabase) },
    });

    if (provider.name !== "meta_cloud") {
      return {
        status: 409,
        body: {
          success: false,
          error_code: "PROVIDER_MISMATCH",
          message: `Conexão ${connectionId} não está configurada para meta_cloud (provider resolvido: ${provider.name})`,
        },
      };
    }

    const conn = { connectionId, organizationId, provider: "meta_cloud" as const };

    let result;
    switch (type) {
      case "text":
        result = await provider.sendText(conn, to, String(payload.text ?? ""));
        break;
      case "media":
        result = await provider.sendMedia(conn, to, payload as unknown as MediaRef);
        break;
      case "audio":
        result = await provider.sendAudio(conn, to, payload as unknown as MediaRef);
        break;
      case "document":
        result = await provider.sendDocument(conn, to, payload as unknown as MediaRef);
        break;
      case "template":
        result = await provider.sendTemplate(conn, to, payload as unknown as TemplateRef);
        break;
      case "markRead":
        await provider.markAsRead(conn, to);
        result = { ok: true };
        break;
      default:
        return {
          status: 400,
          body: { success: false, error_code: "UNSUPPORTED_TYPE", message: `type "${type}" não suportado pelo provider meta_cloud` },
        };
    }

    return {
      status: result.ok ? 200 : 502,
      body: {
        success: result.ok,
        error_code: result.ok ? null : (result as any).errorCode ?? "META_SEND_FAILED",
        message: result.ok ? "Mensagem enviada" : (result as any).errorMessage ?? "Falha ao enviar",
        debug: { provider_message_id: (result as any).providerMessageId },
      },
    };
  } catch (err: unknown) {
    if (isWhatsAppProviderError(err)) {
      const status = err.code === "FEATURE_DISABLED" || err.code === "ORG_MISMATCH" ? 403 : 400;
      return { status, body: { success: false, error_code: err.code, message: err.message } };
    }
    console.error("[meta-cloud-dispatch] exceção não tratada:", err);
    return { status: 500, body: { success: false, error_code: "INTERNAL_ERROR", message: "Falha interna" } };
  }
}
