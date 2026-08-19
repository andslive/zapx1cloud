-- FASE 14A — verify token individual e rotacionável por conexão HookCloud.
--
-- Contexto: o GET de verificação (`hub.mode`/`hub.verify_token`/
-- `hub.challenge`) usava, até aqui, um único META_WEBHOOK_VERIFY_TOKEN
-- PLATAFORMA-WIDE (ver meta-cloud-webhook/index.ts, handleVerification —
-- INALTERADO nesta migration e nesta fase, continua servindo o caminho
-- `direct_meta`/legado). Esta migration adiciona a fundação de schema para
-- um segundo segredo, POR CONEXÃO, exclusivo do modo `hookcloud`:
--   - `hookcloud_verify_token_hash`      → autentica SOMENTE o GET.
--   - `hookcloud_webhook_secret_hash`    → autentica SOMENTE o POST
--     (coluna já existente, migration 20260819100000 — INTOCADA aqui).
-- Os dois nunca são o mesmo valor (gerados por chamadas CSPRNG
-- independentes no código, ver meta-webhook-hookcloud-secret.ts).
--
-- NÃO aplicada nesta fase. Mesma ordem operacional das migrations
-- anteriores desta linha de trabalho: aplicar → verificar schema real →
-- só então deployar o código consumidor.

-- ── 1) Colunas novas — idempotente, sem default, sem backfill ───────────
-- A tabela está vazia hoje (0 conexões Meta/HookCloud, confirmado na Fase
-- 13C) — mas mesmo que não estivesse, `ADD COLUMN IF NOT EXISTS` sem
-- `DEFAULT`/`NOT NULL` nunca reescreve nem valida linhas existentes.

ALTER TABLE public.evolution_instances_meta_cloud
  ADD COLUMN IF NOT EXISTS hookcloud_verify_token_hash text;

ALTER TABLE public.evolution_instances_meta_cloud
  ADD COLUMN IF NOT EXISTS hookcloud_verify_token_rotated_at timestamptz;

COMMENT ON COLUMN public.evolution_instances_meta_cloud.hookcloud_verify_token_hash IS
  'Hash SHA-256 (hex) do verify token individual usado exclusivamente no GET hub.verify_token do modo onboarding_source=hookcloud. INDEPENDENTE de hookcloud_webhook_secret_hash (que autentica só o POST) — nunca o mesmo valor bruto. NULL = nenhum verify token configurado (GET reprova). Ver /tmp/x1zap-hookcloud-audit-20260818.md, Fase 14A.';

COMMENT ON COLUMN public.evolution_instances_meta_cloud.hookcloud_verify_token_rotated_at IS
  'Timestamp da última rotação de hookcloud_verify_token_hash — só para auditoria/observabilidade, não participa da validação em si.';

-- ── 2) RPC de provisionamento — nova assinatura (9 args) ─────────────────
-- `CREATE OR REPLACE FUNCTION` NÃO substitui uma função quando a lista de
-- tipos de argumento muda (cria uma sobrecarga nova, deixando as duas
-- coexistindo com grants divergentes) — por isso a assinatura ANTIGA (8
-- args, aplicada na Fase 13C) é removida explicitamente antes de recriar.
-- `IF EXISTS` torna esta migration idempotente mesmo se já reaplicada.

DROP FUNCTION IF EXISTS public.provision_hookcloud_meta_connection(uuid, text, text, text, text, text, text, text);

