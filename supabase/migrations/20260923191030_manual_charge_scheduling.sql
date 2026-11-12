-- ═══════════════════════════════════════════════════════════════════════
-- Agendamento persistido (Seção 3/9 do requisito) -- horário distribuído
-- calculado UMA VEZ e gravado, respeitando fuso do lead, capacidade por
-- conexão, piso global de data, e a distinção entre promessa vencida
-- (pendência separada) vs. promessa de final de mês (já aprovada a
-- partir de 29/09/2026).
--
-- ESCOPO: schema + functions de cálculo/revalidação. NENHUM cron real é
-- agendado, NENHUM flag de ativação é ligado -- manual_charge_schedule_pending
-- fica pronta para ser chamada por um futuro cron.schedule (não criado
-- aqui) ou manualmente para teste.
-- ═══════════════════════════════════════════════════════════════════════

-- ── Pré-requisito de FK composta contra evolution_instances (tabela real
--    já existente, nunca criada por esta feature) ──
ALTER TABLE public.evolution_instances
  ADD CONSTRAINT evolution_instances_organization_id_id_uk UNIQUE (organization_id, id);

-- ── Seção 9: idioma/locale/fuso do lead, com origem/confiança
--    explicitamente rastreadas -- nunca escolhidos silenciosamente. NULL
--    significa "desconhecido", tratado como bloqueio para revisão pelo
--    agendador, nunca como um fuso padrão silencioso. ──
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS preferred_timezone text,
  ADD COLUMN IF NOT EXISTS preferred_locale text,
  ADD COLUMN IF NOT EXISTS timezone_source text
    CHECK (timezone_source IS NULL OR timezone_source IN ('explicit', 'conversation_detected', 'country_hint')),
  ADD COLUMN IF NOT EXISTS timezone_confidence numeric
    CHECK (timezone_confidence IS NULL OR (timezone_confidence >= 0 AND timezone_confidence <= 1));

COMMENT ON COLUMN public.leads.preferred_timezone IS
  'IANA timezone (ex.: America/Sao_Paulo, America/Mexico_City). NULL = desconhecido -- manual_charge_capture_scheduling_inputs recusa agendar sem isso, nunca assume um fuso padrão.';
COMMENT ON COLUMN public.leads.timezone_source IS
  'Proveniência: explicit (informado pelo lead), conversation_detected (inferido do texto), country_hint (só palpite do DDI -- nunca determinante sozinho, ver requisito Seção 9).';

-- ── Config de distribuição/capacidade -- valores PROPOSTOS com
--    justificativa, pendentes de aprovação de negócio. Não desbloqueiam
--    envio algum por si só (isso continua exclusivamente controlado por
--    manual_charge_dispatch_claim_enabled / manual_charge_manual_trigger_enabled,
--    ambas false). ──
CREATE TABLE public.manual_charge_scheduling_config (
  organization_id uuid PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  -- Justificativa proposta: 40/dia/conexão fica bem abaixo de limites
  -- informais observados em canários WhatsApp não-oficiais -- valor
  -- conservador de partida, não uma medição real desta organização.
  daily_cap_per_connection integer NOT NULL DEFAULT 40 CHECK (daily_cap_per_connection > 0),
  -- Justificativa proposta: janela comercial ampla o suficiente para
  -- distribuir sem concentrar, mas sem invadir horário noturno do lead.
  window_start_local time NOT NULL DEFAULT '09:00',
  window_end_local time NOT NULL DEFAULT '18:00',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (window_start_local < window_end_local)
);

COMMENT ON TABLE public.manual_charge_scheduling_config IS
  'Valores PROPOSTOS (daily_cap_per_connection=40, janela 09h-18h local do lead) -- pendentes de aprovação explícita de negócio. Nenhuma linha aqui libera envio -- isso continua sob os flags de ativação (Seção 7), sempre false nesta fase.';

CREATE TRIGGER manual_charge_scheduling_config_touch_updated_at
  BEFORE UPDATE ON public.manual_charge_scheduling_config
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

REVOKE ALL ON public.manual_charge_scheduling_config FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.manual_charge_scheduling_config TO authenticated;
ALTER TABLE public.manual_charge_scheduling_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "manual_charge_scheduling_config_org_read" ON public.manual_charge_scheduling_config
  FOR SELECT TO authenticated
  USING (public.manual_charge_actor_authorized(organization_id));

