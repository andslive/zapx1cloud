// FASE 2A — resolução de provider por conexão. Esta é a ÚNICA função que
// deve decidir qual provider atende uma conexão — nenhum outro lugar deve
// inferir provider por número de telefone, nem escolher "o que estiver
// disponível". Ver relatório Fase 2A, §8 (regras obrigatórias).
//
// Regras obrigatórias (pedido explícito do usuário, não negociável):
//  1) Conexão existente com `provider` ausente/nulo/vazio resolve
//     EXCLUSIVAMENTE para 'uazapi' (retrocompatibilidade total).
//  2) `provider` com valor desconhecido (não é 'uazapi' nem 'meta_cloud')
//     falha FECHADO — nunca assume um default silenciosamente. Isso é
//     intencional mesmo sabendo que a coluna `evolution_instances.provider`
//     já teve valores como 'chromium'/'evolution' cogitados em comentário de
//     migration: este contrato novo não foi desenhado para esses valores, e
//     não deve fingir que foi.
//  3) `connection_id` que não pertence à `organization_id` informada nunca
//     é servido — e o erro nunca revela a qual organização a conexão
//     pertence de fato (evita vazamento de existência entre organizações).
//  4) Meta sem configuração válida falha visivelmente (erro tipado), nunca
//     cai silenciosamente para UazAPI.

import type { ConnectionRef, WhatsAppProvider, WhatsAppProviderName } from "./types.ts";
import { createWhatsAppProviderError } from "./errors.ts";
import { createUazapiAdapter, type UazapiAdapterDeps } from "./uazapi-adapter.ts";
import { createMetaCloudAdapter, type MetaCloudAdapterDeps } from "./meta-adapter.ts";

const KNOWN_PROVIDERS: readonly WhatsAppProviderName[] = ["uazapi", "meta_cloud"];

/** Superfície mínima do client Supabase usada aqui — evita depender do tipo concreto do SDK. */
export interface SupabaseLike {
  from(table: string): {
    select(columns: string): {
      eq(column: string, value: unknown): {
        maybeSingle(): Promise<{ data: any; error: any }>;
      };
    };
  };
}

/**
 * Resolve APENAS a referência da conexão (id/org/provider), sem construir o
 * adapter concreto. Função separada para permitir testar a lógica de
 * isolamento multi-tenant sem precisar mockar os dois adapters.
 */
export async function resolveConnectionProvider(
  supabase: SupabaseLike,
  connectionId: string,
  expectedOrganizationId: string,
): Promise<ConnectionRef> {
  if (!connectionId) {
    throw createWhatsAppProviderError("CONNECTION_NOT_FOUND", "connectionId ausente");
  }
  if (!expectedOrganizationId) {
    throw createWhatsAppProviderError("ORG_MISMATCH", "organizationId ausente na chamada — resolução recusada");
  }

  const { data, error } = await supabase
    .from("evolution_instances")
    .select("id, organization_id, provider, archived_at")
    .eq("id", connectionId)
    .maybeSingle();

  if (error) {
    throw createWhatsAppProviderError(
      "UPSTREAM_HTTP_ERROR",
      `Falha ao resolver conexão ${connectionId}: ${error.message ?? error}`,
      { cause: error },
    );
  }
  if (!data) {
    throw createWhatsAppProviderError("CONNECTION_NOT_FOUND", `Conexão ${connectionId} não encontrada`);
  }
  if (data.organization_id !== expectedOrganizationId) {
    // Mensagem deliberadamente genérica — não confirma nem nega que a
    // conexão existe em outra organização.
    throw createWhatsAppProviderError(
      "ORG_MISMATCH",
      `Conexão ${connectionId} não pertence à organização informada`,
    );
  }
  // FASE 20I (achado da revisão independente do PR #28) — este era o único
  // chokepoint de resolução de provider (usado por `dispatchMetaCloudSend`,
  // por sua vez chamado por `meta-cloud-send/index.ts` diretamente com um
  // `connection_id` de body, SEM nenhum gate de `archived_at` a montante —
  // diferente de `uazapi-send/index.ts`, que já filtra `archived_at IS NULL`
  // antes de chegar aqui) que não recusava uma conexão arquivada. Falha
  // fechada aqui mesmo, no núcleo compartilhado, protege TODOS os
  // chamadores atuais e futuros, não só os que já filtram a montante.
  if (data.archived_at) {
    throw createWhatsAppProviderError(
      "CONNECTION_ARCHIVED",
      `Conexão ${connectionId} está arquivada e não pode ser usada para envio`,
    );
  }

  const rawProvider = data.provider;
  const provider: WhatsAppProviderName =
    rawProvider === null || rawProvider === undefined || rawProvider === ""
      ? "uazapi"
      : (rawProvider as WhatsAppProviderName);

  if (!KNOWN_PROVIDERS.includes(provider)) {
    throw createWhatsAppProviderError(
      "PROVIDER_UNKNOWN",
      `Provider desconhecido "${rawProvider}" na conexão ${connectionId} — falha fechada, nenhum default aplicado`,
    );
  }

  return { connectionId: data.id, organizationId: data.organization_id, provider };
}

export interface ResolveWhatsAppProviderDeps {
  uazapi?: UazapiAdapterDeps;
  metaCloud?: MetaCloudAdapterDeps;
}

/**
 * Resolve a conexão E retorna a instância concreta do provider pronta para
 * uso. Esta é a função que a Fase 2B deve chamar nos pontos de envio reais
 * — nenhuma delas deve instanciar um adapter diretamente.
 */
export async function resolveWhatsAppProvider(
  supabase: SupabaseLike,
  connectionId: string,
  organizationId: string,
  deps: ResolveWhatsAppProviderDeps = {},
): Promise<WhatsAppProvider> {
  const conn = await resolveConnectionProvider(supabase, connectionId, organizationId);

  if (conn.provider === "uazapi") {
    return createUazapiAdapter(deps.uazapi ?? {});
  }
  if (conn.provider === "meta_cloud") {
    return createMetaCloudAdapter(supabase, deps.metaCloud ?? {});
  }

  // Inalcançável: resolveConnectionProvider já falhou fechado antes de
  // chegar aqui para qualquer valor fora de KNOWN_PROVIDERS.
  throw createWhatsAppProviderError("PROVIDER_UNKNOWN", `Provider inesperado: ${(conn as any).provider}`);
}
