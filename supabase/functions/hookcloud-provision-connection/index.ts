// FASE 13A — backend de provisionamento manual de uma conexão HookCloud.
//
// Fluxo: um administrador autorizado (da própria organização) cola no
// painel do CRM os dados exibidos pelo painel da HookCloud após o
// Embedded Signup deles (Phone Number ID, WABA ID, Business ID opcional,
// número comercial, Meta Access Token). Esta função:
//   1) valida autorização (JWT real + organização + papel administrativo);
//   2) valida os identificadores como strings opacas;
//   3) chama a RPC atômica `provision_hookcloud_meta_connection` (migration
//      20260819200000, NÃO aplicada nesta fase) — que cria a instância
//      base, o secret do token no Vault, e a config Meta com
//      onboarding_state='pending', tudo dentro de UMA transação;
//   4) gera DOIS segredos INDEPENDENTES via CSPRNG (Fase 14A) — um
//      callback secret (POST, embutido na URL como `hcs`) e um verify
//      token (GET, devolvido separado) — guarda só o HASH de cada um (a
//      RPC recebe os hashes, nunca os valores brutos);
//   5) monta a URL de callback a partir de configuração confiável do
//      servidor (nunca do Host header da requisição) e devolve os dois
//      valores brutos ao administrador exatamente UMA vez.
//
// NÃO É FRONTEND. NÃO faz Embedded Signup. NÃO chama a Graph API real.
// NÃO usa credencial real em nenhum teste. NÃO libera nenhuma ação de
// negócio — a conexão criada fica em `onboarding_state = 'pending'`
// (nunca 'active'), inerte até uma fase futura de verificação.
//
// Reaproveita, sem duplicar: o padrão de autorização real já usado em
// `create-team-member/index.ts` (JWT via anon client + `profiles.
// organization_id` + `user_roles`); `isMetaCloudApiEnabled` (flag por
// organização); `resolveHookCloudWebhookMode` (flag global HookCloud);
// `generateHookCloudCallbackSecret`/`hashHookCloudWebhookSecret` (Fase
// 11A/13A); a RPC `vault.create_secret` já usada por
// `rotate_meta_connection_access_token` (via a nova RPC atômica, mesmo
// mecanismo, nenhum caminho paralelo de armazenamento de token).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  generateHookCloudCallbackSecret,
  generateHookCloudVerifyToken,
  hashHookCloudVerifyToken,
  hashHookCloudWebhookSecret,
} from "../_shared/meta-webhook-hookcloud-secret.ts";
import { resolveHookCloudWebhookMode } from "../_shared/meta-webhook-hookcloud-mode.ts";
import { isMetaCloudApiEnabled } from "../_shared/meta-cloud-flags.ts";
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

// Papel mínimo exigido — mais restrito que create-team-member (que aceita
// 'manager' para a maioria das operações). Provisionar uma conexão com um
// Meta Access Token real é mais sensível do que gerenciar membros de
// equipe, então só 'admin'/'super_admin' — nunca 'manager'/'seller'.
const REQUIRED_ROLES = new Set(["admin", "super_admin"]);

// ── Interfaces mínimas — injetáveis para teste, sem tipo concreto do SDK ─

export interface AuthClientLike {
  auth: { getUser(): Promise<{ data: { user: { id: string } | null } }> };
}

/** Resultado de `.eq(...)` — thenable (como o PostgrestFilterBuilder real do supabase-js, que retorna array por padrão) e com `.maybeSingle()` para o caso de linha única esperada. */
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

/**
 * Interface abstrata para validação futura do Meta Access Token (ex.:
 * chamar `GET /me` na Graph API para confirmar que o token é válido e
 * corresponde ao Phone Number ID informado). NESTA FASE, nenhuma
 * implementação real existe — só um stub que confirma formato mínimo,
 * sem nenhuma chamada de rede. Injetável, para permitir substituição por
 * uma implementação real numa fase futura sem alterar o resto do fluxo.
 */
