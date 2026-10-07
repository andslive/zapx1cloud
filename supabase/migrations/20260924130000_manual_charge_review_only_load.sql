-- ═══════════════════════════════════════════════════════════════════════
-- Carga "só revisão" dos candidatos de setembro/2026 (etapa C).
-- Cria dispatches para revisão SEM agendar e SEM enviar; a classificação por regex continua provisória
-- (manual_charge_pre_send_review_reason bloqueia qualquer envio). Não liga flag, não cria cron.
--  1) apply_classified_message: (a) sinais anteriores descartados (recusa/pagamento/ambíguo) são
--     reaplicados quando o lead vira candidato; (b) com app.manual_charge_review_only = on captura a
--     data/mensagem de origem mas não agenda.
--  2) schedule_dispatch: data ausente nunca agenda (bloqueia).
--  3) manual_charge_load_for_review_enqueue/_batch: carga em lotes (uma transação por lote),
--     idempotente (jobs únicos por mensagem+versão), recusa rodar com a flag de envio ligada.
-- ═══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.manual_charge_apply_classified_message(
  p_job_id uuid,
  p_claim_token uuid,
  p_signals jsonb,
  p_model text,
  p_prompt_version text,
  p_raw_output jsonb,
  p_validation_status text,
  p_validation_errors jsonb DEFAULT '[]'::jsonb,
  p_campaign_key text DEFAULT 'sept2026',
  p_detected_locale text DEFAULT NULL,
  p_locale_confidence numeric DEFAULT NULL
) RETURNS TABLE(status text, decision text, dispatch_id uuid, charge_kind text, detail jsonb)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_job RECORD;
  v_msg RECORD;
  v_lead RECORD;
  v_errors jsonb := COALESCE(p_validation_errors, '[]'::jsonb);
  v_sig jsonb;
  v_type text;
  v_evidence text;
  v_conf numeric;
  v_date date;
  v_precision text;
  v_norm_content text;
  v_result_id uuid;
  v_has_promise boolean := false;
  v_has_payment boolean := false;
  v_has_refused boolean := false;
  v_has_ambiguous boolean := false;
  v_has_voluntary boolean := false;
  v_has_purchase_context boolean;
  v_is_paid boolean;
  v_existing_id uuid;
  v_decision RECORD;
  v_create RECORD;
  v_dispatch_id uuid;
  v_dispatch RECORD;
  v_pa_id uuid;
  v_route RECORD;
  v_detail jsonb := '[]'::jsonb;
  v_needs_review boolean := false;
  v_reopen RECORD;
  v_capture text;
  v_final_status text;
  v_other_dispatch uuid;
  v_bf RECORD;
  v_bf_sig jsonb;
  v_bf_type text;
  v_bf_route RECORD;
