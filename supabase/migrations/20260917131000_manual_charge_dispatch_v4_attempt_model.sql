-- ═══════════════════════════════════════════════════════════════════════
-- Manual charge dispatch — modelo de attempts (v4)
--
-- Implementa, sobre o schema da Fase A (20260915120000), a proposta de
-- design v4 revisada e aprovada com ressalvas (ver histórico desta
-- tarefa): identidade imutável de tentativa separada do dispatch,
-- fronteira objetiva do provider, lock advisory único global, outbox
-- transacional sem consumidor real.
--
-- ESCOPO EXPLICITAMENTE LIMITADO (autorização do usuário para esta
-- passagem): schema, RPCs, testes e documentação LOCAL. Esta migration
-- NÃO implementa nem habilita: consumidor da outbox, publicação em
-- BullMQ/Redis, chamada HTTP a qualquer provider, envio real de
-- mensagem, ou qualquer conexão de rede. A Fase A permanece
-- estruturalmente incapaz de enviar WhatsApp — nenhuma função criada ou
-- alterada aqui chama qualquer API externa.
-- ═══════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════
-- 1) manual_charge_dispatches — coluna de ponteiro para a tentativa ativa
--    e novo estado terminal-intermediário para cancelamento pós-fronteira.
-- ═══════════════════════════════════════════════════════════════════════

ALTER TABLE public.manual_charge_dispatches
  ADD COLUMN active_attempt_id uuid;

-- Novo valor de status, ÚNICO acrescentado nesta migration: representa
-- especificamente "cancelamento solicitado depois que a fronteira do
-- provider pode ter sido cruzada" — NUNCA reaproveita
-- needs_review_payment_claim (que continua significando exclusivamente
-- disputa de pagamento, sem ambiguidade). Excluído estruturalmente da
-- lista evaluable de manual_charge_evaluate (ver seção 6).
ALTER TABLE public.manual_charge_dispatches
  DROP CONSTRAINT manual_charge_dispatches_status_check;

ALTER TABLE public.manual_charge_dispatches
  ADD CONSTRAINT manual_charge_dispatches_status_check CHECK (status IN (
    'eligible',
    'hold_receipt_review', 'hold_human', 'hold_connection', 'hold_suppression_review',
    'needs_review_integrity', 'needs_review_human_state', 'needs_review_payment_claim',
    'needs_review_suppression', 'needs_review_receipt',
    'cancelled_permanent', 'paid',
    'sending', 'sent', 'failed', 'unknown_result',
    'reconciled_sent', 'reconciled_not_sent', 'needs_review_reconciliation',
    'needs_review_uncertain_send'
  ));

COMMENT ON COLUMN public.manual_charge_dispatches.active_attempt_id IS
  'v4 — aponta para a tentativa (manual_charge_send_attempts) atualmente em voo, se houver. NULL quando não há tentativa ativa. Protegido por FK composta (organization_id, id, active_attempt_id) contra manual_charge_send_attempts (organization_id, dispatch_id, attempt_id) — garante que, quando não-nulo, sempre aponta para um attempt que realmente pertence a esta organização E a este dispatch, nunca a outro.';

-- ═══════════════════════════════════════════════════════════════════════
-- 2) manual_charge_send_attempts — identidade imutável de tentativa.
--    No máximo um attempt "ativo" por dispatch é garantido pela própria
--    natureza de active_attempt_id ser uma única coluna (não um
--    conjunto) — nunca mais de um attempt pode ser simultaneamente "o
--    apontado" por um dado dispatch.
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE public.manual_charge_send_attempts (
  attempt_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dispatch_id uuid NOT NULL,
  organization_id uuid NOT NULL,
  -- UNIQUE global: nenhum outro attempt, de nenhum dispatch, pode reusar
  -- o mesmo claim_token — é a chave de correlação apresentada pelo
  -- worker em mark_provider_boundary.
  claim_token uuid NOT NULL,
  attempt_state text NOT NULL DEFAULT 'claimed_not_started' CHECK (attempt_state IN (
    'claimed_not_started',
    'provider_call_may_have_started',
    'sent_confirmed',
    'not_sent_confirmed',
    'unknown_result',
    'released_not_started',
    'cancel_requested_after_provider',
    'conflicting_results'
  )),
  claimed_by text NOT NULL,
  claimed_at timestamptz NOT NULL DEFAULT now(),
  -- NULL até o worker confirmar, numa transação própria e curta, ANTES
  -- de qualquer request HTTP, que a chamada ao provider PODE ter
  -- começado (ver mark_provider_boundary). Uma vez preenchido, nunca é
  -- limpo — é o fato objetivo e binário que substitui qualquer
  -- inferência sobre "o que pode ter acontecido depois do request".
  provider_boundary_at timestamptz,
  -- NULL enquanto o attempt está em qualquer estado não-terminal.
  -- Preenchido exatamente quando attempt_state se torna
  -- released_not_started (ver release/cancel). sent_confirmed é
  -- absorvente por si só (trigger abaixo) e não depende de closed_at.
  closed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),

  UNIQUE (claim_token),
  UNIQUE (organization_id, attempt_id),
  UNIQUE (organization_id, dispatch_id, attempt_id),

  FOREIGN KEY (organization_id, dispatch_id)
    REFERENCES public.manual_charge_dispatches (organization_id, id) ON DELETE RESTRICT
);

CREATE INDEX manual_charge_send_attempts_dispatch_idx
  ON public.manual_charge_send_attempts (dispatch_id);