export interface MetaAccessTokenValidator {
  validate(rawToken: string): Promise<{ valid: boolean; reason?: string }>;
}

/** Stub desta fase — NUNCA faz chamada de rede real. */
export function createNoopMetaAccessTokenValidator(): MetaAccessTokenValidator {
  return {
    async validate(rawToken: string) {
      if (!rawToken || rawToken.trim().length === 0) {
        return { valid: false, reason: "empty_token" };
      }
      // Formato mínimo plausível — nunca uma prova real de validade.
      // Substituir por uma chamada real à Graph API é trabalho de fase
      // futura, fora do escopo desta.
      return { valid: true };
    },
  };
}

export interface ProvisionHookCloudConnectionDeps {
  authClient: AuthClientLike;
  adminClient: AdminSupabaseLike;
  tokenValidator: MetaAccessTokenValidator;
  /** Base confiável para montar a URL de callback — NUNCA o Host header da requisição. */
  callbackBaseUrl: string;
  /** Injetável para teste — evita depender de crypto real em todo teste. */
  generateSecret?: () => string;
  /** FASE 14A — injetável para teste; gera o verify token INDEPENDENTE do callback secret (chamada CSPRNG separada). */
  generateVerifyToken?: () => string;
  /** Injetável para teste — substitui isMetaCloudApiEnabled sem precisar mockar a consulta completa de flags. */
  isMetaCloudApiEnabledForOrg?: (organizationId: string) => Promise<boolean>;
}

export interface ProvisionHookCloudConnectionInput {
  organizationId: string; // enviado pelo cliente, NUNCA usado como autoridade — só comparado contra o valor real do perfil
  connectionName: string;
  phoneNumberId: string;
  wabaId: string;
  businessId?: string;
  displayPhoneNumber: string;
  accessToken: string;
}

/**
 * FASE 16B: nunca inclui `Access-Control-Allow-Origin` (isso agora é
 * responsabilidade exclusiva do roteador — `routeProvisionConnectionRequest`
 * — que mescla a decisão de CORS baseada na allowlist real DEPOIS que
 * este handler já decidiu status/corpo). Sempre `Cache-Control: no-store`
 * — nenhuma resposta deste endpoint é cacheável, sucesso ou erro.
 */
function jsonResponse(status: number, body: Record<string, unknown>, extraHeaders: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...NO_STORE_HEADERS, ...extraHeaders, "Content-Type": "application/json" },
  });
}

/**
 * Trata um ID Meta (Phone Number ID, WABA ID, Business ID) como string
 * opaca — nunca `Number(...)`, nunca `parseInt`. Só confirma que é uma
 * string não vazia dentro de um limite de tamanho razoável (defesa
 * contra payload absurdo, não uma regra de formato Meta específica —
 * a Meta não documenta um formato fixo além de "string numérica longa").
 */
function isPlausibleOpaqueId(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= 64;
}

/**
 * HTTPS obrigatório para a base da URL de callback, exceto para
 * desenvolvimento local (127.0.0.1/localhost, onde o próprio Supabase CLI
 * serve as Edge Functions em HTTP por padrão). Falha fechada para
 * qualquer outra coisa (URL malformada, `http://` num domínio real, etc.)
 * — nunca constrói uma URL de callback insegura por omissão.
 */
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

