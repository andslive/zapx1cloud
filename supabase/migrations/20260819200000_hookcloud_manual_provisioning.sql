-- FASE 13A — RPC única e atômica para provisionamento manual de uma
-- conexão HookCloud (o administrador cola os dados exibidos no painel da
-- HookCloud após o Embedded Signup deles — Phone Number ID, WABA ID,
-- Business ID, número comercial, Meta Access Token — e esta função cria
-- tudo: a conexão base, a configuração Meta, o secret do token no Vault
-- e vincula o hash do segredo de callback já gerado pelo chamador).
--
-- NÃO reinventa armazenamento de token: reaproveita `vault.create_secret`
-- exatamente como `rotate_meta_connection_access_token` já faz (migration
-- 20260811000000_meta_cloud_vault_secrets.sql) — mesmo mecanismo, mesma
-- convenção de nome de secret, nenhum caminho paralelo.
--
-- Atomicidade: função PL/pgSQL única = uma transação. Qualquer
-- RAISE EXCEPTION em qualquer ponto reverte TUDO que a função já fez
-- nesta chamada — a linha de `evolution_instances`, o secret criado no
-- Vault, e a linha de `evolution_instances_meta_cloud` — nunca existe
-- instância base sem config Meta, config Meta sem instância base, secret
-- órfão no Vault, hash sem conexão, ou conexão parcialmente ativa. Nunca
-- deixa a conexão em `onboarding_state = 'active'` — sempre 'pending'
-- (exige verificação humana/callback numa fase posterior, fora do escopo
-- desta migration).
--
-- NÃO aplicada nesta fase. Ordem operacional obrigatória (mesma regra já
-- estabelecida nas Fases 10A/10C/11A/11C): aplicar → verificar schema
-- real → só então deployar o código consumidor
-- (hookcloud-provision-connection Edge Function).