BEGIN
  SELECT * INTO v_job FROM public.manual_charge_classification_jobs WHERE id = p_job_id FOR UPDATE;
  IF v_job IS NULL THEN
    RETURN QUERY SELECT 'job_not_found'::text, NULL::text, NULL::uuid, NULL::text, NULL::jsonb; RETURN;
  END IF;
  IF v_job.status IN ('done', 'needs_review', 'failed') THEN
    RETURN QUERY SELECT ('already_finalized:' || v_job.status)::text, v_job.decision, v_job.dispatch_id, NULL::text, NULL::jsonb; RETURN;
  END IF;
  IF v_job.status <> 'claimed' OR v_job.claim_token IS DISTINCT FROM p_claim_token THEN
    RETURN QUERY SELECT 'claim_mismatch'::text, NULL::text, NULL::uuid, NULL::text, NULL::jsonb; RETURN;
  END IF;

  SELECT wm.id, wm.content, wc.id AS conversation_id, wc.organization_id, wc.lead_id
  INTO v_msg
  FROM public.webchat_messages wm
  JOIN public.webchat_conversations wc ON wc.id = wm.conversation_id
  WHERE wm.id = v_job.source_message_id;

  IF v_msg IS NULL OR v_msg.organization_id IS DISTINCT FROM v_job.organization_id
     OR v_msg.lead_id IS DISTINCT FROM v_job.lead_id OR v_msg.conversation_id IS DISTINCT FROM v_job.conversation_id THEN
    v_errors := v_errors || jsonb_build_array('source_message_scope_mismatch');
  END IF;

  SELECT * INTO v_lead FROM public.leads l WHERE l.id = v_job.lead_id AND l.organization_id = v_job.organization_id;
  IF v_lead IS NULL THEN
    v_errors := v_errors || jsonb_build_array('lead_not_in_organization');
  END IF;

  IF jsonb_typeof(p_signals) IS DISTINCT FROM 'array' THEN
    v_errors := v_errors || jsonb_build_array('signals_not_array');
  ELSIF v_msg IS NOT NULL THEN
    v_norm_content := regexp_replace(lower(v_msg.content), '\s+', ' ', 'g');
    FOR v_sig IN SELECT * FROM jsonb_array_elements(p_signals) LOOP
      v_type := v_sig->>'type';
      v_evidence := v_sig->>'evidence';
      v_date := NULL;
      v_precision := v_sig->>'date_precision';

      IF v_type IS NULL OR v_type NOT IN ('promised_date', 'payment_informed', 'refused_contact',
          'voluntary_commitment', 'postponement_requested', 'ambiguous', 'no_signal') THEN
        v_errors := v_errors || jsonb_build_array('unknown_signal_type:' || COALESCE(v_type, 'null'));
        CONTINUE;
      END IF;

      IF v_type <> 'no_signal' THEN
        IF v_evidence IS NULL OR btrim(v_evidence) = ''
           OR position(regexp_replace(lower(v_evidence), '\s+', ' ', 'g') IN v_norm_content) = 0 THEN
          v_errors := v_errors || jsonb_build_array('evidence_not_in_message:' || v_type);
        END IF;
      END IF;

      BEGIN
        v_conf := (v_sig->>'confidence')::numeric;
      EXCEPTION WHEN OTHERS THEN
        v_conf := NULL;
      END;
      IF v_conf IS NULL OR v_conf < 0 OR v_conf > 1 THEN
        v_errors := v_errors || jsonb_build_array('invalid_confidence:' || v_type);
      ELSIF v_type IN ('promised_date', 'payment_informed', 'refused_contact', 'voluntary_commitment') AND v_conf < 0.7 THEN
        v_errors := v_errors || jsonb_build_array('low_confidence_decisive_signal:' || v_type);
      END IF;

      IF v_sig ? 'promised_date' AND v_sig->>'promised_date' IS NOT NULL THEN
        BEGIN
          v_date := (v_sig->>'promised_date')::date;
        EXCEPTION WHEN OTHERS THEN
          v_errors := v_errors || jsonb_build_array('invalid_date:' || v_type);
        END;
        IF v_date IS NOT NULL AND (
             v_date < (v_job.message_occurred_at AT TIME ZONE 'UTC')::date - 45
          OR v_date > (v_job.message_occurred_at AT TIME ZONE 'UTC')::date + 366) THEN
          v_errors := v_errors || jsonb_build_array('date_out_of_range:' || v_type);
        END IF;
        IF v_type NOT IN ('promised_date', 'voluntary_commitment') THEN
          v_errors := v_errors || jsonb_build_array('date_not_allowed_for:' || v_type);
        END IF;
      END IF;

      IF v_type = 'promised_date' AND (v_sig->>'promised_date') IS NULL THEN
        v_errors := v_errors || jsonb_build_array('promised_date_missing_date');
      END IF;
      IF v_precision IS NOT NULL AND v_precision NOT IN ('exact', 'flexible_period_start') THEN
        v_errors := v_errors || jsonb_build_array('invalid_date_precision:' || v_type);
      END IF;

      v_has_promise := v_has_promise OR v_type = 'promised_date';
      v_has_payment := v_has_payment OR v_type = 'payment_informed';
      v_has_refused := v_has_refused OR v_type = 'refused_contact';
      v_has_ambiguous := v_has_ambiguous OR v_type IN ('ambiguous', 'postponement_requested');
      v_has_voluntary := v_has_voluntary OR v_type = 'voluntary_commitment';
    END LOOP;
  END IF;

  IF p_validation_status <> 'valid' OR jsonb_array_length(v_errors) > 0 THEN
    INSERT INTO public.manual_charge_classification_results
      (organization_id, job_id, classifier_version, model, prompt_version, raw_output, signals, validation_status, validation_errors)
    VALUES (v_job.organization_id, p_job_id, v_job.classifier_version, p_model, p_prompt_version, p_raw_output, p_signals, 'invalid', v_errors)
    RETURNING id INTO v_result_id;

    UPDATE public.manual_charge_classification_jobs
    SET status = 'needs_review', result_id = v_result_id, decision = 'invalid_classifier_output',
        claim_token = NULL, updated_at = clock_timestamp()
    WHERE id = p_job_id;

    RETURN QUERY SELECT 'needs_review'::text, 'invalid_classifier_output'::text, NULL::uuid, NULL::text, v_errors; RETURN;
  END IF;

  INSERT INTO public.manual_charge_classification_results
    (organization_id, job_id, classifier_version, model, prompt_version, raw_output, signals, validation_status, validation_errors)
  VALUES (v_job.organization_id, p_job_id, v_job.classifier_version, p_model, p_prompt_version, p_raw_output, p_signals, 'valid', '[]'::jsonb)
  RETURNING id INTO v_result_id;

  -- Idioma detectado pelo classificador (nunca sobrescreve explícito).
  IF p_detected_locale IS NOT NULL THEN
    PERFORM public.manual_charge_set_detected_locale(v_job.lead_id, p_detected_locale, p_locale_confidence);
  END IF;

  -- Serializa decisões do mesmo lead+campanha (dois jobs do mesmo lead já
  -- não rodam juntos pela fila; isto cobre chamadas manuais concorrentes).
  PERFORM pg_advisory_xact_lock(hashtextextended(
    v_job.organization_id::text || ':charge-candidate:' || v_lead.phone_normalized || ':' || p_campaign_key, 0));

  SELECT d.id INTO v_existing_id FROM public.manual_charge_dispatches d
  WHERE d.organization_id = v_job.organization_id AND d.phone_normalized = v_lead.phone_normalized
    AND d.campaign_key = p_campaign_key;

  -- Mesmo compromisso (mesma mensagem de origem) já registrado em OUTRA
  -- campanha do mesmo telefone: não cria nem duplica. Trocar campaign_key
  -- não faz um compromisso antigo valer de novo.
  IF v_existing_id IS NULL AND (v_has_promise OR v_has_voluntary) THEN
    SELECT f.dispatch_id INTO v_other_dispatch
    FROM public.manual_charge_conversation_facts f
    JOIN public.manual_charge_dispatches od ON od.id = f.dispatch_id
    WHERE f.organization_id = v_job.organization_id AND f.source_message_id = v_job.source_message_id
      AND od.phone_normalized = v_lead.phone_normalized AND od.campaign_key <> p_campaign_key
    LIMIT 1;
    IF v_other_dispatch IS NOT NULL THEN
      UPDATE public.manual_charge_classification_jobs
      SET status = 'done', result_id = v_result_id, decision = 'commitment_already_recorded_other_campaign',
          dispatch_id = v_other_dispatch, claim_token = NULL, updated_at = clock_timestamp()
      WHERE id = p_job_id;
      RETURN QUERY SELECT 'done'::text, 'commitment_already_recorded_other_campaign'::text, v_other_dispatch, NULL::text, '[]'::jsonb;
      RETURN;
    END IF;
  END IF;

  SELECT EXISTS (SELECT 1 FROM public.purchase_audit pa WHERE pa.lead_id = v_job.lead_id) INTO v_has_purchase_context;
  SELECT EXISTS (SELECT 1 FROM public.purchase_audit pa WHERE pa.lead_id = v_job.lead_id
                 AND pa.purchase_status IN ('success', 'recognized')) INTO v_is_paid;

  SELECT * INTO v_decision FROM public.manual_charge_candidate_decision(
    v_has_promise, v_has_payment, v_has_refused, v_has_ambiguous, v_has_voluntary,
    v_has_purchase_context, v_is_paid, v_existing_id IS NOT NULL);

  IF v_decision.decision = 'attach_to_existing' THEN
    v_dispatch_id := v_existing_id;
  ELSIF v_decision.decision = 'create' THEN
    -- purchase_audit só entra como evidência de apoio quando foi ELE que
    -- justificou a criação (sinal sem promessa nem contribuição).
    IF NOT v_has_promise AND NOT v_has_voluntary THEN
      SELECT pa.id INTO v_pa_id FROM public.purchase_audit pa
      WHERE pa.lead_id = v_job.lead_id ORDER BY pa.created_at DESC LIMIT 1;
    END IF;
    SELECT * INTO v_create FROM public.manual_charge_create_dispatch_for_obligation(
      v_job.organization_id, v_job.lead_id, v_pa_id, p_campaign_key, v_decision.charge_kind);
    v_dispatch_id := v_create.dispatch_id;
    v_detail := v_detail || jsonb_build_array(jsonb_build_object('create', v_create.status));

    -- Sinais de mensagens ANTERIORES do mesmo lead que foram descartadas por não haver evidência
    -- de obrigação naquele momento (recusa, pagamento informado, ambíguo) passam a valer assim
    -- que o lead vira candidato. Sem isto, uma recusa anterior à promessa se perderia.
    IF v_create.status = 'created' AND v_dispatch_id IS NOT NULL THEN
      FOR v_bf IN
        SELECT j.conversation_id, j.source_message_id, r.signals, j.classifier_version
        FROM public.manual_charge_classification_jobs j
        JOIN public.manual_charge_classification_results r ON r.id = j.result_id
        WHERE j.organization_id = v_job.organization_id AND j.lead_id = v_job.lead_id AND j.id <> p_job_id
          AND j.status = 'done' AND j.dispatch_id IS NULL AND r.validation_status = 'valid'
        ORDER BY j.message_occurred_at, j.id
      LOOP
        FOR v_bf_sig IN SELECT * FROM jsonb_array_elements(v_bf.signals) LOOP
          v_bf_type := v_bf_sig->>'type';
          CONTINUE WHEN v_bf_type = 'no_signal';
          SELECT r2.routed_to, r2.outcome INTO v_bf_route
          FROM public.manual_charge_record_classified_signal(
            v_dispatch_id, v_job.lead_id, v_bf.conversation_id, v_bf.source_message_id,
            CASE v_bf_type WHEN 'payment_informed' THEN 'payment_claimed' ELSE v_bf_type END,
            (v_bf_sig->>'promised_date')::date, v_bf_sig->>'evidence',
            'classifier:' || v_bf.classifier_version, COALESCE(p_prompt_version, v_bf.classifier_version),
            NULL, COALESCE(v_bf_sig->>'date_precision', 'exact')) r2;
          v_detail := v_detail || jsonb_build_array(jsonb_build_object(
            'backfill_signal', v_bf_type, 'routed_to', v_bf_route.routed_to, 'outcome', v_bf_route.outcome));
        END LOOP;
      END LOOP;
    END IF;
  END IF;

  IF v_dispatch_id IS NULL THEN
    UPDATE public.manual_charge_classification_jobs
    SET status = 'done', result_id = v_result_id, decision = v_decision.decision,
        claim_token = NULL, updated_at = clock_timestamp()
    WHERE id = p_job_id;
    RETURN QUERY SELECT 'done'::text, v_decision.decision, NULL::uuid, NULL::text, v_detail; RETURN;
  END IF;

  FOR v_sig IN SELECT * FROM jsonb_array_elements(p_signals) LOOP
    v_type := v_sig->>'type';
    CONTINUE WHEN v_type = 'no_signal';

    SELECT r.routed_to, r.outcome, r.reference_id INTO v_route
    FROM public.manual_charge_record_classified_signal(
      v_dispatch_id, v_job.lead_id, v_job.conversation_id, v_job.source_message_id,
      CASE v_type WHEN 'payment_informed' THEN 'payment_claimed' ELSE v_type END,
      (v_sig->>'promised_date')::date,
      v_sig->>'evidence',
      'classifier:' || v_job.classifier_version,
      COALESCE(p_prompt_version, v_job.classifier_version),
      NULL,
      COALESCE(v_sig->>'date_precision', 'exact')
    ) r;

    v_detail := v_detail || jsonb_build_array(jsonb_build_object(
      'signal', v_type, 'routed_to', v_route.routed_to, 'outcome', v_route.outcome));

    IF v_route.outcome IN ('stale_supersedes_rejected', 'unknown_signal_type', 'source_message_not_found', 'lead_mismatch') THEN
      v_needs_review := true;
    END IF;
  END LOOP;

  -- Cobrança já enviada + NOVA data explícita depois do envio -> nova
  -- ocasião na mesma linha (a função exige fato de data posterior ao
  -- envio; "ok", emoji ou silêncio não reabrem).
  SELECT * INTO v_dispatch FROM public.manual_charge_dispatches WHERE id = v_dispatch_id;
  IF v_dispatch.status = 'sent' AND (v_has_promise OR v_has_voluntary) THEN
    SELECT * INTO v_reopen FROM public.manual_charge_reopen_dispatch_for_new_commitment(v_dispatch_id);
    v_detail := v_detail || jsonb_build_array(jsonb_build_object('reopen', v_reopen.status));
  END IF;

  SELECT c.status INTO v_capture FROM public.manual_charge_capture_scheduling_inputs(v_dispatch_id) c;
  -- Modo "só revisão" (carga de setembro): captura a data e a mensagem de origem, mas NÃO agenda.
  IF v_capture IN ('inputs_captured', 'inputs_unchanged')
     AND COALESCE(current_setting('app.manual_charge_review_only', true), 'off') <> 'on' THEN
    PERFORM public.manual_charge_schedule_dispatch(v_dispatch_id);
  END IF;
  PERFORM public.manual_charge_evaluate(v_dispatch_id);

  v_final_status := CASE WHEN v_needs_review THEN 'needs_review' ELSE 'done' END;
  UPDATE public.manual_charge_classification_jobs
  SET status = v_final_status, result_id = v_result_id, decision = v_decision.decision,
      dispatch_id = v_dispatch_id, claim_token = NULL, updated_at = clock_timestamp()
  WHERE id = p_job_id;

  SELECT * INTO v_dispatch FROM public.manual_charge_dispatches WHERE id = v_dispatch_id;
  RETURN QUERY SELECT v_final_status, v_decision.decision, v_dispatch_id, v_dispatch.charge_kind, v_detail;