export async function handleProvisionRequest(req: Request, deps: ProvisionHookCloudConnectionDeps): Promise<Response> {
  // 1) Autenticação real — nunca confia em nenhum campo do corpo da
  // requisição para identidade. Mesmo padrão de create-team-member.
  const { data: { user: caller } } = await deps.authClient.auth.getUser();
  if (!caller) {
    return jsonResponse(401, { error: "not_authenticated" });
  }

  // 2) organization_id SEMPRE derivado do perfil do usuário autenticado —
  // nunca do corpo da requisição (mesmo que o cliente envie um
  // organization_id, ele só é usado para CONFIRMAR que bate com o real;
  // nunca como autoridade por si só — ver validação cross-tenant abaixo).
  // FASE 13B (achado de revisão): também confirma que o usuário não está
  // desativado/suspenso (`profiles.disabled`/`is_active`) — um JWT ainda
  // válido não deveria bastar para provisionar uma conexão Meta real se a
  // conta já foi desativada pela própria organização.
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

  // 3) Papel administrativo — mesmo padrão de create-team-member: consulta
  // TODAS as linhas de user_roles do usuário (um usuário pode ter mais de
  // um papel), nunca .maybeSingle() aqui.
  const { data: roleRows } = await deps.adminClient
    .from("user_roles")
    .select("role")
    .eq("user_id", caller.id);
  const roles: string[] = (roleRows ?? []).map((r: any) => r.role);
  const isAuthorizedRole = roles.some((r) => REQUIRED_ROLES.has(r));
  if (!isAuthorizedRole) {
    return jsonResponse(403, { error: "insufficient_role" });
  }

  // Falha rápido em configuração de servidor inválida, ANTES de qualquer
  // trabalho de banco — nunca constrói uma URL de callback insegura.
  // Exceção só para desenvolvimento local (127.0.0.1/localhost), onde o
  // próprio Supabase CLI serve em HTTP.
  if (!isTrustedCallbackBaseUrl(deps.callbackBaseUrl)) {
    console.error("[hookcloud-provision-connection] callbackBaseUrl configurado não é HTTPS confiável");
    return jsonResponse(500, { error: "invalid_callback_base_url" });
  }

  let body: Partial<ProvisionHookCloudConnectionInput>;
  try {
    body = await req.json();
  } catch {
    return jsonResponse(400, { error: "malformed_json" });
  }

  // 4) organization_id enviado pelo cliente, se presente, precisa BATER
  // com o real — nunca é usado sozinho, e uma tentativa cross-tenant
  // (organização diferente da do perfil) é rejeitada aqui, antes de
  // qualquer outra validação.
  if (body.organizationId && body.organizationId !== profile.organization_id) {
    return jsonResponse(403, { error: "organization_mismatch" });
  }
  const organizationId = profile.organization_id as string;

  // 5) Feature flags — reaproveitadas, não duplicadas. Flag global
  // HookCloud (env var) + flag Meta por organização (tabela existente).
  // Como ambas estão desligadas por padrão em toda esta linha de
  // trabalho, este endpoint não pode ser usado em produção mesmo que o
  // código seja um dia implantado sem configuração adicional.
  const hookCloudMode = resolveHookCloudWebhookMode();
  if (hookCloudMode !== "pilot") {
    return jsonResponse(403, { error: "hookcloud_disabled" });
  }
  const metaEnabledForOrg = deps.isMetaCloudApiEnabledForOrg
    ? await deps.isMetaCloudApiEnabledForOrg(organizationId)
    : await isMetaCloudApiEnabled(deps.adminClient as any, organizationId);
  if (!metaEnabledForOrg) {
    return jsonResponse(403, { error: "meta_cloud_disabled_for_organization" });
  }

  // 6) Validação dos identificadores como strings opacas.
  if (!isPlausibleOpaqueId(body.connectionName)) {
    return jsonResponse(400, { error: "invalid_connection_name" });
  }
  if (!isPlausibleOpaqueId(body.phoneNumberId)) {
    return jsonResponse(400, { error: "invalid_phone_number_id" });
  }
  if (!isPlausibleOpaqueId(body.wabaId)) {
    return jsonResponse(400, { error: "invalid_waba_id" });
  }
  if (body.businessId !== undefined && body.businessId !== "" && !isPlausibleOpaqueId(body.businessId)) {
    return jsonResponse(400, { error: "invalid_business_id" });
  }
  if (!isPlausibleOpaqueId(body.displayPhoneNumber)) {
    return jsonResponse(400, { error: "invalid_display_phone_number" });
  }

  // 7) Token — nunca vazio; validado pela interface abstrata (stub nesta
  // fase, nunca uma chamada de rede real).
  if (typeof body.accessToken !== "string" || body.accessToken.trim().length === 0) {
    return jsonResponse(400, { error: "empty_token" });
  }
  const tokenCheck = await deps.tokenValidator.validate(body.accessToken);
  if (!tokenCheck.valid) {
    return jsonResponse(400, { error: "invalid_token" });
  }

  // 8) Dois segredos INDEPENDENTES — CSPRNG separado para cada um (nunca
  // um derivado do outro), só o HASH de cada um é enviado à RPC.
  //   - callbackSecret (`hcs`)  → autentica exclusivamente o POST.
  //   - verifyToken             → autentica exclusivamente o GET
  //     individual desta conexão (Fase 14A) — nunca reutiliza o mesmo
  //     valor do callback secret.
  const generateSecret = deps.generateSecret ?? generateHookCloudCallbackSecret;
  const generateVerifyToken = deps.generateVerifyToken ?? generateHookCloudVerifyToken;
  const rawCallbackSecret = generateSecret();
  const rawVerifyToken = generateVerifyToken();
  const callbackSecretHash = await hashHookCloudWebhookSecret(rawCallbackSecret);
  const verifyTokenHash = await hashHookCloudVerifyToken(rawVerifyToken);

  // 9) RPC atômica — cria tudo ou nada. Os valores brutos só existem
  // nesta chamada (nunca logados, nunca no corpo de erro).
  const { data: rpcData, error: rpcError } = await deps.adminClient.rpc("provision_hookcloud_meta_connection", {
    p_organization_id: organizationId,
    p_connection_name: body.connectionName,
    p_phone_number_id: body.phoneNumberId,
    p_waba_id: body.wabaId,
    p_business_id: body.businessId ?? null,
    p_display_phone_number: body.displayPhoneNumber,
    p_access_token: body.accessToken,
    p_hookcloud_secret_hash: callbackSecretHash,
    p_hookcloud_verify_token_hash: verifyTokenHash,
  });

  if (rpcError) {
    // Nunca ecoa rpcError.message bruto — só o código já sanitizado pela
    // própria RPC (hookcloud_provisioning_conflict/_invalid_input/_failed).
    if (rpcError.code === "hookcloud_provisioning_conflict" || rpcError.message?.includes("hookcloud_provisioning_conflict")) {
      return jsonResponse(409, { error: "phone_number_id_or_waba_conflict" });
    }
    if (rpcError.message?.includes("hookcloud_provisioning_invalid_input")) {
      return jsonResponse(400, { error: "invalid_input" });
    }
    // Vault indisponível ou qualquer outra falha — nada foi persistido
    // (a RPC é uma transação única); nunca retorna o token, nunca deixa
    // provider ambíguo.
    return jsonResponse(500, { error: "provisioning_failed" });
  }

  const row = Array.isArray(rpcData) ? rpcData[0] : rpcData;
  const connectionId = row?.connection_id;
  const onboardingState = row?.onboarding_state ?? "pending";

  if (!connectionId) {
    return jsonResponse(500, { error: "provisioning_failed" });
  }

  // 10) URL de callback — base confiável configurada pelo servidor, NUNCA
  // o Host header da requisição recebida. Nome do parâmetro (`hcs`) é o
  // mesmo já implementado no gate real (Fase 12A) — nenhum segundo
  // parâmetro inventado.
  const callbackUrl = `${deps.callbackBaseUrl.replace(/\/$/, "")}/functions/v1/meta-cloud-webhook?hcs=${rawCallbackSecret}`;

  // 11) Resposta — só o estritamente necessário. NUNCA o Meta Access
  // Token, referência de Vault, service role, App Secret ou os HASHES dos
  // dois segredos (só os valores BRUTOS, e só agora — nenhuma segunda
  // leitura possível depois desta resposta). `verify_token` é devolvido
  // SEPARADO da `callback_url` (nunca embutido nela) — é o valor que o
  // administrador deve colar no campo "Verify Token" do painel HookCloud,
  // nunca na URL de callback.
  return jsonResponse(201, {
    connection_id: connectionId,
    onboarding_state: onboardingState,
    callback_url: callbackUrl,
    verify_token: rawVerifyToken,
    warnings: [
      "A URL de callback contém o segredo em texto — pode aparecer em logs de infraestrutura (proxies/CDN). Trate como sensível.",
      "O callback secret (na URL) e o verify_token (separado) são dois valores INDEPENDENTES — nunca use um no lugar do outro.",
      "O callback secret é uma mitigação ao POST, não substitui HMAC — a Meta não permite header personalizado neste modo.",
      "O verify_token só é exigido pela Meta uma vez, no momento em que o painel HookCloud configura o callback.",
      "Nenhum dos dois valores será mostrado novamente. Se perdidos, será necessário rotacionar numa fase futura.",
      "A conexão foi criada como 'pending' — nenhuma mensagem pode ser enviada ou recebida até uma verificação posterior.",
    ],
  }, CREDENTIAL_RESPONSE_HEADERS);
}