COMMENT ON TABLE public.manual_charge_send_attempts IS
  'v4 — identidade imutável de tentativa de envio, separada do dispatch. attempt_id nunca é reutilizado; claim_token é único globalmente. attempt_state e provider_boundary_at nunca retrocedem (ver trigger de absorção abaixo). Sem capacidade de envio real — nenhuma função desta migration chama rede.';

REVOKE ALL ON public.manual_charge_send_attempts FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.manual_charge_send_attempts TO service_role;
ALTER TABLE public.manual_charge_send_attempts ENABLE ROW LEVEL SECURITY;

-- FK composta agora que manual_charge_send_attempts existe (referencia
-- para trás, do dispatch para o attempt "ativo" — não há ciclo de
-- constraint impossível de aplicar: a linha do dispatch já existe com
-- active_attempt_id NULL antes de qualquer attempt ser criado; o UPDATE
-- que preenche active_attempt_id só roda DEPOIS que a linha do attempt
-- já foi inserida na mesma transação, então a FK sempre encontra o alvo
-- já commitado-na-transação-corrente).
-- DEFERRABLE INITIALLY DEFERRED: necessário porque claim_charge_for_send
-- faz o UPDATE que preenche active_attempt_id ANTES do INSERT do
-- attempt (a ordem inversa criaria um attempt órfão sempre que o gate
-- de claim falhasse) — sem isto, a FK seria verificada
-- estatement-a-statement e falharia entre os dois passos da MESMA
-- transação. Verificação real acontece no COMMIT, quando ambas as
-- linhas já existem — nunca fica permanentemente inconsistente.
ALTER TABLE public.manual_charge_dispatches
  ADD CONSTRAINT manual_charge_dispatches_active_attempt_fkey
  FOREIGN KEY (organization_id, id, active_attempt_id)
  REFERENCES public.manual_charge_send_attempts (organization_id, dispatch_id, attempt_id)
  DEFERRABLE INITIALLY DEFERRED;

-- Trigger de absorção: nenhuma linha pode sair de sent_confirmed ou de
-- released_not_started uma vez que os alcançou (defesa em profundidade
-- além da lógica das RPCs — mesmo um bug futuro numa function não
-- consegue reverter estes dois estados).
CREATE OR REPLACE FUNCTION public.manual_charge_send_attempts_enforce_absorbing_states()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $$
BEGIN
  IF OLD.attempt_state = 'sent_confirmed' AND NEW.attempt_state <> 'sent_confirmed' THEN
    RAISE EXCEPTION 'attempt_state sent_confirmed é absorvente, nunca pode ser revertido' USING ERRCODE = 'P0012';
  END IF;
  -- released_not_started é terminal para qualquer transição EXCETO uma:
  -- um resultado real e tardio de sent_confirmed chegando depois de um
  -- release que, retrospectivamente, se revela incorreto (a "prova
  -- técnica de não-envio" usada para liberar era falível -- ver proposta
  -- v4 seção 8, "callback tardio depois da liberação": sent_confirmed
  -- NUNCA pode ser perdido, mesmo quando contradiz um release já
  -- concedido). Qualquer OUTRA transição para fora de
  -- released_not_started continua bloqueada.
  IF OLD.attempt_state = 'released_not_started'
     AND NEW.attempt_state NOT IN ('released_not_started', 'sent_confirmed') THEN
    RAISE EXCEPTION 'attempt_state released_not_started só pode avançar para sent_confirmed (resultado tardio contraditório), nunca para outro estado' USING ERRCODE = 'P0013';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER manual_charge_send_attempts_absorbing_trg
  BEFORE UPDATE ON public.manual_charge_send_attempts
  FOR EACH ROW EXECUTE FUNCTION public.manual_charge_send_attempts_enforce_absorbing_states();

-- ═══════════════════════════════════════════════════════════════════════
-- 3) manual_charge_send_attempt_events — ledger append-only. Nenhum papel
--    (nem service_role) recebe UPDATE/DELETE — só INSERT, através das
--    RPCs SECURITY DEFINER desta migration. Trigger de defesa em
--    profundidade rejeita qualquer UPDATE/DELETE mesmo que alguém tente
--    via superusuário/owner por engano.
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE public.manual_charge_send_attempt_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_id uuid NOT NULL,
  organization_id uuid NOT NULL,
  event_seq integer NOT NULL,
  event_kind text NOT NULL CHECK (event_kind IN (
    'attempt_created',
    'provider_boundary_crossed',
    'cancel_requested',
    'release_granted',
    'release_denied',
    'result_sent_confirmed',
    'result_not_sent_confirmed',
    'result_unknown',
    'result_conflicting'
  )),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  recorded_at timestamptz NOT NULL DEFAULT now(),

  UNIQUE (attempt_id, event_seq),

  FOREIGN KEY (organization_id, attempt_id)
    REFERENCES public.manual_charge_send_attempts (organization_id, attempt_id) ON DELETE RESTRICT
);

CREATE INDEX manual_charge_send_attempt_events_attempt_idx
  ON public.manual_charge_send_attempt_events (attempt_id);

COMMENT ON TABLE public.manual_charge_send_attempt_events IS
  'v4 — ledger append-only puro por attempt. Nunca UPDATE/DELETE (ver trigger). event_seq é monotônico por attempt_id, calculado sob o mesmo advisory lock que protege as RPCs desta migration.';

REVOKE ALL ON public.manual_charge_send_attempt_events FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.manual_charge_send_attempt_events TO service_role;
ALTER TABLE public.manual_charge_send_attempt_events ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.manual_charge_send_attempt_events_forbid_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $$
BEGIN
  RAISE EXCEPTION 'manual_charge_send_attempt_events é append-only — UPDATE/DELETE nunca são permitidos' USING ERRCODE = 'P0014';
END;
$$;