CREATE OR REPLACE FUNCTION public.provision_hookcloud_meta_connection(
  p_organization_id uuid,
  p_connection_name text,
  p_phone_number_id text,
  p_waba_id text,
  p_business_id text,
  p_display_phone_number text,
  p_access_token text,
  p_hookcloud_secret_hash text,
  p_hookcloud_verify_token_hash text
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
  IF p_organization_id IS NULL
     OR p_connection_name IS NULL OR length(trim(p_connection_name)) = 0
     OR p_phone_number_id IS NULL OR length(trim(p_phone_number_id)) = 0
     OR p_waba_id IS NULL OR length(trim(p_waba_id)) = 0
     OR p_access_token IS NULL OR length(p_access_token) = 0
     OR p_hookcloud_secret_hash IS NULL OR length(p_hookcloud_secret_hash) <> 64
     OR p_hookcloud_verify_token_hash IS NULL OR length(p_hookcloud_verify_token_hash) <> 64
     -- Defesa em profundidade contra reutilização acidental do mesmo
     -- segredo bruto para as duas finalidades (a geração no código já
     -- garante independência real — ver meta-webhook-hookcloud-secret.ts
     -- — mas um hash colidido nunca deve ser aceito silenciosamente).
     OR p_hookcloud_secret_hash = p_hookcloud_verify_token_hash
  THEN
    RAISE EXCEPTION 'hookcloud_provisioning_invalid_input';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.organizations WHERE id = p_organization_id) THEN
    RAISE EXCEPTION 'hookcloud_provisioning_invalid_input';
  END IF;

  BEGIN
    INSERT INTO public.evolution_instances (organization_id, name, provider, phone_number, status)
    VALUES (p_organization_id, p_connection_name, 'meta_cloud', p_display_phone_number, 'disconnected')
    RETURNING id INTO v_connection_id;

    v_token_secret_ref := vault.create_secret(
      p_access_token,
      'meta_access_token:' || v_connection_id::text || ':' || extract(epoch FROM clock_timestamp())::bigint::text,
      'Meta Cloud API access token (provisionamento manual HookCloud)'
    );

    INSERT INTO public.evolution_instances_meta_cloud (
      evolution_instance_id, organization_id, meta_business_id, waba_id,
      phone_number_id, display_phone_number, onboarding_state,
      access_token_secret_ref, onboarding_source,
      hookcloud_webhook_secret_hash, hookcloud_webhook_secret_rotated_at,
      hookcloud_verify_token_hash, hookcloud_verify_token_rotated_at
    ) VALUES (
      v_connection_id, p_organization_id, NULLIF(trim(p_business_id), ''), p_waba_id,
      p_phone_number_id, p_display_phone_number, 'pending',
      v_token_secret_ref, 'hookcloud',
      p_hookcloud_secret_hash, now(),
      p_hookcloud_verify_token_hash, now()
    );
  EXCEPTION
    WHEN unique_violation THEN
      RAISE EXCEPTION 'hookcloud_provisioning_conflict';
    WHEN OTHERS THEN
      RAISE EXCEPTION 'hookcloud_provisioning_failed';
  END;

  RETURN QUERY SELECT v_connection_id, 'pending'::text;
END;
$$;

