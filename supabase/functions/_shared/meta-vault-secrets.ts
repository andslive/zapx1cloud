// FASE 2B.0 — leitura backend-only de secrets da Meta Cloud API via Vault.
//
// BACKEND-ONLY: este módulo só roda em Edge Functions (Deno runtime,
// `service_role`). NUNCA é importável pelo frontend — não há build do
// Vite que alcance `supabase/functions/`, e nada aqui usa sintaxe/import
// compatível com o bundle do navegador (import direto de
// `@supabase/supabase-js` via `esm.sh`, padrão Deno). A garantia é
// estrutural (localização do arquivo, fora de `src/`), reforçada por um
// teste que varre `src/` procurando qualquer import deste arquivo (ver
// `meta-vault-secrets.frontend-boundary.test.ts`).
//
// Único ponto de leitura de secret desta fundação — NUNCA consulta
// `vault.decrypted_secrets` diretamente a partir de um cliente de usuário
// (nem sequer existe código aqui que monte essa query — só chama as RPCs
// `SECURITY DEFINER` já testadas em Postgres real, ver relatório Fase
// 2B.0). Nunca aceita um UUID de secret livre — sempre resolve pela
// identidade `connectionId`+`organizationId`.

import { createWhatsAppProviderError, isWhatsAppProviderError } from "./whatsapp-provider/errors.ts";

/** União fechada — nenhum outro valor é aceito, TypeScript recusa qualquer string solta. */
export type MetaSecretKind = "access_token" | "app_secret" | "webhook_verify_token";

/** Superfície mínima do client Supabase usada aqui (compatível com service_role). */
export interface VaultSupabaseLike {
  rpc(fn: string, args: Record<string, unknown>): Promise<{ data: unknown; error: { message?: string; code?: string } | null }>;
}

/**
 * Resolve um secret da Meta Cloud API — SEMPRE exige `connectionId` E
 * `organizationId` simultaneamente, mesmo para os tipos de secret que são
 * de plataforma (`app_secret`/`webhook_verify_token`, que não variam por
 * conexão/organização de fato) — a exigência de identidade no nível da
 * interface é deliberada e consistente, independente de o backend usar
 * ou não esses dois campos para a query interna daquele tipo específico.
 *
 * Nunca faz fallback para variável de ambiente, payload, ou secret de
 * outra conexão — qualquer falha da RPC propaga como
 * `WhatsAppProviderError(code: "SECRET_ACCESS_DENIED")`, mensagem sempre
 * genérica (nunca ecoa detalhe do erro do Postgres, que já é genérico por
 * design nas RPCs, ver migration `20260811000000_...sql`).
 */
export async function getMetaSecretForConnection(
  supabase: VaultSupabaseLike,
  connectionId: string,
  organizationId: string,
  secretKind: MetaSecretKind,
): Promise<string> {
  if (!connectionId || !organizationId) {
    throw createWhatsAppProviderError(
      "SECRET_ACCESS_DENIED",
      "connectionId e organizationId são obrigatórios para resolver um secret Meta",
    );
  }

  try {
    if (secretKind === "access_token") {
      const { data, error } = await supabase.rpc("get_meta_connection_access_token", {
        p_connection_id: connectionId,
        p_organization_id: organizationId,
      });
      if (error || typeof data !== "string" || data.length === 0) {
        throw new Error("rpc_denied");
      }
      return data;
    }

    if (secretKind === "app_secret" || secretKind === "webhook_verify_token") {
      const { data, error } = await supabase.rpc("get_meta_platform_secret", {
        p_secret_kind: secretKind,
      });
      if (error || typeof data !== "string" || data.length === 0) {
        throw new Error("rpc_denied");
      }
      return data;
    }

    // Inalcançável para o union fechado — TypeScript já barra em tempo de
    // compilação; mantido como defesa em profundidade em runtime.
    throw new Error("unknown_secret_kind");
  } catch (err) {
    // Nunca propaga o erro original (poderia, em tese, ecoar detalhe do
    // Postgres em alguma versão futura da RPC) — sempre normaliza para o
    // mesmo código/mensagem genérica, sem incluir `connectionId`,
    // `organizationId` nem `secretKind` no texto (evita telemetria
    // acidentalmente correlacionar tentativas de acesso com identificadores
    // sensíveis em ferramentas de log que indexam mensagens de erro).
    if (isWhatsAppProviderError(err)) throw err;
    throw createWhatsAppProviderError("SECRET_ACCESS_DENIED", "Acesso ao secret negado", { cause: err });
  }
}