CREATE TRIGGER manual_charge_send_attempt_events_forbid_update_trg
  BEFORE UPDATE ON public.manual_charge_send_attempt_events
  FOR EACH ROW EXECUTE FUNCTION public.manual_charge_send_attempt_events_forbid_mutation();

CREATE TRIGGER manual_charge_send_attempt_events_forbid_delete_trg
  BEFORE DELETE ON public.manual_charge_send_attempt_events
  FOR EACH ROW EXECUTE FUNCTION public.manual_charge_send_attempt_events_forbid_mutation();

-- ═══════════════════════════════════════════════════════════════════════
-- 4) manual_charge_send_jobs_outbox — outbox transacional, SEM consumidor
--    real nesta fase. Nenhuma função criada nesta migration lê BullMQ,
--    Redis ou qualquer fila — a tabela existe apenas para que a criação
--    do attempt seja atômica com a intenção de publicação, preparando o
--    terreno para um worker futuro (fora do escopo autorizado agora).
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE public.manual_charge_send_jobs_outbox (
  attempt_id uuid PRIMARY KEY,
  dispatch_id uuid NOT NULL,
  organization_id uuid NOT NULL,
  -- Chave idempotente própria da outbox (independente do claim_token) —
  -- um futuro publicador a usaria como deduplicação do lado do
  -- consumidor de fila, se necessário. Não tem nenhum uso nesta fase.
  idempotency_key uuid NOT NULL DEFAULT gen_random_uuid(),
  enqueued_at timestamptz NOT NULL DEFAULT now(),
  leased_by text,
  leased_until timestamptz,
  published_at timestamptz,

  FOREIGN KEY (organization_id, attempt_id)
    REFERENCES public.manual_charge_send_attempts (organization_id, attempt_id) ON DELETE RESTRICT
);

COMMENT ON TABLE public.manual_charge_send_jobs_outbox IS
  'v4 — outbox transacional sem consumidor nesta fase. UNIQUE(attempt_id) garante exatamente uma linha lógica por attempt, mesmo sob tentativas de republicação. leased_by/leased_until são um padrão de lease para um futuro publicador — não têm nenhuma implementação de worker associada aqui.';

REVOKE ALL ON public.manual_charge_send_jobs_outbox FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.manual_charge_send_jobs_outbox TO service_role;
ALTER TABLE public.manual_charge_send_jobs_outbox ENABLE ROW LEVEL SECURITY;

-- ═══════════════════════════════════════════════════════════════════════
-- 5) claim_charge_for_send — corrigida para criar o attempt +
--    active_attempt_id + linha de outbox atomicamente, na MESMA
--    transação e sob o MESMO advisory lock que já usava.
-- ═══════════════════════════════════════════════════════════════════════

-- CREATE OR REPLACE não permite mudar o tipo de retorno (colunas OUT) de
-- uma function existente — precisa de DROP explícito primeiro. Todas as
-- outras functions desta migration mantêm os mesmos tipos de parâmetro
-- e retorno da Fase A (só mudam nomes de parâmetro e corpo), então não
-- precisam de DROP.
DROP FUNCTION public.claim_charge_for_send(uuid, text);

CREATE FUNCTION public.claim_charge_for_send(
  p_dispatch_id uuid,
  p_actor text
) RETURNS TABLE(status text, claim_token uuid, attempt_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_dispatch_org uuid;
  v_token uuid;
  v_attempt_id uuid;
  v_updated_status text;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_dispatch_id::text, 0));

  SELECT d.organization_id INTO v_dispatch_org
  FROM public.manual_charge_dispatches AS d WHERE d.id = p_dispatch_id;

  IF v_dispatch_org IS NULL THEN
    RETURN QUERY SELECT 'not_found'::text, NULL::uuid, NULL::uuid;
    RETURN;
  END IF;

  v_token := gen_random_uuid();
  v_attempt_id := gen_random_uuid();

  -- v4: active_attempt_id IS NULL entra no gate — defesa em profundidade
  -- além do status IN (...): mesmo que um bug futuro deixasse o status
  -- em 'eligible'/'reconciled_not_sent' com um attempt ainda ativo
  -- (não deveria ser possível por construção), este gate adicional
  -- ainda bloquearia um segundo claim.
  UPDATE public.manual_charge_dispatches AS d
  SET status = 'sending', claim_token = v_token, claimed_by = p_actor, claimed_at = now(),
      active_attempt_id = v_attempt_id
  WHERE d.id = p_dispatch_id
    AND d.status IN ('eligible', 'reconciled_not_sent')
    AND d.active_attempt_id IS NULL
    AND (SELECT enabled FROM public.recovery_feature_flags
         WHERE key = 'manual_charge_dispatch_claim_enabled') IS TRUE;

  IF FOUND THEN
    INSERT INTO public.manual_charge_send_attempts
      (attempt_id, dispatch_id, organization_id, claim_token, attempt_state, claimed_by, claimed_at)
    VALUES (v_attempt_id, p_dispatch_id, v_dispatch_org, v_token, 'claimed_not_started', p_actor, now());

    INSERT INTO public.manual_charge_send_attempt_events
      (attempt_id, organization_id, event_seq, event_kind, payload)
    VALUES (v_attempt_id, v_dispatch_org, 1, 'attempt_created', jsonb_build_object('claimed_by', p_actor));

    INSERT INTO public.manual_charge_send_jobs_outbox (attempt_id, dispatch_id, organization_id)
    VALUES (v_attempt_id, p_dispatch_id, v_dispatch_org);

    RETURN QUERY SELECT 'sending'::text, v_token, v_attempt_id;
    RETURN;
  END IF;

  SELECT d.status INTO v_updated_status FROM public.manual_charge_dispatches AS d WHERE d.id = p_dispatch_id;

  IF v_updated_status = 'sending' THEN
    RETURN QUERY SELECT 'already_sending'::text, NULL::uuid, NULL::uuid;
  ELSIF v_updated_status IN ('eligible', 'reconciled_not_sent') THEN
    RETURN QUERY SELECT 'claim_disabled'::text, NULL::uuid, NULL::uuid;
  ELSE
    RETURN QUERY SELECT ('not_eligible_' || v_updated_status)::text, NULL::uuid, NULL::uuid;
  END IF;
