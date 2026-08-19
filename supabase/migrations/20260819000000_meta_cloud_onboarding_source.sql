-- FASE 9A — fundação semântica mínima para distinguir a ORIGEM do onboarding
-- de uma conexão Meta Cloud API (ex.: HookCloud) do TRANSPORTE em si.
--
-- `evolution_instances.provider` já é, e continua sendo, a única fonte de
-- verdade sobre o transporte ('uazapi' | 'meta_cloud' — ver CHECK
-- `evolution_instances_provider_known_check`, migration
-- 20260810120000_meta_cloud_api_foundation.sql, e `resolve.ts`). Esta
-- migration NÃO cria uma coluna `transport_provider` nem duplica esse
-- conceito — faria exatamente o que o relatório de auditoria HookCloud
-- (Fase 8B) instruiu a evitar: duas fontes de verdade para o mesmo dado.
--
-- Também NÃO cria `automation_owner`: nenhum consumidor real dessa coluna
-- existe hoje (a HookCloud não tem construtor de funis nem bloco
-- Webhook/API interno — confirmado pela própria HookCloud, Fase 8B — logo
-- "quem executa automação" já é, por definição do produto atual, sempre o
-- X1Zap, sem precisar de um campo de banco para expressar isso). Se um
-- consumidor real surgir no futuro, essa coluna pode ser proposta então,
-- com a necessidade concreta documentada.
--
-- `onboarding_source` vive em `evolution_instances_meta_cloud` (não em
-- `evolution_instances`), porque é um detalhe específico de COMO uma
-- conexão Meta Cloud API foi cadastrada — não se aplica a conexões UazAPI,
-- que nem têm linha nesta tabela satélite. Nullable: nenhuma linha existe
-- hoje nesta tabela (fundação Meta inerte, 0 conexões reais — confirmado
-- na Fase 5B/5F/6A/6B/6C/8A), então esta migration não teria NENHUMA linha
-- para migrar de qualquer forma; NULL é o mesmo idioma semântico já usado
-- por `evolution_instances.provider IS NULL` (retrocompatibilidade/estado
-- não informado), mantendo consistência com o padrão já estabelecido no
-- projeto em vez de inventar um sentinela textual ('legacy') sem
-- necessidade.
--
-- Valores conhecidos hoje: 'hookcloud' (onboarding via HookCloud Flow,
-- Embedded Signup facilitado por eles) e 'direct_meta' (Embedded Signup
-- direto, sem intermediário — o design original da Fase 2A). Nenhum dos
-- dois é usado ainda; nenhuma feature é ativada por esta migration.
--
-- Dívida técnica registrada, deliberadamente NÃO implementada nesta fase:
-- uma regra que rejeite `evolution_instances.provider = 'uazapi'` com uma
-- linha correspondente em `evolution_instances_meta_cloud` com
-- `onboarding_source = 'hookcloud'` exigiria um CHECK entre tabelas
-- diferentes, o que o Postgres não suporta nativamente — só seria possível
-- via TRIGGER, e a Fase 9A proíbe explicitamente criar trigger nesta
-- etapa. Hoje essa consistência já é garantida a nível de aplicação
-- (`resolve.ts` só tenta carregar `evolution_instances_meta_cloud` quando
-- `provider = 'meta_cloud'`), e a FK composta existente
-- (`evolution_instances_meta_cloud_conn_org_fk`) já impede o cross-org.
-- Se, no futuro, essa garantia precisar ser movida para o banco, deve
-- entrar como proposta própria, com trigger auditado separadamente.

-- ─── 1. Coluna `onboarding_source` (idempotente nativamente via IF NOT EXISTS) ───
ALTER TABLE public.evolution_instances_meta_cloud
  ADD COLUMN IF NOT EXISTS onboarding_source text;

-- ─── 2. CHECK constraint de valores conhecidos (idempotente, mesmo padrão
--         seguro já usado em `evolution_instances_provider_known_check` e em
--         `onboarding_state`/`history_sync_status` desta mesma tabela) ───
--
-- NULL é explicitamente permitido — nenhuma linha existente é afetada
-- (tabela vazia hoje) e nenhuma escrita futura é obrigada a informar a
-- origem caso ainda não seja conhecida. `NOT VALID`: aplica a regra a toda
-- escrita nova a partir de agora, sem escanear linhas existentes (não há
-- nenhuma para escanear, mas mantém o mesmo padrão seguro adotado em toda
-- a fundação Meta, para nunca depender dessa premissa).
DO $$
DECLARE
  v_def text;
BEGIN
  SELECT pg_get_constraintdef(oid) INTO v_def
  FROM pg_catalog.pg_constraint
  WHERE conname = 'evolution_instances_meta_cloud_onboarding_source_known_check'
    AND conrelid = 'public.evolution_instances_meta_cloud'::regclass;

  IF v_def IS NULL THEN
    ALTER TABLE public.evolution_instances_meta_cloud
      ADD CONSTRAINT evolution_instances_meta_cloud_onboarding_source_known_check
      CHECK (onboarding_source IS NULL OR onboarding_source IN ('hookcloud', 'direct_meta'))
      NOT VALID;
  ELSIF v_def <> $DEF$CHECK (((onboarding_source IS NULL) OR (onboarding_source = ANY (ARRAY['hookcloud'::text, 'direct_meta'::text])))) NOT VALID$DEF$ THEN
    RAISE EXCEPTION 'evolution_instances_meta_cloud_onboarding_source_known_check já existe com definição diferente da esperada (%) — revisar manualmente antes de prosseguir.', v_def;
  END IF;
  -- Definição já existente e idêntica à esperada: nada a fazer.
END $$;

COMMENT ON COLUMN public.evolution_instances_meta_cloud.onboarding_source IS
  'Origem do onboarding desta conexão Meta Cloud API (quem fez o Embedded Signup / forneceu as credenciais) — NÃO é o transporte, que continua sendo evolution_instances.provider. NULL = não informado. Valores conhecidos: hookcloud, direct_meta. Ver /tmp/x1zap-hookcloud-audit-20260818.md, Fase 8B/9A.';