-- ── Campos de agendamento no dispatch. planned_send_at, uma vez gravado,
--    NUNCA é recalculado pelo agendador (idempotência -- "sem novo
--    sorteio a cada execução"). Só uma nova evidência de data (promessa
--    diferente) força scheduling_status de volta a 'unscheduled' via
--    manual_charge_capture_scheduling_inputs (nunca automaticamente por
--    aqui). ──
ALTER TABLE public.manual_charge_dispatches
  ADD COLUMN connection_id uuid,
  ADD COLUMN agreed_date date,
  ADD COLUMN scheduling_source_message_id uuid REFERENCES public.webchat_messages(id) ON DELETE SET NULL,
  ADD COLUMN planned_send_at timestamptz,
  ADD COLUMN scheduling_status text NOT NULL DEFAULT 'unscheduled' CHECK (scheduling_status IN (
    'unscheduled', 'scheduled',
    'blocked_no_connection', 'blocked_no_timezone', 'blocked_capacity',
    'blocked_overdue_promise_pending_rule', 'blocked_ambiguous_order'
  ));

ALTER TABLE public.manual_charge_dispatches
  ADD CONSTRAINT manual_charge_dispatches_org_connection_fkey
  FOREIGN KEY (organization_id, connection_id) REFERENCES public.evolution_instances (organization_id, id) ON DELETE RESTRICT;

CREATE INDEX manual_charge_dispatches_scheduling_idx
  ON public.manual_charge_dispatches (organization_id, scheduling_status, planned_send_at)
  WHERE scheduling_status = 'scheduled';

COMMENT ON COLUMN public.manual_charge_dispatches.planned_send_at IS
  'Horário distribuído, calculado UMA VEZ por manual_charge_schedule_dispatch e nunca re-sorteado. Chamar o agendador de novo para um dispatch já scheduled é no-op -- idempotente por construção (WHERE scheduling_status=''unscheduled'' no UPDATE).';
COMMENT ON COLUMN public.manual_charge_dispatches.scheduling_status IS
  'blocked_overdue_promise_pending_rule: promised_date < 29/09/2026 (piso aprovado) -- pendência de regra de negócio separada, nunca cobrada automaticamente sem definição explícita. blocked_ambiguous_order: a promessa vigente foi decidida por ordem de INSERÇÃO (sem timestamp nativo do provedor) E existe mais de uma data prometida distinta no histórico -- não se libera envio por suposição de ordem.';

-- ═══════════════════════════════════════════════════════════════════════
-- manual_charge_capture_scheduling_inputs -- lê o estado mais atual
-- (conversation_facts + leads + webchat_conversations) e grava
-- agreed_date/lead_timezone(indireto via connection)/connection_id no
-- dispatch. Idempotente: só sobrescreve quando a evidência de origem
-- (scheduling_source_message_id) mudou -- nunca reescreve por execução
-- repetida com a mesma evidência.
-- ═══════════════════════════════════════════════════════════════════════