END;
$$;

COMMENT ON FUNCTION public.claim_charge_for_send IS
  'v4 — cria o attempt + active_attempt_id + linha de outbox atomicamente, na mesma transação do claim. Ainda FASE A: nenhuma chamada de rede, sem consumidor de outbox.';

-- ═══════════════════════════════════════════════════════════════════════
-- 6) mark_provider_boundary — fronteira objetiva. Chamada exclusivamente
--    por um futuro worker, ANTES de qualquer request HTTP (não
--    implementado nesta migration). Só retorna o attempt_id quando
--    EXATAMENTE uma linha foi alterada.
-- ═══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.mark_provider_boundary(
  p_dispatch_id uuid,
  p_attempt_id uuid,
  p_claim_token uuid
) RETURNS TABLE(attempt_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_org uuid;
  v_updated_attempt uuid;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_dispatch_id::text, 0));

  SELECT d.organization_id INTO v_org FROM public.manual_charge_dispatches AS d WHERE d.id = p_dispatch_id;
  IF v_org IS NULL THEN
    RETURN;
  END IF;

  -- Transição atômica única: SET attempt_state (para um valor DIFERENTE
  -- de claimed_not_started) + provider_boundary_at no MESMO UPDATE, com
  -- WHERE exigindo o estado anterior exato E que o attempt ainda seja o
  -- active_attempt_id do dispatch. Sob o advisory lock, dois workers
  -- concorrentes disputando o MESMO attempt_id nunca ambos casam esta
  -- condição — o primeiro a commitar muda attempt_state, o segundo
  -- (chegando depois do lock) não encontra mais 'claimed_not_started'.
  UPDATE public.manual_charge_send_attempts AS a
  SET attempt_state = 'provider_call_may_have_started',
      provider_boundary_at = now()
  FROM public.manual_charge_dispatches AS d
  WHERE a.attempt_id = p_attempt_id
    AND a.dispatch_id = p_dispatch_id
    AND a.organization_id = v_org
    AND a.claim_token = p_claim_token
    AND a.attempt_state = 'claimed_not_started'
    AND a.closed_at IS NULL
    AND d.id = a.dispatch_id
    AND d.active_attempt_id = a.attempt_id
  RETURNING a.attempt_id INTO v_updated_attempt;

  IF v_updated_attempt IS NULL THEN
    RETURN;
  END IF;

  -- ACHADO REAL DE EXECUÇÃO CONTRA POSTGRES (mesma classe de bug já
  -- documentada na Fase A original): RETURNS TABLE(attempt_id uuid) cria
  -- um OUT "attempt_id" que colidia com a coluna
  -- manual_charge_send_attempt_events.attempt_id sem qualificação —
  -- SQLSTATE 42702. Corrigido com alias explícito "e".
  INSERT INTO public.manual_charge_send_attempt_events
    (attempt_id, organization_id, event_seq, event_kind, payload)
  SELECT v_updated_attempt, v_org,
         COALESCE(MAX(e.event_seq), 0) + 1, 'provider_boundary_crossed', '{}'::jsonb
  FROM public.manual_charge_send_attempt_events AS e WHERE e.attempt_id = v_updated_attempt;

  RETURN QUERY SELECT v_updated_attempt;
END;
$$;

COMMENT ON FUNCTION public.mark_provider_boundary IS
  'v4 — fato objetivo e binário: marca que a chamada ao provider PODE ter começado. Deve ser chamada por um futuro worker, numa transação própria e curta, ANTES de qualquer request HTTP — se retornar zero linhas (attempt_id NULL), o worker deve abortar sem chamar o provider. Nenhuma chamada HTTP é feita por esta função.';

