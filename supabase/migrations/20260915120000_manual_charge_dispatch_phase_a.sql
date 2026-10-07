-- FASE A — infraestrutura de disparo de cobrança manual.
--
-- Escopo desta migration: schema, constraints, RLS, RPCs de registro,
-- avaliação, claim e auditoria, máquina de estados monotônica, fatos
-- independentes, opt-out estruturado, kill switch de banco.
--
-- Esta migration NÃO cria nenhuma capacidade de envio. Nenhuma function
-- aqui chama a UazAPI, nenhum worker/cron é criado, nenhum fetch externo
-- existe em nenhum ponto deste arquivo. O envio real (Fase B) é
-- deliberadamente uma etapa futura separada, com seu próprio kill switch
-- de worker e aprovação humana explícita vinculada a um commit revisado.
--
-- Aditiva, forward-only. Não altera nenhuma tabela/function pré-existente
-- de módulos sensíveis (uazapi-webhook, purchase_audit, ai_receipt_audits,
-- webchat_conversations, webchat_messages, leads) além de acrescentar
-- constraints UNIQUE necessárias para FKs compostas (ver seção 1).

-- ═══════════════════════════════════════════════════════════════════════
-- 1) Chaves candidatas necessárias em tabelas existentes, para suportar
--    FKs compostas de isolamento por organização nas seções seguintes.
--    Puramente aditivo — nenhuma coluna, valor ou comportamento existente
--    é alterado.
-- ═══════════════════════════════════════════════════════════════════════

-- As 4 constraints abaixo (nomes usados pelas FKs compostas das seções
-- seguintes) NÃO são criadas aqui — ver docs/runbooks/
-- manual_charge_online_index_rollout.md para o procedimento online
-- (CREATE UNIQUE INDEX CONCURRENTLY + ADD CONSTRAINT USING INDEX) e o
-- guard fail-closed logo abaixo (seção 1b), que recusa aplicar o resto
-- desta migration se elas ainda não existirem:
--   leads_organization_id_id_uk                            UNIQUE (organization_id, id)            em leads
--   webchat_conversations_organization_id_id_uk             UNIQUE (organization_id, id)            em webchat_conversations
--   webchat_conversations_organization_id_lead_id_id_uk      UNIQUE (organization_id, lead_id, id)   em webchat_conversations
--   webchat_messages_conversation_id_id_uk                  UNIQUE (conversation_id, id)             em webchat_messages
-- (lead_id é nullable em webchat_conversations; UNIQUE trata NULLs como
-- distintos entre si — a terceira constraint não rejeita lead_id NULL,
-- só impõe unicidade quando preenchido.)

-- ═══════════════════════════════════════════════════════════════════════
-- 1b) PRÉ-REQUISITO FAIL-CLOSED — as 4 constraints acima NÃO são criadas
--     por `ALTER TABLE ... ADD CONSTRAINT UNIQUE` nesta migration (achado
--     crítico de revisão: isso tomaria ACCESS EXCLUSIVE LOCK em tabelas de
--     produção em uso ativo). Elas devem já existir, criadas via
--     `CREATE UNIQUE INDEX CONCURRENTLY` + `ADD CONSTRAINT ... USING
--     INDEX`, processo manual documentado em
--     docs/runbooks/manual_charge_online_index_rollout.md — NUNCA
--     executado automaticamente por esta migration. Se as 4 acima não
--     existirem ainda no momento em que ESTA migration for aplicada, o
--     bloco abaixo falha imediatamente (fail-closed) em vez de tentar
--     recriá-las ou de deixar as FKs compostas das seções seguintes
--     falharem com um erro genérico.
-- ═══════════════════════════════════════════════════════════════════════

-- Guard endurecido ainda mais (achado real de 2ª rodada de revisão: a
-- versão anterior confirmava tabela/tipo/validated, mas não as COLUNAS —
-- uma UNIQUE(id) homônima na tabela certa ainda passaria). Função
-- reutilizável: compara conkey (array de attnum, ORDEM importa) contra os
-- attnums reais das colunas nomeadas, e exige ausência de expressão
-- (indexprs) e de predicado parcial (indpred) — só assim a FK composta
-- que vai usar essa constraint como alvo tem garantia real de que ela é
-- exatamente a chave candidata esperada.
-- Function PERMANENTE (não pg_temp): mantida após a migration para poder
-- ser testada diretamente (ver supabase/tests/manual_charge_phase_a.sql,
-- teste do guard) e reutilizada por qualquer migration futura que precise
-- do mesmo tipo de pré-condição. Introspecção pura de catálogo, sem
-- efeito colateral — segura para expor.
CREATE OR REPLACE FUNCTION public.manual_charge_assert_prerequisite_uk(
  p_conname text, p_table regclass, p_columns text[]
) RETURNS void
LANGUAGE plpgsql
SET search_path TO ''
AS $fn$
DECLARE
  v_expected_attnums smallint[];
  v_ok boolean;
BEGIN
  SELECT array_agg(a.attnum ORDER BY ord.i)
  INTO v_expected_attnums
  FROM unnest(p_columns) WITH ORDINALITY AS ord(colname, i)
  JOIN pg_catalog.pg_attribute a ON a.attrelid = p_table AND a.attname = ord.colname AND NOT a.attisdropped;

  IF v_expected_attnums IS NULL OR array_length(v_expected_attnums, 1) <> array_length(p_columns, 1) THEN
    RAISE EXCEPTION 'missing_prerequisite_online_indexes: coluna(s) esperada(s) % não encontrada(s) em %', p_columns, p_table USING ERRCODE = 'P0010';
  END IF;

  -- Achado real de 3ª rodada de revisão: a versão anterior confirmava
  -- convalidated (propriedade da CONSTRAINT) mas nunca lia indisvalid/
  -- indisready/indislive (propriedades do ÍNDICE por trás dela). Um
  -- CREATE INDEX CONCURRENTLY interrompido pode deixar um índice
  -- indisvalid=false que, em tese, ainda poderia ter sido promovido a
  -- constraint (convalidated=true) por um operador apressado — o guard
  -- precisa recusar esse estado também, não só confiar na constraint.
  SELECT
    con.contype = 'u'
    AND con.convalidated
    AND con.conkey = v_expected_attnums
    AND idx.indexprs IS NULL
    AND idx.indpred IS NULL
    AND idx.indisvalid
    AND idx.indisready
    AND idx.indislive
  INTO v_ok
  FROM pg_catalog.pg_constraint con
  JOIN pg_catalog.pg_index idx ON idx.indexrelid = con.conindid
  WHERE con.conname = p_conname AND con.conrelid = p_table;

  IF v_ok IS NOT TRUE THEN
    RAISE EXCEPTION 'missing_prerequisite_online_indexes: % em % precisa ser UNIQUE(%), validada, com índice válido/pronto/vivo (indisvalid/indisready/indislive), sem expressão e sem predicado parcial — aplique docs/runbooks/manual_charge_online_index_rollout.md ANTES desta migration (CREATE UNIQUE INDEX CONCURRENTLY + ADD CONSTRAINT USING INDEX, nunca ALTER TABLE direto)',
      p_conname, p_table, array_to_string(p_columns, ', ') USING ERRCODE = 'P0010';
  END IF;
END;
$fn$;