// ── Nota sobre o GET verify_token — RESOLVIDO para HookCloud na Fase 14A ─
//
// A Fase 13A registrou esta lacuna como decisão pendente: o GET de
// verificação usava (e para `direct_meta`/legado continua usando) um
// único META_WEBHOOK_VERIFY_TOKEN PLATAFORMA-WIDE, o que impedia devolver
// esse valor a um admin de uma única organização sem violar menor
// privilégio.
//
// A Fase 14A resolveu isso ESPECIFICAMENTE para conexões HookCloud: cada
// conexão agora tem seu PRÓPRIO `hookcloud_verify_token_hash`
// (independente do callback secret), gerado e devolvido nesta mesma
// resposta (`verify_token`, acima) — nunca o verify token global. O admin
// cola este valor no campo "Verify Token" do painel HookCloud; o
// `meta-cloud-webhook/index.ts` (Fase 14A, `handleHookCloudVerification`)
// localiza a conexão pelo `hcs` e valida este token individualmente,
// nunca contra o valor global.
//
// O verify token PLATAFORMA-WIDE (META_WEBHOOK_VERIFY_TOKEN) permanece
// intocado e continua sendo a única opção para o caminho `direct_meta` —
// não foi removido, pois pode haver consumidor legado.

// ── FASE 16B — roteamento HTTP real (método, CORS, cache, corpo) ────────
//
// `handleProvisionRequest` (acima) permanece INTOCADO — mesma assinatura,
// mesma lógica de autenticação/autorização/RPC já auditada nas Fases
// 13A/13B/16A. Esta camada nova só decide, ANTES de chegar lá: método
// permitido, origem CORS, Content-Type, e tamanho do corpo — nunca
// autenticação, nunca banco, nunca segredo.