-- ═══════════════════════════════════════════════════════════════════════
-- 7) release_dispatch_for_new_attempt — única via de liberação para
--    reavaliação, e SÓ quando a fronteira nunca foi cruzada. Usada por
--    um fluxo de reconciliação (humano ou automatizado) para um attempt
--    abandonado — distinto de cancel_claim (chamada pelo próprio
--    worker, ver seção 8).
-- ═══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.release_dispatch_for_new_attempt(
  p_dispatch_id uuid,
  p_attempt_id uuid,
  p_reason text
) RETURNS TABLE(status text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_org uuid;
  v_dispatch_active_attempt uuid;
  v_attempt_state text;
  v_boundary_at timestamptz;
  v_closed_count integer;
  v_next_seq integer;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_dispatch_id::text, 0));

  SELECT d.organization_id, d.active_attempt_id INTO v_org, v_dispatch_active_attempt
  FROM public.manual_charge_dispatches AS d WHERE d.id = p_dispatch_id
  FOR UPDATE;

  IF v_org IS NULL THEN
    RETURN QUERY SELECT 'dispatch_not_found'::text;
    RETURN;
  END IF;

  IF public.manual_charge_actor_authorized(v_org) IS NOT TRUE THEN
    RAISE EXCEPTION 'unauthorized_actor' USING ERRCODE = '42501';
  END IF;

  IF v_dispatch_active_attempt IS DISTINCT FROM p_attempt_id THEN
    RETURN QUERY SELECT 'denied_not_active_attempt'::text;
    RETURN;
  END IF;

  SELECT a.attempt_state, a.provider_boundary_at INTO v_attempt_state, v_boundary_at
  FROM public.manual_charge_send_attempts AS a
  WHERE a.attempt_id = p_attempt_id AND a.dispatch_id = p_dispatch_id
  FOR UPDATE;

  IF v_attempt_state IS NULL THEN
    RETURN QUERY SELECT 'attempt_not_found'::text;
    RETURN;
  END IF;

  IF v_attempt_state <> 'claimed_not_started' THEN
    RETURN QUERY SELECT 'denied_attempt_not_releasable'::text;
    RETURN;
  END IF;

  IF v_boundary_at IS NOT NULL THEN
    RETURN QUERY SELECT 'denied_boundary_already_crossed'::text;
    RETURN;
  END IF;

  UPDATE public.manual_charge_send_attempts
  SET attempt_state = 'released_not_started', closed_at = now()
  WHERE attempt_id = p_attempt_id
    AND attempt_state = 'claimed_not_started'
    AND provider_boundary_at IS NULL;
  GET DIAGNOSTICS v_closed_count = ROW_COUNT;

  IF v_closed_count <> 1 THEN
    RAISE EXCEPTION 'release_attempt_update_affected_%_rows_expected_1', v_closed_count USING ERRCODE = 'P0015';
  END IF;

  SELECT COALESCE(MAX(event_seq), 0) + 1 INTO v_next_seq
  FROM public.manual_charge_send_attempt_events WHERE attempt_id = p_attempt_id;

  INSERT INTO public.manual_charge_send_attempt_events
    (attempt_id, organization_id, event_seq, event_kind, payload)
  VALUES (p_attempt_id, v_org, v_next_seq, 'release_granted', jsonb_build_object('reason', p_reason));

  UPDATE public.manual_charge_dispatches
  SET active_attempt_id = NULL, status = 'reconciled_not_sent'
  WHERE id = p_dispatch_id AND active_attempt_id = p_attempt_id;

  RETURN QUERY SELECT 'released'::text;
END;
$$;

COMMENT ON FUNCTION public.release_dispatch_for_new_attempt IS
  'v4 — única via de liberação de reavaliação para um attempt abandonado. Só libera se attempt_state=claimed_not_started E provider_boundary_at IS NULL. Falha fechado (RAISE EXCEPTION) se a UPDATE de encerramento não afetar exatamente 1 linha. Fluxo de reconciliação humana/automatizada — distinto de cancel_claim, que é chamada pelo próprio worker (ver seção 8).';

-- ═══════════════════════════════════════════════════════════════════════
-- 8) cancel_claim — corrigida para diferenciar cancelamento ANTES e
--    DEPOIS da fronteira do provider. Chamada pelo próprio worker
--    (ex.: Gate 2 lido desligado imediatamente antes do provider).
--    Nunca trata "cancelamento solicitado" como prova de não-envio.
-- ═══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.cancel_claim(
  p_dispatch_id uuid,
  p_claim_token uuid,
  p_reason text
) RETURNS TABLE(status text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_org uuid;
  v_attempt_id uuid;
  v_attempt_state text;
  v_boundary_at timestamptz;
  v_next_seq integer;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_dispatch_id::text, 0));

  SELECT d.organization_id INTO v_org FROM public.manual_charge_dispatches AS d WHERE d.id = p_dispatch_id;
  IF v_org IS NULL THEN
    RETURN QUERY SELECT 'not_found'::text;
    RETURN;
  END IF;

  SELECT a.attempt_id, a.attempt_state, a.provider_boundary_at
  INTO v_attempt_id, v_attempt_state, v_boundary_at
  FROM public.manual_charge_send_attempts AS a
  WHERE a.dispatch_id = p_dispatch_id AND a.claim_token = p_claim_token
  FOR UPDATE;

  IF v_attempt_id IS NULL THEN
    RETURN QUERY SELECT 'not_in_sending_state'::text;
    RETURN;
  END IF;

  IF v_attempt_state <> 'claimed_not_started' AND v_attempt_state <> 'provider_call_may_have_started' THEN
    -- já resolvido (sent_confirmed, not_sent_confirmed, released, etc.)
    -- — cancelamento chegando tarde demais para agir, mas nunca é um
    -- erro silencioso: retorna o estado real.
    RETURN QUERY SELECT ('not_in_sending_state_attempt_' || v_attempt_state)::text;
    RETURN;
  END IF;

  SELECT COALESCE(MAX(event_seq), 0) + 1 INTO v_next_seq
  FROM public.manual_charge_send_attempt_events WHERE attempt_id = v_attempt_id;

  IF v_boundary_at IS NULL THEN
    -- Caso A — cancelamento ANTES de qualquer chamada ao provider:
    -- termina como released_not_started (terminal), dispatch reaberto.
    UPDATE public.manual_charge_send_attempts
    SET attempt_state = 'released_not_started', closed_at = now()
    WHERE attempt_id = v_attempt_id AND attempt_state = 'claimed_not_started';

    IF NOT FOUND THEN
      RETURN QUERY SELECT 'not_in_sending_state'::text;
      RETURN;
    END IF;

    INSERT INTO public.manual_charge_send_attempt_events
      (attempt_id, organization_id, event_seq, event_kind, payload)
    VALUES (v_attempt_id, v_org, v_next_seq, 'cancel_requested', jsonb_build_object('reason', p_reason, 'boundary_crossed', false));

    UPDATE public.manual_charge_dispatches
    SET active_attempt_id = NULL, status = 'reconciled_not_sent', disposition_reason = p_reason
    WHERE id = p_dispatch_id AND active_attempt_id = v_attempt_id;

    RETURN QUERY SELECT 'cancelled_before_provider'::text;
  ELSE
    -- Caso B — cancelamento DEPOIS que a fronteira pode ter sido
    -- cruzada: NUNCA declara "não enviado". Fica incerto, bloqueado,
    -- fora da lista evaluable, aguardando resultado real ou
    -- reconciliação técnica.
    UPDATE public.manual_charge_send_attempts
    SET attempt_state = 'cancel_requested_after_provider'
    WHERE attempt_id = v_attempt_id AND attempt_state = 'provider_call_may_have_started';

    IF NOT FOUND THEN
      RETURN QUERY SELECT 'not_in_sending_state'::text;
      RETURN;
    END IF;

    INSERT INTO public.manual_charge_send_attempt_events
      (attempt_id, organization_id, event_seq, event_kind, payload)
    VALUES (v_attempt_id, v_org, v_next_seq, 'cancel_requested', jsonb_build_object('reason', p_reason, 'boundary_crossed', true));

    UPDATE public.manual_charge_dispatches
    SET status = 'needs_review_uncertain_send', disposition_reason = p_reason
    WHERE id = p_dispatch_id AND active_attempt_id = v_attempt_id;

    RETURN QUERY SELECT 'cancel_requested_pending_reconciliation'::text;
  END IF;