END;
$$;

CREATE OR REPLACE FUNCTION public.manual_charge_schedule_dispatch(p_dispatch_id uuid)
 RETURNS TABLE(status text, planned_send_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  v_max_days_lookahead_flexible constant integer := 13;
BEGIN
  SELECT * INTO v_dispatch FROM public.manual_charge_dispatches WHERE id = p_dispatch_id;
  IF v_dispatch IS NULL THEN
    RETURN QUERY SELECT 'dispatch_not_found'::text, NULL::timestamptz; RETURN;
  END IF;

  -- Bloqueio por fuso é sempre reavaliado (o fuso do lead pode ter
  -- mudado: informado, limpo ou incerto); as checagens abaixo bloqueiam
  -- de novo com o motivo atual, se for o caso.
  IF v_dispatch.scheduling_status IN ('blocked_no_timezone', 'blocked_timezone_uncertain') THEN
    UPDATE public.manual_charge_dispatches SET scheduling_status = 'unscheduled'
    WHERE id = p_dispatch_id AND scheduling_status = v_dispatch.scheduling_status;
    v_dispatch.scheduling_status := 'unscheduled';
  END IF;

  IF v_dispatch.scheduling_status <> 'unscheduled' THEN
    RETURN QUERY SELECT v_dispatch.scheduling_status, v_dispatch.planned_send_at; RETURN;
  END IF;

  -- Data ausente nunca agenda (GREATEST ignoraria o NULL e cairia no piso global de 29/09).
  IF v_dispatch.agreed_date IS NULL THEN
    RETURN QUERY SELECT 'blocked_no_agreed_date'::text, NULL::timestamptz; RETURN;
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

  IF NOT public.manual_charge_lead_timezone_certain(v_dispatch.lead_id) THEN
    UPDATE public.manual_charge_dispatches SET scheduling_status = 'blocked_timezone_uncertain' WHERE id = p_dispatch_id;
    RETURN QUERY SELECT 'blocked_timezone_uncertain'::text, NULL::timestamptz; RETURN;
  END IF;

  IF v_dispatch.agreed_date < '2026-09-29'::date THEN
    UPDATE public.manual_charge_dispatches SET scheduling_status = 'blocked_overdue_promise_pending_rule' WHERE id = p_dispatch_id;
    RETURN QUERY SELECT 'blocked_overdue_promise_pending_rule'::text, NULL::timestamptz; RETURN;
  END IF;

  SELECT * INTO v_config FROM public.manual_charge_scheduling_config WHERE organization_id = v_dispatch.organization_id;
  IF v_config IS NULL THEN
    INSERT INTO public.manual_charge_scheduling_config (organization_id) VALUES (v_dispatch.organization_id)
    ON CONFLICT (organization_id) DO NOTHING;
    SELECT * INTO v_config FROM public.manual_charge_scheduling_config WHERE organization_id = v_dispatch.organization_id;
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

    IF COALESCE(v_dispatch.agreed_date_precision, 'exact') = 'exact' THEN
      UPDATE public.manual_charge_dispatches SET scheduling_status = 'blocked_capacity' WHERE id = p_dispatch_id;
      RETURN QUERY SELECT 'blocked_capacity'::text, NULL::timestamptz; RETURN;
    END IF;

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
$function$;

CREATE FUNCTION public.manual_charge_load_for_review_enqueue(p_organization_id uuid, p_limit integer DEFAULT 100000)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.organizations WHERE id = p_organization_id) THEN
    RAISE EXCEPTION 'organization_not_found' USING ERRCODE = 'P0016';
  END IF;
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 500000 THEN
    RAISE EXCEPTION 'invalid_limit' USING ERRCODE = 'P0016';
  END IF;
  -- Idempotente: só enfileira mensagens ainda sem job rule_v1.
  RETURN public.manual_charge_enqueue_classification(p_organization_id, '2026-09-01 00:00:00+00'::timestamptz, 'rule_v1', p_limit);
