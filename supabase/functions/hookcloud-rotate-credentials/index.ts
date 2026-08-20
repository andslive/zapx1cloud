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

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  generateHookCloudCallbackSecret,
  generateHookCloudVerifyToken,
  hashHookCloudVerifyToken,
  hashHookCloudWebhookSecret,
} from "../_shared/meta-webhook-hookcloud-secret.ts";
import {
  buildCorsDecision,
  CREDENTIAL_RESPONSE_HEADERS,
  HOOKCLOUD_ADMIN_MAX_BODY_BYTES,
  isAcceptableJsonContentType,
  isSyntacticallyValidJson,
  NO_STORE_HEADERS,
  readJsonBodyWithLimit,
  resolveHookCloudAdminAllowedOrigins,
} from "../_shared/hookcloud-admin-http.ts";

// FASE 16B — o antigo `corsHeaders` (`Access-Control-Allow-Origin: "*"`)
// foi removido por completo. CORS agora vem exclusivamente de
// `buildCorsDecision` (allowlist exata de `hookcloud-admin-http.ts`),
// aplicado só quando há um `Origin` de navegador real e permitido —
// nunca um valor estático, nunca `*`.

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

/** FASE 16B: nunca inclui `Access-Control-Allow-Origin` (responsabilidade do roteador). Sempre `Cache-Control: no-store`. */
function jsonResponse(status: number, body: Record<string, unknown>, extraHeaders: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...NO_STORE_HEADERS, ...extraHeaders, "Content-Type": "application/json" },
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

  // FASE 16B — decisão arquitetural registrada explicitamente (achado da
  // Fase 16A): AO CONTRÁRIO de hookcloud-provision-connection, esta rota
  // NUNCA verifica `resolveHookCloudWebhookMode()`/`isMetaCloudApiEnabled()`.
  // Isto é DELIBERADO, não uma omissão: rotação é uma operação de
  // manutenção/recuperação sobre uma conexão que JÁ EXISTE — bloqueá-la
  // pela flag global de piloto deixaria um administrador sem conseguir
  // recuperar/invalidar credenciais de uma conexão real só porque a
  // integração foi desligada (ex.: durante uma pausa operacional ou uma
  // suspeita de vazamento de segredo). A rotação já é estruturalmente
  // segura sem essa checagem: (a) só afeta conexões que já são
  // `onboarding_source='hookcloud'` — nunca cria nada novo, nunca reativa
  // automação; (b) SEMPRE devolve a conexão para `onboarding_state='pending'`
  // (RPC `rotate_hookcloud_webhook_credentials`), então mesmo uma rotação
  // bem-sucedida nunca deixa uma conexão apta a processar mensagens sem
  // uma nova verificação; (c) nenhum caminho de negócio (funil, IA,
  // envio) é alcançável a partir desta rota, com a flag ligada ou não.
  // Ver teste dedicado "rotação com flag desligada mantém pending" abaixo.
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

  // FASE 16B: uma resposta 200 desta rota SEMPRE carrega ao menos um
  // segredo bruto novo (nenhuma rotação bem-sucedida acontece sem
  // rotacionar pelo menos um dos dois — ver checagem "nothing_to_rotate"
  // acima) — sempre usa os cabeçalhos anti-cache reforçados.
  return jsonResponse(200, responseBody, CREDENTIAL_RESPONSE_HEADERS);
}

// ── FASE 16B — roteamento HTTP real (método, CORS, cache, corpo) ────────
//
// `handleRotateCredentialsRequest` (acima) permanece INTOCADO — mesma
// assinatura, mesma lógica já auditada nas Fases 14A/16A. Mesma camada
// de roteamento de `hookcloud-provision-connection/index.ts`, duplicada
// aqui deliberadamente (não extraída para um helper genérico de
// roteamento porque as duas funções delegam para handlers com formatos
// de `deps` diferentes — só as PRIMITIVAS de baixo nível, sem estado e
// sem risco de divergência silenciosa, vivem em `hookcloud-admin-http.ts`).

export interface RouteRotateCredentialsRequestDeps {
  /** Allowlist real de origens administrativas — injetável para teste. */
  allowedOrigins: ReadonlySet<string>;
  /** FASE 17A (achado de revisão): construído sob demanda, só depois que o roteamento já validou método, CORS, Content-Type e corpo — nunca antes (mesma correção de `hookcloud-provision-connection`). */
  buildHandlerDeps: () => RotateHookCloudCredentialsDeps;
}

const ALLOWED_METHODS_HEADER = "POST, OPTIONS";