REVOKE ALL ON FUNCTION public.provision_hookcloud_meta_connection(uuid, text, text, text, text, text, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.provision_hookcloud_meta_connection(uuid, text, text, text, text, text, text, text, text) FROM anon;
REVOKE ALL ON FUNCTION public.provision_hookcloud_meta_connection(uuid, text, text, text, text, text, text, text, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.provision_hookcloud_meta_connection(uuid, text, text, text, text, text, text, text, text) TO service_role;

-- ── 3) RPC de rotação — fundação testável, conjunta ou separada ─────────
-- Rotaciona `hookcloud_webhook_secret_hash` e/ou `hookcloud_verify_token_hash`
-- de UMA conexão já existente. Qualquer hash de entrada NULL significa
-- "não rotacionar esse segredo agora" — os dois nunca são obrigatórios ao
-- mesmo tempo (rotação pode ser conjunta ou separada, por design). Sempre
-- que QUALQUER um dos dois é rotacionado, `onboarding_state` volta para
-- 'pending' — a conexão só volta a ficar ativa depois de uma verificação
-- posterior (GET bem-sucedido com o novo verify token), fora do escopo
-- desta função. Nunca toca em `access_token_secret_ref` (o token Meta em
-- si não é afetado por esta rotação).
--
-- Autorização (quem pode chamar com qual `p_organization_id`) é
-- responsabilidade da Edge Function chamadora (mesmo padrão de
-- `provision_hookcloud_meta_connection`/`hookcloud-provision-connection`)
-- — esta RPC, como defesa em profundidade, ainda assim EXIGE que
-- `p_organization_id` bata com a organização real da conexão, e nunca
-- aceita `p_connection_id` de outra organização (proteção cross-tenant
-- também no nível do banco, não só na Edge Function).

CREATE OR REPLACE FUNCTION public.rotate_hookcloud_webhook_credentials(
  p_connection_id uuid,
  p_organization_id uuid,
  p_new_callback_secret_hash text,
  p_new_verify_token_hash text
)
RETURNS TABLE (connection_id uuid, onboarding_state text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_row public.evolution_instances_meta_cloud%ROWTYPE;
BEGIN
  IF p_connection_id IS NULL OR p_organization_id IS NULL THEN
    RAISE EXCEPTION 'hookcloud_rotation_invalid_input';
  END IF;

  IF p_new_callback_secret_hash IS NULL AND p_new_verify_token_hash IS NULL THEN
    RAISE EXCEPTION 'hookcloud_rotation_invalid_input';
  END IF;

  IF (p_new_callback_secret_hash IS NOT NULL AND length(p_new_callback_secret_hash) <> 64)
     OR (p_new_verify_token_hash IS NOT NULL AND length(p_new_verify_token_hash) <> 64)
     OR (p_new_callback_secret_hash IS NOT NULL AND p_new_callback_secret_hash = p_new_verify_token_hash)
  THEN
    RAISE EXCEPTION 'hookcloud_rotation_invalid_input';
  END IF;

  SELECT * INTO v_row
  FROM public.evolution_instances_meta_cloud
  WHERE evolution_instance_id = p_connection_id
  FOR UPDATE;

  -- Cross-tenant: linha inexistente OU pertencente a outra organização —
  -- MESMA mensagem genérica nos dois casos, nunca revela qual dos dois
  -- ocorreu (evita confirmar a um chamador não autorizado que um
  -- connection_id existe em outra organização).
  IF NOT FOUND OR v_row.organization_id <> p_organization_id THEN
    RAISE EXCEPTION 'hookcloud_rotation_not_found';
  END IF;

  IF v_row.onboarding_source IS DISTINCT FROM 'hookcloud' THEN
    RAISE EXCEPTION 'hookcloud_rotation_not_found';
  END IF;

  UPDATE public.evolution_instances_meta_cloud
  SET
    hookcloud_webhook_secret_hash = COALESCE(p_new_callback_secret_hash, hookcloud_webhook_secret_hash),
    hookcloud_webhook_secret_rotated_at = CASE WHEN p_new_callback_secret_hash IS NOT NULL THEN now() ELSE hookcloud_webhook_secret_rotated_at END,
    hookcloud_verify_token_hash = COALESCE(p_new_verify_token_hash, hookcloud_verify_token_hash),
    hookcloud_verify_token_rotated_at = CASE WHEN p_new_verify_token_hash IS NOT NULL THEN now() ELSE hookcloud_verify_token_rotated_at END,
    -- Rotacionar qualquer um dos dois segredos invalida a verificação
    -- anterior da rota — a conexão só volta a ficar utilizável depois de
    -- um novo GET de verificação bem-sucedido.
    onboarding_state = 'pending'
  WHERE evolution_instance_id = p_connection_id;

  RETURN QUERY SELECT p_connection_id, 'pending'::text;
END;
$$;

REVOKE ALL ON FUNCTION public.rotate_hookcloud_webhook_credentials(uuid, uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rotate_hookcloud_webhook_credentials(uuid, uuid, text, text) FROM anon;
REVOKE ALL ON FUNCTION public.rotate_hookcloud_webhook_credentials(uuid, uuid, text, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.rotate_hookcloud_webhook_credentials(uuid, uuid, text, text) TO service_role;

-- ══════════════════════════════════════════════════════════════════════
-- ROLLBACK (documentado, NÃO executado):
--
-- DROP FUNCTION IF EXISTS public.rotate_hookcloud_webhook_credentials(uuid, uuid, text, text);
-- DROP FUNCTION IF EXISTS public.provision_hookcloud_meta_connection(uuid, text, text, text, text, text, text, text, text);
-- CREATE OR REPLACE FUNCTION public.provision_hookcloud_meta_connection(uuid, text, text, text, text, text, text, text)
--   -- (assinatura de 8 args da Fase 13A/13C — ver migration 20260819200000)
-- ALTER TABLE public.evolution_instances_meta_cloud DROP COLUMN IF EXISTS hookcloud_verify_token_hash;
-- ALTER TABLE public.evolution_instances_meta_cloud DROP COLUMN IF EXISTS hookcloud_verify_token_rotated_at;
--
-- Nota: esta migration NÃO foi aplicada — este rollback é só
-- documentação preventiva, nunca executado nesta fase.
-- ══════════════════════════════════════════════════════════════════════