REVOKE ALL ON FUNCTION public.manual_charge_assert_prerequisite_uk(text, regclass, text[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.manual_charge_assert_prerequisite_uk(text, regclass, text[]) TO service_role;

DO $$
BEGIN
  PERFORM public.manual_charge_assert_prerequisite_uk('leads_organization_id_id_uk', 'public.leads', ARRAY['organization_id', 'id']);
  PERFORM public.manual_charge_assert_prerequisite_uk('webchat_conversations_organization_id_id_uk', 'public.webchat_conversations', ARRAY['organization_id', 'id']);
  PERFORM public.manual_charge_assert_prerequisite_uk('webchat_conversations_organization_id_lead_id_id_uk', 'public.webchat_conversations', ARRAY['organization_id', 'lead_id', 'id']);
  PERFORM public.manual_charge_assert_prerequisite_uk('webchat_messages_conversation_id_id_uk', 'public.webchat_messages', ARRAY['conversation_id', 'id']);
END $$;

-- ═══════════════════════════════════════════════════════════════════════
-- 1c) Helper de autorização — usado por toda RPC humana desta feature.
--     Único caminho de decisão SIM/NÃO: qualquer ambiguidade (ator não
--     autenticado, sem perfil, sem organização, sem papel válido,
--     organização divergente, UUID inexistente, claims nulas/malformadas)
--     resolve para false, NUNCA para NULL. Chame sempre como
--     "IF public.manual_charge_actor_authorized(...) IS NOT TRUE THEN
--     RAISE EXCEPTION" — nunca combine autorização com uma expressão que
--     possa avaliar para NULL (ex.: "x <> y AND NOT z", o bug real
--     encontrado em revisão: com y ou z NULL, toda a expressão vira NULL
--     e o IF nunca dispara).
-- ═══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.manual_charge_actor_authorized(
  p_organization_id uuid
) RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_actor_org uuid;
BEGIN
  IF v_actor IS NULL THEN
    RETURN false; -- sem sessão autenticada (claims nulas/ausentes) => nega
  END IF;

  IF public.is_super_admin(v_actor) IS TRUE THEN
    RETURN true;
  END IF;

  IF p_organization_id IS NULL THEN
    RETURN false; -- organização-alvo desconhecida => nega, nunca assume
  END IF;

  v_actor_org := public.get_user_organization(v_actor);
  IF v_actor_org IS NULL THEN
    RETURN false; -- ator sem perfil/organização (UUID inexistente em
                  -- profiles, ou profile sem organization_id) => nega
  END IF;

  IF v_actor_org IS DISTINCT FROM p_organization_id THEN
    RETURN false; -- organização diferente => nega
  END IF;

  RETURN (public.has_role(v_actor, 'admin'::public.app_role) IS TRUE)
      OR (public.has_role(v_actor, 'manager'::public.app_role) IS TRUE);
  -- papel ausente/não reconhecido => has_role retorna false (nunca NULL,
  -- é STABLE SQL com EXISTS), a expressão acima resolve para false.
END;
$$;

COMMENT ON FUNCTION public.manual_charge_actor_authorized IS
  'FASE A — checagem de autorização única e exaustiva usada por todas as RPCs humanas. Toda ambiguidade resolve para false. Corrige achado crítico de revisão: as 3 RPCs humanas anteriores usavam "v_org <> get_user_organization(...) AND NOT is_super_admin(...)", que se torna NULL (não dispara RAISE) quando get_user_organization retorna NULL — bypass real de isolamento por organização para ator sem perfil.';

REVOKE ALL ON FUNCTION public.manual_charge_actor_authorized(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.manual_charge_actor_authorized(uuid) TO authenticated, service_role;

-- ═══════════════════════════════════════════════════════════════════════
-- 2) manual_charge_dispatches — a cobrança em si, com máquina de estados
--    monotônica. Todo UPDATE de status usa WHERE status IN (...) — nunca
--    WHERE id = ... sozinho — para impedir transição a partir de um
--    estado que já mudou.
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE public.manual_charge_dispatches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  lead_id uuid NOT NULL,
  -- Derivado por trigger a partir de leads.phone_normalized no INSERT —
  -- nunca aceito diretamente do chamador (ver trigger abaixo). Existe
  -- para sustentar a UNIQUE de identidade de cobrança (achado real de
  -- revisão: "uma campanha deve ter um único dispatch por telefone,
  -- independente de status").
  phone_normalized text,
  campaign_key text NOT NULL CHECK (campaign_key <> ''),
  status text NOT NULL DEFAULT 'eligible' CHECK (status IN (
    'eligible',
    'hold_receipt_review', 'hold_human', 'hold_connection', 'hold_suppression_review',
    'needs_review_integrity', 'needs_review_human_state', 'needs_review_payment_claim',
    'needs_review_suppression', 'needs_review_receipt',
    'cancelled_permanent', 'paid',
    'sending', 'sent', 'failed', 'unknown_result',
    -- Reconciliação de unknown_result (achado real de revisão — antes
    -- não havia caminho de saída desse estado nesta fase):
    -- 'reconciled_not_sent' NÃO é terminal — participa de reavaliação e
    -- de um futuro claim específico DESTA MESMA linha (nunca cria outro
    -- dispatch, dado a UNIQUE absoluta abaixo). 'reconciled_sent' É
    -- terminal. 'needs_review_reconciliation' segue o mesmo tratamento
    -- dos demais needs_review_* (reavaliável, não diretamente clamável).
    'reconciled_sent', 'reconciled_not_sent', 'needs_review_reconciliation'
  )),
  disposition_reason text,
  claim_token uuid,
  claimed_by text,
  claimed_at timestamptz,
  sent_at timestamptz,
  provider_response jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  UNIQUE (organization_id, id),
  UNIQUE (organization_id, lead_id, id),
  -- composta: garante que lead_id realmente pertence a esta organização,
  -- não apenas que ambos existem isoladamente (achado real de revisão —
  -- FKs independentes não bastavam para isolamento por organização).
  --
  -- ON DELETE RESTRICT, não CASCADE (achado real de 3ª rodada de revisão:
  -- a versão anterior usava CASCADE, o que apagaria silenciosamente todo
  -- o histórico financeiro/operacional de cobrança — dispatches, eventos
  -- de payment claim, revisões, supressões vinculadas via RESTRICT em
  -- cascata abaixo — junto com o lead. Todas as tabelas FILHAS de
  -- manual_charge_dispatches já usam ON DELETE RESTRICT contra ela (ver
  -- payment_claim_events, manual_charge_payment_claim_reviews e as
  -- demais seções desta migration), então RESTRICT aqui é suficiente
  -- para proteger toda a cadeia: excluir um lead com qualquer dispatch
  -- associado agora falha com foreign_key_violation em vez de apagar
  -- evidência. CONSEQUÊNCIA OPERACIONAL DECLARADA, NÃO RESOLVIDA NESTA
  -- RODADA: `public.delete_lead_cascade` (função já existente no
  -- projeto, ver supabase/migrations/20260805040000_...sql) não conhece
  -- esta tabela — ela vai agora falhar com FK violation, abortando a
  -- exclusão em lote inteira, para qualquer lead que tenha dispatch de
  -- cobrança manual. Isso é o comportamento SEGURO (bloquear em vez de
  -- apagar financeiro), mas exige uma migration futura separada para
  -- decidir e implementar o tratamento explícito (bloquear com mensagem
  -- clara para o operador, ou arquivar/desvincular o dispatch antes de
  -- permitir a exclusão do lead) — reportado como bloqueador de decisão
  -- de produto pendente, não implementado unilateralmente aqui.
  FOREIGN KEY (organization_id, lead_id)
    REFERENCES public.leads (organization_id, id) ON DELETE RESTRICT
);

-- Identidade PERMANENTE da cobrança: um único dispatch por organização +
-- telefone + campanha, para SEMPRE — independente de status, inclusive
-- terminal (achado real de revisão: o índice parcial anterior permitia
-- recriar a campanha após 'sent'/'paid', e não protegia contra um INSERT
-- direto já em status terminal). Uma nova tentativa da mesma campanha
-- para o mesmo telefone NUNCA cria outro dispatch — usa
-- reconcile_unknown_result (seção 10) para mover a MESMA linha de volta a
-- um estado reavaliável, ou (fora do escopo desta Fase A) uma futura
-- tabela filha de tentativas vinculada a este mesmo dispatch_id.
ALTER TABLE public.manual_charge_dispatches
  ADD CONSTRAINT manual_charge_dispatches_org_phone_campaign_uk
  UNIQUE (organization_id, phone_normalized, campaign_key);

CREATE INDEX manual_charge_dispatches_org_status_idx
  ON public.manual_charge_dispatches (organization_id, status);

CREATE OR REPLACE FUNCTION public.manual_charge_dispatches_set_phone_normalized()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  SELECT l.phone_normalized INTO NEW.phone_normalized
  FROM public.leads l WHERE l.id = NEW.lead_id;

  IF NEW.phone_normalized IS NULL THEN
    RAISE EXCEPTION 'lead_without_phone_normalized' USING ERRCODE = 'P0009';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.manual_charge_dispatches_set_phone_normalized IS
  'FASE A — phone_normalized nunca é aceito do chamador; sempre derivado de leads.phone_normalized no momento do INSERT, para sustentar a identidade permanente da cobrança (UNIQUE org+telefone+campanha).';

-- DECISÃO DE PRODUTO EXPLÍCITA (declarada, não implementada — instrução
-- direta desta rodada): este trigger é BEFORE INSERT, NUNCA BEFORE
-- UPDATE. `manual_charge_dispatches.phone_normalized` é portanto uma
-- FOTOGRAFIA IMUTÁVEL do telefone do lead no exato momento em que o
-- dispatch foi criado — não uma referência viva. Se
-- `leads.phone_normalized` mudar depois (correção cadastral, número
-- trocado), os dispatches HISTÓRICOS deste lead mantêm o valor antigo
-- para sempre; nenhuma sincronização automática existe ou é proposta
-- aqui. Consequência aceita e não resolvida nesta tarefa: um novo
-- dispatch da MESMA campanha, criado DEPOIS da correção cadastral, usará
-- o telefone NOVO e portanto NÃO colidirá com o dispatch antigo (telefone
-- antigo) na UNIQUE (organization_id, phone_normalized, campaign_key) —
-- ou seja, a identidade "permanente" da cobrança é permanente em relação
-- ao PAR (telefone-no-momento-do-insert, campanha), não ao lead em si.
-- Isto diverge de uma leitura mais forte de "um único dispatch por lead
-- por campanha, para sempre" — se essa for a garantia realmente
-- pretendida pelo produto, a chave da UNIQUE precisaria ser
-- (organization_id, lead_id, campaign_key) em vez de phone_normalized, o
-- que é uma mudança de design, não uma correção, e não foi feita
-- unilateralmente aqui. Reportado como BLOQUEADOR DE DECISÃO DE PRODUTO
-- pendente, não como bug.
COMMENT ON COLUMN public.manual_charge_dispatches.phone_normalized IS
  'Fotografia IMUTÁVEL de leads.phone_normalized no momento do INSERT (trigger BEFORE INSERT, nunca BEFORE UPDATE). NÃO se realinha se o telefone do lead mudar depois — decisão de produto explícita, pendente de confirmação: ver comentário acima da trigger para a consequência exata sobre a garantia de unicidade por lead vs. por telefone-no-momento-da-criação.';

-- ACHADO REAL (auditoria de matriz de grants, rodada de aplicação em
-- produção): esta função nunca teve REVOKE/GRANT explícito, ao contrário
-- de leads_protect_billing_history (outra function de trigger nesta
-- mesma migration, que já revogava PUBLIC/anon/authenticated). Sem
-- revoke explícito, PUBLIC mantém EXECUTE por padrão (comportamento
-- padrão do Postgres para função recém-criada). O disparo do trigger em
-- si NUNCA depende de EXECUTE concedido ao usuário da operação de
-- INSERT/UPDATE -- é o mecanismo de trigger que invoca a função, não uma
-- chamada explícita do usuário. Nenhum papel precisa executá-la
-- diretamente (referencia NEW, que só existe dentro do contexto do
-- trigger) -- por isso o mínimo necessário aqui é revogar de todos, sem
-- conceder EXECUTE a nenhum papel.
REVOKE ALL ON FUNCTION public.manual_charge_dispatches_set_phone_normalized() FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER manual_charge_dispatches_set_phone_normalized_trg
  BEFORE INSERT ON public.manual_charge_dispatches
  FOR EACH ROW EXECUTE FUNCTION public.manual_charge_dispatches_set_phone_normalized();

CREATE TRIGGER manual_charge_dispatches_touch_updated_at
  BEFORE UPDATE ON public.manual_charge_dispatches
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

COMMENT ON TABLE public.manual_charge_dispatches IS
  'FASE A — cobrança manual candidata a envio futuro (Fase B). Esta tabela nunca é escrita por nenhuma function que chame um provider externo — não existe tal function nesta fase.';
COMMENT ON COLUMN public.manual_charge_dispatches.status IS
  '19 estados possíveis. Terminais: cancelled_permanent, paid, sent, failed, reconciled_sent. unknown_result NÃO é terminal (tem saída via reconcile_unknown_result); reconciled_not_sent e needs_review_reconciliation também não são terminais (reavaliáveis). A monotonicidade (nunca sair de um estado terminal de verdade) NÃO é imposta pelo schema — depende de toda RPC atual e futura usar WHERE status IN (...) explícito nos UPDATEs, como as desta migration fazem; service_role ignora RLS e pode, em tese, violar isso com um UPDATE direto fora das RPCs.';

REVOKE ALL ON public.manual_charge_dispatches FROM PUBLIC, anon, authenticated;
-- GRANT SELECT é necessário além do REVOKE: a policy de RLS abaixo só
-- FILTRA linhas de um SELECT já permitido a nível de tabela — sem este
-- GRANT, nenhum authenticated conseguiria ler nada, mesmo com policy
-- (achado real de revisão: RLS não concede privilégio, só restringe um
-- já concedido).
GRANT SELECT ON public.manual_charge_dispatches TO authenticated;
ALTER TABLE public.manual_charge_dispatches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "manual_charge_dispatches_org_read" ON public.manual_charge_dispatches
  FOR SELECT TO authenticated
  USING (
    organization_id = public.get_user_organization(auth.uid())
    AND (
      public.has_role(auth.uid(), 'admin'::app_role)
      OR public.has_role(auth.uid(), 'manager'::app_role)
      OR public.is_super_admin(auth.uid())
    )
  );
-- Nenhuma policy de INSERT/UPDATE/DELETE: essas operações só acontecem
-- através das functions SECURITY DEFINER desta migration, chamadas com a
-- service_role key (que ignora RLS por definição do Supabase).

-- ═══════════════════════════════════════════════════════════════════════
-- 3) manual_charge_evaluations — fotografia auditável de cada avaliação.
--    INSERT-only: nenhum papel recebe UPDATE/DELETE, em nenhuma
--    circunstância. Cada nova avaliação da mesma cobrança gera uma NOVA
--    linha, preservando o histórico completo.
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE public.manual_charge_evaluations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  manual_charge_dispatch_id uuid NOT NULL,
  organization_id uuid NOT NULL,
  evaluated_at timestamptz NOT NULL DEFAULT now(),
  decision_matrix_version text NOT NULL,
  disposition text NOT NULL,
  disposition_reason text,
  facts jsonb NOT NULL,

  CHECK (jsonb_typeof(facts) = 'object'),
  FOREIGN KEY (organization_id, manual_charge_dispatch_id)
    REFERENCES public.manual_charge_dispatches (organization_id, id) ON DELETE RESTRICT
);

CREATE INDEX manual_charge_evaluations_dispatch_idx
  ON public.manual_charge_evaluations (manual_charge_dispatch_id, evaluated_at DESC);
CREATE INDEX manual_charge_evaluations_org_disposition_idx
  ON public.manual_charge_evaluations (organization_id, disposition);

COMMENT ON TABLE public.manual_charge_evaluations IS
  'FASE A — fotografia imutável (INSERT-only) de cada avaliação de disposição. facts registra TODOS os fatos calculados (não só o vencedor da precedência), com evidence_ids reais.';

REVOKE ALL ON public.manual_charge_evaluations FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.manual_charge_evaluations TO authenticated;
ALTER TABLE public.manual_charge_evaluations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "manual_charge_evaluations_org_read" ON public.manual_charge_evaluations
  FOR SELECT TO authenticated
  USING (
    organization_id = public.get_user_organization(auth.uid())
    AND (
      public.has_role(auth.uid(), 'admin'::app_role)
      OR public.has_role(auth.uid(), 'manager'::app_role)
      OR public.is_super_admin(auth.uid())
    )
  );

