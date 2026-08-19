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
//   4) gera um segredo de callback via CSPRNG, guarda só o HASH (a RPC
//      recebe o hash, nunca o valor bruto);
//   5) monta a URL de callback a partir de configuração confiável do
//      servidor (nunca do Host header da requisição) e a devolve ao
//      administrador exatamente UMA vez.
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
import { generateHookCloudCallbackSecret, hashHookCloudWebhookSecret } from "../_shared/meta-webhook-hookcloud-secret.ts";
import { resolveHookCloudWebhookMode } from "../_shared/meta-webhook-hookcloud-mode.ts";
import { isMetaCloudApiEnabled } from "../_shared/meta-cloud-flags.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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

function jsonResponse(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
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
  const { data: profile } = await deps.adminClient
    .from("profiles")
    .select("organization_id")
    .eq("id", caller.id)
    .maybeSingle();

  if (!profile?.organization_id) {
    return jsonResponse(403, { error: "no_organization" });
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

  // 8) Segredo de callback — CSPRNG, só o hash é enviado à RPC.
  const generateSecret = deps.generateSecret ?? generateHookCloudCallbackSecret;
  const rawCallbackSecret = generateSecret();
  const callbackSecretHash = await hashHookCloudWebhookSecret(rawCallbackSecret);

  // 9) RPC atômica — cria tudo ou nada. O token real só existe nesta
  // chamada (nunca logado, nunca no corpo de erro).
  const { data: rpcData, error: rpcError } = await deps.adminClient.rpc("provision_hookcloud_meta_connection", {
    p_organization_id: organizationId,
    p_connection_name: body.connectionName,
    p_phone_number_id: body.phoneNumberId,
    p_waba_id: body.wabaId,
    p_business_id: body.businessId ?? null,
    p_display_phone_number: body.displayPhoneNumber,
    p_access_token: body.accessToken,
    p_hookcloud_secret_hash: callbackSecretHash,
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
  // Token, referência de Vault, service role, App Secret ou o HASH do
  // segredo (só o valor bruto, e só agora — nenhuma segunda leitura
  // possível depois desta resposta).
  return jsonResponse(201, {
    connection_id: connectionId,
    onboarding_state: onboardingState,
    callback_url: callbackUrl,
    warnings: [
      "A URL de callback contém o segredo em texto — pode aparecer em logs de infraestrutura (proxies/CDN). Trate como sensível.",
      "Este segredo é uma mitigação, não substitui HMAC — a Meta não permite header personalizado neste modo.",
      "Este valor não será mostrado novamente. Se perdido, será necessário rotacionar o segredo numa fase futura.",
      "A conexão foi criada como 'pending' — nenhuma mensagem pode ser enviada ou recebida até uma verificação posterior.",
    ],
  });
}

// ── Nota sobre o GET verify_token (decisão registrada, não implementada) ─
//
// O GET de verificação usa hoje um único META_WEBHOOK_VERIFY_TOKEN
// PLATAFORMA-WIDE (compartilhado por TODAS as organizações desta
// instalação — ver meta-cloud-webhook/index.ts, handleVerification,
// intocado desde a Fase 2A). Retornar esse valor para um admin de UMA
// organização divulgaria um segredo do qual a segurança de TODAS as
// outras organizações também depende indiretamente — uma violação de
// menor privilégio, mesmo que o verify_token em si tenha baixo risco
// (só prova posse da URL de callback para a Meta, não autentica POSTs).
// Esta ambiguidade operacional é registrada e NÃO resolvida por
// improviso nesta fase — o valor NUNCA é incluído na resposta deste
// endpoint. Uma fase futura própria deve decidir entre: (a) restringir a
// exibição a super_admin apenas; (b) migrar para um verify_token por
// organização/conexão (mudança estrutural maior, fora do escopo desta
// fase); ou (c) manter como configuração manual feita fora deste fluxo.

// ── Nota de integração (deliberadamente NÃO feita nesta fase) ───────────
//
// Este arquivo exporta `handleProvisionRequest` já com TODAS as
// checagens (autenticação, organização, papel, as duas feature flags,
// validação de identificadores, geração/hash do segredo, chamada à RPC
// atômica) como função pura testável (deps injetadas) — mas NÃO inclui um
// bloco `Deno.serve`/`import.meta.main` real com clientes Supabase de
// produção — ainda não há nenhuma conexão HookCloud real para
// provisionar, e as flags (HOOKCLOUD_WEBHOOK_MODE,
// meta_cloud_feature_flags) permanecem desligadas em toda esta linha de
// trabalho. Compor o entry point real (só autenticação via ANON_KEY/
// SERVICE_ROLE_KEY reais + `Deno.serve`, chamando `handleProvisionRequest`
// com os clientes reais) é trabalho de uma fase de deploy futura, com sua
// própria autorização — mesmo padrão incremental já usado em
// meta-webhook-hookcloud-gate.ts (Fase 11A) antes de ser conectado ao
// handler real (Fase 12A).
