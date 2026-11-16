-- Contas de gateway de pagamento por organização (ColocaPay SPEI/MXN, LeonaPay OXXO/MXN).
-- 100% aditiva. NÃO APLICAR em produção sem autorização explícita; validada só em Postgres local.
--
-- Segredos (API key e segredo de webhook) vivem no Supabase Vault, como em
-- 20260811000000_meta_cloud_vault_secrets.sql. A tabela guarda apenas UUIDs opacos de
-- referência e dados mascarados. Nenhum papel de aplicação lê o valor: só as RPCs
-- SECURITY DEFINER abaixo, concedidas exclusivamente a service_role.

CREATE EXTENSION IF NOT EXISTS supabase_vault;

CREATE TABLE IF NOT EXISTS public.payment_gateway_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider IN ('colocapay', 'leonapay')),
  label text NOT NULL CHECK (length(btrim(label)) BETWEEN 1 AND 80),
  environment text NOT NULL CHECK (environment IN ('sandbox', 'production')),
  -- Referências opacas ao Vault (nunca o valor).
  api_key_secret_ref uuid,
  webhook_secret_secret_ref uuid,
  -- Dados mascarados para exibição.
  api_key_last4 text,
  webhook_secret_last4 text,
  -- Token público e aleatório que identifica a conta na URL do webhook. Não é segredo de
  -- autenticação (a autenticidade vem da assinatura/segredo), só um localizador.
  webhook_token text NOT NULL DEFAULT replace(gen_random_uuid()::text, '-', ''),
  enabled boolean NOT NULL DEFAULT false,
  last_test_at timestamptz,
  -- Resultado do último teste: {credential_accepted, method_available, detail, checked_at}.
  last_test_result jsonb,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT payment_gateway_accounts_label_unique UNIQUE (organization_id, provider, label),
  CONSTRAINT payment_gateway_accounts_webhook_token_unique UNIQUE (webhook_token)
);

CREATE INDEX IF NOT EXISTS idx_payment_gateway_accounts_org
  ON public.payment_gateway_accounts (organization_id, provider);

ALTER TABLE public.payment_gateway_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org admins and managers view payment gateway accounts"
ON public.payment_gateway_accounts FOR SELECT
USING (
  organization_id = (SELECT organization_id FROM public.profiles WHERE id = auth.uid())
  AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'))
);

-- Escrita só pela Edge Function (service_role). Nenhuma política de INSERT/UPDATE/DELETE
-- para usuários. Leitura de usuário só nas colunas não sensíveis.
REVOKE ALL ON public.payment_gateway_accounts FROM PUBLIC, anon, authenticated;
GRANT SELECT (id, organization_id, provider, label, environment, api_key_last4,
              webhook_secret_last4, webhook_token, enabled, last_test_at,
              last_test_result, created_at, updated_at)
  ON public.payment_gateway_accounts TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.payment_gateway_accounts TO service_role;

-- ─── RPCs SECURITY DEFINER: únicas portas de escrita/leitura de segredo ───

CREATE OR REPLACE FUNCTION public.payment_gateway_set_secret(
  p_account_id uuid,
  p_organization_id uuid,
  p_secret_kind text,
  p_value text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_ref uuid;
  v_name text;
BEGIN
  IF p_account_id IS NULL OR p_organization_id IS NULL
     OR p_value IS NULL OR length(p_value) = 0
     OR p_secret_kind NOT IN ('api_key', 'webhook_secret') THEN
    RAISE EXCEPTION 'payment_secret_denied';
  END IF;

  IF p_secret_kind = 'api_key' THEN
    SELECT api_key_secret_ref INTO v_ref FROM public.payment_gateway_accounts
     WHERE id = p_account_id AND organization_id = p_organization_id;
  ELSE
    SELECT webhook_secret_secret_ref INTO v_ref FROM public.payment_gateway_accounts
     WHERE id = p_account_id AND organization_id = p_organization_id;
  END IF;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'payment_secret_denied';
  END IF;

  IF v_ref IS NULL THEN
    v_name := 'payment_gw_' || p_secret_kind || ':' || p_account_id::text;
    v_ref := vault.create_secret(p_value, v_name, 'payment gateway secret');
  ELSE
    PERFORM vault.update_secret(v_ref, p_value);
  END IF;

  IF p_secret_kind = 'api_key' THEN
    UPDATE public.payment_gateway_accounts
       SET api_key_secret_ref = v_ref,
           api_key_last4 = right(p_value, 4),
           updated_at = now()
     WHERE id = p_account_id AND organization_id = p_organization_id;
  ELSE
    UPDATE public.payment_gateway_accounts
       SET webhook_secret_secret_ref = v_ref,
           webhook_secret_last4 = right(p_value, 4),
           updated_at = now()
     WHERE id = p_account_id AND organization_id = p_organization_id;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_payment_gateway_secret(
  p_account_id uuid,
  p_organization_id uuid,
  p_secret_kind text
) RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_ref uuid;
  v_value text;
BEGIN
  IF p_account_id IS NULL OR p_organization_id IS NULL
     OR p_secret_kind NOT IN ('api_key', 'webhook_secret') THEN
    RAISE EXCEPTION 'payment_secret_denied';
  END IF;

  IF p_secret_kind = 'api_key' THEN
    SELECT api_key_secret_ref INTO v_ref FROM public.payment_gateway_accounts
     WHERE id = p_account_id AND organization_id = p_organization_id;
  ELSE
    SELECT webhook_secret_secret_ref INTO v_ref FROM public.payment_gateway_accounts
     WHERE id = p_account_id AND organization_id = p_organization_id;
  END IF;
  IF v_ref IS NULL THEN
    RAISE EXCEPTION 'payment_secret_denied';
  END IF;

  SELECT decrypted_secret INTO v_value FROM vault.decrypted_secrets WHERE id = v_ref;
  IF v_value IS NULL THEN
    RAISE EXCEPTION 'payment_secret_denied';
  END IF;
  RETURN v_value;
END;
$$;

REVOKE ALL ON FUNCTION public.payment_gateway_set_secret(uuid, uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.payment_gateway_set_secret(uuid, uuid, text, text) TO service_role;
REVOKE ALL ON FUNCTION public.get_payment_gateway_secret(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_payment_gateway_secret(uuid, uuid, text) TO service_role;
