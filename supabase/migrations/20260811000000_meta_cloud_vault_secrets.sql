-- FASE 2B.0 — Vault real e acesso backend-only para secrets da Meta Cloud
-- API. 100% aditiva. NÃO APLICAR sem autorização explícita — arquivo local,
-- validado apenas em Postgres efêmero local nesta fase (ver relatório
-- Fase 2B.0). Nenhum `supabase db push`/link remoto foi executado.
--
-- Auditoria feita antes de escrever este arquivo (instrução #8 da Fase
-- 2B.0): `grep -rn "vault\." supabase/migrations/*.sql` encontrou USO REAL
-- e JÁ EM PRODUÇÃO do Supabase Vault neste repositório —
-- `20260428143324_email_infra.sql`/`20260507142850_email_infra.sql`
-- (`CREATE EXTENSION IF NOT EXISTS supabase_vault;`, `vault.create_secret`)
-- e `20260610210851_...sql`/`20260611172832_...sql`/`20260612124944_...sql`
-- (leitura de `vault.decrypted_secrets` para SUPABASE_URL/SERVICE_ROLE_KEY
-- usados por `pg_net`/`pg_cron`). Este arquivo SEGUE essa convenção já
-- estabelecida (mesma extensão, mesmas funções `vault.*`) — não inventa um
-- mecanismo paralelo.
--
-- Decisão arquitetural registrada: `access_token_secret_ref` (já existente
-- em `evolution_instances_meta_cloud` desde a Fase 2A) é POR CONEXÃO — cada
-- conexão Meta Cloud tem seu próprio access token de longa duração.
-- `app_secret`/`webhook_verify_token` são, por natureza, PLATAFORMA-WIDE
-- (um único App da Meta hospeda todas as conexões desta instalação) — não
-- fazem sentido como coluna por conexão, então vivem numa tabela singleton
-- separada (`meta_cloud_platform_secrets`), mesmo padrão de singleton já
-- usado em `platform_settings`. Isso é documentado explicitamente para não
-- forçar um vínculo artificial de organização/conexão em algo que não é
-- escopado a organização/conexão de fato.

CREATE EXTENSION IF NOT EXISTS supabase_vault;

-- ─── 1. Integridade: conexão "active" precisa ter um secret ref ───
--
-- Reforça em nível de banco que uma conexão marcada como pronta para uso
-- real (`onboarding_state = 'active'`) sempre tem uma referência de
-- credencial associada — nunca "ativa" sem token. Aplicado com validação
-- imediata (não é `NOT VALID`) porque, diferente da CHECK de `provider`
-- (Fase 2A.3), aqui não há dado histórico de produção em jogo: a tabela
-- `evolution_instances_meta_cloud` inteira é nova desta fundação (Fase 2A),
-- nunca aplicada em nenhum ambiente remoto — não há linha existente que
-- possa violar esta regra.
ALTER TABLE public.evolution_instances_meta_cloud
  ADD CONSTRAINT evolution_instances_meta_cloud_active_requires_token
  CHECK (onboarding_state <> 'active' OR access_token_secret_ref IS NOT NULL);

-- ─── 2. Secrets de plataforma (App Secret / Webhook Verify Token) ───

CREATE TABLE IF NOT EXISTS public.meta_cloud_platform_secrets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Singleton: só pode existir UMA linha (índice único abaixo). Mesmo
  -- padrão de restrição de singleton já usado em
  -- meta_cloud_feature_flags (Fase 2A), aqui via constante fixa.
  singleton_guard boolean NOT NULL DEFAULT true,
  -- Referências opacas — NUNCA o valor em texto plano aqui.
  app_secret_secret_ref uuid,
  webhook_verify_token_secret_ref uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES public.profiles(id),
  CONSTRAINT meta_cloud_platform_secrets_singleton_check CHECK (singleton_guard = true)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_meta_cloud_platform_secrets_singleton
  ON public.meta_cloud_platform_secrets (singleton_guard);

ALTER TABLE public.meta_cloud_platform_secrets ENABLE ROW LEVEL SECURITY;

