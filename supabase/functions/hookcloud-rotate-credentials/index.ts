// FASE 14A — fundação testável de rotação dos dois segredos HookCloud de
// uma conexão já existente (callback secret e/ou verify token, conjunta
// ou separadamente). NÃO É FRONTEND. NÃO tem `Deno.serve`/`import.meta.main`
// real ainda (mesmo padrão incremental de hookcloud-provision-connection,
// Fase 13A: função pura testável primeiro, entry point real é trabalho de
// uma fase de deploy futura própria).
//
// Reaproveita, sem duplicar: o MESMO padrão de autorização real já usado
// em hookcloud-provision-connection/index.ts (JWT via anon client +
// profiles.organization_id + profiles.disabled/is_active + user_roles,
// papel mínimo admin/super_admin); generateHookCloudCallbackSecret/
// generateHookCloudVerifyToken + hash (Fase 11A/13A/14A); a RPC atômica
// `rotate_hookcloud_webhook_credentials` (migration 20260819300000, NÃO
// aplicada).
//
// Efeito da rotação (ver a RPC para a garantia formal): rotacionar
// QUALQUER um dos dois segredos invalida IMEDIATAMENTE o valor anterior
// (a RPC sobrescreve o hash — o valor antigo simplesmente deixa de bater
// com qualquer hash armazenado) e devolve a conexão para
// onboarding_state='pending' — ela só volta a ficar utilizável depois de
// um novo GET de verificação bem-sucedido com os segredos novos. O token
// de acesso Meta (Vault) NUNCA é tocado por esta operação.

import {
  generateHookCloudCallbackSecret,
  generateHookCloudVerifyToken,
  hashHookCloudVerifyToken,
  hashHookCloudWebhookSecret,
} from "../_shared/meta-webhook-hookcloud-secret.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const REQUIRED_ROLES = new Set(["admin", "super_admin"]);

export interface AuthClientLike {
  auth: { getUser(): Promise<{ data: { user: { id: string } | null } }> };
}

export interface EqResultLike extends PromiseLike<{ data: any[] | null; error: any }> {
  maybeSingle(): Promise<{ data: any; error: any }>;
}

export interface AdminSupabaseLike {
  from(table: string): {
    select(columns: string): {
      eq(column: string, value: unknown): EqResultLike;
    };
  };
  rpc(fn: string, args: Record<string, unknown>): Promise<{ data: any; error: { code?: string; message?: string } | null }>;
}

export interface RotateHookCloudCredentialsDeps {
  authClient: AuthClientLike;
  adminClient: AdminSupabaseLike;
  /** Base confiável para montar a nova URL de callback — NUNCA o Host header da requisição. */
  callbackBaseUrl: string;
  /** Injetável para teste. */
  generateCallbackSecret?: () => string;
  /** Injetável para teste. */
  generateVerifyToken?: () => string;
}

export interface RotateHookCloudCredentialsInput {
  organizationId: string; // enviado pelo cliente, NUNCA usado como autoridade — só comparado contra o real
  connectionId: string;
  rotateCallbackSecret?: boolean;
  rotateVerifyToken?: boolean;
}

function jsonResponse(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function isPlausibleOpaqueId(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= 64;
}

function isTrustedCallbackBaseUrl(base: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(base);
  } catch {
    return false;
  }
  if (parsed.protocol === "https:") return true;
  if (parsed.protocol === "http:" && (parsed.hostname === "127.0.0.1" || parsed.hostname === "localhost")) return true;
  return false;
}