export interface RouteProvisionConnectionRequestDeps {
  /** Allowlist real de origens administrativas — injetável para teste. */
  allowedOrigins: ReadonlySet<string>;
  /**
   * FASE 17A (achado de revisão): construído SOB DEMANDA, só depois que
   * o roteamento já validou método, CORS, Content-Type e corpo — nunca
   * antes. Antes desta correção, o entry point real construía os
   * clientes Supabase (incluindo o de `service_role`, o mais
   * privilegiado do sistema) para TODA requisição recebida, mesmo as
   * que seriam rejeitadas por método errado, origem fora da allowlist,
   * ou corpo inválido — desperdício de recurso e superfície
   * desnecessária. Agora, nenhuma requisição rejeitada chega a
   * construir nenhum cliente Supabase.
   */
  buildHandlerDeps: () => ProvisionHookCloudConnectionDeps;
}

const ALLOWED_METHODS_HEADER = "POST, OPTIONS";

export async function routeProvisionConnectionRequest(
  req: Request,
  deps: RouteProvisionConnectionRequestDeps,
): Promise<Response> {
  const origin = req.headers.get("origin");
  const cors = buildCorsDecision(origin, deps.allowedOrigins);

  // OPTIONS: SOMENTE validação CORS. Nunca autentica, nunca consulta
  // banco, nunca gera segredo, nunca chama RPC, nunca lê/loga o corpo.
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

  // Origem de navegador presente mas fora da allowlist — falha fechada,
  // ANTES de qualquer autenticação/banco/RPC.
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

  // Repassa ao handler já auditado — um Request NOVO, com o corpo já
  // integralmente lido em memória (nunca uma segunda leitura do stream
  // original, que já foi consumido acima por `readJsonBodyWithLimit`).
  const forwardedReq = new Request(req.url, { method: "POST", headers: req.headers, body: bodyResult.text });
  // FASE 17A: só agora — com método, CORS, Content-Type e corpo já
  // validados — o cliente privilegiado (service_role) é construído.
  const handlerDeps = deps.buildHandlerDeps();
  const innerResponse = await handleProvisionRequest(forwardedReq, handlerDeps);

  // Camada final: aplica CORS real + no-store por cima do que o handler
  // já decidiu (status/corpo do handler NUNCA são alterados aqui).
  const finalHeaders = new Headers(innerResponse.headers);
  for (const [key, value] of Object.entries(cors.headers)) finalHeaders.set(key, value);
  finalHeaders.set("Cache-Control", "no-store");
  return new Response(innerResponse.body, { status: innerResponse.status, headers: finalHeaders });
}

