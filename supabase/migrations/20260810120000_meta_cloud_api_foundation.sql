-- FASE 2A — fundação de schema para o segundo provider de WhatsApp (Meta
-- Cloud API). 100% aditiva. NÃO APLICAR sem autorização explícita — este
-- arquivo existe apenas no repositório local nesta fase (não foi rodado
-- `supabase db push`, não há link ativo com nenhum projeto Supabase a
-- partir deste ambiente).
--
-- FASE 2A.3 — Correção 1 do Gate 2A.2: a decisão original (Fase 2A) de NÃO
-- colocar CHECK constraint em `evolution_instances.provider` foi revista
-- após auditoria mais profunda. Motivo da decisão original: o comentário
-- da coluna (migration 20260529155657) previa outros valores possíveis
-- ("uazapi, chromium, evolution, etc"), e não havia confirmação de que
-- nenhuma linha real usava esses valores.
--
-- Auditoria feita nesta fase (somente leitura, sem acessar produção):
--   1) `grep` por TODA atribuição literal a `provider`/`whatsapp_provider`
--      em `supabase/migrations/*.sql` — encontrou-se `whatsapp_provider`
--      (coluna DIFERENTE, em `platform_settings`, configuração global
--      singleton, já tem sua própria CHECK `IN ('evolution','uazapi')`
--      desde 20260522192323) migrando de 'evolution'→'uazapi'
--      (20260523141145, 20260526035730). Nenhuma migration jamais
--      escreveu 'chromium'/'evolution'/'whatsapp_web' (ou qualquer coisa
--      além de 'uazapi') em `evolution_instances.provider` especificamente.
--   2) `grep` por toda escrita de `evolution_instances.provider` em
--      Edge Functions (`whatsapp-proxy/index.ts`, `instances-api/index.ts`,
--      etc.) — o único literal encontrado, em todos os pontos, é
--      `provider: 'uazapi'` (ex.: whatsapp-proxy/index.ts, ação
--      create_instance_self). Nenhum caminho de código deste repositório
--      jamais escreve 'chromium'/'evolution' nessa coluna especificamente.
--   3) O campo `Connection.provider?: string` solto em `src/hooks/useConnections.ts`
--      (mencionado no relatório da Fase 1) pertence a um sistema PARALELO
--      (o "Chromium web-session manager", fora deste repositório) e não
--      corresponde a `evolution_instances.provider` — não é evidência de
--      uso real nesta coluna.
--
-- CONCLUSÃO: não há evidência, em nenhum caminho de código deste
-- repositório, de que `evolution_instances.provider` já tenha recebido
-- valor diferente de 'uazapi' (ou NULL/default). O comentário original da
-- coluna era aspiracional ("etc"), nunca realizado em código. Isso NÃO é
-- uma garantia absoluta sobre dados de produção (poderia, em tese, ter
-- sido escrito por um processo fora deste repositório — SQL manual,
-- painel administrativo externo — que uma auditoria de código não
-- alcança), então a constraint abaixo é aplicada com `NOT VALID`
-- (ver seção 0b): reforça toda escrita NOVA imediatamente, sem escanear
-- nem arriscar falhar sobre linhas existentes desconhecidas. A validação
-- retroativa (`VALIDATE CONSTRAINT`) fica como passo separado, documentado,
-- condicionado a uma consulta prévia confirmando ausência de valores
-- inesperados nos dados reais.
--
-- ROLLBACK completo ao final do arquivo (comentado, não executado).
--
-- FASE 2A.2 — Correção 3 do ADENDO GATE 2A.1: o gate confirmou que nada no
-- banco impedia uma linha de `evolution_instances_meta_cloud` ter
-- `organization_id` de uma organização e `evolution_instance_id` apontando
-- para uma conexão de OUTRA organização (as duas colunas eram
-- independentes). Corrigido abaixo com uma FK COMPOSTA:
-- `(evolution_instance_id, organization_id) REFERENCES
-- evolution_instances(id, organization_id)` — exige, como pré-requisito,
-- uma constraint `UNIQUE(id, organization_id)` em `evolution_instances`
-- (seção 0 abaixo), que é sempre satisfeita trivialmente por qualquer dado
-- já existente (porque `id` sozinho já é `PRIMARY KEY`, logo já é único —
-- adicionar `organization_id` a um par que já era único não pode falhar
-- por conflito de dados, nunca).
--
-- Nota sobre lock: `ALTER TABLE public.evolution_instances ADD CONSTRAINT
-- ... UNIQUE (id, organization_id)` é aplicado de forma NÃO-concorrente
-- (`CREATE UNIQUE INDEX CONCURRENTLY` não pode rodar dentro da mesma
-- transação de um arquivo de migration comum, e este arquivo segue a
-- mesma convenção de migration única já usada no restante deste
-- repositório). Isso significa que o build do índice retém lock que
-- bloqueia escritas em `evolution_instances` durante sua construção. Para
-- uma tabela deste domínio (conexões WhatsApp por organização — ordem de
-- grandeza esperada de centenas a poucos milhares de linhas, a julgar
-- pela convenção de nomes "chipNN" vista na Fase 1), o build deve ser
-- rápido (sub-segundo). Não foi possível confirmar a contagem real de
-- linhas por auditoria somente leitura — se o volume real for muito maior
-- do que o esperado, recomenda-se aplicar essa constraint específica
-- separadamente, fora deste arquivo, via `CREATE UNIQUE INDEX
-- CONCURRENTLY` seguido de `ALTER TABLE ... ADD CONSTRAINT ... UNIQUE
-- USING INDEX`, antes de aplicar o restante desta migration.