END;
$$;

COMMENT ON FUNCTION public.cancel_claim IS
  'v4 — diferencia cancelamento antes/depois da fronteira do provider. Antes: released_not_started terminal, dispatch reaberto (reconciled_not_sent). Depois: cancel_requested_after_provider, dispatch=needs_review_uncertain_send, NUNCA reaberto automaticamente — cancelamento nunca é tratado como prova de não-envio.';

-- ═══════════════════════════════════════════════════════════════════════
-- 9) record_send_result — corrigida para exigir attempt_id explícito
--    (fencing), gravar o evento SEMPRE incondicionalmente, e só então
--    propagar condicionalmente para o dispatch quando o attempt ainda é
--    o active_attempt_id. sent_confirmed é absorvente e nunca perdido.
-- ═══════════════════════════════════════════════════════════════════════

-- Renomeia p_claim_token -> p_attempt_id (mesmo tipo uuid, mas Postgres
-- rejeita CREATE OR REPLACE quando o NOME de um parâmetro IN muda).
DROP FUNCTION public.record_send_result(uuid, uuid, text, jsonb);

CREATE FUNCTION public.record_send_result(
  p_dispatch_id uuid,
  p_attempt_id uuid,
  p_result_status text,
  p_provider_response jsonb DEFAULT NULL
) RETURNS TABLE(status text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_org uuid;
  v_current_attempt_state text;
  v_next_seq integer;
  v_event_kind text;
  v_new_attempt_state text;
  v_is_duplicate boolean;
  v_dispatch_active_attempt uuid;
BEGIN
  IF p_result_status NOT IN ('sent', 'failed', 'unknown_result') THEN
    RAISE EXCEPTION 'invalid_result_status' USING ERRCODE = 'P0005';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_dispatch_id::text, 0));

  SELECT a.organization_id, a.attempt_state INTO v_org, v_current_attempt_state
  FROM public.manual_charge_send_attempts AS a
  WHERE a.attempt_id = p_attempt_id AND a.dispatch_id = p_dispatch_id
  FOR UPDATE;

  IF v_org IS NULL THEN
    RETURN QUERY SELECT 'attempt_not_found'::text;
    RETURN;
  END IF;

  v_event_kind := CASE p_result_status
    WHEN 'sent' THEN 'result_sent_confirmed'
    WHEN 'failed' THEN 'result_not_sent_confirmed'
    ELSE 'result_unknown'
  END;

  -- Duplicata idêntica: mesmo attempt, mesmo event_kind, mesmo payload —
  -- idempotente, não grava segunda linha nem tenta nova transição.
  SELECT EXISTS (
    SELECT 1 FROM public.manual_charge_send_attempt_events
    WHERE attempt_id = p_attempt_id AND event_kind = v_event_kind
      AND payload = jsonb_build_object('provider_response', p_provider_response)
  ) INTO v_is_duplicate;

  IF v_is_duplicate THEN
    RETURN QUERY SELECT 'result_already_recorded'::text;
    RETURN;
  END IF;

  -- sent_confirmed é absorvente: qualquer resultado chegando depois de
  -- já existir sent_confirmed para este attempt é contraditório, nunca
  -- reverte o estado, mas ainda é gravado como evidência.
  IF v_current_attempt_state = 'sent_confirmed' AND p_result_status <> 'sent' THEN
    v_event_kind := 'result_conflicting';
  END IF;

  v_next_seq := (
    SELECT COALESCE(MAX(event_seq), 0) + 1
    FROM public.manual_charge_send_attempt_events WHERE attempt_id = p_attempt_id
  );

  -- Passo 1 — SEMPRE grava o evento primeiro, incondicionalmente
  -- (append-only puro): todo resultado gera evidência, mesmo quando não
  -- pode mais mudar o estado.
  INSERT INTO public.manual_charge_send_attempt_events
    (attempt_id, organization_id, event_seq, event_kind, payload)
  VALUES (p_attempt_id, v_org, v_next_seq, v_event_kind,
          jsonb_build_object('provider_response', p_provider_response));

  -- Passo 2 — tenta a transição do attempt. sent_confirmed nunca é
  -- sobrescrito (WHERE attempt_state <> 'sent_confirmed'; reforçado
  -- ainda pelo trigger de absorção).
  -- ACHADO REAL DE EXECUÇÃO CONTRA POSTGRES (achado por revisão Codex,
  -- confirmado empiricamente): sem o segundo termo do WHERE abaixo, um
  -- resultado tardio 'failed'/'unknown_result' (ou um conflitante)
  -- chegando para um attempt JÁ released_not_started tentava uma
  -- transição que o trigger de absorção rejeita (released_not_started só
  -- pode avançar para sent_confirmed) -- a RAISE EXCEPTION do trigger
  -- abortava a TRANSAÇÃO INTEIRA, desfazendo também o evento do Passo 1,
  -- que deveria SEMPRE ser gravado incondicionalmente. Corrigido: a
  -- própria condição do UPDATE agora exclui released_not_started (exceto
  -- quando o novo estado é sent_confirmed), então o UPDATE simplesmente
  -- não casa (0 linhas, sem erro) em vez de violar o trigger -- o evento
  -- do Passo 1 permanece gravado normalmente.
  IF v_event_kind = 'result_conflicting' THEN
    UPDATE public.manual_charge_send_attempts
    SET attempt_state = 'conflicting_results'
    WHERE attempt_id = p_attempt_id
      AND attempt_state <> 'sent_confirmed'
      AND attempt_state <> 'released_not_started';
  ELSE
    v_new_attempt_state := CASE p_result_status
      WHEN 'sent' THEN 'sent_confirmed'
      WHEN 'failed' THEN 'not_sent_confirmed'
      ELSE 'unknown_result'
    END;
    UPDATE public.manual_charge_send_attempts
    SET attempt_state = v_new_attempt_state,
        closed_at = CASE WHEN p_result_status IN ('sent', 'failed') THEN now() ELSE closed_at END
    WHERE attempt_id = p_attempt_id
      AND attempt_state <> 'sent_confirmed'
      AND (attempt_state <> 'released_not_started' OR v_new_attempt_state = 'sent_confirmed');
  END IF;

  -- Passo 3 — SÓ propaga para o dispatch se este attempt AINDA for o
  -- active_attempt_id (fencing explícito contra aplicar resultado de A
  -- ao estado de B).
  SELECT d.active_attempt_id INTO v_dispatch_active_attempt
  FROM public.manual_charge_dispatches AS d WHERE d.id = p_dispatch_id;

  IF v_dispatch_active_attempt IS NOT DISTINCT FROM p_attempt_id THEN
    UPDATE public.manual_charge_dispatches AS d
    SET status = p_result_status,
        sent_at = CASE WHEN p_result_status = 'sent' THEN now() ELSE sent_at END,
        provider_response = p_provider_response,
        active_attempt_id = CASE WHEN p_result_status IN ('sent', 'failed') THEN NULL ELSE d.active_attempt_id END
    WHERE d.id = p_dispatch_id AND d.active_attempt_id = p_attempt_id;

    RETURN QUERY SELECT p_result_status;
  ELSE
    -- Attempt não é mais o ativo (já substituído por outro, ou o
    -- dispatch já está em outro estado por outro caminho) — o evento já
    -- foi gravado no passo 1, mas nada no dispatch é tocado.
    RETURN QUERY SELECT 'result_recorded_no_transition'::text;
  END IF;
