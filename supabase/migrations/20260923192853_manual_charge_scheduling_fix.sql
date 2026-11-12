-- ═══════════════════════════════════════════════════════════════════════
-- Duas correções reais, achadas ao projetar os testes pedidos na revisão
-- (nenhuma delas foi um defeito hipotético -- as duas foram raciocinadas
-- a partir de cenários concretos que os testes anteriores não cobriam).
-- Não reedita a migration de agendamento (20260923191030) nem nenhuma
-- outra anterior -- correções via CREATE OR REPLACE nesta migration nova.
--
-- CORREÇÃO 1 -- desempate de correção de classificação por detected_at
-- reativava interpretação antiga sob reprocessamento tardio:
--   manual_charge_conversation_current_facts desempatava
--   message_occurred_at empatado por detected_at DESC. Isso é correto
--   quando as DUAS linhas vêm de mensagens DIFERENTES processadas fora
--   de ordem (já testado). MAS: para a MESMA mensagem, uma correção
--   (classifier_version mais nova, decision_key diferente) seguida de um
--   reprocessamento TARDIO da classificação ANTIGA (ex.: um worker
--   duplicado/lento que ainda usava o classificador desatualizado,
--   terminando DEPOIS da correção) teria detected_at MAIOR que a
--   correção -- e venceria erroneamente, reativando a interpretação
--   velha. Corrigido: para linhas da MESMA mensagem, a precedência agora
--   é por classifier_version (numérica, maior vence), com detected_at
--   como desempate SÓ quando a versão não for comparável (não-numérica)
--   -- nunca mais entre uma correção e um reprocessamento tardio da
--   versão antiga da MESMA mensagem.
--
-- CORREÇÃO 2 -- capacidade esgotada empurrava silenciosamente para o dia
-- seguinte, mudando de fato quando o lead seria cobrado sem nunca ter
-- concordado com isso:
--   manual_charge_schedule_dispatch tinha um loop que avançava a data
--   candidata quando a capacidade diária da conexão estourava. Isso
--   silenciosamente adiava o envio para um dia que o lead nunca
--   combinou -- exatamente o "mudar o acordo" que o requisito proíbe.
--   Corrigido: capacidade esgotada no dia efetivamente combinado agora
--   bloqueia com scheduling_status='blocked_capacity' e PARA -- nunca
--   tenta outro dia sozinho. Um operador humano decide (aumentar
--   capacidade, mover manualmente, etc.), nunca o agendador.
--   Efeito colateral corrigido junto: a checagem de capacidade era
--   "SELECT count(*) depois UPDATE" -- corrida clássica entre duas
--   chamadas concorrentes para o MESMO dia/conexão, cada uma vendo
--   contagem abaixo do limite antes de qualquer commit, e as duas
--   agendando -- estourando o cap. Adicionado
--   pg_advisory_xact_lock(conexão+data) ANTES da contagem, mesmo padrão
--   já usado em claim_charge_for_send.
-- ═══════════════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS public.manual_charge_conversation_current_facts(uuid);