-- ─── 0. Pré-requisito da FK composta da Correção 3 ───

ALTER TABLE public.evolution_instances
  ADD CONSTRAINT evolution_instances_id_organization_id_key
  UNIQUE (id, organization_id);

-- ─── 0b. CHECK constraint em evolution_instances.provider (Fase 2A.3, Correção 1) ───
--
-- `NOT VALID`: aplica a regra a toda escrita NOVA imediatamente (INSERT/UPDATE
-- a partir de agora são checados), mas NÃO escaneia linhas existentes no
-- momento do ALTER TABLE — não pode falhar por causa de dado desconhecido
-- já presente, e não faz um table scan bloqueante. `provider IS NULL` é
-- explicitamente permitido (retrocompatibilidade — ausência de provider
-- continua resolvendo para 'uazapi' no código, `resolve.ts`).
--
-- Passo de validação retroativa (NÃO incluído aqui, deliberadamente fora
-- desta migration — depende de confirmação prévia via consulta somente
-- leitura em produção, fora do escopo desta fase):
--   SELECT id, provider FROM public.evolution_instances
--     WHERE provider IS NOT NULL AND provider NOT IN ('uazapi', 'meta_cloud');
--   -- se vazio, então: ALTER TABLE public.evolution_instances
--   --   VALIDATE CONSTRAINT evolution_instances_provider_known_check;
ALTER TABLE public.evolution_instances
  ADD CONSTRAINT evolution_instances_provider_known_check
  CHECK (provider IS NULL OR provider IN ('uazapi', 'meta_cloud'))
  NOT VALID;

-- ─── 1. Configuração Meta Cloud API por conexão (1:1 com evolution_instances) ───