CREATE FUNCTION public.manual_charge_capture_scheduling_inputs(
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

  SELECT effective_promised_date, promised_date_source_message_id, promised_date_occurred_at_source
  INTO v_facts
  FROM public.manual_charge_conversation_current_facts(p_dispatch_id);

  IF v_facts.effective_promised_date IS NULL THEN
    RETURN QUERY SELECT 'no_promised_date_yet'::text; RETURN;
  END IF;

  -- Não libera envio por suposição de ordem: se a promessa vigente veio
  -- do fallback de inserção (sem timestamp nativo) E existe mais de uma
  -- data prometida distinta no histórico deste dispatch, a ordem não é
  -- confiável o bastante para decidir sozinha -- bloqueia para revisão em
  -- vez de agendar com base numa suposição.
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

  -- Conexão: a mais recente vinculada a uma conversa deste lead (nunca
  -- presumida -- ausência de vínculo bloqueia).
  SELECT wc.evolution_instance_id INTO v_connection_id
  FROM public.webchat_conversations wc
  WHERE wc.lead_id = v_dispatch.lead_id AND wc.organization_id = v_dispatch.organization_id
    AND wc.evolution_instance_id IS NOT NULL
  ORDER BY wc.updated_at DESC NULLS LAST, wc.created_at DESC
  LIMIT 1;

  -- Idempotência real: só regrava quando a EVIDÊNCIA de origem mudou
  -- (nova mensagem decidindo uma data diferente) -- nunca reseta um
  -- planned_send_at já calculado para a mesma evidência.
  IF v_dispatch.scheduling_source_message_id IS NOT DISTINCT FROM v_facts.promised_date_source_message_id
     AND v_dispatch.agreed_date IS NOT DISTINCT FROM v_facts.effective_promised_date
     AND v_dispatch.connection_id IS NOT DISTINCT FROM v_connection_id THEN
    RETURN QUERY SELECT 'inputs_unchanged'::text; RETURN;
  END IF;

  UPDATE public.manual_charge_dispatches
  SET agreed_date = v_facts.effective_promised_date,
      scheduling_source_message_id = v_facts.promised_date_source_message_id,
      connection_id = v_connection_id,
      -- Nova evidência invalida um agendamento anterior -- nunca aplica a
      -- data antiga silenciosamente. superseded é só um marcador
      -- transitório: o próximo passo (manual_charge_schedule_dispatch)
      -- decide o estado final real.
      scheduling_status = 'unscheduled',
      planned_send_at = NULL
  WHERE id = p_dispatch_id;

  RETURN QUERY SELECT 'inputs_captured'::text;
END;
$$;

COMMENT ON FUNCTION public.manual_charge_capture_scheduling_inputs IS
  'Lê conversation_facts (promessa vigente) + conexão vinculada e grava no dispatch. Idempotente por evidência (scheduling_source_message_id) -- reprocessar sem novidade é no-op. Recusa decidir a data quando a ordem das mensagens não é confiável (fallback + múltiplas datas distintas no histórico) -- bloqueia para revisão em vez de assumir.';

REVOKE ALL ON FUNCTION public.manual_charge_capture_scheduling_inputs(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.manual_charge_capture_scheduling_inputs(uuid) TO service_role;

-- ═══════════════════════════════════════════════════════════════════════
-- manual_charge_schedule_dispatch -- calcula planned_send_at UMA VEZ
-- (idempotente: WHERE scheduling_status='unscheduled' no UPDATE final).
-- Distribuição determinística por hash do dispatch_id (nunca random() --
-- a mesma entrada sempre produz o mesmo deslocamento, então mesmo uma
-- reexecução acidental nunca "resorteia").
-- ═══════════════════════════════════════════════════════════════════════

CREATE FUNCTION public.manual_charge_schedule_dispatch(
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
  v_max_days_lookahead constant integer := 30;
BEGIN
  SELECT * INTO v_dispatch FROM public.manual_charge_dispatches WHERE id = p_dispatch_id;
  IF v_dispatch IS NULL THEN
    RETURN QUERY SELECT 'dispatch_not_found'::text, NULL::timestamptz; RETURN;
  END IF;

  IF v_dispatch.scheduling_status <> 'unscheduled' THEN
    -- Idempotente: já scheduled (ou bloqueado por um motivo específico já
    -- registrado) -- nunca recalcula.
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
    -- Promessa vencida em relação ao piso já aprovado -- pendência de
    -- regra separada, NUNCA cobrada imediatamente. Só promessas
    -- resolvidas para >= 29/09/2026 (inclusive "final de setembro",
    -- que o classificador já deve resolver para essa data) seguem.
    UPDATE public.manual_charge_dispatches SET scheduling_status = 'blocked_overdue_promise_pending_rule' WHERE id = p_dispatch_id;
    RETURN QUERY SELECT 'blocked_overdue_promise_pending_rule'::text, NULL::timestamptz; RETURN;
  END IF;

  SELECT * INTO v_config FROM public.manual_charge_scheduling_config WHERE organization_id = v_dispatch.organization_id;
  IF v_config IS NULL THEN
    INSERT INTO public.manual_charge_scheduling_config (organization_id) VALUES (v_dispatch.organization_id)
    RETURNING * INTO v_config;
  END IF;

  v_window_minutes := EXTRACT(EPOCH FROM (v_config.window_end_local - v_config.window_start_local))::integer / 60;
  -- Deslocamento determinístico (0..window_minutes-1) a partir de 8 hex
  -- do md5 do dispatch_id -- mesma entrada, mesma saída, sempre.
  v_offset_minutes := (('x' || substr(md5(p_dispatch_id::text), 1, 8))::bit(32)::bigint) % v_window_minutes;

  v_candidate_date := v_dispatch.agreed_date;

  LOOP
    v_candidate_instant := GREATEST(
      v_global_floor,
      ((v_candidate_date + v_config.window_start_local)::timestamp AT TIME ZONE v_lead.preferred_timezone)
        + make_interval(mins => v_offset_minutes)
    );

    -- Capacidade por conexão/dia: conta o que já está scheduled para essa
    -- MESMA conexão, no MESMO dia local do lead -- se estourou, tenta o
    -- próximo dia (nunca excede o limite, nunca muda o acordo -- só
    -- adia dentro da janela seguinte).
    SELECT count(*) INTO v_scheduled_count
    FROM public.manual_charge_dispatches d2
    WHERE d2.connection_id = v_dispatch.connection_id
      AND d2.scheduling_status = 'scheduled'
      AND (d2.planned_send_at AT TIME ZONE v_lead.preferred_timezone)::date = v_candidate_date;

    IF v_scheduled_count < v_config.daily_cap_per_connection THEN
      EXIT;
    END IF;

    v_candidate_date := v_candidate_date + 1;
    v_days_tried := v_days_tried + 1;
    IF v_days_tried > v_max_days_lookahead THEN
      UPDATE public.manual_charge_dispatches SET scheduling_status = 'blocked_capacity' WHERE id = p_dispatch_id;
      RETURN QUERY SELECT 'blocked_capacity'::text, NULL::timestamptz; RETURN;
    END IF;
  END LOOP;

  UPDATE public.manual_charge_dispatches
  SET planned_send_at = v_candidate_instant, scheduling_status = 'scheduled'
  WHERE id = p_dispatch_id AND scheduling_status = 'unscheduled'
  RETURNING manual_charge_dispatches.planned_send_at INTO v_candidate_instant;

  IF v_candidate_instant IS NULL THEN
    -- Corrida: outra chamada concorrente já agendou/bloqueou entre a
    -- leitura e agora -- devolve o estado real, nunca sobrescreve.
    SELECT d.scheduling_status, d.planned_send_at INTO v_dispatch.scheduling_status, v_candidate_instant
    FROM public.manual_charge_dispatches d WHERE d.id = p_dispatch_id;
    RETURN QUERY SELECT v_dispatch.scheduling_status, v_candidate_instant; RETURN;
  END IF;

  RETURN QUERY SELECT 'scheduled'::text, v_candidate_instant;
END;
$$;

COMMENT ON FUNCTION public.manual_charge_schedule_dispatch IS
  'Calcula planned_send_at UMA VEZ (idempotente via WHERE scheduling_status=''unscheduled''). Deslocamento determinístico por hash do dispatch_id (nunca random()) -- reexecutar nunca resorteia. Respeita: piso global 29/09/2026 09h America/Recife, janela local do lead (IANA timezone, DST-safe via AT TIME ZONE), capacidade diária por conexão (adia para o próximo dia sem exceder, nunca muda o acordo). Bloqueia (não agenda) promessas vencidas antes do piso -- pendência de regra separada.';

REVOKE ALL ON FUNCTION public.manual_charge_schedule_dispatch(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.manual_charge_schedule_dispatch(uuid) TO service_role;

-- ═══════════════════════════════════════════════════════════════════════
-- manual_charge_schedule_pending -- ponto de entrada em lote (para um
-- FUTURO cron, não criado/agendado nesta migration). Idempotente: só
-- toca dispatches unscheduled; nunca reprocessa um já scheduled/bloqueado
-- (evita rajada ao reiniciar -- reconexão/restart nunca "descarrega a
-- fila" porque o que já tem planned_send_at nunca é recalculado).
-- ═══════════════════════════════════════════════════════════════════════

CREATE FUNCTION public.manual_charge_schedule_pending(
  p_organization_id uuid
) RETURNS TABLE(dispatch_id uuid, status text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_id uuid;
  v_capture_status text;
  v_schedule_status text;
BEGIN
  FOR v_id IN
    SELECT d.id FROM public.manual_charge_dispatches d
    WHERE d.organization_id = p_organization_id AND d.status = 'eligible'
      AND d.scheduling_status = 'unscheduled'
  LOOP
    SELECT c.status INTO v_capture_status FROM public.manual_charge_capture_scheduling_inputs(v_id) c;
    IF v_capture_status IN ('inputs_captured', 'inputs_unchanged') THEN
      SELECT s.status INTO v_schedule_status FROM public.manual_charge_schedule_dispatch(v_id) s;
    ELSE
      v_schedule_status := v_capture_status;
    END IF;
    dispatch_id := v_id; status := v_schedule_status;
    RETURN NEXT;
  END LOOP;
END;
$$;

COMMENT ON FUNCTION public.manual_charge_schedule_pending IS
  'Ponto de entrada em lote, pronto para um futuro cron.schedule (NÃO criado/agendado aqui). Só toca dispatches eligible+unscheduled -- nunca reprocessa um já scheduled, então reinício/reconexão nunca causa rajada.';

REVOKE ALL ON FUNCTION public.manual_charge_schedule_pending(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.manual_charge_schedule_pending(uuid) TO service_role;

-- ═══════════════════════════════════════════════════════════════════════
-- manual_charge_prevalidate_send -- revalidação IMEDIATAMENTE antes do
-- envio (mensagens novas, pagamento, recusa, pausa via
-- manual_charge_evaluate; agendamento, janela local, conexão via os
-- campos desta migration). Usada por manual E automático -- nunca duas
-- cópias das mesmas regras.
-- ═══════════════════════════════════════════════════════════════════════

CREATE FUNCTION public.manual_charge_prevalidate_send(
  p_dispatch_id uuid
) RETURNS TABLE(ok boolean, reason text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_dispatch RECORD;
  v_lead RECORD;
  v_connection RECORD;
  v_config RECORD;
  v_now_local time;
  v_current_status text;
BEGIN
  PERFORM public.manual_charge_evaluate(p_dispatch_id);

  SELECT * INTO v_dispatch FROM public.manual_charge_dispatches WHERE id = p_dispatch_id;
  IF v_dispatch IS NULL THEN
    RETURN QUERY SELECT false, 'dispatch_not_found'::text; RETURN;
  END IF;

  IF v_dispatch.status NOT IN ('eligible', 'reconciled_not_sent') THEN
    RETURN QUERY SELECT false, ('not_eligible:' || v_dispatch.status)::text; RETURN;
  END IF;

  IF v_dispatch.scheduling_status <> 'scheduled' OR v_dispatch.planned_send_at IS NULL THEN
    RETURN QUERY SELECT false, ('scheduling_incomplete:' || v_dispatch.scheduling_status)::text; RETURN;
  END IF;

  IF now() < v_dispatch.planned_send_at THEN
    RETURN QUERY SELECT false, 'before_planned_send_at'::text; RETURN;
  END IF;

  SELECT * INTO v_lead FROM public.leads WHERE id = v_dispatch.lead_id;
  IF v_lead.preferred_timezone IS NULL THEN
    RETURN QUERY SELECT false, 'no_timezone'::text; RETURN;
  END IF;

  SELECT * INTO v_connection FROM public.evolution_instances WHERE id = v_dispatch.connection_id;
  IF v_connection IS NULL OR v_connection.status IS DISTINCT FROM 'connected' OR v_connection.is_active IS NOT TRUE THEN
    RETURN QUERY SELECT false, 'connection_unavailable'::text; RETURN;
  END IF;

  SELECT * INTO v_config FROM public.manual_charge_scheduling_config WHERE organization_id = v_dispatch.organization_id;
  IF v_config IS NOT NULL THEN
    v_now_local := (now() AT TIME ZONE v_lead.preferred_timezone)::time;
    IF v_now_local < v_config.window_start_local OR v_now_local > v_config.window_end_local THEN
      RETURN QUERY SELECT false, 'outside_local_window'::text; RETURN;
    END IF;
  END IF;

  RETURN QUERY SELECT true, NULL::text;
END;
$$;

COMMENT ON FUNCTION public.manual_charge_prevalidate_send IS
  'Revalidação única, usada por manual E automático, imediatamente antes do envio: reavalia pagamento/recusa/pausa/mensagens novas (manual_charge_evaluate) e confere agendamento/janela local/conexão (campos desta migration). Retorna ok=false com o motivo exato sempre que qualquer barreira não for satisfeita -- nunca um "sucesso" parcial.';

REVOKE ALL ON FUNCTION public.manual_charge_prevalidate_send(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.manual_charge_prevalidate_send(uuid) TO service_role;

-- ═══════════════════════════════════════════════════════════════════════
-- Disparo manual agora EXIGE manual_charge_prevalidate_send=true --
-- enquanto faltar agendamento/janela/conexão, bloqueia no SERVIDOR,
-- nunca dependendo só do botão estar desabilitado na UI.
-- ═══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.manual_charge_trigger_manual_send(
  p_dispatch_id uuid,
  p_reason text
) RETURNS TABLE(outcome text, disposition_reason text, claim_token uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_org uuid;
  v_outcome text;
  v_claim_token uuid;
  v_trigger_enabled boolean;
  v_min_date_floor timestamptz := '2026-09-29 09:00:00-03'::timestamptz;
  v_pre_ok boolean;
  v_pre_reason text;
  v_claim_status text;
BEGIN
  IF p_reason IS NULL OR btrim(p_reason) = '' THEN
    RAISE EXCEPTION 'reason_required' USING ERRCODE = 'P0010';
  END IF;

  SELECT organization_id INTO v_org
  FROM public.manual_charge_dispatches
  WHERE id = p_dispatch_id;

  IF public.manual_charge_actor_authorized(v_org) IS NOT TRUE THEN
    RAISE EXCEPTION 'unauthorized_actor' USING ERRCODE = '42501';
  END IF;

  IF v_org IS NULL THEN
    RAISE EXCEPTION 'dispatch_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF now() < v_min_date_floor THEN
    v_outcome := 'blocked_min_date';
    INSERT INTO public.manual_charge_manual_trigger_events
      (organization_id, dispatch_id, actor, reason, outcome, disposition_reason)
    VALUES (v_org, p_dispatch_id, v_actor, p_reason, v_outcome, 'before_min_date_floor');
    RETURN QUERY SELECT v_outcome, 'before_min_date_floor'::text, NULL::uuid;
    RETURN;
  END IF;

  SELECT enabled INTO v_trigger_enabled
  FROM public.recovery_feature_flags WHERE key = 'manual_charge_manual_trigger_enabled';

  IF COALESCE(v_trigger_enabled, false) IS NOT TRUE THEN
    v_outcome := 'trigger_disabled';
    INSERT INTO public.manual_charge_manual_trigger_events
      (organization_id, dispatch_id, actor, reason, outcome, disposition_reason)
    VALUES (v_org, p_dispatch_id, v_actor, p_reason, v_outcome, 'manual_trigger_flag_off');
    RETURN QUERY SELECT v_outcome, 'manual_trigger_flag_off'::text, NULL::uuid;
    RETURN;
  END IF;

  -- Revalidação única e exaustiva: pagamento/recusa/pausa/mensagens novas
  -- E agendamento/janela local/conexão -- enquanto qualquer um faltar ou
  -- falhar, bloqueia no servidor, independente do estado do botão na UI.
  SELECT p.ok, p.reason INTO v_pre_ok, v_pre_reason FROM public.manual_charge_prevalidate_send(p_dispatch_id) p;

  IF v_pre_ok IS NOT TRUE THEN
    v_outcome := 'not_eligible';
    INSERT INTO public.manual_charge_manual_trigger_events
      (organization_id, dispatch_id, actor, reason, outcome, disposition_reason)
    VALUES (v_org, p_dispatch_id, v_actor, p_reason, v_outcome, v_pre_reason);
    RETURN QUERY SELECT v_outcome, v_pre_reason, NULL::uuid;
    RETURN;
  END IF;

  SELECT c.status, c.claim_token INTO v_claim_status, v_claim_token
  FROM public.claim_charge_for_send(p_dispatch_id, 'manual:' || v_actor::text) c;

  v_outcome := CASE
    WHEN v_claim_status = 'sending' THEN 'claimed'
    WHEN v_claim_status = 'already_sending' THEN 'already_sending'
    WHEN v_claim_status = 'claim_disabled' THEN 'claim_disabled'
    WHEN v_claim_status = 'not_found' THEN 'not_found'
    ELSE 'not_eligible'
  END;

  INSERT INTO public.manual_charge_manual_trigger_events
    (organization_id, dispatch_id, actor, reason, outcome, disposition_reason, claim_token)
  VALUES (v_org, p_dispatch_id, v_actor, p_reason, v_outcome, v_claim_status, v_claim_token);

  RETURN QUERY SELECT v_outcome, v_claim_status, v_claim_token;
END;
$$;

COMMENT ON FUNCTION public.manual_charge_trigger_manual_send IS
  'CORRIGIDO 20260923191030: agora exige manual_charge_prevalidate_send=true (agendamento/janela local/conexão, além de pagamento/recusa/pausa) -- enquanto essas verificações faltarem ou falharem, bloqueia no servidor por construção, nunca dependendo do botão estar desabilitado na UI. Delega a exclusividade a claim_charge_for_send -- o mesmo caminho do automático.';

REVOKE ALL ON FUNCTION public.manual_charge_trigger_manual_send(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.manual_charge_trigger_manual_send(uuid, text) TO authenticated;