export async function routeRotateCredentialsRequest(
  req: Request,
  deps: RouteRotateCredentialsRequestDeps,
): Promise<Response> {
  const origin = req.headers.get("origin");
  const cors = buildCorsDecision(origin, deps.allowedOrigins);

  if (req.method === "OPTIONS") {
    if (origin !== null && !cors.allowed) {
      return new Response(null, { status: 403, headers: { ...NO_STORE_HEADERS } });
    }
    return new Response(null, {
      status: 204,
      headers: { ...cors.headers, ...NO_STORE_HEADERS, "Allow": ALLOWED_METHODS_HEADER },
    });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method_not_allowed" }), {
      status: 405,
      headers: { ...cors.headers, ...NO_STORE_HEADERS, "Allow": ALLOWED_METHODS_HEADER, "Content-Type": "application/json" },
    });
  }

  if (origin !== null && !cors.allowed) {
    return new Response(JSON.stringify({ error: "origin_not_allowed" }), {
      status: 403,
      headers: { ...NO_STORE_HEADERS, "Content-Type": "application/json" },
    });
  }

  const contentType = req.headers.get("content-type");
  if (!isAcceptableJsonContentType(contentType)) {
    return new Response(JSON.stringify({ error: "unsupported_media_type" }), {
      status: 415,
      headers: { ...cors.headers, ...NO_STORE_HEADERS, "Content-Type": "application/json" },
    });
  }

  const bodyResult = await readJsonBodyWithLimit(req, HOOKCLOUD_ADMIN_MAX_BODY_BYTES);
  if (!bodyResult.ok) {
    const status = bodyResult.reason === "too_large" ? 413 : 400;
    const error = bodyResult.reason === "too_large"
      ? "payload_too_large"
      : bodyResult.reason === "invalid_utf8"
      ? "invalid_encoding"
      : "empty_body";
    return new Response(JSON.stringify({ error }), {
      status,
      headers: { ...cors.headers, ...NO_STORE_HEADERS, "Content-Type": "application/json" },
    });
  }

  if (!isSyntacticallyValidJson(bodyResult.text)) {
    return new Response(JSON.stringify({ error: "malformed_json" }), {
      status: 400,
      headers: { ...cors.headers, ...NO_STORE_HEADERS, "Content-Type": "application/json" },
    });
  }

  const forwardedReq = new Request(req.url, { method: "POST", headers: req.headers, body: bodyResult.text });
  // FASE 17A: só agora — com método, CORS, Content-Type e corpo já
  // validados — o cliente privilegiado (service_role) é construído.
  const handlerDeps = deps.buildHandlerDeps();
  const innerResponse = await handleRotateCredentialsRequest(forwardedReq, handlerDeps);

  const finalHeaders = new Headers(innerResponse.headers);
  for (const [key, value] of Object.entries(cors.headers)) finalHeaders.set(key, value);
  finalHeaders.set("Cache-Control", "no-store");
  return new Response(innerResponse.body, { status: innerResponse.status, headers: finalHeaders });
}

// ── Entry point real ──────────────────────────────────────────────────
// `import.meta.main` evita que `Deno.serve` tente abrir uma porta de
// rede quando este arquivo é apenas IMPORTADO (ex.: pelos testes, que
// rodam sem `--allow-net`) — mesmo padrão já usado em
// `meta-cloud-webhook/index.ts` desde a Fase 2A e em
// `hookcloud-provision-connection/index.ts` (Fase 16B). Nenhum código
// roda no carregamento do módulo além de literais estáticos
// (`REQUIRED_ROLES`) — nenhuma chamada de banco, nenhuma geração de
// credencial, nenhuma leitura de body acontece até que uma requisição
// HTTP real chegue.

if (import.meta.main) {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const callbackBaseUrl = supabaseUrl ?? "";
  const allowedOrigins = resolveHookCloudAdminAllowedOrigins();

  Deno.serve(async (req) => {
    if (!supabaseUrl || !serviceRoleKey || !anonKey) {
      console.error("[hookcloud-rotate-credentials] configuração de ambiente incompleta");
      return new Response(JSON.stringify({ error: "server_misconfigured" }), {
        status: 500,
        headers: { ...NO_STORE_HEADERS, "Content-Type": "application/json" },
      });
    }

    return await routeRotateCredentialsRequest(req, {
      allowedOrigins,
      // FASE 17A: só chamado pelo roteador DEPOIS de método/CORS/
      // Content-Type/corpo já validados.
      buildHandlerDeps: () => {
        const authHeader = req.headers.get("authorization") ?? "";
        const userClient = createClient(supabaseUrl, anonKey, {
          global: { headers: { Authorization: authHeader } },
        });
        const adminClient = createClient(supabaseUrl, serviceRoleKey);
        return {
          authClient: userClient.auth as unknown as AuthClientLike,
          adminClient: adminClient as unknown as AdminSupabaseLike,
          callbackBaseUrl,
        };
      },
    });
  });
}