CREATE OR REPLACE FUNCTION public.provision_hookcloud_meta_connection(
  p_organization_id uuid,
  p_connection_name text,
  p_phone_number_id text,
  p_waba_id text,
  p_business_id text,
  p_display_phone_number text,
  p_access_token text,
  p_hookcloud_secret_hash text
)
RETURNS TABLE (connection_id uuid, onboarding_state text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_connection_id uuid;
  v_token_secret_ref uuid;
BEGIN
  -- Validação de entrada — todos os IDs Meta tratados como strings opacas
  -- (nunca convertidos para número; comprimento/vazio validados, nunca o
  -- CONTEÚDO interpretado). `p_business_id` é o único opcional (nem toda
  -- integração expõe Business ID separado do WABA — ver auditoria
  -- HookCloud, Fase 8A/8B).
  IF p_organization_id IS NULL
     OR p_connection_name IS NULL OR length(trim(p_connection_name)) = 0
     OR p_phone_number_id IS NULL OR length(trim(p_phone_number_id)) = 0
     OR p_waba_id IS NULL OR length(trim(p_waba_id)) = 0
     OR p_access_token IS NULL OR length(p_access_token) = 0
     OR p_hookcloud_secret_hash IS NULL OR length(p_hookcloud_secret_hash) <> 64
  THEN
    RAISE EXCEPTION 'hookcloud_provisioning_invalid_input';
  END IF;

  -- Defesa em profundidade: nunca confia cegamente que a organização
  -- existe só porque o chamador (Edge Function) diz que sim — mesmo que a
  -- Edge Function já tenha validado isso via `profiles.organization_id`
  -- do usuário autenticado.
  IF NOT EXISTS (SELECT 1 FROM public.organizations WHERE id = p_organization_id) THEN
    RAISE EXCEPTION 'hookcloud_provisioning_invalid_input';
  END IF;

  BEGIN
    -- 1) Conexão base — SEMPRE nova (esta função nunca aceita um
    -- connection_id existente como entrada), então "conexão UazAPI
    -- recebendo configuração Meta" é estruturalmente impossível aqui.
    INSERT INTO public.evolution_instances (organization_id, name, provider, phone_number, status)
    VALUES (p_organization_id, p_connection_name, 'meta_cloud', p_display_phone_number, 'disconnected')
    RETURNING id INTO v_connection_id;

    -- 2) Secret do token de acesso no Vault, criado ANTES de ser
    -- referenciado (mesmo padrão de rotate_meta_connection_access_token
    -- — nunca referencia algo que ainda não existe).
    v_token_secret_ref := vault.create_secret(
      p_access_token,
      'meta_access_token:' || v_connection_id::text || ':' || extract(epoch FROM clock_timestamp())::bigint::text,
      'Meta Cloud API access token (provisionamento manual HookCloud)'
    );

    -- 3) Configuração Meta — onboarding_state SEMPRE 'pending' aqui
    -- (nunca 'active'; a CHECK evolution_instances_meta_cloud_active_
    -- requires_token, já existente, também não seria satisfeita por um
    -- estado 'active' sem verificação, mas o valor abaixo já é 'pending'
    -- por design, não por essa constraint). `onboarding_source =
    -- 'hookcloud'` sempre — esta função é exclusiva do fluxo de
    -- provisionamento HookCloud (o fluxo `direct_meta` é outra fase, se
    -- algum dia existir uma RPC equivalente para ele).
    INSERT INTO public.evolution_instances_meta_cloud (
      evolution_instance_id, organization_id, meta_business_id, waba_id,
      phone_number_id, display_phone_number, onboarding_state,
      access_token_secret_ref, onboarding_source, hookcloud_webhook_secret_hash,
      hookcloud_webhook_secret_rotated_at
    ) VALUES (
      v_connection_id, p_organization_id, NULLIF(trim(p_business_id), ''), p_waba_id,
      p_phone_number_id, p_display_phone_number, 'pending',
      v_token_secret_ref, 'hookcloud', p_hookcloud_secret_hash,
      now()
    );
  EXCEPTION
    WHEN unique_violation THEN
      -- Phone Number ID (ou a combinação waba_id+phone_number_id) já
      -- pertence a outra conexão — mensagem específica o bastante para
      -- ser acionável por um administrador autorizado (não é um vetor de
      -- enumeração de terceiros não autenticados, como o webhook público
      -- é — aqui o chamador já provou ser admin da própria organização),
      -- mas nunca ecoa detalhe bruto da constraint/índice do Postgres.
      RAISE EXCEPTION 'hookcloud_provisioning_conflict';
    WHEN OTHERS THEN
      -- Qualquer outra falha (Vault indisponível, erro inesperado) —
      -- genérica, nunca ecoa mensagem interna do Postgres/Vault. Como
      -- esta função inteira é uma transação, chegar aqui significa que
      -- TUDO que já foi feito nesta chamada (INSERT em
      -- evolution_instances, secret no Vault, INSERT em
      -- evolution_instances_meta_cloud) é revertido automaticamente —
      -- nunca há instância órfã, secret órfão ou config parcial.
      RAISE EXCEPTION 'hookcloud_provisioning_failed';
  END;

  RETURN QUERY SELECT v_connection_id, 'pending'::text;
END;
$$;

REVOKE ALL ON FUNCTION public.provision_hookcloud_meta_connection(uuid, text, text, text, text, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.provision_hookcloud_meta_connection(uuid, text, text, text, text, text, text, text) FROM anon;
REVOKE ALL ON FUNCTION public.provision_hookcloud_meta_connection(uuid, text, text, text, text, text, text, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.provision_hookcloud_meta_connection(uuid, text, text, text, text, text, text, text) TO service_role;

-- ══════════════════════════════════════════════════════════════════════
-- ROLLBACK (documentado, NÃO executado):
--
-- DROP FUNCTION IF EXISTS public.provision_hookcloud_meta_connection(uuid, text, text, text, text, text, text, text);
--
-- Nota: não apaga nenhuma conexão/secret já provisionado por esta função
-- (nenhum foi, nesta fase — não aplicada). Se algum dia precisar reverter
-- APÓS uso real, isso é decisão administrativa separada e deliberada.
-- ══════════════════════════════════════════════════════════════════════