export async function handleRotateCredentialsRequest(req: Request, deps: RotateHookCloudCredentialsDeps): Promise<Response> {
  // 1) Autenticação real — mesmo padrão de hookcloud-provision-connection.
  const { data: { user: caller } } = await deps.authClient.auth.getUser();
  if (!caller) {
    return jsonResponse(401, { error: "not_authenticated" });
  }

  // 2) organization_id do perfil real — nunca do corpo da requisição —
  // e checagem de usuário desativado/suspenso (mesmo achado da Fase 13B).
  const { data: profile } = await deps.adminClient
    .from("profiles")
    .select("organization_id, disabled, is_active")
    .eq("id", caller.id)
    .maybeSingle();

  if (!profile?.organization_id) {
    return jsonResponse(403, { error: "no_organization" });
  }
  if (profile.disabled === true || profile.is_active === false) {
    return jsonResponse(403, { error: "user_disabled" });
  }

  // 3) Papel administrativo — mesmo mínimo exigido pelo provisionamento.
  const { data: roleRows } = await deps.adminClient
    .from("user_roles")
    .select("role")
    .eq("user_id", caller.id);
  const roles: string[] = (roleRows ?? []).map((r: any) => r.role);
  const isAuthorizedRole = roles.some((r) => REQUIRED_ROLES.has(r));
  if (!isAuthorizedRole) {
    return jsonResponse(403, { error: "insufficient_role" });
  }

  if (!isTrustedCallbackBaseUrl(deps.callbackBaseUrl)) {
    console.error("[hookcloud-rotate-credentials] callbackBaseUrl configurado não é HTTPS confiável");
    return jsonResponse(500, { error: "invalid_callback_base_url" });
  }

  let body: Partial<RotateHookCloudCredentialsInput>;
  try {
    body = await req.json();
  } catch {
    return jsonResponse(400, { error: "malformed_json" });
  }

  // 4) organization_id enviado, se presente, precisa BATER com o real —
  // rejeição cross-tenant ANTES de qualquer outra validação, mesmo padrão
  // do provisionamento.
  if (body.organizationId && body.organizationId !== profile.organization_id) {
    return jsonResponse(403, { error: "organization_mismatch" });
  }
  const organizationId = profile.organization_id as string;

  if (!isPlausibleOpaqueId(body.connectionId)) {
    return jsonResponse(400, { error: "invalid_connection_id" });
  }

  const rotateCallbackSecret = body.rotateCallbackSecret === true;
  const rotateVerifyToken = body.rotateVerifyToken === true;
  if (!rotateCallbackSecret && !rotateVerifyToken) {
    return jsonResponse(400, { error: "nothing_to_rotate" });
  }

  // 5) Gera SOMENTE os valores solicitados — CSPRNG independente para
  // cada um, nunca reaproveitando um valor pré-existente. Só o hash é
  // enviado à RPC; o(s) valor(es) bruto(s) só existem nesta chamada.
  const generateCallbackSecret = deps.generateCallbackSecret ?? generateHookCloudCallbackSecret;
  const generateVerifyToken = deps.generateVerifyToken ?? generateHookCloudVerifyToken;

  const rawCallbackSecret = rotateCallbackSecret ? generateCallbackSecret() : null;
  const rawVerifyToken = rotateVerifyToken ? generateVerifyToken() : null;
  const callbackSecretHash = rawCallbackSecret ? await hashHookCloudWebhookSecret(rawCallbackSecret) : null;
  const verifyTokenHash = rawVerifyToken ? await hashHookCloudVerifyToken(rawVerifyToken) : null;

  // 6) RPC atômica — cross-tenant validado NOVAMENTE no banco (defesa em
  // profundidade), conexão sempre volta para 'pending'.
  const { data: rpcData, error: rpcError } = await deps.adminClient.rpc("rotate_hookcloud_webhook_credentials", {
    p_connection_id: body.connectionId,
    p_organization_id: organizationId,
    p_new_callback_secret_hash: callbackSecretHash,
    p_new_verify_token_hash: verifyTokenHash,
  });

  if (rpcError) {
    if (rpcError.message?.includes("hookcloud_rotation_not_found")) {
      // Mesma resposta genérica para "conexão inexistente" e "conexão de
      // outra organização" — nunca revela qual dos dois ocorreu.
      return jsonResponse(404, { error: "connection_not_found" });
    }
    return jsonResponse(500, { error: "rotation_failed" });
  }

  const row = Array.isArray(rpcData) ? rpcData[0] : rpcData;
  const connectionId = row?.connection_id;
  const onboardingState = row?.onboarding_state ?? "pending";
  if (!connectionId) {
    return jsonResponse(500, { error: "rotation_failed" });
  }

  // 7) Resposta — só os valores BRUTOS recém-gerados (nunca os hashes,
  // nunca o token Meta/Vault). Campos ausentes quando o respectivo
  // segredo não foi rotacionado nesta chamada.
  const responseBody: Record<string, unknown> = {
    connection_id: connectionId,
    onboarding_state: onboardingState,
    warnings: [
      "A conexão voltou para o estado 'pending' — nenhuma mensagem pode ser enviada ou recebida até uma nova verificação.",
      "Cada valor rotacionado invalida IMEDIATAMENTE o valor anterior correspondente.",
      "Estes valores não serão mostrados novamente.",
    ],
  };
  if (rawCallbackSecret) {
    responseBody.callback_url = `${deps.callbackBaseUrl.replace(/\/$/, "")}/functions/v1/meta-cloud-webhook?hcs=${rawCallbackSecret}`;
  }
  if (rawVerifyToken) {
    responseBody.verify_token = rawVerifyToken;
  }

  return jsonResponse(200, responseBody);
}

// ── Nota de integração (deliberadamente NÃO feita nesta fase) ───────────
// Assim como hookcloud-provision-connection na Fase 13A: nenhum
// `Deno.serve`/`import.meta.main` real, nenhuma migration aplicada,
// nenhum deploy. Compor o entry point real com clientes Supabase de
// produção é trabalho de uma fase de deploy futura, com sua própria
// autorização.