-- RLS: só super admin (mesmo padrão de meta_cloud_feature_flags) — nem
-- admin/manager de organização veem isto, porque não é escopado a
-- organização nenhuma. Mesmo assim, RLS aqui é defesa em profundidade —
-- a garantia real é a RPC SECURITY DEFINER (seção 4) e os GRANTs restritos
-- (nunca SELECT direto na tabela por ninguém além de service_role/super
-- admin via política).
CREATE POLICY "Super admin manages platform secrets refs"
ON public.meta_cloud_platform_secrets
FOR ALL
USING (public.is_super_admin(auth.uid()))
WITH CHECK (public.is_super_admin(auth.uid()));

-- FASE 2B.0.5B — defeito concreto encontrado e corrigido: esta tabela era
-- a única, entre as 4 tabelas Meta, sem nenhum REVOKE explícito — herdava
-- `arwdDxtm` para anon/authenticated/service_role via ALTER DEFAULT
-- PRIVILEGES do projeto gerenciado (confirmado por ensaio real, Fase
-- 2B.0.5, e reconfirmado na Fase 2B.0.5A). Auditoria de consumidores reais
-- (repetida nesta fase): NENHUM caminho de código deste repositório
-- executa `.from("meta_cloud_platform_secrets")` — o único acesso real é
-- via `get_meta_platform_secret`, RPC `SECURITY DEFINER` cujo owner
-- (quem aplicar esta migration) já tem acesso pleno à tabela
-- independentemente de qualquer GRANT concedido a `service_role` (funções
-- SECURITY DEFINER rodam com os privilégios do OWNER, nunca do chamador —
-- mesmo princípio já documentado na seção 4 deste arquivo). Portanto
-- `service_role` não recebe NENHUM grant direto nesta tabela — o
-- bootstrap inicial da linha singleton (app_secret/webhook_verify_token)
-- é uma operação administrativa rara, feita por quem aplicar a migration
-- (owner), nunca por código de aplicação.
REVOKE ALL ON public.meta_cloud_platform_secrets FROM PUBLIC;
REVOKE ALL ON public.meta_cloud_platform_secrets FROM anon;
REVOKE ALL ON public.meta_cloud_platform_secrets FROM authenticated;
REVOKE ALL ON public.meta_cloud_platform_secrets FROM service_role;
-- Nenhum GRANT para nenhum papel — só o owner (via RPC SECURITY DEFINER
-- da seção 4, ou acesso direto de superusuário/dono para bootstrap
-- administrativo) enxerga esta tabela. Mesmo essa visibilidade nunca
-- inclui o VALOR do secret (a coluna é só o UUID de referência) — o valor
-- só sai pela RPC da seção 4.

-- ─── 3. Nomenclatura de secrets no Vault (convenção, não enforced por constraint) ───
--
-- vault.secrets.name usa o padrão:
--   meta_access_token:{evolution_instance_id}
--   meta_app_secret (singleton)
--   meta_webhook_verify_token (singleton)
-- Isso é só convenção de nomeação para auditoria manual (`SELECT name FROM
-- vault.secrets`), nunca usado para RESOLVER um secret a partir do nome —
-- toda resolução de leitura passa pelo UUID armazenado na tabela de
-- configuração, nunca por busca de nome (ver seção 4, nota sobre não
-- aceitar UUID/nome livre do cliente).

-- ─── 4. RPCs SECURITY DEFINER — únicas portas de leitura de secret ───
--
-- Ambas as funções: schema explícito em TODO objeto referenciado,
-- `SET search_path = pg_catalog` (mínimo tecnicamente possível — todo
-- objeto de `public.*`/`vault.*` já é referenciado com schema explícito no
-- corpo de cada função, então nenhum desses dois schemas precisa estar no
-- search_path para resolução de nomes; reduzido de `pg_catalog, public,
-- vault` para `pg_catalog` na Fase 2B.0.2, ver auditoria Fase 2B.0.1 §4),
-- nenhuma interpolação dinâmica de identificador (sem
-- `EXECUTE format(...)` com nome de coluna/tabela vindo de parâmetro),
-- falham fechado (RAISE EXCEPTION genérico, nunca revela detalhe de
-- por que falhou — nunca "conexão existe mas pertence a outra org" vs
-- "conexão não existe", sempre a mesma mensagem).