// ── Entry point real ──────────────────────────────────────────────────
// `import.meta.main` evita que `Deno.serve` tente abrir uma porta de
// rede quando este arquivo é apenas IMPORTADO (ex.: pelos testes, que
// rodam sem `--allow-net`) — mesmo padrão já usado em
// `meta-cloud-webhook/index.ts` desde a Fase 2A. Nenhum código roda no
// carregamento do módulo além de literais estáticos (`corsHeaders`
// removido, `REQUIRED_ROLES`) — nenhuma chamada de banco, nenhuma
// geração de credencial, nenhuma leitura de body acontece até que uma
// requisição HTTP real chegue.

if (import.meta.main) {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const callbackBaseUrl = supabaseUrl ?? "";
  const allowedOrigins = resolveHookCloudAdminAllowedOrigins();

  Deno.serve(async (req) => {
    if (!supabaseUrl || !serviceRoleKey || !anonKey) {
      // Falha de configuração de servidor — nunca expõe QUAL variável
      // está ausente, nunca ecoa valor algum.
      console.error("[hookcloud-provision-connection] configuração de ambiente incompleta");
      return new Response(JSON.stringify({ error: "server_misconfigured" }), {
        status: 500,
        headers: { ...NO_STORE_HEADERS, "Content-Type": "application/json" },
      });
    }

    return await routeProvisionConnectionRequest(req, {
      allowedOrigins,
      // FASE 17A: só chamado pelo roteador DEPOIS de método/CORS/
      // Content-Type/corpo já validados — nenhuma requisição rejeitada
      // chega a construir o cliente `service_role`.
      buildHandlerDeps: () => {
        const authHeader = req.headers.get("authorization") ?? "";
        const userClient = createClient(supabaseUrl, anonKey, {
          global: { headers: { Authorization: authHeader } },
        });
        const adminClient = createClient(supabaseUrl, serviceRoleKey);
        return {
          authClient: userClient.auth as unknown as AuthClientLike,
          adminClient: adminClient as unknown as AdminSupabaseLike,
          tokenValidator: createNoopMetaAccessTokenValidator(),
          callbackBaseUrl,
        };
      },
    });
  });
}

// ── Nota histórica ────────────────────────────────────────────────────
// O padrão incremental usado aqui (função pura testável primeiro, entry
// point real só numa fase de deploy posterior) é o mesmo já usado em
// `meta-webhook-hookcloud-gate.ts` (Fase 11A) antes de ser conectado ao
// handler real (Fase 12A). A Fase 16B completa esse padrão para este
// endpoint: o entry point real acima usa exatamente `handleProvisionRequest`,
// sem nenhuma alteração na lógica de negócio já auditada.