CREATE FUNCTION public.manual_charge_conversation_current_facts(
  p_dispatch_id uuid
) RETURNS TABLE(
  effective_promised_date date,
  promised_date_source_message_id uuid,
  promised_date_occurred_at_source text,
  has_pending_ambiguous_signal boolean,
  ambiguous_source_message_id uuid
)
LANGUAGE sql
STABLE
SET search_path TO ''
AS $$
  WITH per_message_current AS (
    -- Para cada mensagem, a linha "vigente" daquela mensagem: prefere
    -- classifier_version numérica MAIOR (uma correção real); detected_at
    -- só desempata quando a versão não é comparável -- nunca decide
    -- entre uma correção e uma classificação antiga da MESMA mensagem.
    SELECT DISTINCT ON (f.source_message_id)
      f.source_message_id, f.message_occurred_at, f.promised_date, f.occurred_at_source
    FROM public.manual_charge_conversation_facts f
    WHERE f.dispatch_id = p_dispatch_id AND f.fact_type = 'promised_date'
    ORDER BY f.source_message_id,
      (f.classifier_version ~ '^[0-9]+$') DESC,
      CASE WHEN f.classifier_version ~ '^[0-9]+$' THEN f.classifier_version::bigint ELSE NULL END DESC NULLS LAST,
      f.detected_at DESC
  ),
  latest_promised AS (
    SELECT source_message_id, promised_date, occurred_at_source
    FROM per_message_current
    ORDER BY message_occurred_at DESC
    LIMIT 1
  ),
  latest_business_signal AS (
    SELECT max(f.message_occurred_at) AS ts
    FROM public.manual_charge_conversation_facts f
    WHERE f.dispatch_id = p_dispatch_id
      AND f.fact_type IN ('promised_date', 'postponement_requested')
  ),
  latest_ambiguous AS (
    SELECT f.source_message_id, f.message_occurred_at
    FROM public.manual_charge_conversation_facts f
    WHERE f.dispatch_id = p_dispatch_id AND f.fact_type IN ('ambiguous', 'no_signal')
    ORDER BY f.message_occurred_at DESC, f.detected_at DESC
    LIMIT 1
  )
  SELECT
    (SELECT promised_date FROM latest_promised),
    (SELECT source_message_id FROM latest_promised),
    (SELECT occurred_at_source FROM latest_promised),
    EXISTS (
      SELECT 1 FROM latest_ambiguous la
      WHERE la.message_occurred_at > COALESCE((SELECT ts FROM latest_business_signal), '-infinity'::timestamptz)
    ),
    (SELECT source_message_id FROM latest_ambiguous la
      WHERE la.message_occurred_at > COALESCE((SELECT ts FROM latest_business_signal), '-infinity'::timestamptz));
$$;

COMMENT ON FUNCTION public.manual_charge_conversation_current_facts IS
  'CORRIGIDO 20260923192853: para a MESMA mensagem, a linha vigente é escolhida por classifier_version numérica (maior vence), nunca por detected_at -- um reprocessamento tardio da classificação antiga nunca reativa uma interpretação já corrigida. Entre mensagens DIFERENTES, continua por message_occurred_at DESC (ordem real de ocorrência, não de inserção/chamada).';

REVOKE ALL ON FUNCTION public.manual_charge_conversation_current_facts(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.manual_charge_conversation_current_facts(uuid) TO authenticated, service_role;

-- ═══════════════════════════════════════════════════════════════════════

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
  v_candidate_instant timestamptz;
  v_scheduled_count integer;
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

  v_candidate_instant := GREATEST(
    v_global_floor,
    ((v_dispatch.agreed_date + v_config.window_start_local)::timestamp AT TIME ZONE v_lead.preferred_timezone)
      + make_interval(mins => v_offset_minutes)
  );

  -- Serializa concorrência para o MESMO connection_id + dia local --
  -- sem isso, duas chamadas concorrentes poderiam ambas ler a contagem
  -- abaixo do limite antes de qualquer uma commitar, e as duas
  -- agendarem, estourando o cap (achado real de revisão).
  PERFORM pg_advisory_xact_lock(hashtextextended(
    v_dispatch.connection_id::text || ':' || v_dispatch.agreed_date::text, 0));

  SELECT count(*) INTO v_scheduled_count
  FROM public.manual_charge_dispatches d2
  WHERE d2.connection_id = v_dispatch.connection_id
    AND d2.scheduling_status = 'scheduled'
    AND (d2.planned_send_at AT TIME ZONE v_lead.preferred_timezone)::date = v_dispatch.agreed_date;

  IF v_scheduled_count >= v_config.daily_cap_per_connection THEN
    -- NUNCA empurra silenciosamente para outro dia -- isso mudaria a
    -- data combinada sem o lead ter concordado. Expõe o conflito para
    -- decisão humana (aumentar capacidade, mover manualmente,
    -- renegociar).
    UPDATE public.manual_charge_dispatches SET scheduling_status = 'blocked_capacity' WHERE id = p_dispatch_id;
    RETURN QUERY SELECT 'blocked_capacity'::text, NULL::timestamptz; RETURN;
  END IF;

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
  'CORRIGIDO 20260923192853: capacidade esgotada no dia combinado agora bloqueia (blocked_capacity) e PARA -- nunca empurra silenciosamente para outro dia (isso mudaria a data sem o lead concordar). pg_advisory_xact_lock(conexão+dia) serializa a checagem de capacidade contra chamadas concorrentes -- sem isso, duas chamadas simultâneas podiam ambas passar pelo cap.';

REVOKE ALL ON FUNCTION public.manual_charge_schedule_dispatch(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.manual_charge_schedule_dispatch(uuid) TO service_role;
