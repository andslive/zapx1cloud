// Cadastro de contas de gateway (ColocaPay SPEI / LeonaPay OXXO) por organização.
// Segredos só entram aqui, vão direto ao Vault via RPC e NUNCA voltam ao cliente
// (resposta traz apenas estado e dados mascarados).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  GATEWAYS,
  isEnvironment,
  isProvider,
  webhookPath,
} from "../_shared/payment-gateways/catalog.ts";
import { maskSecret, testGatewayConnection } from "../_shared/payment-gateways/connection-test.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const PUBLIC_COLS =
  "id, organization_id, provider, label, environment, api_key_last4, webhook_secret_last4, webhook_token, enabled, last_test_at, last_test_result, created_at, updated_at";

function view(row: any, supabaseUrl: string) {
  return {
    id: row.id,
    provider: row.provider,
    label: row.label,
    environment: row.environment,
    enabled: row.enabled,
    api_key_masked: maskSecret(row.api_key_last4),
    webhook_secret_masked: maskSecret(row.webhook_secret_last4),
    webhook_secret_set: !!row.webhook_secret_last4,
    webhook_url: supabaseUrl + webhookPath(row.provider, row.webhook_token),
    last_test_at: row.last_test_at,
    last_test_result: row.last_test_result,
    updated_at: row.updated_at,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser(authHeader.replace("Bearer ", ""));
    if (userErr || !userData?.user?.id) return json({ error: "Unauthorized" }, 401);
    const userId = userData.user.id;

    const admin = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: profile } = await admin.from("profiles").select("organization_id").eq("id", userId).maybeSingle();
    const orgId = profile?.organization_id as string | undefined;
    if (!orgId) return json({ error: "Organization not found" }, 400);

    const [{ data: isAdmin }, { data: isManager }] = await Promise.all([
      admin.rpc("has_role", { _user_id: userId, _role: "admin" }),
      admin.rpc("has_role", { _user_id: userId, _role: "manager" }),
    ]);
    if (!isAdmin && !isManager) return json({ error: "Forbidden" }, 403);

    const body = await req.json().catch(() => ({}));
    const action = String(body.action ?? "");

    if (action === "list") {
      const { data, error } = await admin
        .from("payment_gateway_accounts")
        .select(PUBLIC_COLS)
        .eq("organization_id", orgId)
        .order("created_at");
      if (error) return json({ error: "Falha ao listar contas" }, 500);
      return json({
        accounts: (data ?? []).map((r) => view(r, SUPABASE_URL)),
        catalog: Object.values(GATEWAYS).map((g) => ({
          provider: g.provider,
          label: g.label,
          methods: g.methods,
          credential_help: g.credentialHelp,
        })),
      });
    }

    if (action === "upsert") {
      const { id, provider, label, environment } = body;
      const apiKey = typeof body.api_key === "string" ? body.api_key.trim() : "";
      const webhookSecret = typeof body.webhook_secret === "string" ? body.webhook_secret.trim() : "";
      if (!isProvider(provider)) return json({ error: "Gateway inválido" }, 400);
      if (!isEnvironment(environment)) return json({ error: "Ambiente inválido" }, 400);
      const cleanLabel = String(label ?? "").trim();
      if (!cleanLabel || cleanLabel.length > 80) return json({ error: "Nome da conta obrigatório (até 80 caracteres)" }, 400);
      if (apiKey.length > 512 || webhookSecret.length > 512) return json({ error: "Valor longo demais" }, 400);

      let accountId: string;
      if (id) {
        const { data: existing } = await admin
          .from("payment_gateway_accounts")
          .select("id, provider")
          .eq("id", id)
          .eq("organization_id", orgId)
          .maybeSingle();
        if (!existing) return json({ error: "Conta não encontrada" }, 404);
        if (existing.provider !== provider) return json({ error: "O gateway não pode ser trocado; crie outra conta" }, 400);
        const { error } = await admin
          .from("payment_gateway_accounts")
          .update({ label: cleanLabel, environment, updated_at: new Date().toISOString() })
          .eq("id", id)
          .eq("organization_id", orgId);
        if (error) return json({ error: error.code === "23505" ? "Já existe conta com esse nome" : "Falha ao salvar" }, 400);
        accountId = id;
      } else {
        if (!apiKey) return json({ error: "Informe a API key para cadastrar a conta" }, 400);
        const { data, error } = await admin
          .from("payment_gateway_accounts")
          .insert({ organization_id: orgId, provider, label: cleanLabel, environment, created_by: userId })
          .select("id")
          .single();
        if (error) return json({ error: error.code === "23505" ? "Já existe conta com esse nome" : "Falha ao salvar" }, 400);
        accountId = data.id;
      }

      for (const [kind, value] of [["api_key", apiKey], ["webhook_secret", webhookSecret]] as const) {
        if (!value) continue; // em edição, campo vazio mantém o segredo atual
        const { error } = await admin.rpc("payment_gateway_set_secret", {
          p_account_id: accountId,
          p_organization_id: orgId,
          p_secret_kind: kind,
          p_value: value,
        });
        if (error) return json({ error: "Falha ao guardar segredo no Vault" }, 500);
      }
      const { data: row } = await admin.from("payment_gateway_accounts").select(PUBLIC_COLS).eq("id", accountId).single();
      return json({ account: view(row, SUPABASE_URL) });
    }

    if (action === "test") {
      const { data: row } = await admin
        .from("payment_gateway_accounts")
        .select(PUBLIC_COLS)
        .eq("id", body.id)
        .eq("organization_id", orgId)
        .maybeSingle();
      if (!row) return json({ error: "Conta não encontrada" }, 404);
      const { data: apiKey, error: keyErr } = await admin.rpc("get_payment_gateway_secret", {
        p_account_id: row.id,
        p_organization_id: orgId,
        p_secret_kind: "api_key",
      });
      if (keyErr || typeof apiKey !== "string") return json({ error: "API key não cadastrada nesta conta" }, 400);
      const result = await testGatewayConnection(row.provider, row.environment, apiKey);
      await admin
        .from("payment_gateway_accounts")
        .update({ last_test_at: result.checked_at, last_test_result: result })
        .eq("id", row.id)
        .eq("organization_id", orgId);
      return json({ result });
    }

    if (action === "set_enabled") {
      const { data: row, error } = await admin
        .from("payment_gateway_accounts")
        .update({ enabled: body.enabled === true, updated_at: new Date().toISOString() })
        .eq("id", body.id)
        .eq("organization_id", orgId)
        .select(PUBLIC_COLS)
        .maybeSingle();
      if (error || !row) return json({ error: "Conta não encontrada" }, 404);
      return json({ account: view(row, SUPABASE_URL) });
    }

    return json({ error: "Ação desconhecida" }, 400);
  } catch (_e) {
    return json({ error: "Erro interno" }, 500);
  }
});