-- ═══════════════════════════════════════════════════════════════════════
-- 4) manual_charge_suppressions — opt-out estruturado. Matriz normativa
--    reason×scope imposta por CHECK constraint, não só por convenção.
--    Só functions controladas (create_suppression_candidate/
--    confirm_suppression) promovem candidate→confirmed; escrita direta é
--    revogada de todos os papéis comuns.
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE public.manual_charge_suppressions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  phone_normalized text NOT NULL CHECK (phone_normalized <> ''),
  scope text NOT NULL CHECK (scope IN ('campaign', 'product', 'all_contact')),
  campaign_key text,
  product_ref text,
  reason text NOT NULL CHECK (reason IN (
    'stop_contact', 'wrong_number', 'product_decline',
    'temporary_decline', 'complaint', 'ambiguous'
  )),
  status text NOT NULL DEFAULT 'candidate' CHECK (status IN ('candidate', 'confirmed', 'revoked')),
  -- Evidência opcional, mas quando presente precisa ser isolada por
  -- organização (achado real de revisão: uma FK simples permitia uma
  -- supressão da organização A apontar para mensagem/conversa da B).
  -- FKs compostas abaixo (fora desta lista de colunas) tornam isso
  -- impossível; ambas nulas juntas (evidência ausente) continuam
  -- permitidas.
  source_conversation_id uuid,
  source_message_id uuid,
  detected_at timestamptz NOT NULL DEFAULT now(),
  confirmed_at timestamptz,
  -- RESTRICT, não SET NULL: os CHECKs abaixo exigem confirmed_by/revoked_by
  -- não-nulos quando status='confirmed'/'revoked' — SET NULL produziria uma
  -- violação de CHECK ao tentar apagar o profile, em vez de um erro de FK
  -- claro. RESTRICT preserva a identidade do ator no rastro de auditoria.
  confirmed_by uuid REFERENCES public.profiles(id) ON DELETE RESTRICT,
  revoked_at timestamptz,
  revoked_by uuid REFERENCES public.profiles(id) ON DELETE RESTRICT,
  detector text NOT NULL CHECK (detector <> ''),
  confidence numeric CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  -- reason <-> escopo: combinações impossíveis de inserir, não só documentadas
  CHECK (
    (reason IN ('stop_contact', 'wrong_number')
      AND scope = 'all_contact' AND campaign_key IS NULL AND product_ref IS NULL)
    OR (reason = 'product_decline' AND scope IN ('product', 'campaign')
      AND ((scope = 'product' AND product_ref IS NOT NULL AND campaign_key IS NULL)
        OR (scope = 'campaign' AND campaign_key IS NOT NULL AND product_ref IS NULL)))
    OR (reason IN ('temporary_decline', 'complaint', 'ambiguous')
      AND ((scope = 'all_contact' AND campaign_key IS NULL AND product_ref IS NULL)
        OR (scope = 'campaign' AND campaign_key IS NOT NULL AND product_ref IS NULL)
        OR (scope = 'product' AND product_ref IS NOT NULL AND campaign_key IS NULL)))
  ),
  CHECK (status <> 'confirmed' OR (confirmed_at IS NOT NULL AND confirmed_by IS NOT NULL AND revoked_at IS NULL AND revoked_by IS NULL)),
  CHECK (status <> 'revoked' OR (revoked_at IS NOT NULL AND revoked_by IS NOT NULL AND confirmed_at IS NOT NULL)),
  CHECK (status <> 'candidate' OR (confirmed_at IS NULL AND confirmed_by IS NULL AND revoked_at IS NULL AND revoked_by IS NULL)),
  CHECK (campaign_key IS NULL OR campaign_key <> ''),
  CHECK (product_ref IS NULL OR product_ref <> ''),
  -- Corrigido (achado real de revisão): a versão anterior usava uma FK
  -- composta (source_conversation_id, source_message_id) com
  -- ON DELETE SET NULL, que anulava os DOIS campos juntos ao apagar só a
  -- mensagem — perdendo a referência à conversa mesmo que ela ainda
  -- existisse. Agora: mensagem pode ser apagada isoladamente (só
  -- source_message_id vira NULL); a conversa NUNCA desaparece por baixo
  -- do pé desta evidência (RESTRICT); a coerência mensagem↔conversa é
  -- garantida por trigger (abaixo), não pela FK, para poder ter
  -- ON DELETE independente em cada campo.
  CHECK (source_message_id IS NULL OR source_conversation_id IS NOT NULL),
  FOREIGN KEY (organization_id, source_conversation_id)
    REFERENCES public.webchat_conversations (organization_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (source_message_id)
    REFERENCES public.webchat_messages (id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX manual_charge_suppressions_active_uk
  ON public.manual_charge_suppressions (organization_id, phone_normalized, scope,
                                         COALESCE(campaign_key, ''), COALESCE(product_ref, ''))
  WHERE status = 'confirmed';

CREATE TRIGGER manual_charge_suppressions_touch_updated_at
  BEFORE UPDATE ON public.manual_charge_suppressions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.manual_charge_suppressions_validate_evidence()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  IF NEW.source_message_id IS NOT NULL AND NEW.source_conversation_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.webchat_messages wm
      WHERE wm.id = NEW.source_message_id AND wm.conversation_id = NEW.source_conversation_id
    ) THEN
      RAISE EXCEPTION 'evidence_message_does_not_belong_to_conversation' USING ERRCODE = 'P0008';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.manual_charge_suppressions_validate_evidence IS
  'FASE A — substitui a checagem que antes vinha de uma FK composta (source_conversation_id, source_message_id): confirma que a mensagem realmente pertence à conversa declarada, sem acoplar o ON DELETE dos dois campos entre si.';

-- ACHADO REAL (auditoria de matriz de grants, rodada de aplicação em
-- produção) -- mesmo motivo da correção em
-- manual_charge_dispatches_set_phone_normalized acima: sem revoke
-- explícito, PUBLIC mantinha EXECUTE por padrão. O disparo do trigger
-- não depende de EXECUTE concedido ao usuário da operação. Nenhum papel
-- precisa executá-la diretamente (referencia NEW) -- mínimo necessário é
-- revogar de todos, sem conceder a nenhum papel.
REVOKE ALL ON FUNCTION public.manual_charge_suppressions_validate_evidence() FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER manual_charge_suppressions_validate_evidence_trg
  BEFORE INSERT OR UPDATE ON public.manual_charge_suppressions
  FOR EACH ROW EXECUTE FUNCTION public.manual_charge_suppressions_validate_evidence();

COMMENT ON TABLE public.manual_charge_suppressions IS
  'FASE A — opt-out estruturado. temporary_decline/complaint/ambiguous NUNCA produzem bloqueio permanente automático, mesmo confirmed — a função de disposição trata esses 3 reasons como suspensão para revisão, nunca cancelamento definitivo.';

REVOKE ALL ON public.manual_charge_suppressions FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.manual_charge_suppressions TO authenticated;
ALTER TABLE public.manual_charge_suppressions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "manual_charge_suppressions_org_read" ON public.manual_charge_suppressions
  FOR SELECT TO authenticated
  USING (
    organization_id = public.get_user_organization(auth.uid())
    AND (
      public.has_role(auth.uid(), 'admin'::app_role)
      OR public.has_role(auth.uid(), 'manager'::app_role)
      OR public.is_super_admin(auth.uid())
    )
  );

CREATE OR REPLACE FUNCTION public.create_suppression_candidate(
  p_organization_id uuid,
  p_phone_normalized text,
  p_scope text,
  p_reason text,
  p_campaign_key text DEFAULT NULL,
  p_product_ref text DEFAULT NULL,
  p_source_conversation_id uuid DEFAULT NULL,
  p_source_message_id uuid DEFAULT NULL,
  p_detector text DEFAULT 'manual',
  p_confidence numeric DEFAULT NULL,
  p_created_by uuid DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_id uuid;
BEGIN
  -- system-only (grant abaixo é só service_role) — não há auth.uid() de
  -- chamador para checar; organização/lead vêm do pipeline de ingestão
  -- confiável, não de um usuário final. Regra relaxada (mensagem implica
  -- conversa, não mais "ambos ou nenhum") para casar com o novo desenho
  -- de evidência da tabela (ver seção 4).
  IF p_source_message_id IS NOT NULL AND p_source_conversation_id IS NULL THEN
    RAISE EXCEPTION 'source_message_id_requires_conversation_id' USING ERRCODE = 'P0006';
  END IF;

  INSERT INTO public.manual_charge_suppressions (
    organization_id, phone_normalized, scope, campaign_key, product_ref,
    reason, status, source_conversation_id, source_message_id, detector, confidence, created_by
  ) VALUES (
    p_organization_id, p_phone_normalized, p_scope, p_campaign_key, p_product_ref,
    p_reason, 'candidate', p_source_conversation_id, p_source_message_id, p_detector, p_confidence, p_created_by
  ) RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

COMMENT ON FUNCTION public.create_suppression_candidate IS
  'FASE A — único caminho para registrar um candidato de opt-out. Nunca promove a confirmed sozinha.';

CREATE OR REPLACE FUNCTION public.confirm_suppression(
  p_suppression_id uuid
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_actor_user_id uuid := auth.uid();
  v_org uuid;
BEGIN
  -- O ator NUNCA é aceito como parâmetro do chamador — sempre derivado de
  -- auth.uid(). v_org fica NULL se o recurso não existir — a autorização
  -- é checada de qualquer forma (achado real de revisão: checar
  -- autorização só DEPOIS de confirmar existência vazava, via um
  -- `RETURN false` diferente do `RAISE EXCEPTION`, se o recurso existe ou
  -- não para quem não tem acesso). Para um organization_id NULL, o helper
  -- nega para todo mundo, exceto super_admin.
  --
  -- ACHADO REAL DE EXECUÇÃO CONTRA POSTGRES: a versão anterior filtrava
  -- também "AND status = 'candidate'" NESTA MESMA consulta — a que
  -- determina a organização para AUTORIZAÇÃO, não a que decide a
  -- transição. Consequência real, reproduzida: um admin autorizado, da
  -- MESMA organização, chamando esta function numa linha que já não está
  -- mais em 'candidate' (idempotência — 7.1b; ou "estado incompatível" —
  -- 7.4), fazia v_org resolver para NULL (a linha existe, mas o WHERE
  -- também exige status='candidate', então "não encontrada" por esse
  -- critério) — manual_charge_actor_authorized(NULL) nega para qualquer
  -- não-super_admin, produzindo unauthorized_actor (42501) para um ator
  -- LEGITIMAMENTE autorizado, em vez do `false` que o design desta
  -- function promete para estado incompatível. As outras 3 RPCs humanas
  -- (record_payment_claim_resolution, resolve_payment_claim_review,
  -- reconcile_unknown_result) já separavam corretamente "localizar
  -- organização para autorizar" de "checar estado depois" — só esta
  -- tinha o filtro de estado bundlado na consulta de autorização.
  -- Corrigido: filtro de estado agora vive SÓ no UPDATE abaixo (igual às
  -- outras 3 RPCs); a transição continua determinada exclusivamente por
  -- esse UPDATE (WHERE ... AND status = 'candidate', RETURN FOUND) —
  -- nenhuma checagem de estado nova foi introduzida separada do UPDATE,
  -- então nenhuma corrida nova é possível.
  SELECT organization_id INTO v_org
  FROM public.manual_charge_suppressions
  WHERE id = p_suppression_id;

  -- Checagem ÚNICA e exaustiva (achado crítico corrigido: a versão
  -- anterior usava "v_org <> get_user_organization(...) AND NOT
  -- is_super_admin(...)", que vira NULL — e portanto nunca dispara o
  -- RAISE — quando o ator não tem organização/perfil).
  IF public.manual_charge_actor_authorized(v_org) IS NOT TRUE THEN
    RAISE EXCEPTION 'unauthorized_actor' USING ERRCODE = '42501';
  END IF;

  UPDATE public.manual_charge_suppressions
  SET status = 'confirmed', confirmed_at = now(), confirmed_by = v_actor_user_id
  WHERE id = p_suppression_id AND status = 'candidate';

  RETURN FOUND;
END;
$$;

COMMENT ON FUNCTION public.confirm_suppression IS
  'FASE A — usa manual_charge_actor_authorized (checagem única e exaustiva, nunca NULL). O ator vem de auth.uid(), nunca de parâmetro (impede impersonação). WHERE status=''candidate'' explícito impede corrida com outra confirmação/revogação concorrente.';

REVOKE ALL ON FUNCTION public.create_suppression_candidate(uuid, text, text, text, text, text, uuid, uuid, text, numeric, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_suppression_candidate(uuid, text, text, text, text, text, uuid, uuid, text, numeric, uuid) TO service_role;

REVOKE ALL ON FUNCTION public.confirm_suppression(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.confirm_suppression(uuid) TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════
-- 5) payment_claim_events / payment_claim_resolution_events —
--    "já paguei" como fato independente, ligado a UMA cobrança específica
--    (nunca um bloqueio global de telefone). Resoluções são uma sequência
--    linear (sequence_no), nunca um grafo — sem ponteiro de predecessor,
--    logo sem possibilidade estrutural de ciclo.
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE public.payment_claim_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  manual_charge_dispatch_id uuid NOT NULL,
  lead_id uuid NOT NULL,
  conversation_id uuid NOT NULL,
  source_message_id uuid NOT NULL,
  campaign_key text,
  product_ref text,
  detected_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),

  UNIQUE (organization_id, id),
  UNIQUE (organization_id, lead_id, id),
  FOREIGN KEY (organization_id, lead_id)
    REFERENCES public.leads (organization_id, id) ON DELETE RESTRICT,
  -- FKs compostas (não apenas por organização): amarram lead_id ao MESMO
  -- lead do dispatch e ao MESMO lead da conversa — um claim nunca pode
  -- ligar um lead ao dispatch/conversa de outro lead, mesmo na mesma
  -- organização (achado real de revisão da implementação).
  FOREIGN KEY (organization_id, lead_id, manual_charge_dispatch_id)
    REFERENCES public.manual_charge_dispatches (organization_id, lead_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, lead_id, conversation_id)
    REFERENCES public.webchat_conversations (organization_id, lead_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (conversation_id, source_message_id)
    REFERENCES public.webchat_messages (conversation_id, id) ON DELETE RESTRICT
);

COMMENT ON TABLE public.payment_claim_events IS
  'FASE A — fato bruto e imutável: "esta mensagem, desta conversa, alega pagamento desta cobrança específica". Nunca um bloqueio global de telefone. FKs compostas garantem lead_id = lead do dispatch = lead da conversa, sempre.';

REVOKE ALL ON public.payment_claim_events FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.payment_claim_events TO authenticated;
ALTER TABLE public.payment_claim_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "payment_claim_events_org_read" ON public.payment_claim_events
  FOR SELECT TO authenticated
  USING (
    organization_id = public.get_user_organization(auth.uid())
    AND (
      public.has_role(auth.uid(), 'admin'::app_role)
      OR public.has_role(auth.uid(), 'manager'::app_role)
      OR public.is_super_admin(auth.uid())
    )
  );

CREATE TABLE public.payment_claim_resolution_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  claim_event_id uuid NOT NULL,
  sequence_no integer NOT NULL CHECK (sequence_no >= 1),
  status text NOT NULL CHECK (status IN (
    'pending_reconciliation', 'confirmed_paid', 'not_found', 'invalid', 'needs_review'
  )),
  -- RESTRICT: o CHECK abaixo exige reconciled_by não-nulo fora de
  -- pending_reconciliation; preserva a identidade do ator no rastro.
  reconciled_by uuid REFERENCES public.profiles(id) ON DELETE RESTRICT,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),

  UNIQUE (organization_id, claim_event_id, sequence_no),
  FOREIGN KEY (organization_id, claim_event_id)
    REFERENCES public.payment_claim_events (organization_id, id) ON DELETE RESTRICT,
  CHECK (status = 'pending_reconciliation' OR reconciled_by IS NOT NULL)
);

COMMENT ON TABLE public.payment_claim_resolution_events IS
  'FASE A — sequência linear (sequence_no), nunca um grafo. INSERT-only. O estado vigente é sempre o maior sequence_no da mesma claim_event_id (ver view payment_claim_current_status).';

REVOKE ALL ON public.payment_claim_resolution_events FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.payment_claim_resolution_events TO authenticated;
ALTER TABLE public.payment_claim_resolution_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "payment_claim_resolution_events_org_read" ON public.payment_claim_resolution_events
  FOR SELECT TO authenticated
  USING (
    organization_id = public.get_user_organization(auth.uid())
    AND (
      public.has_role(auth.uid(), 'admin'::app_role)
      OR public.has_role(auth.uid(), 'manager'::app_role)
      OR public.is_super_admin(auth.uid())
    )
  );

CREATE VIEW public.payment_claim_current_status
WITH (security_invoker = true) AS
SELECT ce.id AS claim_event_id, ce.organization_id,
       COALESCE(latest.status, 'pending_reconciliation') AS current_status,
       latest.id AS current_resolution_id, latest.sequence_no
FROM public.payment_claim_events ce
LEFT JOIN LATERAL (
  SELECT re.id, re.status, re.sequence_no
  FROM public.payment_claim_resolution_events re
  WHERE re.claim_event_id = ce.id AND re.organization_id = ce.organization_id
  ORDER BY re.sequence_no DESC
  LIMIT 1
) latest ON true;

COMMENT ON VIEW public.payment_claim_current_status IS
  'FASE A — estado vigente derivado, nunca armazenado: o maior sequence_no de cada claim_event_id, ou pending_reconciliation implícito se ainda não há nenhuma resolução.';

-- ═══════════════════════════════════════════════════════════════════════
-- 6) manual_charge_payment_claim_reviews / _review_candidates /
--    payment_claim_review_events — fila de ambiguidade (zero ou vários
--    dispatches candidatos para a mesma mensagem). Candidato amarrado
--    simultaneamente à organização, ao lead do review E ao lead do
--    próprio dispatch — nenhuma FK simples.
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE public.manual_charge_payment_claim_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  lead_id uuid NOT NULL,
  conversation_id uuid NOT NULL,
  source_message_id uuid NOT NULL,
  detected_at timestamptz NOT NULL DEFAULT now(),

  UNIQUE (organization_id, id),
  UNIQUE (organization_id, id, lead_id),
  FOREIGN KEY (organization_id, lead_id)
    REFERENCES public.leads (organization_id, id) ON DELETE RESTRICT,
  -- composta: a conversa precisa ser do MESMO lead deste review, não só
  -- da mesma organização.
  FOREIGN KEY (organization_id, lead_id, conversation_id)
    REFERENCES public.webchat_conversations (organization_id, lead_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (conversation_id, source_message_id)
    REFERENCES public.webchat_messages (conversation_id, id) ON DELETE RESTRICT
);