END;
$$;

COMMENT ON FUNCTION public.record_send_result IS
  'v4 — exige attempt_id explícito (fencing). Evento sempre gravado incondicionalmente (append-only). sent_confirmed é absorvente e nunca perdido. Resultado nunca aplicado ao dispatch se o attempt já não for o active_attempt_id.';

-- ═══════════════════════════════════════════════════════════════════════
-- 10) manual_charge_evaluate — corrigida: bloqueia o dispatch ANTES de
--     calcular, relê fatos depois do lock, exclui estruturalmente
--     qualquer dispatch com active_attempt_id, e nunca reabre para
--     eligible quando existe sent_confirmed em qualquer attempt.
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
  v_has_sent_confirmed boolean;
BEGIN
  -- v4: advisory lock PRIMEIRO (mesma chave global de todas as outras
  -- RPCs desta migration), depois FOR UPDATE no dispatch — ANTES de
  -- qualquer leitura de fato. Uma segunda chamada concorrente bloqueia
  -- aqui, nunca calcula com fatos lidos antes de esperar.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_dispatch_id::text, 0));

  SELECT * INTO v_dispatch FROM public.manual_charge_dispatches WHERE id = p_dispatch_id FOR UPDATE;
  IF v_dispatch IS NULL THEN
    RAISE EXCEPTION 'dispatch_not_found' USING ERRCODE = 'P0002';
  END IF;

  -- v4: exclusão estrutural — qualquer dispatch com uma tentativa em
  -- voo (active_attempt_id preenchido) nunca é avaliável, independente
  -- do valor de status. Isto é MAIS forte que apenas excluir certos
  -- valores de status, porque protege contra qualquer estado futuro que
  -- ainda tenha um attempt em aberto.
  IF v_dispatch.active_attempt_id IS NOT NULL THEN
    RETURN QUERY SELECT v_dispatch.status, 'attempt_in_progress_not_evaluable'::text;
    RETURN;
  END IF;

  -- v4: defesa em profundidade — mesmo que active_attempt_id já tenha
  -- sido limpo, um sent_confirmed histórico em QUALQUER attempt deste
  -- dispatch bloqueia reabertura e força o estado terminal correto.
  SELECT EXISTS (
    SELECT 1 FROM public.manual_charge_send_attempts
    WHERE dispatch_id = p_dispatch_id AND attempt_state = 'sent_confirmed'
  ) INTO v_has_sent_confirmed;

  IF v_has_sent_confirmed AND v_dispatch.status <> 'sent' THEN
    UPDATE public.manual_charge_dispatches SET status = 'sent' WHERE id = p_dispatch_id
    RETURNING id INTO v_updated_id;
    RETURN QUERY SELECT 'sent'::text, 'already_sent_historically'::text;
    RETURN;
  END IF;

  IF v_dispatch.status NOT IN ('eligible', 'hold_receipt_review', 'hold_human', 'hold_connection',
      'needs_review_integrity', 'needs_review_human_state', 'needs_review_payment_claim',
      'needs_review_suppression', 'needs_review_receipt', 'hold_suppression_review',
      'reconciled_not_sent', 'needs_review_reconciliation') THEN
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
  -- CORRIGIDO NESTA RODADA: uma leitura anterior desta migration havia
  -- copiado uma versão simplificada (simétrica à de purchase_audit) desta
  -- lógica por engano — a versão REAL, corrente na migration da Fase A,
  -- é assimétrica (organization_id NULL sem conversation_id É, por si
  -- só, um conflito de integridade — não exige conversation_id
  -- presente). Achado real de execução: TESTE 17.11c (suíte sequencial)
  -- falhou contra a versão simplificada, confirmando a divergência antes
  -- de qualquer commit. Corrigido copiando exatamente o texto vigente da
  -- migration 20260915120000.
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

  -- CORRIGIDO NESTA RODADA: uma leitura anterior desta migration havia
  -- copiado uma versão sem o filtro purchase_status IN ('success',
  -- 'recognized') — reconheceria QUALQUER linha de purchase_audit,
  -- inclusive 'failed'/'pending', como compra confirmada. Corrigido
  -- copiando exatamente o texto vigente da migration 20260915120000.
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

  SELECT
    bool_or((assigned_user_id IS NOT NULL AND current_agent_id IS NOT NULL AND status = 'bot_active')) AS inconsistent,
    bool_or(assigned_user_id IS NOT NULL OR status IN ('human_active', 'waiting_human')) AS holding
  INTO v_fact_human_inconsistent, v_fact_human_hold
  FROM public.webchat_conversations
  WHERE lead_id = v_dispatch.lead_id AND organization_id = v_dispatch.organization_id;
  v_fact_human_inconsistent := COALESCE(v_fact_human_inconsistent, false);
  v_fact_human_hold := COALESCE(v_fact_human_hold, false);

  SELECT pcs.current_status INTO v_fact_payment_claim_status
  FROM public.payment_claim_events ce
  JOIN public.payment_claim_current_status pcs ON pcs.claim_event_id = ce.id
  WHERE ce.manual_charge_dispatch_id = p_dispatch_id
  ORDER BY ce.created_at DESC
  LIMIT 1;

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

  UPDATE public.manual_charge_dispatches
  SET status = v_disposition, disposition_reason = v_reason
  WHERE id = p_dispatch_id
    AND status IN ('eligible', 'hold_receipt_review', 'hold_human', 'hold_connection',
      'needs_review_integrity', 'needs_review_human_state', 'needs_review_payment_claim',
      'needs_review_suppression', 'needs_review_receipt', 'hold_suppression_review',
      'reconciled_not_sent', 'needs_review_reconciliation')
  RETURNING id INTO v_updated_id;

  IF v_updated_id IS NULL THEN
    SELECT status INTO v_current_status FROM public.manual_charge_dispatches WHERE id = p_dispatch_id;
    RETURN QUERY SELECT v_current_status, 'concurrent_state_change'::text;
    RETURN;
  END IF;

  INSERT INTO public.manual_charge_evaluations
    (manual_charge_dispatch_id, organization_id, decision_matrix_version, disposition, disposition_reason, facts)
  VALUES (p_dispatch_id, v_dispatch.organization_id, 'phase-a-v4', v_disposition, v_reason, v_facts);

  RETURN QUERY SELECT v_disposition, v_reason;