CREATE TABLE IF NOT EXISTS public.evolution_instances_meta_cloud (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  evolution_instance_id uuid NOT NULL UNIQUE,
  -- Mantido como FK direta a organizations(id) por defesa em profundidade
  -- (garante que a organização existe), ALÉM da FK composta abaixo (que
  -- garante que ela é a organização REAL da conexão referenciada).
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  meta_business_id text,
  waba_id text NOT NULL,
  phone_number_id text NOT NULL,
  display_phone_number text,
  graph_api_version text NOT NULL DEFAULT 'v26.0', -- valor de desenvolvimento/teste — confirmar no App Dashboard antes de uso real (ver checklist externo do relatório Fase 2A)
  coexistence_enabled boolean NOT NULL DEFAULT false,
  -- pending: linha criada, nada configurado ainda
  -- code_exchanged: authorization code trocado por token (Embedded Signup)
  -- waba_linked: WABA/phone_number_id descobertos
  -- webhook_subscribed: app inscrito no webhook do WABA
  -- active: pronta para uso real (única onde o adapter aceita enviar)
  -- error: falha em algum passo do onboarding
  -- offboarded: desconectada deliberadamente
  onboarding_state text NOT NULL DEFAULT 'pending'
    CHECK (onboarding_state IN ('pending', 'code_exchanged', 'waba_linked', 'webhook_subscribed', 'active', 'error', 'offboarded')),
  -- NUNCA armazenar o token aqui. Referência opaca a um secret no Supabase
  -- Vault (ou mecanismo equivalente a decidir) — ver relatório, §10.
  access_token_secret_ref uuid,
  token_expires_at timestamptz,
  quality_rating text,
  messaging_limit_tier text,
  last_health_check_at timestamptz,
  last_error_code text,
  last_error_message text,
  history_sync_status text NOT NULL DEFAULT 'not_applicable'
    CHECK (history_sync_status IN ('not_applicable', 'pending', 'received', 'ignored_not_imported_as_live')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (waba_id, phone_number_id),
  -- FASE 2A.3 — Correção 3 do Gate 2A.2: `phone_number_id` sozinho também
  -- precisa ser globalmente único ENTRE TODAS as configurações Meta,
  -- porque `meta_webhook_events` usa `phone_number_id` (não `organization_id`,
  -- que o payload da Meta nem carrega) como escopo da chave de
  -- idempotência (`meta-webhook-idempotency.ts`). O gate apontou,
  -- corretamente, que essa suposição não tinha garantia relacional — só
  -- `UNIQUE(waba_id, phone_number_id)` existia, o que permitiria, em tese,
  -- o MESMO `phone_number_id` reaparecer sob um `waba_id` diferente (e
  -- portanto, possivelmente, outra organização). Um `phone_number_id` é um
  -- identificador da Meta para UM número de telefone específico já
  -- registrado na Cloud API — não pode legitimamente pertencer a duas
  -- contas ao mesmo tempo — então esta constraint não restringe nenhum
  -- caso de uso real, só torna essa garantia EXPLÍCITA e VERIFICÁVEL pelo
  -- banco, em vez de uma suposição não verificada sobre como a Meta se
  -- comporta.
  UNIQUE (phone_number_id),
  -- FK COMPOSTA (Correção 3): impede, no próprio banco, que esta linha
  -- aponte para uma conexão de uma organização diferente da declarada em
  -- `organization_id`. Qualquer INSERT/UPDATE que tente cruzar organização
  -- e conexão falha aqui, antes de qualquer RLS — RLS não substitui
  -- integridade referencial, é a lição explícita desta correção.
  CONSTRAINT evolution_instances_meta_cloud_conn_org_fk
    FOREIGN KEY (evolution_instance_id, organization_id)
    REFERENCES public.evolution_instances (id, organization_id)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_evolution_instances_meta_cloud_org
  ON public.evolution_instances_meta_cloud (organization_id);

CREATE INDEX IF NOT EXISTS idx_evolution_instances_meta_cloud_waba_phone
  ON public.evolution_instances_meta_cloud (waba_id, phone_number_id);

ALTER TABLE public.evolution_instances_meta_cloud ENABLE ROW LEVEL SECURITY;

-- Mesmo padrão de RLS já usado em evolution_instances (migration 20260418201939).
CREATE POLICY "Admins and managers can view meta cloud instance config"
ON public.evolution_instances_meta_cloud
FOR SELECT
USING (
  public.is_super_admin(auth.uid())
  OR (
    public.user_belongs_to_organization(auth.uid(), organization_id)
    AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'))
  )
);

CREATE POLICY "Admins and managers can insert meta cloud instance config"
ON public.evolution_instances_meta_cloud
FOR INSERT
WITH CHECK (
  public.is_super_admin(auth.uid())
  OR (
    public.user_belongs_to_organization(auth.uid(), organization_id)
    AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'))
  )
);

CREATE POLICY "Admins and managers can update meta cloud instance config"
ON public.evolution_instances_meta_cloud
FOR UPDATE
USING (
  public.is_super_admin(auth.uid())
  OR (
    public.user_belongs_to_organization(auth.uid(), organization_id)
    AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'))
  )
);

CREATE POLICY "Admins and managers can delete meta cloud instance config"
ON public.evolution_instances_meta_cloud
FOR DELETE
USING (
  public.is_super_admin(auth.uid())
  OR (
    public.user_belongs_to_organization(auth.uid(), organization_id)
    AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'))
  )
);

-- FASE 2B.0.5A/5B — ACL explícita, sem depender de ALTER DEFAULT PRIVILEGES
-- do projeto: auditoria de consumidores reais (Edge Functions em
-- supabase/functions/_shared/whatsapp-provider/meta-adapter.ts, únicos
-- pontos do repositório que tocam esta tabela — meta-adapter.ts:52 e
-- meta-adapter.ts:186, ambos `.select(...)`, ambos via
-- SUPABASE_SERVICE_ROLE_KEY) não encontrou NENHUM `.insert()`/`.update()`/
-- `.delete()`/`.upsert()` em nenhum caminho de código deste repositório, e
-- NENHUM consumidor real via cliente `authenticated` (o card de frontend
-- correspondente, src/config/metaCloudApiFeatureFlag.ts, está hardcoded
-- desligado e documenta explicitamente que o frontend ainda não consulta
-- esta tabela). As policies "Admins and managers can ..." permanecem no
-- arquivo (prontas para quando um consumidor real via `authenticated`
-- existir), mas o GRANT correspondente é removido agora. `service_role`
-- recebe SOMENTE `SELECT` (Fase 2B.0.5B — corrigido de `ALL` para a
-- operação estritamente comprovada; necessidade futura de INSERT/UPDATE
-- para o fluxo de onboarding Meta, quando implementado, deverá ampliar
-- este GRANT na própria migration que introduzir esse fluxo, não aqui).
REVOKE ALL ON public.evolution_instances_meta_cloud FROM PUBLIC;
REVOKE ALL ON public.evolution_instances_meta_cloud FROM anon;
REVOKE ALL ON public.evolution_instances_meta_cloud FROM authenticated;
REVOKE ALL ON public.evolution_instances_meta_cloud FROM service_role;
GRANT SELECT ON public.evolution_instances_meta_cloud TO service_role;

-- ─── 2. Ledger idempotente de eventos do webhook Meta ───
--
-- FASE 2A.2 — Correção 2 do ADENDO GATE 2A.1: a constraint antiga
-- `UNIQUE(wamid, event_type)` colidia `sent`/`delivered`/`read`/`failed`
-- do mesmo `wamid` entre si, porque todos compartilhavam `event_type =
-- 'status'` (o subtipo real só existia num campo separado, nunca
-- consultado pela constraint). Substituída por `idempotency_key text
-- NOT NULL UNIQUE` — uma única coluna, calculada deterministicamente por
-- `computeMetaEventIdempotencyKey()`
-- (supabase/functions/_shared/meta-webhook-idempotency.ts), que já inclui
-- o subtipo de status, o escopo (phone_number_id/waba_id) e, para eventos
-- sem id nativo (history/contact_sync/echo sem id/unknown), um hash
-- canônico do conteúdo. `wamid`/`event_type`/`status` continuam existindo
-- como colunas estruturadas só para consulta/observabilidade — a
-- deduplicação de verdade é 100% responsabilidade de `idempotency_key`.

CREATE TABLE IF NOT EXISTS public.meta_webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  waba_id text NOT NULL,
  phone_number_id text,
  -- message | status | message_echo | message_delete | history |
  -- contact_sync | account_update | error | connection | qrcode | unknown
  -- (mesmos valores de NormalizedInboundKind, whatsapp-provider/types.ts)
  event_type text NOT NULL,
  -- Subtipo real de status (sent|delivered|read|failed), quando event_type='status'.
  status text,
  wamid text, -- id de mensagem da Meta, quando aplicável — só informativo/consulta, NÃO é a chave de dedup
  -- Chave de idempotência determinística e completa — ver comentário acima.
  -- NOT NULL: todo evento, mesmo sem wamid, tem uma chave calculável
  -- (message/status usam wamid; os demais usam hash canônico do conteúdo).
  idempotency_key text NOT NULL,
  raw_payload jsonb NOT NULL,
  signature_valid boolean NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  processing_status text NOT NULL DEFAULT 'pending'
    CHECK (processing_status IN ('pending', 'processed', 'skipped_duplicate', 'skipped_echo', 'skipped_history', 'skipped_unknown', 'error', 'dead_letter')),
  processing_error text,
  retry_count int NOT NULL DEFAULT 0
);

-- Idempotência real: uma única constraint UNIQUE sobre a chave já
-- computada com escopo+subtipo — protegida pelo banco (não por checagem
-- em memória), correta sob concorrência real (dois requests simultâneos
-- para o mesmo evento: um insere, o outro recebe 23505 e trata como
-- duplicata confirmada — nunca dois processamentos).
CREATE UNIQUE INDEX IF NOT EXISTS uq_meta_webhook_events_idempotency_key
  ON public.meta_webhook_events (idempotency_key);

CREATE INDEX IF NOT EXISTS idx_meta_webhook_events_pending
  ON public.meta_webhook_events (processing_status)
  WHERE processing_status = 'pending';

CREATE INDEX IF NOT EXISTS idx_meta_webhook_events_routing
  ON public.meta_webhook_events (waba_id, phone_number_id, received_at);

ALTER TABLE public.meta_webhook_events ENABLE ROW LEVEL SECURITY;

-- Ledger de infraestrutura: só service_role escreve/lê. Nenhum usuário
-- final (nem admin de organização) acessa diretamente — é um log técnico
-- interno, roteado por WABA/phone_number_id, não pré-filtrado por
-- organização (a Edge Function ainda não sabe a organização antes de
-- processar o evento).
-- FASE 2B.0.5A/5B — mesmo padrão de ACL explícita. Único consumidor real:
-- supabase/functions/meta-cloud-webhook/index.ts:109
-- (`supabase.from("meta_webhook_events").insert(...)`), via
-- SUPABASE_SERVICE_ROLE_KEY. Nenhum `.select()`/`.update()`/`.delete()`
-- encontrado em nenhum caminho de código — `service_role` recebe SOMENTE
-- `INSERT` (Fase 2B.0.5B — corrigido de `ALL`; um futuro worker de retry
-- que precise `UPDATE processing_status` deverá ampliar este GRANT junto
-- com sua própria migration). Nenhum consumidor authenticated/anon.
REVOKE ALL ON public.meta_webhook_events FROM PUBLIC;
REVOKE ALL ON public.meta_webhook_events FROM anon;
REVOKE ALL ON public.meta_webhook_events FROM authenticated;
REVOKE ALL ON public.meta_webhook_events FROM service_role;
GRANT INSERT ON public.meta_webhook_events TO service_role;

-- ─── 3. Feature flags (global e por organização, desligadas por padrão) ───

CREATE TABLE IF NOT EXISTS public.meta_cloud_feature_flags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope text NOT NULL CHECK (scope IN ('global', 'organization')),
  organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES public.profiles(id),
  CHECK (
    (scope = 'global' AND organization_id IS NULL)
    OR (scope = 'organization' AND organization_id IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_meta_cloud_feature_flags_global
  ON public.meta_cloud_feature_flags (scope)
  WHERE scope = 'global';

CREATE UNIQUE INDEX IF NOT EXISTS uq_meta_cloud_feature_flags_org
  ON public.meta_cloud_feature_flags (organization_id)
  WHERE scope = 'organization';

ALTER TABLE public.meta_cloud_feature_flags ENABLE ROW LEVEL SECURITY;

-- Leitura: super admin sempre; admin/manager só a própria organização (para
-- a tela mostrar "Em configuração"/"disponível" corretamente) — nunca a
-- flag de outra organização.
CREATE POLICY "Super admin manages all meta cloud feature flags"
ON public.meta_cloud_feature_flags
FOR ALL
USING (public.is_super_admin(auth.uid()))
WITH CHECK (public.is_super_admin(auth.uid()));

CREATE POLICY "Org admins can view their own meta cloud feature flag"
ON public.meta_cloud_feature_flags
FOR SELECT
USING (
  scope = 'organization'
  AND public.user_belongs_to_organization(auth.uid(), organization_id)
  AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'))
);

-- FASE 2B.0.5A/5B — mesmo padrão de ACL explícita. Único consumidor real
-- hoje: supabase/functions/_shared/meta-cloud-flags.ts:31 (`.select("enabled")`),
-- chamado exclusivamente por supabase/functions/meta-cloud-send/index.ts
-- via SUPABASE_SERVICE_ROLE_KEY. Nenhum `.insert()`/`.update()`/`.delete()`
-- encontrado — `service_role` recebe SOMENTE `SELECT` (Fase 2B.0.5B —
-- corrigido de `ALL`). A policy "Org admins can view their own meta cloud
-- feature flag" (authenticated) permanece no arquivo, pronta para quando
-- src/config/metaCloudApiFeatureFlag.ts deixar de ser hardcoded e passar a
-- consultar esta tabela de fato — o GRANT correspondente é removido agora
-- por ausência de consumidor comprovado.
REVOKE ALL ON public.meta_cloud_feature_flags FROM PUBLIC;
REVOKE ALL ON public.meta_cloud_feature_flags FROM anon;
REVOKE ALL ON public.meta_cloud_feature_flags FROM authenticated;
REVOKE ALL ON public.meta_cloud_feature_flags FROM service_role;
GRANT SELECT ON public.meta_cloud_feature_flags TO service_role;

-- Nenhuma linha inserida por esta migration — ausência de linha já
-- significa "desligado" (ver supabase/functions/_shared/meta-cloud-flags.ts).
-- Se quiser registrar explicitamente a flag global como desligada:
-- INSERT INTO public.meta_cloud_feature_flags (scope, organization_id, enabled)
--   VALUES ('global', NULL, false)
--   ON CONFLICT DO NOTHING;
-- (comentado deliberadamente — nem essa insersão foi executada nesta fase)

-- ══════════════════════════════════════════════════════════════════════
-- ROLLBACK (documentado, NÃO executado) — ORDEM IMPORTA: as tabelas novas
-- devem cair ANTES da constraint em `evolution_instances` (a FK composta
-- de `evolution_instances_meta_cloud` depende dela; `evolution_instances`
-- é tabela pré-existente com dados reais, então sua constraint só é
-- removida por último e sozinha):
--
-- DROP TABLE IF EXISTS public.meta_cloud_feature_flags;
-- DROP TABLE IF EXISTS public.meta_webhook_events;
-- DROP TABLE IF EXISTS public.evolution_instances_meta_cloud;
-- ALTER TABLE public.evolution_instances
--   DROP CONSTRAINT IF EXISTS evolution_instances_provider_known_check;
-- ALTER TABLE public.evolution_instances
--   DROP CONSTRAINT IF EXISTS evolution_instances_id_organization_id_key;
--
-- Consequência do rollback: nenhuma perda de dado em `evolution_instances`
-- (as duas constraints removidas são um CHECK e um índice de unicidade
-- sobre colunas já existentes, nenhuma coluna é removida) — 100% seguro
-- com tráfego ativo mesmo depois de aplicado, contanto que nenhuma FK
-- composta nova (fora desta migration) tenha sido criada dependendo do
-- índice de unicidade nesse meio-tempo.
-- ══════════════════════════════════════════════════════════════════════