COMMENT ON TABLE public.manual_charge_payment_claim_reviews IS
  'FASE A — criada quando register_payment_claim encontra zero ou mais de um dispatch candidato para a mensagem. Nunca escrita fora de register_payment_claim/resolve_payment_claim_review.';

REVOKE ALL ON public.manual_charge_payment_claim_reviews FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.manual_charge_payment_claim_reviews TO authenticated;
ALTER TABLE public.manual_charge_payment_claim_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "manual_charge_payment_claim_reviews_org_read" ON public.manual_charge_payment_claim_reviews
  FOR SELECT TO authenticated
  USING (
    organization_id = public.get_user_organization(auth.uid())
    AND (
      public.has_role(auth.uid(), 'admin'::app_role)
      OR public.has_role(auth.uid(), 'manager'::app_role)
      OR public.is_super_admin(auth.uid())
    )
  );

-- (UNIQUE (organization_id, lead_id, id) já declarada na CREATE TABLE de
-- manual_charge_dispatches, seção 2 — não repetida aqui.)

CREATE TABLE public.manual_charge_payment_claim_review_candidates (
  review_id uuid NOT NULL,
  organization_id uuid NOT NULL,
  lead_id uuid NOT NULL,
  dispatch_id uuid NOT NULL,
  PRIMARY KEY (review_id, dispatch_id),

  FOREIGN KEY (organization_id, review_id, lead_id)
    REFERENCES public.manual_charge_payment_claim_reviews (organization_id, id, lead_id) ON DELETE CASCADE,
  FOREIGN KEY (organization_id, lead_id, dispatch_id)
    REFERENCES public.manual_charge_dispatches (organization_id, lead_id, id)
);

COMMENT ON TABLE public.manual_charge_payment_claim_review_candidates IS
  'FASE A — as duas FKs compostas obrigam review.lead_id = candidato.lead_id = dispatch.lead_id sempre. Um candidato nunca pode apontar para um dispatch de outro lead, mesmo na mesma organização.';

REVOKE ALL ON public.manual_charge_payment_claim_review_candidates FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.manual_charge_payment_claim_review_candidates TO authenticated;
ALTER TABLE public.manual_charge_payment_claim_review_candidates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "manual_charge_payment_claim_review_candidates_org_read" ON public.manual_charge_payment_claim_review_candidates
  FOR SELECT TO authenticated
  USING (
    organization_id = public.get_user_organization(auth.uid())
    AND (
      public.has_role(auth.uid(), 'admin'::app_role)
      OR public.has_role(auth.uid(), 'manager'::app_role)
      OR public.is_super_admin(auth.uid())
    )
  );

CREATE TABLE public.payment_claim_review_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  review_id uuid NOT NULL,
  action text NOT NULL CHECK (action IN ('opened', 'resolved_claim_created', 'resolved_no_claim')),
  -- RESTRICT: o CHECK abaixo exige actor não-nulo fora de action='opened';
  -- preserva a identidade do ator no rastro de auditoria.
  actor uuid REFERENCES public.profiles(id) ON DELETE RESTRICT,
  resulting_claim_event_id uuid,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),

  FOREIGN KEY (organization_id, review_id)
    REFERENCES public.manual_charge_payment_claim_reviews (organization_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, resulting_claim_event_id)
    REFERENCES public.payment_claim_events (organization_id, id) ON DELETE RESTRICT,
  CHECK (action = 'opened' OR actor IS NOT NULL),
  CHECK ((action = 'resolved_claim_created') = (resulting_claim_event_id IS NOT NULL))
);
CREATE UNIQUE INDEX payment_claim_review_events_resolution_uk
  ON public.payment_claim_review_events (review_id) WHERE action <> 'opened';

COMMENT ON TABLE public.payment_claim_review_events IS
  'FASE A — INSERT-only. manual_charge_payment_claim_reviews nunca é atualizada; seu status é sempre derivado do evento de resolução mais recente (no máximo um, por causa do índice único parcial).';

REVOKE ALL ON public.payment_claim_review_events FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.payment_claim_review_events TO authenticated;
ALTER TABLE public.payment_claim_review_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "payment_claim_review_events_org_read" ON public.payment_claim_review_events
  FOR SELECT TO authenticated
  USING (
    organization_id = public.get_user_organization(auth.uid())
    AND (
      public.has_role(auth.uid(), 'admin'::app_role)
      OR public.has_role(auth.uid(), 'manager'::app_role)
      OR public.is_super_admin(auth.uid())
    )
  );

