-- ═══════════════════════════════════════════════════════════════════════
-- Duas correções estruturais reais, achadas ao desenhar os testes
-- pedidos na revisão. Não reedita nenhuma migration anterior.
--
-- CORREÇÃO A -- campaign_key não é a identidade real da ocasião:
--   A UNIQUE(organization_id, phone_normalized, campaign_key) da Fase A
--   impede repetir a MESMA campanha, mas nada impedia escolher uma
--   campaign_key NOVA (uma string qualquer) para o MESMO telefone e
--   criar outro dispatch para o MESMO compromisso -- driblando "silêncio
--   após ausência de resposta". Corrigido: nova coluna
--   source_purchase_audit_id (a obrigação REAL, vinda de purchase_audit)
--   + UNIQUE(organization_id, phone_normalized, source_purchase_audit_id)
--   -- agora a identidade da ocasião é a obrigação de compra real, nunca
--   uma string arbitrária. Uma nova ocasião exige uma linha NOVA em
--   purchase_audit (evidência real e auditável), nunca só um novo rótulo
--   de campanha. manual_charge_create_dispatch_for_obligation é o único
--   caminho controlado -- valida que a obrigação pertence ao lead/
--   organização antes de criar.
--
-- CORREÇÃO B -- classifier_version identifica a VERSÃO do classificador,
-- não a ordem de REVISÃO de uma decisão -- duas correções feitas pela
-- MESMA versão não tinham como ser ordenadas de forma confiável (o
-- desempate anterior, por detected_at, tinha exatamente o mesmo defeito
-- que a correção passada já tinha eliminado para versões diferentes).
--   Corrigido: supersedes_fact_id (auto-referência, explícita) -- uma
--   correção só é aceita se apontar EXATAMENTE para a linha vigente
--   (a "cabeça" atual da cadeia) no momento do envio. Uma reclassificação
--   atrasada que tentar corrigir uma linha que JÁ NÃO é mais a vigente é
--   REJEITADA explicitamente (stale_supersedes_rejected) -- nunca aceita
--   silenciosamente. Isso nunca depende de relógio/versão/ordem de
--   chamada -- só da referência explícita que o próprio chamador declara.
--   UNIQUE(supersedes_fact_id) garante que cada linha só pode ser
--   corrigida por, no máximo, UMA sucessora -- nunca um garfo (fork) na
--   cadeia.
-- ═══════════════════════════════════════════════════════════════════════

-- ── Correção A: obrigação real como identidade da ocasião ──

ALTER TABLE public.manual_charge_dispatches
  ADD COLUMN source_purchase_audit_id uuid REFERENCES public.purchase_audit(id) ON DELETE RESTRICT;

-- purchase_audit nunca teve organization_id (achado documentado na
-- própria Fase A) -- a UNIQUE aqui não pode ser uma FK composta contra
-- organization_id; a validação de que a obrigação pertence ao lead/
-- organização certos acontece na function de criação abaixo, no mesmo
-- espírito dos próprios checks de integridade de manual_charge_evaluate.
ALTER TABLE public.manual_charge_dispatches
  ADD CONSTRAINT manual_charge_dispatches_org_phone_purchase_uk
  UNIQUE (organization_id, phone_normalized, source_purchase_audit_id);

COMMENT ON COLUMN public.manual_charge_dispatches.source_purchase_audit_id IS
  'A obrigação REAL (purchase_audit) desta ocasião de cobrança. UNIQUE(organization_id, phone_normalized, source_purchase_audit_id) é a identidade verdadeira da ocasião -- nunca campaign_key sozinho, que é só um rótulo. Uma nova ocasião para o MESMO telefone exige uma linha NOVA em purchase_audit (evidência real), nunca só uma nova string de campanha.';