END;
$$;

COMMENT ON FUNCTION public.manual_charge_evaluate IS
  'v4 — bloqueia o dispatch (advisory lock + FOR UPDATE) ANTES de calcular; relê fatos só depois do lock. Exclui estruturalmente dispatches com active_attempt_id preenchido. sent_confirmed histórico em qualquer attempt força status=sent incondicionalmente. Nunca apaga/altera uma linha de manual_charge_suppressions como efeito colateral.';

-- ═══════════════════════════════════════════════════════════════════════
-- 11) Grants — mesmo padrão endurecido já usado no restante da Fase A.
-- ═══════════════════════════════════════════════════════════════════════

REVOKE ALL ON FUNCTION public.claim_charge_for_send(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_charge_for_send(uuid, text) TO service_role;

REVOKE ALL ON FUNCTION public.mark_provider_boundary(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_provider_boundary(uuid, uuid, uuid) TO service_role;

REVOKE ALL ON FUNCTION public.release_dispatch_for_new_attempt(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.release_dispatch_for_new_attempt(uuid, uuid, text) TO authenticated;

REVOKE ALL ON FUNCTION public.cancel_claim(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_claim(uuid, uuid, text) TO service_role;

REVOKE ALL ON FUNCTION public.record_send_result(uuid, uuid, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_send_result(uuid, uuid, text, jsonb) TO service_role;

REVOKE ALL ON FUNCTION public.manual_charge_evaluate(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.manual_charge_evaluate(uuid) TO service_role;

REVOKE ALL ON FUNCTION public.manual_charge_send_attempts_enforce_absorbing_states() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.manual_charge_send_attempt_events_forbid_mutation() FROM PUBLIC, anon, authenticated, service_role;