-- ═══════════════════════════════════════════════════════════════════════
-- 7) payment_claim_intake — barreira ÚNICA de deduplicação atômica.
--    A mesma mensagem NUNCA produz claim e review simultaneamente: a
--    reserva (INSERT...ON CONFLICT DO NOTHING) acontece ANTES de
--    qualquer outcome ser criado — só quem vence a reserva chega a criar
--    algo. Isso é uma garantia da TRANSAÇÃO de register_payment_claim
--    (única function com privilégio de escrita aqui), não do schema
--    isolado: o CHECK abaixo aceita, em si, uma linha com outcome NULL —
--    é a disciplina da function que nunca deixa isso persistir commitado
--    (achado real de revisão: não superestimar o que o schema garante
--    sozinho).
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE public.payment_claim_intake (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  source_message_id uuid NOT NULL,
  conversation_id uuid NOT NULL,
  lead_id uuid NOT NULL,
  detected_at timestamptz NOT NULL DEFAULT now(),
  outcome text,
  claim_event_id uuid,
  review_id uuid,

  UNIQUE (organization_id, source_message_id),
  -- Exclusivo por construção: exatamente um dos três estados, nunca uma
  -- combinação parcial/contraditória (achado real de revisão).
  --
  -- ACHADO REAL DE EXECUÇÃO CONTRA POSTGRES (não apenas revisão estática):
  -- a versão anterior desta CHECK, sem "IS TRUE", tinha uma lacuna de
  -- lógica trivalorada — `outcome = 'claim'` quando outcome é NULL avalia
  -- para NULL (não FALSE), e Postgres só REJEITA uma linha quando a CHECK
  -- avalia para FALSE; NULL é tratado como "satisfeita". Isso permitia
  -- outcome=NULL com claim_event_id preenchido (uma combinação
  -- estruturalmente incoerente) passar pela CHECK sem erro — confirmado
  -- por execução direta: a expressão original avaliava para NULL, não
  -- FALSE, para exatamente essa combinação. Só uma FK composta
  -- coincidente (com um claim_event_id que não existisse) mascarava o
  -- problema nos testes anteriores. "IS TRUE" converte qualquer resultado
  -- que não seja literalmente TRUE (inclusive NULL) em rejeição — a CHECK
  -- agora rejeita a combinação inválida mesmo quando os IDs referenciados
  -- existem de verdade, sem depender da FK como defesa.
  --
  -- `outcome` é text livre (sem enum/CHECK de domínio próprio) — por
  -- construção, as 3 cláusulas já exigem um valor exato ('claim' ou
  -- 'review') ou NULL; qualquer outro texto não casa com nenhuma
  -- cláusula, resultando em FALSE (não NULL, já que a comparação com um
  -- valor NOT NULL de outcome é determinística) — IS TRUE rejeita esse
  -- caso também, sem exigir um enum separado.
  -- Nome explícito (não deixado para o Postgres gerar automaticamente):
  -- um nome estável e previsível é o que permite a um teste capturar e
  -- confirmar QUAL constraint rejeitou a linha, em vez de inferir isso
  -- só pelo SQLSTATE genérico de check_violation (23514, compartilhado
  -- por qualquer CHECK da tabela).
  CONSTRAINT payment_claim_intake_outcome_exclusive_check CHECK ((
    (outcome IS NULL AND claim_event_id IS NULL AND review_id IS NULL)
    OR (outcome = 'claim' AND claim_event_id IS NOT NULL AND review_id IS NULL)
    OR (outcome = 'review' AND claim_event_id IS NULL AND review_id IS NOT NULL)
  ) IS TRUE),
  FOREIGN KEY (organization_id, lead_id, conversation_id)
    REFERENCES public.webchat_conversations (organization_id, lead_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, lead_id)
    REFERENCES public.leads (organization_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (conversation_id, source_message_id)
    REFERENCES public.webchat_messages (conversation_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, lead_id, claim_event_id)
    REFERENCES public.payment_claim_events (organization_id, lead_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, review_id, lead_id)
    REFERENCES public.manual_charge_payment_claim_reviews (organization_id, id, lead_id) ON DELETE RESTRICT
);

COMMENT ON TABLE public.payment_claim_intake IS
  'FASE A — a única escrita mutável desta tabela é o UPDATE que anexa outcome/claim_event_id/review_id, feito pela MESMA transação que reservou a linha, dentro de register_payment_claim. Nenhuma outra sessão observa um commit com outcome NULL — por MVCC, a linha só se torna visível já completa, ou não se torna visível (rollback).';

REVOKE ALL ON public.payment_claim_intake FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.payment_claim_intake TO authenticated;
ALTER TABLE public.payment_claim_intake ENABLE ROW LEVEL SECURITY;

CREATE POLICY "payment_claim_intake_org_read" ON public.payment_claim_intake
  FOR SELECT TO authenticated
  USING (
    organization_id = public.get_user_organization(auth.uid())
    AND (
      public.has_role(auth.uid(), 'admin'::app_role)
      OR public.has_role(auth.uid(), 'manager'::app_role)
      OR public.is_super_admin(auth.uid())
    )
  );

-- ═══════════════════════════════════════════════════════════════════════
-- 8) register_payment_claim — única function de escrita para os fatos de
--    payment_claimed. Valida, numa ÚNICA consulta encadeada (não checagens
--    separadas), que organização, conversa, lead e mensagem formam uma
--    cadeia inequívoca e que a mensagem é inbound e do lead (nunca do
--    bot/agente) — a ausência de qualquer elo falha fechado (RAISE
--    EXCEPTION, nada é criado).
-- ═══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.register_payment_claim(
  p_organization_id uuid,
  p_conversation_id uuid,
  p_lead_id uuid,
  p_source_message_id uuid,
  p_actor text DEFAULT 'system'
) RETURNS TABLE(outcome text, claim_event_id uuid, review_id uuid, already_processed boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_intake_id uuid;
  v_outcome text;
  v_claim_event_id uuid;
  v_review_id uuid;
  v_candidate_dispatch_ids uuid[];
  v_chain_ok boolean;
BEGIN
  -- Cadeia única e inequívoca: conversa pertence à organização E ao lead
  -- informados; a mensagem pertence exatamente a essa conversa; a
  -- mensagem é inbound E do lead (visitor), nunca do bot/agente. Ausência
  -- de qualquer elo desta cadeia => v_chain_ok = false => falha fechado.
  SELECT EXISTS (
    SELECT 1
    FROM public.webchat_conversations wc
    JOIN public.webchat_messages wm
      ON wm.conversation_id = wc.id AND wm.id = p_source_message_id
    WHERE wc.id = p_conversation_id
      AND wc.organization_id = p_organization_id
      AND wc.lead_id = p_lead_id
      AND wm.direction = 'inbound'
      AND wm.sender_type = 'visitor'
  ) INTO v_chain_ok;

  IF NOT v_chain_ok THEN
    RAISE EXCEPTION 'invalid_or_ambiguous_evidence_chain' USING ERRCODE = 'P0001';
  END IF;

  -- Reserva atômica — única barreira real de deduplicação. Se outra
  -- chamada concorrente já reservou este (organization_id,
  -- source_message_id), esta INSERT bloqueia até ela resolver e, se
  -- commitada, o ON CONFLICT DO NOTHING prevalece (zero linhas
  -- retornadas) — nunca cria nada além desta consulta.
  INSERT INTO public.payment_claim_intake (organization_id, source_message_id, conversation_id, lead_id)
  VALUES (p_organization_id, p_source_message_id, p_conversation_id, p_lead_id)
  ON CONFLICT (organization_id, source_message_id) DO NOTHING
  RETURNING id INTO v_intake_id;

  IF v_intake_id IS NULL THEN
    SELECT pci.outcome, pci.claim_event_id, pci.review_id
    INTO v_outcome, v_claim_event_id, v_review_id
    FROM public.payment_claim_intake pci
    WHERE pci.organization_id = p_organization_id AND pci.source_message_id = p_source_message_id;

    RETURN QUERY SELECT v_outcome, v_claim_event_id, v_review_id, true;
    RETURN;
  END IF;

  -- Vencemos a reserva: só agora resolvemos candidatos e criamos o outcome.
  SELECT array_agg(d.id) INTO v_candidate_dispatch_ids
  FROM public.manual_charge_dispatches d
  WHERE d.organization_id = p_organization_id
    AND d.lead_id = p_lead_id
    AND d.status = 'eligible';

  IF array_length(v_candidate_dispatch_ids, 1) = 1 THEN
    INSERT INTO public.payment_claim_events
      (organization_id, manual_charge_dispatch_id, lead_id, conversation_id, source_message_id)
    VALUES (p_organization_id, v_candidate_dispatch_ids[1], p_lead_id, p_conversation_id, p_source_message_id)
    RETURNING id INTO v_claim_event_id;
    v_outcome := 'claim';
  ELSE
    INSERT INTO public.manual_charge_payment_claim_reviews
      (organization_id, lead_id, conversation_id, source_message_id)
    VALUES (p_organization_id, p_lead_id, p_conversation_id, p_source_message_id)
    RETURNING id INTO v_review_id;

    IF v_candidate_dispatch_ids IS NOT NULL THEN
      INSERT INTO public.manual_charge_payment_claim_review_candidates (review_id, organization_id, lead_id, dispatch_id)
      SELECT v_review_id, p_organization_id, p_lead_id, unnest(v_candidate_dispatch_ids);
    END IF;

    INSERT INTO public.payment_claim_review_events (organization_id, review_id, action, actor)
    VALUES (p_organization_id, v_review_id, 'opened', NULL);

    v_outcome := 'review';
  END IF;

  UPDATE public.payment_claim_intake
  SET outcome = v_outcome, claim_event_id = v_claim_event_id, review_id = v_review_id
  WHERE id = v_intake_id;

  RETURN QUERY SELECT v_outcome, v_claim_event_id, v_review_id, false;
END;
$$;

COMMENT ON FUNCTION public.register_payment_claim IS
  'FASE A — nenhum EXCEPTION no caminho principal. A cadeia organização/conversa/lead/mensagem-inbound-do-lead é validada numa única consulta antes de qualquer escrita. "Perdemos a corrida" é um SELECT comum após ON CONFLICT DO NOTHING retornar zero linhas, nunca uma captura de erro.';

REVOKE ALL ON FUNCTION public.register_payment_claim(uuid, uuid, uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.register_payment_claim(uuid, uuid, uuid, uuid, text) TO service_role;

CREATE OR REPLACE FUNCTION public.record_payment_claim_resolution(
  p_claim_event_id uuid,
  p_status text,
  p_note text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_actor_user_id uuid := auth.uid();
  v_org uuid;
  v_next_seq integer;
  v_id uuid;
BEGIN
  -- O ator NUNCA é aceito como parâmetro do chamador — sempre derivado de
  -- auth.uid(). Autorização SEMPRE checada antes de revelar se o recurso
  -- existe (achado real de revisão: levantar claim_event_not_found ANTES
  -- da autorização deixava um ator de outra organização distinguir
  -- "não existe" de "existe mas não é seu" pelo SQLSTATE/mensagem
  -- diferente). Só depois de autorizado é que "não encontrado" pode ser
  -- revelado com segurança.
  SELECT organization_id INTO v_org
  FROM public.payment_claim_events
  WHERE id = p_claim_event_id
  FOR UPDATE;

  -- Checagem ÚNICA e exaustiva (achado crítico corrigido: a comparação
  -- anterior "<> ... AND NOT is_super_admin(...)" virava NULL — nunca
  -- disparava o RAISE — quando o ator não tinha organização/perfil).
  IF public.manual_charge_actor_authorized(v_org) IS NOT TRUE THEN
    RAISE EXCEPTION 'unauthorized_actor' USING ERRCODE = '42501';
  END IF;

  IF v_org IS NULL THEN
    -- só chega aqui se o ator for super_admin (o helper só autoriza
    -- organização NULL para super_admin) — agora é seguro revelar que o
    -- recurso não existe.
    RAISE EXCEPTION 'claim_event_not_found' USING ERRCODE = 'P0002';
  END IF;

  SELECT COALESCE(MAX(sequence_no), 0) + 1 INTO v_next_seq
  FROM public.payment_claim_resolution_events
  WHERE claim_event_id = p_claim_event_id;

  INSERT INTO public.payment_claim_resolution_events
    (organization_id, claim_event_id, sequence_no, status, reconciled_by, note)
  VALUES (v_org, p_claim_event_id, v_next_seq, p_status, v_actor_user_id, p_note)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

COMMENT ON FUNCTION public.record_payment_claim_resolution IS
  'FASE A — SELECT ... FOR UPDATE na linha da claim serializa proativamente duas resoluções concorrentes; o UNIQUE(organization_id, claim_event_id, sequence_no) é o backstop estrutural que torna uma divergência silenciosa impossível mesmo se o lock falhar. Ator sempre de auth.uid(), nunca de parâmetro.';

REVOKE ALL ON FUNCTION public.record_payment_claim_resolution(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_payment_claim_resolution(uuid, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.resolve_payment_claim_review(
  p_review_id uuid,
  p_dispatch_id uuid,
  p_note text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_actor_user_id uuid := auth.uid();
  v_org uuid;
  v_lead uuid;
  v_conversation uuid;
  v_message uuid;
  v_claim_event_id uuid;
BEGIN
  -- Autorização SEMPRE checada antes de revelar se o recurso existe
  -- (achado real de revisão: mesma classe do bug de vazamento de
  -- existência em record_payment_claim_resolution).
  SELECT organization_id, lead_id, conversation_id, source_message_id
  INTO v_org, v_lead, v_conversation, v_message
  FROM public.manual_charge_payment_claim_reviews
  WHERE id = p_review_id;

  -- Checagem ÚNICA e exaustiva (achado crítico corrigido: a comparação
  -- anterior virava NULL — nunca disparava o RAISE — quando o ator não
  -- tinha organização/perfil).
  IF public.manual_charge_actor_authorized(v_org) IS NOT TRUE THEN
    RAISE EXCEPTION 'unauthorized_actor' USING ERRCODE = '42501';
  END IF;

  IF v_org IS NULL THEN
    -- só chega aqui se o ator for super_admin — agora é seguro revelar
    -- que o recurso não existe.
    RAISE EXCEPTION 'review_not_found' USING ERRCODE = 'P0002';
  END IF;

  -- só uma resolução por review — o índice único parcial garante isto;
  -- checagem antecipada aqui é só para dar um erro claro em vez de um
  -- erro genérico de constraint.
  IF EXISTS (SELECT 1 FROM public.payment_claim_review_events WHERE review_id = p_review_id AND action <> 'opened') THEN
    RAISE EXCEPTION 'review_already_resolved' USING ERRCODE = 'P0003';
  END IF;

  IF p_dispatch_id IS NOT NULL THEN
    -- a FK composta de manual_charge_payment_claim_review_candidates já
    -- garante, a nível de banco, que p_dispatch_id (se veio de lá) é do
    -- mesmo lead; aqui confirmamos que era de fato um candidato listado
    -- para este review, não um dispatch arbitrário escolhido à mão.
    IF NOT EXISTS (
      SELECT 1 FROM public.manual_charge_payment_claim_review_candidates
      WHERE review_id = p_review_id AND dispatch_id = p_dispatch_id
    ) THEN
      RAISE EXCEPTION 'dispatch_not_a_listed_candidate' USING ERRCODE = 'P0004';
    END IF;

    INSERT INTO public.payment_claim_events
      (organization_id, manual_charge_dispatch_id, lead_id, conversation_id, source_message_id)
    VALUES (v_org, p_dispatch_id, v_lead, v_conversation, v_message)
    RETURNING id INTO v_claim_event_id;

    INSERT INTO public.payment_claim_review_events
      (organization_id, review_id, action, actor, resulting_claim_event_id, note)
    VALUES (v_org, p_review_id, 'resolved_claim_created', v_actor_user_id, v_claim_event_id, p_note);
  ELSE
    INSERT INTO public.payment_claim_review_events
      (organization_id, review_id, action, actor, note)
    VALUES (v_org, p_review_id, 'resolved_no_claim', v_actor_user_id, p_note);
  END IF;

  RETURN v_claim_event_id;
END;
$$;

COMMENT ON FUNCTION public.resolve_payment_claim_review IS
  'FASE A — resolução humana explícita de uma ambiguidade. Nunca associa por aproximação: p_dispatch_id precisa estar na lista de candidatos JÁ registrada por register_payment_claim. Ator sempre de auth.uid(), nunca de parâmetro.';

REVOKE ALL ON FUNCTION public.resolve_payment_claim_review(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resolve_payment_claim_review(uuid, uuid, text) TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════
-- 9) Kill switch de banco (Gate 1) — Fase A não tem worker/envio, então só
--    o gate de claim existe nesta fase. O Gate 2 (worker) é Fase B.
-- ═══════════════════════════════════════════════════════════════════════

INSERT INTO public.recovery_feature_flags (key, enabled)
VALUES ('manual_charge_dispatch_claim_enabled', false)
ON CONFLICT (key) DO NOTHING;

COMMENT ON TABLE public.recovery_feature_flags IS
  'Reaproveitada de FASE 2.4. Chave desta feature: manual_charge_dispatch_claim_enabled — nasce false. Ausência da linha ou enabled <> true => claim_charge_for_send recusa operar (fail-closed).';

-- ═══════════════════════════════════════════════════════════════════════
-- 10) claim_charge_for_send / record_send_result / cancel_claim — a
--     máquina de estados de envio em si (preservada da v4/aprovada com
--     correções nas partes 2/3, reimplementada aqui de forma concreta).
--     Nenhuma destas functions chama qualquer provider — apenas
--     transicionam status dentro do banco. O worker real que chamaria a
--     UazAPI após um claim bem-sucedido é Fase B, não existe aqui.
-- ═══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.claim_charge_for_send(
  p_dispatch_id uuid,
  p_actor text
) RETURNS TABLE(status text, claim_token uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_dispatch_org uuid;
  v_token uuid;
  v_updated_status text;
BEGIN
  -- advisory lock transacional, chaveado pelo próprio dispatch — primeira
  -- ação, antes de qualquer leitura. Uma segunda tentativa concorrente
  -- bloqueia aqui, não numa UPDATE — permite provar releitura do gate
  -- após a espera (ver plano/testes de isolamento, Fase futura).
  PERFORM pg_advisory_xact_lock(hashtextextended(p_dispatch_id::text, 0));

  -- ACHADO REAL DE EXECUÇÃO CONTRA POSTGRES (mesma classe do achado em
  -- reconcile_unknown_result): RETURNS TABLE(status text, claim_token
  -- uuid) cria dois OUT params que colidiam com as colunas
  -- manual_charge_dispatches.status/.claim_token quando referenciadas sem
  -- qualificar a tabela. Corrigido com alias explícito "d" em toda
  -- referência de coluna desta tabela nesta function — nunca renomeando
  -- as colunas de retorno da RPC, nunca usando
  -- #variable_conflict use_column/use_variable.
  SELECT d.organization_id INTO v_dispatch_org
  FROM public.manual_charge_dispatches AS d WHERE d.id = p_dispatch_id;

  IF v_dispatch_org IS NULL THEN
    RETURN QUERY SELECT 'not_found'::text, NULL::uuid;
    RETURN;
  END IF;

  v_token := gen_random_uuid();

  -- Gate 1 embutido na PRÓPRIA subquery do WHERE — nunca lido antes para
  -- uma variável. Sob READ COMMITTED, uma execução que esperou o advisory
  -- lock reavalia esta subquery no momento em que roda, não usa um valor
  -- lido antes de bloquear.
  -- 'reconciled_not_sent' é tratado como 'eligible' para fins de claim —
  -- reconciliação positiva de que o envio anterior NÃO ocorreu (achado
  -- real de revisão: dispatch nunca é recriado, a MESMA linha volta a ser
  -- clamável).
  UPDATE public.manual_charge_dispatches AS d
  SET status = 'sending', claim_token = v_token, claimed_by = p_actor, claimed_at = now()
  WHERE d.id = p_dispatch_id
    AND d.status IN ('eligible', 'reconciled_not_sent')
    AND (SELECT enabled FROM public.recovery_feature_flags
         WHERE key = 'manual_charge_dispatch_claim_enabled') IS TRUE;

  IF FOUND THEN
    RETURN QUERY SELECT 'sending'::text, v_token;
    RETURN;
  END IF;

  SELECT d.status INTO v_updated_status FROM public.manual_charge_dispatches AS d WHERE d.id = p_dispatch_id;

  IF v_updated_status = 'sending' THEN
    RETURN QUERY SELECT 'already_sending'::text, NULL::uuid;
  ELSIF v_updated_status IN ('eligible', 'reconciled_not_sent') THEN
    -- só pode ser o gate desligado, já que status ainda era clamável
    RETURN QUERY SELECT 'claim_disabled'::text, NULL::uuid;
  ELSE
    RETURN QUERY SELECT ('not_eligible_' || v_updated_status)::text, NULL::uuid;
  END IF;
END;
$$;

COMMENT ON FUNCTION public.claim_charge_for_send IS
  'FASE A — nunca chama nenhum provider. Só transiciona eligible->sending sob o Gate 1. Preserva a v4/partes 2-3, reimplementado concretamente.';

CREATE OR REPLACE FUNCTION public.record_send_result(
  p_dispatch_id uuid,
  p_claim_token uuid,
  p_result_status text,
  p_provider_response jsonb DEFAULT NULL
) RETURNS TABLE(status text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  IF p_result_status NOT IN ('sent', 'failed', 'unknown_result') THEN
    RAISE EXCEPTION 'invalid_result_status' USING ERRCODE = 'P0005';
  END IF;

  -- sent_at só é preenchido quando o resultado é 'sent' de verdade — achado
  -- real de revisão: gravá-lo também para 'failed'/'unknown_result' tornaria
  -- a auditoria ambígua (pareceria confirmação de envio bem-sucedido).
  --
  -- ACHADO REAL DE EXECUÇÃO CONTRA POSTGRES (mesma classe do achado em
  -- reconcile_unknown_result/claim_charge_for_send): RETURNS TABLE(status
  -- text) cria um OUT "status" que colidia com a coluna
  -- manual_charge_dispatches.status no WHERE sem qualificação — esta
  -- function nunca havia sido chamada por nenhum teste, então o bug
  -- nunca tinha se manifestado em execução. Corrigido com alias "d".
  UPDATE public.manual_charge_dispatches AS d
  SET status = p_result_status,
      sent_at = CASE WHEN p_result_status = 'sent' THEN now() ELSE sent_at END,
      provider_response = p_provider_response
  WHERE d.id = p_dispatch_id AND d.claim_token = p_claim_token AND d.status = 'sending';

  IF FOUND THEN
    RETURN QUERY SELECT p_result_status;
  ELSE
    RETURN QUERY SELECT 'not_in_sending_state'::text;
  END IF;
END;
$$;

COMMENT ON FUNCTION public.record_send_result IS
  'FASE A — WHERE status=''sending'' AND claim_token=... explícito: nunca sobrescreve um estado terminal já gravado por outra chamada (ex.: corrida com cancel_claim).';

CREATE OR REPLACE FUNCTION public.cancel_claim(
  p_dispatch_id uuid,
  p_claim_token uuid,
  p_reason text
) RETURNS TABLE(status text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  -- ACHADO REAL DE EXECUÇÃO CONTRA POSTGRES (mesma classe do achado em
  -- reconcile_unknown_result/claim_charge_for_send/record_send_result):
  -- RETURNS TABLE(status text) cria um OUT "status" que colidia com a
  -- coluna manual_charge_dispatches.status no WHERE sem qualificação —
  -- esta function nunca havia sido chamada por nenhum teste, então o bug
  -- nunca tinha se manifestado em execução. Corrigido com alias "d".
  UPDATE public.manual_charge_dispatches AS d
  SET status = 'needs_review_payment_claim', disposition_reason = p_reason
  WHERE d.id = p_dispatch_id AND d.claim_token = p_claim_token AND d.status = 'sending';

  IF FOUND THEN
    RETURN QUERY SELECT 'cancelled'::text;
  ELSE
    RETURN QUERY SELECT 'not_in_sending_state'::text;
  END IF;
END;
$$;

COMMENT ON FUNCTION public.cancel_claim IS
  'FASE A — usado pelo worker (Fase B) quando o Gate 2 lê desligado imediatamente antes do provider. Aqui, sem worker, existe só como mecanismo de reconciliação manual/futuro. WHERE status=''sending'' explícito: nunca corrompe um estado terminal.';

-- ═══════════════════════════════════════════════════════════════════════
-- 10b) reconcile_unknown_result — única saída controlada e auditável de
--      'unknown_result'. Sem capacidade de envio (nenhuma chamada de
--      rede). Nunca autoriza retry automático: 'reconciled_not_sent' só
--      volta a ficar clamável através de claim_charge_for_send, uma
--      chamada humana/futura separada, nunca desta function.
-- ═══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.reconcile_unknown_result(
  p_dispatch_id uuid,
  p_outcome text, -- 'sent' | 'not_sent' | 'needs_review'
  p_note text DEFAULT NULL
) RETURNS TABLE(status text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_org uuid;
  v_new_status text;
BEGIN
  IF p_outcome NOT IN ('sent', 'not_sent', 'needs_review') THEN
    RAISE EXCEPTION 'invalid_reconciliation_outcome' USING ERRCODE = 'P0007';
  END IF;

  -- Autorização SEMPRE checada antes de revelar existência/estado (achado
  -- real de revisão: a versão anterior filtrava por status='unknown_result'
  -- já na primeira consulta, então um dispatch existente em OUTRO estado
  -- e um dispatch inexistente produziam a MESMA resposta
  -- ('not_in_unknown_result_state'), mas um dispatch de OUTRA organização
  -- em unknown_result produzia uma exceção 42501 diferente — vazando,
  -- para quem não tem acesso, se o recurso existe e em qual estado).
  --
  -- ACHADO REAL DE EXECUÇÃO CONTRA POSTGRES (não pego por CREATE FUNCTION
  -- nem por nenhuma revisão estática anterior — a function compila e
  -- aplica normalmente; o erro só aparece ao EXECUTAR uma chamada
  -- autorizada que chega às consultas abaixo): `RETURNS TABLE(status
  -- text)` cria um parâmetro OUT chamado "status" no namespace PL/pgSQL
  -- desta function. Duas consultas abaixo referenciavam a coluna
  -- `status` de manual_charge_dispatches SEM qualificar a tabela,
  -- colidindo com esse OUT — SQLSTATE 42702 (ambiguous_column),
  -- reproduzido com um ator real autorizado. Corrigido com alias
  -- explícito "d" em toda referência de coluna desta tabela nesta
  -- function (inclusive id/organization_id, que não colidiam, por
  -- consistência e defesa em profundidade) — nunca renomeando a coluna
  -- de retorno "status" da assinatura pública da RPC, e nunca usando
  -- `#variable_conflict use_column/use_variable` (resolução permanece
  -- explícita no SQL, não uma diretiva de compilador silenciando a
  -- classe inteira do problema).
  SELECT d.organization_id INTO v_org
  FROM public.manual_charge_dispatches AS d
  WHERE d.id = p_dispatch_id
  FOR UPDATE;

  IF public.manual_charge_actor_authorized(v_org) IS NOT TRUE THEN
    RAISE EXCEPTION 'unauthorized_actor' USING ERRCODE = '42501';
  END IF;

  -- Só a partir daqui (autorizado, ou dispatch inexistente + super_admin)
  -- é seguro revelar se o estado real permite a reconciliação.
  IF NOT EXISTS (
    SELECT 1 FROM public.manual_charge_dispatches AS d
    WHERE d.id = p_dispatch_id AND d.status = 'unknown_result'
  ) THEN
    RETURN QUERY SELECT 'not_in_unknown_result_state'::text;
    RETURN;
  END IF;

  v_new_status := CASE p_outcome
    WHEN 'sent' THEN 'reconciled_sent'
    WHEN 'not_sent' THEN 'reconciled_not_sent'
    ELSE 'needs_review_reconciliation'
  END;

  -- Lado esquerdo do SET NUNCA é qualificado (é a coluna-alvo do UPDATE,
  -- não uma referência ambígua); WHERE usa o alias como as demais.
  UPDATE public.manual_charge_dispatches AS d
  SET status = v_new_status, disposition_reason = p_note
  WHERE d.id = p_dispatch_id AND d.status = 'unknown_result';

  RETURN QUERY SELECT v_new_status;
END;
$$;

COMMENT ON FUNCTION public.reconcile_unknown_result IS
  'FASE A — única RPC capaz de mover uma linha para fora de unknown_result. Administrativa (authenticated, papel admin/manager/super_admin da mesma organização), auditável (WHERE status explícito), sem chamada de rede. reconciled_not_sent NÃO autoriza retry automático — a linha só volta a ser clamável através de uma nova chamada explícita a claim_charge_for_send.';

REVOKE ALL ON FUNCTION public.reconcile_unknown_result(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reconcile_unknown_result(uuid, text, text) TO authenticated;

REVOKE ALL ON FUNCTION public.claim_charge_for_send(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_charge_for_send(uuid, text) TO service_role;
REVOKE ALL ON FUNCTION public.record_send_result(uuid, uuid, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_send_result(uuid, uuid, text, jsonb) TO service_role;
REVOKE ALL ON FUNCTION public.cancel_claim(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_claim(uuid, uuid, text) TO service_role;

-- ═══════════════════════════════════════════════════════════════════════
-- 11) manual_charge_evaluate — calcula TODOS os fatos independentes (sem
--     short-circuit entre eles, exceto integridade que interrompe só o
--     cálculo de pagamento), grava a fotografia em manual_charge_evaluations
--     e retorna a disposição pela precedência única de 12 níveis.
-- ═══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.manual_charge_evaluate(
  p_dispatch_id uuid
) RETURNS TABLE(disposition text, disposition_reason text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_lead RECORD;
  v_dispatch RECORD;

  v_fact_purchase_integrity_conflict boolean;
  v_fact_receipt_integrity_conflict boolean;
  v_fact_integrity_conflict boolean;
  v_fact_purchase_recognized boolean;

  v_fact_suppression_permanent_reason text;
  v_fact_suppression_candidate boolean;
  v_fact_suppression_review_reason text;

  v_fact_human_hold boolean;
  v_fact_human_inconsistent boolean;

  v_fact_payment_claim_status text;

  v_fact_receipt_state text;

  v_disposition text;
  v_reason text;
  v_facts jsonb;
  v_updated_id uuid;
  v_current_status text;
BEGIN
  SELECT * INTO v_dispatch FROM public.manual_charge_dispatches WHERE id = p_dispatch_id;
  IF v_dispatch IS NULL THEN
    RAISE EXCEPTION 'dispatch_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_dispatch.status NOT IN ('eligible', 'hold_receipt_review', 'hold_human', 'hold_connection',
      'needs_review_integrity', 'needs_review_human_state', 'needs_review_payment_claim',
      'needs_review_suppression', 'needs_review_receipt', 'hold_suppression_review',
      'reconciled_not_sent', 'needs_review_reconciliation') THEN
    -- estado terminal ou em voo: não reavaliar
    RETURN QUERY SELECT v_dispatch.status, 'no_longer_evaluable'::text;
    RETURN;
  END IF;

  SELECT * INTO v_lead FROM public.leads WHERE id = v_dispatch.lead_id;

  -- ── Integridade de purchase_audit (tabela-verdade v5.1/v5.2, aprovada) ──
  WITH candidate_purchase AS (
    SELECT pa.*, wc.id AS wc_id, wc.organization_id AS wc_organization_id, wc.lead_id AS wc_lead_id
    FROM public.purchase_audit pa
    LEFT JOIN public.webchat_conversations wc ON wc.id = pa.conversation_id
    WHERE pa.lead_id = v_dispatch.lead_id OR wc.lead_id = v_dispatch.lead_id
  )
  SELECT COALESCE(bool_or(
    (cp.lead_id IS NOT NULL AND cp.conversation_id IS NOT NULL AND (
      cp.wc_id IS NULL
      OR cp.wc_organization_id IS DISTINCT FROM v_lead.organization_id
      OR cp.wc_lead_id IS DISTINCT FROM cp.lead_id
    ))
    OR (cp.lead_id IS NULL AND cp.conversation_id IS NOT NULL AND (
      cp.wc_id IS NULL
      OR cp.wc_organization_id IS DISTINCT FROM v_lead.organization_id
      OR cp.wc_lead_id IS DISTINCT FROM v_dispatch.lead_id
    ))
    OR (cp.lead_id = v_dispatch.lead_id AND cp.wc_lead_id IS NOT NULL AND cp.wc_lead_id IS DISTINCT FROM v_dispatch.lead_id)
    OR (cp.wc_lead_id = v_dispatch.lead_id AND cp.lead_id IS NOT NULL AND cp.lead_id IS DISTINCT FROM v_dispatch.lead_id)
  ), false)
  INTO v_fact_purchase_integrity_conflict
  FROM candidate_purchase cp;

  -- ── Integridade de ai_receipt_audits (tabela-verdade v5.3/v5.4, aprovada) ──
  WITH candidate_rows AS (
    SELECT ra.*, wc.id AS wc_id, wc.organization_id AS wc_organization_id, wc.lead_id AS wc_lead_id
    FROM public.ai_receipt_audits ra
    LEFT JOIN public.webchat_conversations wc ON wc.id = ra.conversation_id
    WHERE ra.lead_id = v_dispatch.lead_id
       OR (ra.conversation_id IS NOT NULL AND wc.lead_id = v_dispatch.lead_id)
  )
  SELECT COALESCE(
    bool_or(cr.lead_id IS NOT NULL AND cr.lead_id = v_dispatch.lead_id
            AND cr.organization_id IS NOT NULL
            AND cr.organization_id IS DISTINCT FROM v_lead.organization_id)
    OR bool_or(cr.lead_id IS NOT NULL AND cr.lead_id = v_dispatch.lead_id
            AND cr.organization_id IS NULL
            AND NOT (cr.conversation_id IS NOT NULL AND cr.wc_id IS NOT NULL))
    OR bool_or(cr.lead_id IS NOT NULL AND cr.lead_id IS DISTINCT FROM v_dispatch.lead_id)
    OR bool_or(cr.lead_id IS NOT NULL
            AND NOT EXISTS (SELECT 1 FROM public.leads l WHERE l.id = cr.lead_id))
    OR bool_or(cr.conversation_id IS NOT NULL AND cr.wc_id IS NULL)
    OR bool_or(cr.wc_id IS NOT NULL AND cr.wc_organization_id IS DISTINCT FROM v_lead.organization_id)
    OR bool_or(cr.wc_id IS NOT NULL AND cr.wc_lead_id IS NULL)
    OR bool_or(cr.wc_id IS NOT NULL AND cr.wc_lead_id IS NOT NULL AND cr.wc_lead_id IS DISTINCT FROM v_dispatch.lead_id)
  , false)
  INTO v_fact_receipt_integrity_conflict
  FROM candidate_rows cr;

  v_fact_integrity_conflict := v_fact_purchase_integrity_conflict OR v_fact_receipt_integrity_conflict;

  v_fact_purchase_recognized := false;
  IF NOT v_fact_integrity_conflict THEN
    SELECT EXISTS (
      SELECT 1
      FROM public.purchase_audit pa
      LEFT JOIN public.webchat_conversations wc ON wc.id = pa.conversation_id
      WHERE pa.purchase_status IN ('success', 'recognized')
        AND (
          (pa.lead_id = v_dispatch.lead_id AND pa.conversation_id IS NULL)
          OR (pa.lead_id IS NULL AND pa.conversation_id IS NOT NULL
              AND wc.organization_id = v_lead.organization_id AND wc.lead_id = v_dispatch.lead_id)
          OR (pa.lead_id = v_dispatch.lead_id AND pa.conversation_id IS NOT NULL
              AND wc.id IS NOT NULL AND wc.lead_id = pa.lead_id AND wc.organization_id = v_lead.organization_id)
        )
    ) INTO v_fact_purchase_recognized;
  END IF;

  -- ── Comprovante (ai_receipt_audits) como sinal não-autoritativo — nunca produz paid ──
  v_fact_receipt_state := 'none';
  IF NOT v_fact_integrity_conflict THEN
    SELECT CASE
      WHEN bool_or(identified = true OR route = 'red' OR decision ILIKE '%dedup%') THEN 'rejected_or_duplicate'
      WHEN bool_or(identified IS NULL AND route IS DISTINCT FROM 'red' AND (decision IS NULL OR decision NOT ILIKE '%dedup%')) THEN 'pending'
      ELSE 'none'
    END INTO v_fact_receipt_state
    FROM public.ai_receipt_audits
    WHERE lead_id = v_dispatch.lead_id;
    v_fact_receipt_state := COALESCE(v_fact_receipt_state, 'none');
  END IF;

  -- ── Opt-out estruturado ──
  SELECT reason INTO v_fact_suppression_permanent_reason
  FROM public.manual_charge_suppressions
  WHERE organization_id = v_dispatch.organization_id
    AND phone_normalized = v_lead.phone
    AND status = 'confirmed'
    AND reason IN ('stop_contact', 'wrong_number', 'product_decline')
    AND (
      scope = 'all_contact'
      OR (scope = 'product' AND product_ref = v_dispatch.campaign_key)
      OR (scope = 'campaign' AND campaign_key = v_dispatch.campaign_key)
    )
  LIMIT 1;

  SELECT EXISTS (
    SELECT 1 FROM public.manual_charge_suppressions
    WHERE organization_id = v_dispatch.organization_id
      AND phone_normalized = v_lead.phone
      AND status = 'candidate'
      AND (
        scope = 'all_contact'
        OR (scope = 'product' AND product_ref = v_dispatch.campaign_key)
        OR (scope = 'campaign' AND campaign_key = v_dispatch.campaign_key)
      )
  ) INTO v_fact_suppression_candidate;

  SELECT reason INTO v_fact_suppression_review_reason
  FROM public.manual_charge_suppressions
  WHERE organization_id = v_dispatch.organization_id
    AND phone_normalized = v_lead.phone
    AND status = 'confirmed'
    AND reason IN ('temporary_decline', 'complaint', 'ambiguous')
    AND (
      scope = 'all_contact'
      OR (scope = 'product' AND product_ref = v_dispatch.campaign_key)
      OR (scope = 'campaign' AND campaign_key = v_dispatch.campaign_key)
    )
  LIMIT 1;

  -- ── Atendimento humano ──
  SELECT
    bool_or((assigned_user_id IS NOT NULL AND current_agent_id IS NOT NULL AND status = 'bot_active')) AS inconsistent,
    bool_or(assigned_user_id IS NOT NULL OR status IN ('human_active', 'waiting_human')) AS holding
  INTO v_fact_human_inconsistent, v_fact_human_hold
  FROM public.webchat_conversations
  WHERE lead_id = v_dispatch.lead_id AND organization_id = v_dispatch.organization_id;
  v_fact_human_inconsistent := COALESCE(v_fact_human_inconsistent, false);
  v_fact_human_hold := COALESCE(v_fact_human_hold, false);

  -- ── payment_claimed (fato por-cobrança, nunca bloqueio global) ──
  SELECT pcs.current_status INTO v_fact_payment_claim_status
  FROM public.payment_claim_events ce
  JOIN public.payment_claim_current_status pcs ON pcs.claim_event_id = ce.id
  WHERE ce.manual_charge_dispatch_id = p_dispatch_id
  ORDER BY ce.created_at DESC
  LIMIT 1;

  -- ── Precedência única (12 níveis) ──
  IF v_fact_integrity_conflict THEN
    v_disposition := 'needs_review_integrity'; v_reason := 'integrity_conflict';
  ELSIF v_fact_purchase_recognized THEN
    v_disposition := 'paid'; v_reason := 'has_purchase';
  ELSIF v_fact_suppression_permanent_reason IS NOT NULL THEN
    v_disposition := 'cancelled_permanent'; v_reason := v_fact_suppression_permanent_reason || '_confirmed';
  ELSIF v_fact_suppression_candidate THEN
    v_disposition := 'hold_suppression_review'; v_reason := 'suppression_candidate_pending';
  ELSIF v_fact_human_inconsistent THEN
    v_disposition := 'needs_review_human_state'; v_reason := 'human_state_inconsistent';
  ELSIF v_fact_payment_claim_status = 'confirmed_paid' THEN
    v_disposition := 'cancelled_permanent'; v_reason := 'payment_claimed_confirmed';
  ELSIF v_fact_payment_claim_status IN ('pending_reconciliation', 'needs_review') THEN
    v_disposition := 'needs_review_payment_claim'; v_reason := 'payment_claimed_' || v_fact_payment_claim_status;
  ELSIF v_fact_suppression_review_reason IS NOT NULL THEN
    v_disposition := 'needs_review_suppression'; v_reason := 'suppression_candidate:' || v_fact_suppression_review_reason;
  ELSIF v_fact_receipt_state = 'rejected_or_duplicate' THEN
    v_disposition := 'needs_review_receipt'; v_reason := 'receipt_rejected_or_duplicate';
  ELSIF v_fact_human_hold THEN
    v_disposition := 'hold_human'; v_reason := 'human_active';
  ELSIF v_fact_receipt_state = 'pending' THEN
    v_disposition := 'hold_receipt_review'; v_reason := 'receipt_pending';
  ELSE
    v_disposition := 'eligible'; v_reason := NULL;
  END IF;

  v_facts := jsonb_build_object(
    'integrity_conflict', v_fact_integrity_conflict,
    'purchase_recognized', v_fact_purchase_recognized,
    'suppression_permanent_reason', v_fact_suppression_permanent_reason,
    'suppression_candidate', v_fact_suppression_candidate,
    'suppression_review_reason', v_fact_suppression_review_reason,
    'human_inconsistent', v_fact_human_inconsistent,
    'human_hold', v_fact_human_hold,
    'payment_claim_status', v_fact_payment_claim_status,
    'receipt_state', v_fact_receipt_state
  );

  -- Corrida corrigida (achado real de revisão): a UPDATE condicional roda
  -- PRIMEIRO, com RETURNING — só se ela realmente afetar a linha (nenhuma
  -- outra transação mudou o status entre a leitura no início desta
  -- function e agora) é que a fotografia de auditoria é gravada. Antes, a
  -- ordem era inversa: a fotografia era gravada mesmo quando a UPDATE
  -- acabava afetando zero linhas, fazendo a RPC retornar uma disposição
  -- "aplicada" que na verdade não foi.
  UPDATE public.manual_charge_dispatches
  SET status = v_disposition, disposition_reason = v_reason
  WHERE id = p_dispatch_id
    AND status IN ('eligible', 'hold_receipt_review', 'hold_human', 'hold_connection',
      'needs_review_integrity', 'needs_review_human_state', 'needs_review_payment_claim',
      'needs_review_suppression', 'needs_review_receipt', 'hold_suppression_review',
      'reconciled_not_sent', 'needs_review_reconciliation')
  RETURNING id INTO v_updated_id;

  IF v_updated_id IS NULL THEN
    -- Outra transação mudou o status entre a leitura e agora (ex.:
    -- claim_charge_for_send venceu a corrida). Não grava a fotografia
    -- como se tivesse sido aplicada; devolve o estado real atual.
    SELECT status INTO v_current_status FROM public.manual_charge_dispatches WHERE id = p_dispatch_id;
    RETURN QUERY SELECT v_current_status, 'concurrent_state_change'::text;
    RETURN;
  END IF;

  INSERT INTO public.manual_charge_evaluations
    (manual_charge_dispatch_id, organization_id, decision_matrix_version, disposition, disposition_reason, facts)
  VALUES (p_dispatch_id, v_dispatch.organization_id, 'phase-a-v1', v_disposition, v_reason, v_facts);

  RETURN QUERY SELECT v_disposition, v_reason;
END;
$$;

COMMENT ON FUNCTION public.manual_charge_evaluate IS
  'FASE A — calcula todos os fatos independentes (sem short-circuit entre eles, exceto o conflito de integridade que interrompe só o cálculo de pagamento) e aplica a precedência única de 12 níveis. Nunca apaga/altera uma linha de manual_charge_suppressions como efeito colateral.';

REVOKE ALL ON FUNCTION public.manual_charge_evaluate(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.manual_charge_evaluate(uuid) TO service_role;

-- ═══════════════════════════════════════════════════════════════════════
-- 12) Grant de leitura da view derivada (RLS das tabelas subjacentes já
--     protege; a view em si não expõe nada que a policy não filtre).
-- ═══════════════════════════════════════════════════════════════════════

REVOKE ALL ON public.payment_claim_current_status FROM PUBLIC, anon;
GRANT SELECT ON public.payment_claim_current_status TO authenticated, service_role;

-- ═══════════════════════════════════════════════════════════════════════
-- 13) Proteção explícita de histórico de cobrança em leads.leads —
--     achado real de revisão: a FK composta de manual_charge_dispatches
--     para leads foi trocada de ON DELETE CASCADE para RESTRICT (ver
--     seção 2 acima) para impedir que excluir um lead apague o histórico
--     financeiro em cascata. Mas RESTRICT sozinho só produz um
--     foreign_key_violation (23503) genérico, com o nome interno da
--     constraint na mensagem — não um erro estável e previsível para
--     quem chama a exclusão (ex.: `public.delete_lead_cascade`, função
--     já existente no projeto, não tocada por esta migration).
--
--     Este trigger BEFORE DELETE roda ANTES de qualquer FK RESTRICT ser
--     avaliada e, se o lead tiver histórico protegido em QUALQUER uma das
--     4 tabelas desta Fase A com FK direta para leads (as únicas 4 —
--     confirmado por grep de "REFERENCES public.leads" nesta migration:
--     manual_charge_dispatches, payment_claim_events,
--     manual_charge_payment_claim_reviews, payment_claim_intake — as
--     demais tabelas da Fase A só referenciam essas 4, nunca leads
--     diretamente), levanta um erro ÚNICO e ESTÁVEL
--     (lead_has_protected_billing_history, SQLSTATE dedicado P0011), sem
--     revelar QUAL das 4 tabelas tem a linha nem a QUE organização ela
--     pertence — apenas que o lead tem histórico protegido.
--
--     ESCOPO EXPLICITAMENTE LIMITADO (decisão desta rodada, não uma
--     omissão): `public.delete_lead_cascade` (definida em
--     supabase/migrations/20260805040000_...sql, ~40 tabelas de outros
--     módulos não relacionados a cobrança manual) NÃO é alterada aqui.
--     Ela vai continuar limpando as ~40 tabelas que já conhece e, ao
--     chegar na exclusão da linha em `public.leads`, vai agora receber este erro
--     estável em vez de um foreign_key_violation genérico — mas nenhuma
--     revisão foi feita sobre se ela já limpa corretamente TODAS as
--     tabelas de outros módulos (fora do escopo desta Fase A). Qualquer
--     ajuste em delete_lead_cascade em si (ex.: capturar este erro e
--     traduzir para uma mensagem amigável na UI, ou permitir "arquivar em
--     vez de excluir" quando há histórico protegido) é um BLOQUEADOR DE
--     INTEGRAÇÃO reportado nesta entrega, não implementado
--     unilateralmente — ver relatório de entrega para a especificação
--     concreta proposta.
-- ═══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.leads_protect_billing_history()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.manual_charge_dispatches WHERE lead_id = OLD.id)
     OR EXISTS (SELECT 1 FROM public.payment_claim_events WHERE lead_id = OLD.id)
     OR EXISTS (SELECT 1 FROM public.manual_charge_payment_claim_reviews WHERE lead_id = OLD.id)
     OR EXISTS (SELECT 1 FROM public.payment_claim_intake WHERE lead_id = OLD.id)
  THEN
    RAISE EXCEPTION 'lead_has_protected_billing_history' USING ERRCODE = 'P0011';
  END IF;
  RETURN OLD;
END;
$$;

COMMENT ON FUNCTION public.leads_protect_billing_history IS
  'FASE A — erro estável e único (lead_has_protected_billing_history, P0011) antes de qualquer FK RESTRICT genérica disparar. Não revela qual tabela nem qual organização tem a linha protegida — apenas que existe histórico. Não altera public.delete_lead_cascade; ela recebe este erro ao tentar excluir a linha de leads, mas suas ~40 tabelas de outros módulos não foram revisadas aqui.';

REVOKE ALL ON FUNCTION public.leads_protect_billing_history() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.leads_protect_billing_history() TO service_role;

DROP TRIGGER IF EXISTS leads_protect_billing_history_trg ON public.leads;
CREATE TRIGGER leads_protect_billing_history_trg
  BEFORE DELETE ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.leads_protect_billing_history();

-- LIMITAÇÃO CONHECIDA, DOCUMENTADA (achado real de revisão, não corrigido
-- nesta rodada por exigir alterar um GRANT compartilhado, fora do escopo
-- desta migration): triggers ROW-level, como esta, disparam por exclusão
-- linha a linha, mas NÃO disparam para o comando de esvaziamento em lote
-- de uma tabela inteira (o comando SQL de "truncar", sinônimo de apagar
-- todas as linhas de uma vez sem passar por trigger de linha).
-- `GRANT ALL ON public.leads TO service_role`
-- (supabase/migrations/20260609185608_...sql) já concede esse privilégio
-- a service_role hoje, independente desta migration. Nenhum caminho de
-- código conhecido usa esse comando em leads (aplicação e
-- delete_lead_cascade sempre usam exclusão linha a linha), mas uma
-- execução direta desse tipo (psql/SQL editor/futura automação com a
-- service_role key) contornaria esta proteção sem passar por nenhum
-- RAISE. Mitigação real exigiria revogar esse privilégio de service_role
-- em leads (avaliar impacto em outros fluxos que dependem de GRANT ALL
-- antes de restringir) e/ou uma trigger adicional de nível de instrução
-- para esse mesmo comando — reportado como bloqueador de integração
-- separado, não implementado unilateralmente aqui por alterar um GRANT
-- que não é específico da Fase A.