CREATE FUNCTION public.manual_charge_create_dispatch_for_obligation(
  p_organization_id uuid,
  p_lead_id uuid,
  p_purchase_audit_id uuid,
  p_campaign_key text
) RETURNS TABLE(status text, dispatch_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_lead RECORD;
  v_pa RECORD;
  v_id uuid;
BEGIN
  SELECT * INTO v_lead FROM public.leads WHERE id = p_lead_id AND organization_id = p_organization_id;
  IF v_lead IS NULL THEN
    RETURN QUERY SELECT 'lead_not_found_in_organization'::text, NULL::uuid; RETURN;
  END IF;

  SELECT * INTO v_pa FROM public.purchase_audit WHERE id = p_purchase_audit_id;
  IF v_pa IS NULL THEN
    RETURN QUERY SELECT 'purchase_audit_not_found'::text, NULL::uuid; RETURN;
  END IF;

  -- A obrigação precisa realmente pertencer a este lead -- nunca
  -- confiar em phone/nome batendo por coincidência.
  IF v_pa.lead_id IS DISTINCT FROM p_lead_id THEN
    RETURN QUERY SELECT 'purchase_audit_belongs_to_different_lead'::text, NULL::uuid; RETURN;
  END IF;

  IF v_pa.purchase_status IN ('success', 'recognized') THEN
    RETURN QUERY SELECT 'obligation_already_paid'::text, NULL::uuid; RETURN;
  END IF;

  INSERT INTO public.manual_charge_dispatches
    (organization_id, lead_id, campaign_key, source_purchase_audit_id, status)
  VALUES (p_organization_id, p_lead_id, p_campaign_key, p_purchase_audit_id, 'eligible')
  ON CONFLICT ON CONSTRAINT manual_charge_dispatches_org_phone_purchase_uk DO NOTHING
  RETURNING id INTO v_id;

  IF v_id IS NULL THEN
    -- Já existe um dispatch para ESTA MESMA obrigação (mesmo telefone) --
    -- nunca cria outro, mesmo com campaign_key diferente. Isso é
    -- exatamente a proteção contra "trocar de campanha para cobrar de
    -- novo sem resposta".
    SELECT d.id INTO v_id FROM public.manual_charge_dispatches d
    WHERE d.organization_id = p_organization_id AND d.phone_normalized = v_lead.phone_normalized
      AND d.source_purchase_audit_id = p_purchase_audit_id;
    RETURN QUERY SELECT 'already_exists_for_this_obligation'::text, v_id; RETURN;
  END IF;

  RETURN QUERY SELECT 'created'::text, v_id;
END;
$$;

COMMENT ON FUNCTION public.manual_charge_create_dispatch_for_obligation IS
  'Único caminho controlado para criar um dispatch com identidade de ocasião real. Bloqueia: lead fora da organização, obrigação de outro lead, obrigação já paga, e (via UNIQUE) uma SEGUNDA tentativa para a MESMA obrigação -- mesmo com campaign_key diferente.';

REVOKE ALL ON FUNCTION public.manual_charge_create_dispatch_for_obligation(uuid, uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.manual_charge_create_dispatch_for_obligation(uuid, uuid, uuid, text) TO service_role;

-- ── Correção B: revisão explícita por supersedes_fact_id, nunca por relógio ──

ALTER TABLE public.manual_charge_conversation_facts
  ADD COLUMN supersedes_fact_id uuid REFERENCES public.manual_charge_conversation_facts(id) ON DELETE RESTRICT,
  ADD COLUMN date_precision text CHECK (date_precision IS NULL OR date_precision IN ('exact', 'flexible_period_start'));

-- Cada linha só pode ser corrigida por, no máximo, UMA sucessora --
-- nunca um garfo na cadeia de revisão. UNIQUE em coluna nullable permite
-- múltiplos NULL (linhas "originais", sem nada as corrigindo ainda).
ALTER TABLE public.manual_charge_conversation_facts
  ADD CONSTRAINT manual_charge_conversation_facts_supersedes_uk UNIQUE (supersedes_fact_id);

-- supersedes_fact_id só pode apontar para uma linha da MESMA mensagem e
-- do MESMO fact_type -- nunca corrigir através de mensagens diferentes.
CREATE OR REPLACE FUNCTION public.manual_charge_conversation_facts_validate_supersedes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_prev RECORD;
BEGIN
  IF NEW.supersedes_fact_id IS NOT NULL THEN
    SELECT * INTO v_prev FROM public.manual_charge_conversation_facts WHERE id = NEW.supersedes_fact_id;
    IF v_prev IS NULL THEN
      RAISE EXCEPTION 'supersedes_fact_not_found' USING ERRCODE = 'P0011';
    END IF;
    IF v_prev.source_message_id IS DISTINCT FROM NEW.source_message_id
       OR v_prev.fact_type IS DISTINCT FROM NEW.fact_type
       OR v_prev.dispatch_id IS DISTINCT FROM NEW.dispatch_id THEN
      RAISE EXCEPTION 'supersedes_fact_must_be_same_message_and_type' USING ERRCODE = 'P0012';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.manual_charge_conversation_facts_validate_supersedes() FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER manual_charge_conversation_facts_validate_supersedes_trg
  BEFORE INSERT ON public.manual_charge_conversation_facts
  FOR EACH ROW EXECUTE FUNCTION public.manual_charge_conversation_facts_validate_supersedes();

-- ═══════════════════════════════════════════════════════════════════════
-- Reescreve record_conversation_fact: exige supersedes explícito para
-- corrigir uma decisão já existente; rejeita (nunca aplica
-- silenciosamente) quando o alvo indicado não é mais a linha vigente.
-- ═══════════════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS public.record_conversation_fact(uuid, uuid, uuid, uuid, text, date, text, text, text);

CREATE FUNCTION public.record_conversation_fact(
  p_dispatch_id uuid,
  p_lead_id uuid,
  p_conversation_id uuid,
  p_source_message_id uuid,
  p_fact_type text,
  p_promised_date date,
  p_raw_excerpt text,
  p_classifier_source text,
  p_classifier_version text,
  p_supersedes_fact_id uuid DEFAULT NULL,
  p_date_precision text DEFAULT 'exact'
) RETURNS TABLE(status text, fact_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_org uuid;
  v_id uuid;
  v_occurred_at timestamptz;
  v_provider_ts timestamptz;
  v_occurred_at_source text;
  v_decision_key text;
  v_current_head_id uuid;
BEGIN
  IF p_fact_type IN ('refused_contact', 'payment_claimed') THEN
    RAISE EXCEPTION 'use_dedicated_mechanism: refused_contact->create_suppression_candidate, payment_claimed->register_payment_claim' USING ERRCODE = 'P0009';
  END IF;

  SELECT organization_id INTO v_org FROM public.manual_charge_dispatches WHERE id = p_dispatch_id;
  IF v_org IS NULL THEN
    RETURN QUERY SELECT 'dispatch_not_found'::text, NULL::uuid; RETURN;
  END IF;

  SELECT wm.provider_occurred_at, wm.created_at INTO v_provider_ts, v_occurred_at
  FROM public.webchat_messages wm
  WHERE wm.id = p_source_message_id AND wm.conversation_id = p_conversation_id;

  IF v_occurred_at IS NULL THEN
    RETURN QUERY SELECT 'source_message_not_found'::text, NULL::uuid; RETURN;
  END IF;

  IF v_provider_ts IS NOT NULL THEN
    v_occurred_at := v_provider_ts;
    v_occurred_at_source := 'provider_native';
  ELSE
    v_occurred_at_source := 'db_insertion_fallback';
  END IF;

  v_decision_key := p_fact_type || ':' || COALESCE((p_promised_date - DATE '1970-01-01')::text, '');

  -- Serializa correções concorrentes para a MESMA mensagem+fact_type --
  -- sem isso, duas correções simultâneas poderiam ambas ler a mesma
  -- "cabeça atual" e ambas tentar sucedê-la.
  PERFORM pg_advisory_xact_lock(hashtextextended(
    p_dispatch_id::text || ':' || p_source_message_id::text || ':' || p_fact_type, 0));

  -- Cabeça atual da cadeia desta mensagem+fact_type: a linha que NINGUÉM
  -- ainda sucede.
  SELECT f.id INTO v_current_head_id
  FROM public.manual_charge_conversation_facts f
  WHERE f.dispatch_id = p_dispatch_id AND f.source_message_id = p_source_message_id AND f.fact_type = p_fact_type
    AND NOT EXISTS (
      SELECT 1 FROM public.manual_charge_conversation_facts f2
      WHERE f2.supersedes_fact_id = f.id
    )
  LIMIT 1;

  IF v_current_head_id IS NULL THEN
    -- Nenhuma classificação ainda para esta mensagem+fact_type -- esta é
    -- a original. supersedes deve vir NULL (nada a corrigir ainda).
    IF p_supersedes_fact_id IS NOT NULL THEN
      RETURN QUERY SELECT 'stale_supersedes_rejected'::text, NULL::uuid; RETURN;
    END IF;
  ELSE
    -- Já existe uma cabeça. Reprocessar a MESMA decisão da cabeça atual
    -- é idempotente, mesmo sem supersedes (reentrega de webhook comum).
    IF EXISTS (
      SELECT 1 FROM public.manual_charge_conversation_facts f
      WHERE f.id = v_current_head_id AND f.decision_key = v_decision_key
    ) THEN
      RETURN QUERY SELECT 'already_recorded'::text, v_current_head_id; RETURN;
    END IF;

    -- Uma decisão DIFERENTE da cabeça atual exige apontar explicitamente
    -- para ela. Sem isso, ou apontando para algo que já não é mais a
    -- cabeça (correção atrasada de uma versão já superada), REJEITA --
    -- nunca aplica silenciosamente.
    IF p_supersedes_fact_id IS DISTINCT FROM v_current_head_id THEN
      RETURN QUERY SELECT 'stale_supersedes_rejected'::text, NULL::uuid; RETURN;
    END IF;
  END IF;

  INSERT INTO public.manual_charge_conversation_facts (
    organization_id, dispatch_id, lead_id, conversation_id, source_message_id,
    message_occurred_at, occurred_at_source, fact_type, promised_date, raw_excerpt,
    classifier_source, classifier_version, supersedes_fact_id, date_precision
  ) VALUES (
    v_org, p_dispatch_id, p_lead_id, p_conversation_id, p_source_message_id,
    v_occurred_at, v_occurred_at_source, p_fact_type, p_promised_date, p_raw_excerpt,
    p_classifier_source, p_classifier_version, p_supersedes_fact_id, p_date_precision
  )
  RETURNING id INTO v_id;

  RETURN QUERY SELECT (CASE WHEN p_supersedes_fact_id IS NULL THEN 'recorded' ELSE 'recorded_correction' END)::text, v_id;
END;
$$;

COMMENT ON FUNCTION public.record_conversation_fact IS
  'CORRIGIDO 20260923195721: uma decisão diferente da cabeça vigente exige p_supersedes_fact_id explícito apontando EXATAMENTE para essa cabeça -- nunca inferido por relógio/versão. Um envio que tenta corrigir uma linha que já não é mais a cabeça é REJEITADO (stale_supersedes_rejected), nunca aplicado. Reprocessar a decisão da cabeça atual continua idempotente.';

REVOKE ALL ON FUNCTION public.record_conversation_fact(uuid, uuid, uuid, uuid, text, date, text, text, text, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_conversation_fact(uuid, uuid, uuid, uuid, text, date, text, text, text, uuid, text) TO service_role;

-- ═══════════════════════════════════════════════════════════════════════
-- Reescreve manual_charge_conversation_current_facts: a "vigente" de
-- cada mensagem é sempre a cabeça da cadeia de supersedes (nunca por
-- classifier_version/detected_at). Entre mensagens diferentes, continua
-- por message_occurred_at DESC.
-- ═══════════════════════════════════════════════════════════════════════

-- manual_charge_dispatches_panel (view, migration 20260923194256) chama
-- current_facts via LATERAL -- precisa ser derrubada antes do DROP
-- FUNCTION (mudança de tipo de retorno) e recriada depois, idêntica.
DROP VIEW IF EXISTS public.manual_charge_dispatches_panel;

DROP FUNCTION IF EXISTS public.manual_charge_conversation_current_facts(uuid);

CREATE FUNCTION public.manual_charge_conversation_current_facts(
  p_dispatch_id uuid
) RETURNS TABLE(
  effective_promised_date date,
  promised_date_source_message_id uuid,
  promised_date_occurred_at_source text,
  promised_date_precision text,
  has_pending_ambiguous_signal boolean,
  ambiguous_source_message_id uuid
)
LANGUAGE sql
STABLE
SET search_path TO ''
AS $$
  WITH heads AS (
    -- A cabeça de cada (mensagem, fact_type): a linha que ninguém sucede.
    SELECT f.*
    FROM public.manual_charge_conversation_facts f
    WHERE f.dispatch_id = p_dispatch_id
      AND NOT EXISTS (
        SELECT 1 FROM public.manual_charge_conversation_facts f2
        WHERE f2.supersedes_fact_id = f.id
      )
  ),
  latest_promised AS (
    SELECT source_message_id, promised_date, occurred_at_source, date_precision
    FROM heads
    WHERE fact_type = 'promised_date'
    ORDER BY message_occurred_at DESC
    LIMIT 1
  ),
  latest_business_signal AS (
    SELECT max(message_occurred_at) AS ts FROM heads WHERE fact_type IN ('promised_date', 'postponement_requested')
  ),
  latest_ambiguous AS (
    SELECT source_message_id, message_occurred_at FROM heads
    WHERE fact_type IN ('ambiguous', 'no_signal')
    ORDER BY message_occurred_at DESC
    LIMIT 1
  )
  SELECT
    (SELECT promised_date FROM latest_promised),
    (SELECT source_message_id FROM latest_promised),
    (SELECT occurred_at_source FROM latest_promised),
    (SELECT date_precision FROM latest_promised),
    EXISTS (
      SELECT 1 FROM latest_ambiguous la
      WHERE la.message_occurred_at > COALESCE((SELECT ts FROM latest_business_signal), '-infinity'::timestamptz)
    ),
    (SELECT source_message_id FROM latest_ambiguous la
      WHERE la.message_occurred_at > COALESCE((SELECT ts FROM latest_business_signal), '-infinity'::timestamptz));
$$;

COMMENT ON FUNCTION public.manual_charge_conversation_current_facts IS
  'CORRIGIDO 20260923195721: a vigente de cada mensagem é a cabeça da cadeia de supersedes_fact_id (referência EXPLÍCITA do chamador, nunca inferida por classifier_version/detected_at). Entre mensagens diferentes, continua por message_occurred_at DESC.';

REVOKE ALL ON FUNCTION public.manual_charge_conversation_current_facts(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.manual_charge_conversation_current_facts(uuid) TO authenticated, service_role;

CREATE VIEW public.manual_charge_dispatches_panel
WITH (security_invoker = true) AS
SELECT
  d.id AS dispatch_id, d.organization_id, d.lead_id, l.name AS lead_name, d.phone_normalized,
  d.campaign_key, d.status, d.disposition_reason, d.claim_token, d.claimed_by, d.claimed_at, d.sent_at,
  d.agreed_date, d.planned_send_at, d.scheduling_status, d.connection_id, ei.name AS connection_name,
  ei.status AS connection_status, l.preferred_locale AS lead_preferred_locale,
  l.preferred_timezone AS lead_preferred_timezone, l.timezone_source AS lead_timezone_source,
  cf.effective_promised_date, cf.promised_date_occurred_at_source, cf.promised_date_precision,
  cf.has_pending_ambiguous_signal, st.is_refused, st.refused_reason, st.is_payment_claimed, st.payment_claim_status,
  EXISTS (SELECT 1 FROM public.purchase_audit pa WHERE pa.lead_id = d.lead_id AND pa.purchase_status IN ('success', 'recognized')) AS payment_confirmed,
  'pending_criteria_approval'::text AS attribution_status,
  d.created_at, d.updated_at
FROM public.manual_charge_dispatches d
JOIN public.leads l ON l.id = d.lead_id
LEFT JOIN public.evolution_instances ei ON ei.id = d.connection_id
LEFT JOIN LATERAL public.manual_charge_conversation_current_facts(d.id) cf ON true
LEFT JOIN LATERAL public.manual_charge_conversation_state(d.id) st ON true;

COMMENT ON VIEW public.manual_charge_dispatches_panel IS
  'Recriada em 20260923195721 (a versão de current_facts mudou de assinatura) -- mesma definição da migration 20260923194256, com a coluna adicional promised_date_precision.';

REVOKE ALL ON public.manual_charge_dispatches_panel FROM PUBLIC, anon;
GRANT SELECT ON public.manual_charge_dispatches_panel TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════
-- date_precision propagado ao dispatch + agendamento diferenciado:
-- data EXATA sem capacidade expõe conflito (comportamento já corrigido);
-- período FLEXÍVEL ("final do mês") sem capacidade no dia avança dentro
-- da janela aprovada (a partir de 29/09/2026), respeitando o cap --
-- nunca concentra tudo em 29/09 09h, nunca excede o cap.
-- ═══════════════════════════════════════════════════════════════════════

ALTER TABLE public.manual_charge_dispatches
  ADD COLUMN agreed_date_precision text CHECK (agreed_date_precision IS NULL OR agreed_date_precision IN ('exact', 'flexible_period_start'));

CREATE OR REPLACE FUNCTION public.manual_charge_capture_scheduling_inputs(
  p_dispatch_id uuid
) RETURNS TABLE(status text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_dispatch RECORD;
  v_facts RECORD;
  v_lead RECORD;
  v_connection_id uuid;
  v_distinct_promise_count integer;
BEGIN
  SELECT * INTO v_dispatch FROM public.manual_charge_dispatches WHERE id = p_dispatch_id;
  IF v_dispatch IS NULL THEN
    RETURN QUERY SELECT 'dispatch_not_found'::text; RETURN;
  END IF;

  SELECT * INTO v_lead FROM public.leads WHERE id = v_dispatch.lead_id;

  SELECT effective_promised_date, promised_date_source_message_id, promised_date_occurred_at_source, promised_date_precision
  INTO v_facts
  FROM public.manual_charge_conversation_current_facts(p_dispatch_id);

  IF v_facts.effective_promised_date IS NULL THEN
    RETURN QUERY SELECT 'no_promised_date_yet'::text; RETURN;
  END IF;

  IF v_facts.promised_date_occurred_at_source = 'db_insertion_fallback' THEN
    SELECT count(DISTINCT promised_date) INTO v_distinct_promise_count
    FROM public.manual_charge_conversation_facts
    WHERE dispatch_id = p_dispatch_id AND fact_type = 'promised_date';

    IF v_distinct_promise_count > 1 THEN
      UPDATE public.manual_charge_dispatches
      SET scheduling_status = 'blocked_ambiguous_order', agreed_date = NULL, planned_send_at = NULL
      WHERE id = p_dispatch_id AND scheduling_status <> 'blocked_ambiguous_order';
      RETURN QUERY SELECT 'blocked_ambiguous_order'::text; RETURN;
    END IF;
  END IF;

  SELECT wc.evolution_instance_id INTO v_connection_id
  FROM public.webchat_conversations wc
  WHERE wc.lead_id = v_dispatch.lead_id AND wc.organization_id = v_dispatch.organization_id
    AND wc.evolution_instance_id IS NOT NULL
  ORDER BY wc.updated_at DESC NULLS LAST, wc.created_at DESC
  LIMIT 1;

  IF v_dispatch.scheduling_source_message_id IS NOT DISTINCT FROM v_facts.promised_date_source_message_id
     AND v_dispatch.agreed_date IS NOT DISTINCT FROM v_facts.effective_promised_date
     AND v_dispatch.connection_id IS NOT DISTINCT FROM v_connection_id THEN
    RETURN QUERY SELECT 'inputs_unchanged'::text; RETURN;
  END IF;

  UPDATE public.manual_charge_dispatches
  SET agreed_date = v_facts.effective_promised_date,
      agreed_date_precision = COALESCE(v_facts.promised_date_precision, 'exact'),
      scheduling_source_message_id = v_facts.promised_date_source_message_id,
      connection_id = v_connection_id,
      scheduling_status = 'unscheduled',
      planned_send_at = NULL
  WHERE id = p_dispatch_id;

  RETURN QUERY SELECT 'inputs_captured'::text;
END;
$$;

COMMENT ON FUNCTION public.manual_charge_capture_scheduling_inputs IS
  'CORRIGIDO 20260923195721: agora também propaga agreed_date_precision (exact/flexible_period_start) do fato vigente para o dispatch -- usado por manual_charge_schedule_dispatch para diferenciar data exata (expõe conflito de capacidade) de período flexível (avança dentro da janela aprovada).';

REVOKE ALL ON FUNCTION public.manual_charge_capture_scheduling_inputs(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.manual_charge_capture_scheduling_inputs(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.manual_charge_schedule_dispatch(
  p_dispatch_id uuid
) RETURNS TABLE(status text, planned_send_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_dispatch RECORD;
  v_lead RECORD;
  v_config RECORD;
  v_global_floor timestamptz := '2026-09-29 09:00:00-03'::timestamptz;
  v_window_minutes integer;
  v_offset_minutes integer;
  v_candidate_date date;
  v_candidate_instant timestamptz;
  v_scheduled_count integer;
  v_days_tried integer := 0;
  v_max_days_lookahead_flexible constant integer := 13; -- ~2 semanas de folga dentro da janela aprovada
BEGIN
  SELECT * INTO v_dispatch FROM public.manual_charge_dispatches WHERE id = p_dispatch_id;
  IF v_dispatch IS NULL THEN
    RETURN QUERY SELECT 'dispatch_not_found'::text, NULL::timestamptz; RETURN;
  END IF;

  IF v_dispatch.scheduling_status <> 'unscheduled' THEN
    RETURN QUERY SELECT v_dispatch.scheduling_status, v_dispatch.planned_send_at; RETURN;
  END IF;

  IF v_dispatch.connection_id IS NULL THEN
    UPDATE public.manual_charge_dispatches SET scheduling_status = 'blocked_no_connection' WHERE id = p_dispatch_id;
    RETURN QUERY SELECT 'blocked_no_connection'::text, NULL::timestamptz; RETURN;
  END IF;

  SELECT * INTO v_lead FROM public.leads WHERE id = v_dispatch.lead_id;
  IF v_lead.preferred_timezone IS NULL THEN
    UPDATE public.manual_charge_dispatches SET scheduling_status = 'blocked_no_timezone' WHERE id = p_dispatch_id;
    RETURN QUERY SELECT 'blocked_no_timezone'::text, NULL::timestamptz; RETURN;
  END IF;

  IF v_dispatch.agreed_date < '2026-09-29'::date THEN
    UPDATE public.manual_charge_dispatches SET scheduling_status = 'blocked_overdue_promise_pending_rule' WHERE id = p_dispatch_id;
    RETURN QUERY SELECT 'blocked_overdue_promise_pending_rule'::text, NULL::timestamptz; RETURN;
  END IF;

  SELECT * INTO v_config FROM public.manual_charge_scheduling_config WHERE organization_id = v_dispatch.organization_id;
  IF v_config IS NULL THEN
    INSERT INTO public.manual_charge_scheduling_config (organization_id) VALUES (v_dispatch.organization_id)
    RETURNING * INTO v_config;
  END IF;

  v_window_minutes := EXTRACT(EPOCH FROM (v_config.window_end_local - v_config.window_start_local))::integer / 60;
  v_offset_minutes := (('x' || substr(md5(p_dispatch_id::text), 1, 8))::bit(32)::bigint) % v_window_minutes;

  v_candidate_date := v_dispatch.agreed_date;

  LOOP
    v_candidate_instant := GREATEST(
      v_global_floor,
      ((v_candidate_date + v_config.window_start_local)::timestamp AT TIME ZONE v_lead.preferred_timezone)
        + make_interval(mins => v_offset_minutes)
    );

    PERFORM pg_advisory_xact_lock(hashtextextended(
      v_dispatch.connection_id::text || ':' || v_candidate_date::text, 0));

    SELECT count(*) INTO v_scheduled_count
    FROM public.manual_charge_dispatches d2
    WHERE d2.connection_id = v_dispatch.connection_id
      AND d2.scheduling_status = 'scheduled'
      AND (d2.planned_send_at AT TIME ZONE v_lead.preferred_timezone)::date = v_candidate_date;

    IF v_scheduled_count < v_config.daily_cap_per_connection THEN
      EXIT;
    END IF;

    -- Data EXATA combinada: capacidade esgotada expõe o conflito e para
    -- -- nunca muda o dia sozinho (comportamento já corrigido antes).
    IF COALESCE(v_dispatch.agreed_date_precision, 'exact') = 'exact' THEN
      UPDATE public.manual_charge_dispatches SET scheduling_status = 'blocked_capacity' WHERE id = p_dispatch_id;
      RETURN QUERY SELECT 'blocked_capacity'::text, NULL::timestamptz; RETURN;
    END IF;

    -- Período FLEXÍVEL ("final do mês"): avança dentro da janela
    -- aprovada, sempre respeitando o cap -- nunca concentra tudo no
    -- primeiro dia, nunca excede o limite diário.
    v_candidate_date := v_candidate_date + 1;
    v_days_tried := v_days_tried + 1;
    IF v_days_tried > v_max_days_lookahead_flexible THEN
      UPDATE public.manual_charge_dispatches SET scheduling_status = 'blocked_capacity' WHERE id = p_dispatch_id;
      RETURN QUERY SELECT 'blocked_capacity'::text, NULL::timestamptz; RETURN;
    END IF;
  END LOOP;

  UPDATE public.manual_charge_dispatches
  SET planned_send_at = v_candidate_instant, scheduling_status = 'scheduled'
  WHERE id = p_dispatch_id AND scheduling_status = 'unscheduled'
  RETURNING manual_charge_dispatches.planned_send_at INTO v_candidate_instant;

  IF v_candidate_instant IS NULL THEN
    SELECT d.scheduling_status, d.planned_send_at INTO v_dispatch.scheduling_status, v_candidate_instant
    FROM public.manual_charge_dispatches d WHERE d.id = p_dispatch_id;
    RETURN QUERY SELECT v_dispatch.scheduling_status, v_candidate_instant; RETURN;
  END IF;

  RETURN QUERY SELECT 'scheduled'::text, v_candidate_instant;
END;
$$;

COMMENT ON FUNCTION public.manual_charge_schedule_dispatch IS
  'CORRIGIDO 20260923195721: diferencia agreed_date_precision -- data exata sem capacidade expõe blocked_capacity e para (nunca muda o dia); período flexível ("final do mês") sem capacidade no dia avança até 13 dias dentro da janela aprovada, sempre respeitando o cap por dia (nunca concentra tudo no dia 29, nunca excede o limite).';

REVOKE ALL ON FUNCTION public.manual_charge_schedule_dispatch(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.manual_charge_schedule_dispatch(uuid) TO service_role;