CREATE OR REPLACE FUNCTION public.get_meta_connection_access_token(
  p_connection_id uuid,
  p_organization_id uuid
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_secret_ref uuid;
  v_onboarding_state text;
  v_decrypted text;
BEGIN
  IF p_connection_id IS NULL OR p_organization_id IS NULL THEN
    RAISE EXCEPTION 'meta_secret_access_denied';
  END IF;

  -- Resolve internamente pela IDENTIDADE da conexão/organização — nunca
  -- aceita um UUID de secret livre. O join com evolution_instances aqui
  -- cumpre o mesmo papel da FK composta da Fase 2A.3 (Correção 3): só
  -- retorna algo se a conexão realmente pertence à organização informada.
  SELECT emc.access_token_secret_ref, emc.onboarding_state
    INTO v_secret_ref, v_onboarding_state
  FROM public.evolution_instances_meta_cloud emc
  JOIN public.evolution_instances ei
    ON ei.id = emc.evolution_instance_id
   AND ei.organization_id = p_organization_id
  WHERE emc.evolution_instance_id = p_connection_id
    AND emc.organization_id = p_organization_id;

  -- Falha fechado: configuração inexistente, vínculo organização/conexão
  -- incorreto, conexão não ativa, ou referência ausente — TODOS os casos
  -- caem na mesma exceção genérica, sem distinguir motivo (nunca revela
  -- se a conexão existe em outra organização).
  IF v_secret_ref IS NULL OR v_onboarding_state IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION 'meta_secret_access_denied';
  END IF;

  SELECT decrypted_secret INTO v_decrypted
  FROM vault.decrypted_secrets
  WHERE id = v_secret_ref;

  IF v_decrypted IS NULL THEN
    -- Referência aponta para um secret removido/revogado no Vault —
    -- também falha fechado, nunca retorna NULL silenciosamente (isso
    -- poderia ser mal-interpretado como "conexão sem token" em vez de
    -- "erro de integridade").
    RAISE EXCEPTION 'meta_secret_access_denied';
  END IF;

  RETURN v_decrypted;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_meta_platform_secret(
  p_secret_kind text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_secret_ref uuid;
  v_decrypted text;
BEGIN
  -- CASE exaustivo, sem ELSE que converta silenciosamente um valor
  -- desconhecido/NULL/vazio em 'webhook_verify_token' — cada ramo válido é
  -- explícito, e o ramo residual (WHEN OTHERS, cobrindo NULL, string vazia,
  -- e qualquer valor fora dos dois esperados) sempre falha fechado. `NOT IN`
  -- sozinho (versão anterior) já rejeitava NULL corretamente em termos de
  -- resultado (NULL NOT IN (...) é NULL, e um IF com condição NULL não entra
  -- no bloco THEN — cai direto no corpo da função com v_secret_ref nunca
  -- atribuído, cenário que dependia do DECLARE sem valor para se comportar
  -- como "não encontrado" em vez de falhar explicitamente por tipo inválido);
  -- este CASE torna a rejeição de NULL/vazio/desconhecido uma decisão
  -- explícita do primeiro ramo avaliado, não um efeito colateral do
  -- comportamento de NULL em SQL.
  CASE p_secret_kind
    WHEN 'app_secret' THEN
      SELECT app_secret_secret_ref INTO v_secret_ref
      FROM public.meta_cloud_platform_secrets
      WHERE singleton_guard = true;
    WHEN 'webhook_verify_token' THEN
      SELECT webhook_verify_token_secret_ref INTO v_secret_ref
      FROM public.meta_cloud_platform_secrets
      WHERE singleton_guard = true;
    ELSE
      -- Cobre NULL, string vazia, e qualquer valor fora dos dois aceitos.
      RAISE EXCEPTION 'meta_secret_access_denied';
  END CASE;

  IF v_secret_ref IS NULL THEN
    RAISE EXCEPTION 'meta_secret_access_denied';
  END IF;

  SELECT decrypted_secret INTO v_decrypted
  FROM vault.decrypted_secrets
  WHERE id = v_secret_ref;

  IF v_decrypted IS NULL THEN
    RAISE EXCEPTION 'meta_secret_access_denied';
  END IF;

  RETURN v_decrypted;
END;
$$;

-- Revoga de TUDO primeiro, depois concede só ao papel estritamente
-- necessário — nunca depende de RLS para proteger a RPC (RLS não é
-- substituto de GRANT/REVOKE em funções SECURITY DEFINER: uma função
-- SECURITY DEFINER roda com os privilégios do OWNER, ignorando RLS da
-- sessão chamadora nas tabelas que ela toca internamente — é exatamente
-- por isso que o controle de acesso tem que estar no GRANT EXECUTE, não
-- na RLS das tabelas subjacentes).
REVOKE ALL ON FUNCTION public.get_meta_connection_access_token(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_meta_connection_access_token(uuid, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.get_meta_connection_access_token(uuid, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_meta_connection_access_token(uuid, uuid) TO service_role;

REVOKE ALL ON FUNCTION public.get_meta_platform_secret(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_meta_platform_secret(text) FROM anon;
REVOKE ALL ON FUNCTION public.get_meta_platform_secret(text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_meta_platform_secret(text) TO service_role;

-- ─── 5. Rotação e revogação — backend-only, atômicas ───
--
-- Todas rodam dentro da transação implícita da própria chamada de função
-- — se qualquer passo falhar, a função inteira reverte (Postgres reverte
-- efeitos de uma function SECURITY DEFINER como qualquer outra instrução
-- dentro da transação do chamador), então NUNCA existe uma janela
-- observável onde `access_token_secret_ref` aponta para um secret que já
-- foi apagado — a remoção do valor ANTIGO (`DELETE FROM vault.secrets`,
-- ver nota abaixo) só acontece DEPOIS
-- do `UPDATE` da referência já ter sido confirmado dentro da mesma
-- transação atômica.

CREATE OR REPLACE FUNCTION public.rotate_meta_connection_access_token(
  p_connection_id uuid,
  p_organization_id uuid,
  p_new_token text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_old_ref uuid;
  v_new_ref uuid;
  v_rows_updated int;
BEGIN
  IF p_connection_id IS NULL OR p_organization_id IS NULL OR p_new_token IS NULL OR length(p_new_token) = 0 THEN
    RAISE EXCEPTION 'meta_secret_rotation_denied';
  END IF;

  -- Confirma vínculo organização/conexão ANTES de criar qualquer secret novo
  -- no Vault (evita criar um secret órfão se a validação for rejeitada).
  SELECT access_token_secret_ref INTO v_old_ref
  FROM public.evolution_instances_meta_cloud emc
  JOIN public.evolution_instances ei
    ON ei.id = emc.evolution_instance_id
   AND ei.organization_id = p_organization_id
  WHERE emc.evolution_instance_id = p_connection_id
    AND emc.organization_id = p_organization_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'meta_secret_rotation_denied';
  END IF;

  -- 1) cria o novo secret primeiro (referência nova, valor novo)
  v_new_ref := vault.create_secret(
    p_new_token,
    'meta_access_token:' || p_connection_id::text || ':' || extract(epoch FROM clock_timestamp())::bigint::text,
    'Meta Cloud API access token (rotacionado)'
  );

  -- 2) só troca a referência ativa DEPOIS do novo secret já existir
  UPDATE public.evolution_instances_meta_cloud
  SET access_token_secret_ref = v_new_ref,
      updated_at = now()
  WHERE evolution_instance_id = p_connection_id
    AND organization_id = p_organization_id;

  GET DIAGNOSTICS v_rows_updated = ROW_COUNT;
  IF v_rows_updated <> 1 THEN
    RAISE EXCEPTION 'meta_secret_rotation_denied';
  END IF;

  -- 3) só invalida o secret ANTIGO depois da troca já confirmada (dentro
  -- da mesma transação — se o UPDATE acima não tivesse commitado ainda,
  -- ok, porque toda a função roda atomicamente; se algo APÓS este ponto
  -- falhar, a transação inteira reverte e o secret antigo nunca é
  -- efetivamente removido, então nunca há perda de acesso).
  -- Esta versão do supabase_vault (0.3.1, confirmada em Postgres real
  -- nesta fase) NÃO expõe `vault.delete_secret()` — só `create_secret`/
  -- `update_secret`. Remoção é por DELETE direto em `vault.secrets`,
  -- mesmo padrão já documentado no rollback de
  -- `20260428143324_email_infra.sql:283` deste repositório
  -- ("DELETE FROM vault.secrets WHERE name = ..."). `vault.secrets` não
  -- tem RLS própria observada nesta versão local; a única proteção real
  -- é quem pode executar ESTA função (`service_role`, via GRANT abaixo).
  IF v_old_ref IS NOT NULL THEN
    DELETE FROM vault.secrets WHERE id = v_old_ref;
  END IF;

  RETURN v_new_ref;
END;
$$;

CREATE OR REPLACE FUNCTION public.revoke_meta_connection(
  p_connection_id uuid,
  p_organization_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_old_ref uuid;
  v_rows_updated int;
BEGIN
  IF p_connection_id IS NULL OR p_organization_id IS NULL THEN
    RAISE EXCEPTION 'meta_secret_revocation_denied';
  END IF;

  SELECT access_token_secret_ref INTO v_old_ref
  FROM public.evolution_instances_meta_cloud emc
  JOIN public.evolution_instances ei
    ON ei.id = emc.evolution_instance_id
   AND ei.organization_id = p_organization_id
  WHERE emc.evolution_instance_id = p_connection_id
    AND emc.organization_id = p_organization_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'meta_secret_revocation_denied';
  END IF;

  -- Muda o estado ANTES de remover o secret — a partir deste UPDATE,
  -- get_meta_connection_access_token já falha fechado (onboarding_state
  -- <> 'active'), mesmo que o DELETE do Vault abaixo ainda não tenha
  -- rodado. "Impedir uso de referência revogada" é garantido pelo estado,
  -- não só pela ausência do secret.
  UPDATE public.evolution_instances_meta_cloud
  SET onboarding_state = 'offboarded',
      access_token_secret_ref = NULL,
      updated_at = now()
  WHERE evolution_instance_id = p_connection_id
    AND organization_id = p_organization_id;

  GET DIAGNOSTICS v_rows_updated = ROW_COUNT;
  IF v_rows_updated <> 1 THEN
    RAISE EXCEPTION 'meta_secret_revocation_denied';
  END IF;

  IF v_old_ref IS NOT NULL THEN
    DELETE FROM vault.secrets WHERE id = v_old_ref;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.rotate_meta_connection_access_token(uuid, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rotate_meta_connection_access_token(uuid, uuid, text) FROM anon;
REVOKE ALL ON FUNCTION public.rotate_meta_connection_access_token(uuid, uuid, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.rotate_meta_connection_access_token(uuid, uuid, text) TO service_role;

REVOKE ALL ON FUNCTION public.revoke_meta_connection(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.revoke_meta_connection(uuid, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.revoke_meta_connection(uuid, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_meta_connection(uuid, uuid) TO service_role;

-- ══════════════════════════════════════════════════════════════════════
-- ROLLBACK (documentado, NÃO executado) — ordem: RPCs primeiro (nada mais
-- depende delas), depois a tabela de secrets de plataforma, depois a
-- CHECK constraint em evolution_instances_meta_cloud. Nenhum dado real de
-- produção é afetado (tabela nova desta fundação, nunca aplicada):
--
-- DROP FUNCTION IF EXISTS public.revoke_meta_connection(uuid, uuid);
-- DROP FUNCTION IF EXISTS public.rotate_meta_connection_access_token(uuid, uuid, text);
-- DROP FUNCTION IF EXISTS public.get_meta_platform_secret(text);
-- DROP FUNCTION IF EXISTS public.get_meta_connection_access_token(uuid, uuid);
-- DROP TABLE IF EXISTS public.meta_cloud_platform_secrets;
-- ALTER TABLE public.evolution_instances_meta_cloud
--   DROP CONSTRAINT IF EXISTS evolution_instances_meta_cloud_active_requires_token;
--
-- Nota: este rollback NÃO apaga secrets já criados em vault.secrets (isso
-- exigiria decisão explícita separada, já que `vault.secrets` é
-- compartilhado com outros usos já em produção deste mesmo Vault —
-- email_infra, funnel-job-runner cron). Apagar secrets órfãos específicos
-- desta fundação, se necessário, é uma limpeza manual e deliberada, não
-- automática neste rollback.
-- ══════════════════════════════════════════════════════════════════════