END;
$$;

CREATE FUNCTION public.manual_charge_load_for_review_batch(
  p_organization_id uuid, p_campaign_key text DEFAULT 'sept2026', p_batch integer DEFAULT 200
) RETURNS TABLE(processed integer, dispatches_created integer, needs_review integer, remaining bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_job RECORD;
  v_applied RECORD;
  v_processed integer := 0;
  v_created integer := 0;
  v_nr integer := 0;
  v_claimed integer;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.organizations WHERE id = p_organization_id) THEN
    RAISE EXCEPTION 'organization_not_found' USING ERRCODE = 'P0016';
  END IF;
  IF p_campaign_key IS NULL OR btrim(p_campaign_key) = '' OR p_batch IS NULL OR p_batch < 1 OR p_batch > 1000 THEN
    RAISE EXCEPTION 'invalid_arguments' USING ERRCODE = 'P0016';
  END IF;
  -- Nunca carrega com o envio ligado.
  IF EXISTS (SELECT 1 FROM public.recovery_feature_flags
             WHERE key IN ('manual_charge_dispatch_claim_enabled', 'manual_charge_manual_trigger_enabled') AND enabled IS TRUE) THEN
    RAISE EXCEPTION 'load_blocked_send_flag_enabled' USING ERRCODE = 'P0016';
  END IF;

  PERFORM set_config('app.manual_charge_review_only', 'on', true);
  LOOP
    EXIT WHEN v_processed >= p_batch;
    v_claimed := 0;
    FOR v_job IN
      SELECT * FROM public.manual_charge_claim_classification_jobs('rule_v1', 'load_for_review', LEAST(p_batch - v_processed, 500), 600, p_organization_id)
    LOOP
      v_claimed := v_claimed + 1;
      v_processed := v_processed + 1;
      SELECT * INTO v_applied FROM public.manual_charge_apply_classified_message(
        v_job.job_id, v_job.claim_token,
        public.manual_charge_rule_classifier_signals(v_job.content),
        'rule_v1', 'sept2026_regex_v1',
        jsonb_build_object('rule', (SELECT to_jsonb(c) FROM public.manual_charge_september_2026_classify_message(v_job.content) c)),
        'valid', '[]'::jsonb, p_campaign_key);
      IF v_applied.detail @> '[{"create":"created"}]'::jsonb THEN v_created := v_created + 1; END IF;
      IF v_applied.status = 'needs_review' THEN v_nr := v_nr + 1; END IF;
    END LOOP;
    EXIT WHEN v_claimed = 0;
  END LOOP;
  PERFORM set_config('app.manual_charge_review_only', 'off', true);

  processed := v_processed; dispatches_created := v_created; needs_review := v_nr;
  SELECT count(*) INTO remaining FROM public.manual_charge_classification_jobs j
  WHERE j.organization_id = p_organization_id AND j.classifier_version = 'rule_v1' AND j.status IN ('pending', 'claimed');
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.manual_charge_load_for_review_enqueue(uuid, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.manual_charge_load_for_review_batch(uuid, text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.manual_charge_load_for_review_enqueue(uuid, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.manual_charge_load_for_review_batch(uuid, text, integer) TO service_role;

COMMENT ON FUNCTION public.manual_charge_load_for_review_batch IS
  'Carga em lotes só para revisão: cria dispatches dos candidatos por regex SEM agendar. Idempotente (só processa jobs pendentes). Recusa rodar com flag de envio ligada.';
