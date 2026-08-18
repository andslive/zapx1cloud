// FASE 2B.0.EVOHUB-1 — implementação real do `MetaAccessTokenProvider`
// (interface definida em `meta-cloud-client.ts`), fechando a lacuna
// deixada deliberadamente aberta pela Fase 2A ("Fase 2B implementa isso").
//
// Fonte única de tokens Meta: `getMetaSecretForConnection` (Vault, via RPC
// SECURITY DEFINER `get_meta_connection_access_token`, service_role
// apenas — ver migration `20260811000000_meta_cloud_vault_secrets.sql`).
// Nenhum outro caminho de leitura de token existe aqui: sem variável de
// ambiente, sem coluna plana, sem cache que persista o valor do secret
// (só a interface é cacheável por chamador, se o chamador decidir; este
// módulo não introduz cache próprio, para não arriscar servir um token já
// revogado durante a janela do cache).
//
// Isolamento: `getAccessToken(connectionId, organizationId)` propaga os
// dois IDs para `getMetaSecretForConnection`, que por sua vez propaga para
// a RPC — o Postgres é quem decide, com `SECURITY DEFINER` e checagem
// própria, se aquele par (conexão, organização) tem um secret válido e
// ativo. Este módulo nunca decide isolamento por conta própria.

import { getMetaSecretForConnection, type VaultSupabaseLike } from "../meta-vault-secrets.ts";
import type { MetaAccessTokenProvider } from "../meta-cloud-client.ts";

/**
 * Cria a implementação real de `MetaAccessTokenProvider` para uso pelos
 * adapters/Edge Functions Meta Cloud API. `supabase` deve ser um client
 * autenticado como `service_role` — a RPC subjacente recusa qualquer outra
 * role (ver Fase 2B.0.6W / grants da RPC).
 */
export function createMetaAccessTokenProvider(supabase: VaultSupabaseLike): MetaAccessTokenProvider {
  return {
    async getAccessToken(connectionId: string, organizationId: string): Promise<string> {
      return getMetaSecretForConnection(supabase, connectionId, organizationId, "access_token");
    },
  };
}
