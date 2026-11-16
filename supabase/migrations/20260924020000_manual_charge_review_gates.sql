-- ═══════════════════════════════════════════════════════════════════════
-- Travas de revisão antes de qualquer envio (24/09/2026).
--  1) Classificação provisória: o classificador por regex (rule_*) nunca
--     autoriza envio. Só libera quando TODA mensagem inbound do lead tem
--     job concluído por classificador estruturado, sem edição posterior.
--     Mensagem sem texto (áudio sem transcrição) mantém a revisão.
--  2) Compromisso duplicado: mudar campaign_key não permite repetir o
--     mesmo compromisso. Se outro dispatch do mesmo telefone já foi
--     contatado, este só envia se a mensagem de ORIGEM do compromisso for
--     posterior a esse contato. purchase_audit não entra nesta regra.
--  3) Fuso: só é certo quando explícito (ou confirmado por operador).
--     DDD/país continuam gravados como inferência (origem preservada),
--     mas nunca autorizam janela de envio.
-- ═══════════════════════════════════════════════════════════════════════

CREATE FUNCTION public.manual_charge_pre_send_review_reason(p_dispatch_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_d RECORD;
  v_origin_at timestamptz;
  v_other_at timestamptz;
BEGIN
  SELECT * INTO v_d FROM public.manual_charge_dispatches WHERE id = p_dispatch_id;
  IF v_d IS NULL THEN RETURN NULL; END IF;

  -- Mensagem sem texto (áudio/mídia sem transcrição): ninguém leu.
  IF EXISTS (
    SELECT 1 FROM public.webchat_conversations wc JOIN public.webchat_messages wm ON wm.conversation_id = wc.id
    WHERE wc.lead_id = v_d.lead_id AND wc.organization_id = v_d.organization_id
      AND wm.direction = 'inbound' AND wm.sender_type = 'visitor' AND COALESCE(wm.is_deleted, false) = false
      AND btrim(COALESCE(wm.content, '')) = ''
      AND COALESCE(wm.provider_occurred_at, wm.created_at) >= '2026-09-01 00:00:00+00'::timestamptz
  ) THEN RETURN 'untranscribed_media'; END IF;

  -- Mensagem editada depois da última classificação estruturada.
  IF EXISTS (
    SELECT 1 FROM public.webchat_conversations wc JOIN public.webchat_messages wm ON wm.conversation_id = wc.id
    WHERE wc.lead_id = v_d.lead_id AND wc.organization_id = v_d.organization_id
      AND wm.direction = 'inbound' AND wm.sender_type = 'visitor' AND COALESCE(wm.is_deleted, false) = false
      AND wm.edited_at IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM public.manual_charge_classification_jobs j
        WHERE j.source_message_id = wm.id AND j.organization_id = v_d.organization_id AND j.status = 'done'
          AND j.classifier_version NOT LIKE 'rule%' AND j.updated_at >= wm.edited_at)
  ) THEN RETURN 'edited_message_not_reclassified'; END IF;

  -- Toda mensagem com texto precisa de classificação estruturada concluída.
  IF EXISTS (
    SELECT 1 FROM public.webchat_conversations wc JOIN public.webchat_messages wm ON wm.conversation_id = wc.id
    WHERE wc.lead_id = v_d.lead_id AND wc.organization_id = v_d.organization_id
      AND wm.direction = 'inbound' AND wm.sender_type = 'visitor' AND COALESCE(wm.is_deleted, false) = false
      AND btrim(COALESCE(wm.content, '')) <> ''
      AND COALESCE(wm.provider_occurred_at, wm.created_at) >= '2026-09-01 00:00:00+00'::timestamptz
      AND NOT EXISTS (SELECT 1 FROM public.manual_charge_classification_jobs j
        WHERE j.source_message_id = wm.id AND j.organization_id = v_d.organization_id AND j.status = 'done'
          AND j.classifier_version NOT LIKE 'rule%')
  ) THEN RETURN 'provisional_or_pending_classification'; END IF;

  -- Mesmo compromisso em outra campanha.
  SELECT COALESCE(wm.provider_occurred_at, wm.created_at) INTO v_origin_at
  FROM public.webchat_messages wm WHERE wm.id = v_d.scheduling_source_message_id;

  SELECT max(COALESCE(o.sent_at, o.claimed_at)) INTO v_other_at
  FROM public.manual_charge_dispatches o
  WHERE o.organization_id = v_d.organization_id AND o.phone_normalized = v_d.phone_normalized AND o.id <> v_d.id
    AND o.status IN ('sending', 'sent', 'unknown_result', 'reconciled_sent',
                     'needs_review_reconciliation', 'needs_review_uncertain_send');

  IF v_other_at IS NOT NULL AND (v_origin_at IS NULL OR v_origin_at <= v_other_at) THEN
    RETURN 'commitment_already_contacted_other_campaign';
  END IF;

  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.manual_charge_pre_send_review_reason(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.manual_charge_pre_send_review_reason(uuid) TO authenticated, service_role;

-- Fuso só é certo quando explícito. A inferência (DDD/país) segue gravada
-- com sua origem, mas não libera envio.
CREATE OR REPLACE FUNCTION public.manual_charge_lead_timezone_certain(p_lead_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path TO ''
AS $$
  SELECT COALESCE((SELECT l.preferred_timezone IS NOT NULL AND l.timezone_source = 'explicit'
                   FROM public.leads l WHERE l.id = p_lead_id), false);
$$;

-- Confirmação do fuso por operador autorizado (organização do lead).
CREATE FUNCTION public.manual_charge_confirm_lead_timezone(p_lead_id uuid, p_timezone text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_org uuid;
BEGIN
  SELECT organization_id INTO v_org FROM public.leads WHERE id = p_lead_id;
  IF v_org IS NULL THEN RETURN 'lead_not_found'; END IF;
  IF public.manual_charge_actor_authorized(v_org) IS NOT TRUE THEN
    RAISE EXCEPTION 'unauthorized_actor' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_timezone_names WHERE name = p_timezone) THEN RETURN 'invalid_timezone'; END IF;
  UPDATE public.leads SET preferred_timezone = p_timezone, timezone_source = 'explicit', timezone_confidence = 1
  WHERE id = p_lead_id;
  RETURN 'confirmed';
END;
$$;

REVOKE ALL ON FUNCTION public.manual_charge_confirm_lead_timezone(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.manual_charge_confirm_lead_timezone(uuid, text) TO authenticated, service_role;

COMMENT ON COLUMN public.leads.timezone_source IS
  'Origem do FUSO. Só explicit (informado pelo lead ou confirmado por operador) autoriza janela de envio. phone_area_code/country_single_timezone são inferências preservadas para exibição e sugestão; conversation_detected/country_hint são legados incertos.';

CREATE OR REPLACE FUNCTION public.manual_charge_enqueue_classification(
  p_organization_id uuid,
  p_since timestamptz,
  p_classifier_version text,
  p_limit integer DEFAULT 1000
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_count integer;
BEGIN
  -- Mensagem editada depois de classificada volta para a fila: a
  -- classificação antiga não vale para o texto novo.
  UPDATE public.manual_charge_classification_jobs j
  SET status = 'pending', attempts = 0, claim_token = NULL, claimed_by = NULL, claimed_at = NULL,
      last_error = 'requeued_message_edited', decision = NULL, updated_at = clock_timestamp()
  FROM public.webchat_messages wm
  WHERE j.organization_id = p_organization_id AND j.classifier_version = p_classifier_version
    AND j.status IN ('done', 'needs_review', 'failed') AND wm.id = j.source_message_id
    AND wm.edited_at IS NOT NULL AND wm.edited_at > j.updated_at;

  INSERT INTO public.manual_charge_classification_jobs
    (organization_id, lead_id, conversation_id, source_message_id, message_occurred_at, classifier_version)
  SELECT wc.organization_id, wc.lead_id, wc.id, wm.id, COALESCE(wm.provider_occurred_at, wm.created_at), p_classifier_version
  FROM public.webchat_conversations wc
  JOIN public.webchat_messages wm ON wm.conversation_id = wc.id
  JOIN public.leads l ON l.id = wc.lead_id AND l.organization_id = wc.organization_id
  WHERE wc.organization_id = p_organization_id
    AND wm.direction = 'inbound' AND wm.sender_type = 'visitor'
    AND COALESCE(wm.is_deleted, false) = false
    AND btrim(COALESCE(wm.content, '')) <> ''
    AND COALESCE(wm.provider_occurred_at, wm.created_at) >= p_since
    AND NOT EXISTS (
      SELECT 1 FROM public.manual_charge_classification_jobs j
      WHERE j.organization_id = p_organization_id AND j.source_message_id = wm.id
        AND j.classifier_version = p_classifier_version
    )
  ORDER BY COALESCE(wm.provider_occurred_at, wm.created_at), wm.id
  LIMIT p_limit
  ON CONFLICT ON CONSTRAINT manual_charge_classification_jobs_msg_version_uk DO NOTHING;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.manual_charge_prevalidate_send(p_dispatch_id uuid)
 RETURNS TABLE(ok boolean, reason text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_dispatch RECORD;
  v_lead RECORD;
  v_connection RECORD;
  v_config RECORD;
  v_now_local time;
  v_official RECORD;
  v_last_attempt_at timestamptz;
  v_review text;
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

  IF clock_timestamp() < v_dispatch.planned_send_at THEN
    RETURN QUERY SELECT false, 'before_planned_send_at'::text; RETURN;
  END IF;

  SELECT * INTO v_config FROM public.manual_charge_scheduling_config WHERE organization_id = v_dispatch.organization_id;
  IF v_config IS NULL THEN
    RETURN QUERY SELECT false, 'no_scheduling_config'::text; RETURN;
  END IF;

  -- Janela perdida (worker parado, conexão caída etc.): nunca envia com
  -- atraso grande. Sai da fila para decisão humana.
  IF clock_timestamp() > v_dispatch.planned_send_at + make_interval(mins => v_config.max_lateness_minutes) THEN
    UPDATE public.manual_charge_dispatches SET scheduling_status = 'blocked_missed_window'
    WHERE id = p_dispatch_id AND scheduling_status = 'scheduled';
    RETURN QUERY SELECT false, 'missed_window'::text; RETURN;
  END IF;

  SELECT * INTO v_lead FROM public.leads WHERE id = v_dispatch.lead_id;
  IF v_lead.preferred_timezone IS NULL THEN
    RETURN QUERY SELECT false, 'no_timezone'::text; RETURN;
  END IF;
  IF NOT public.manual_charge_lead_timezone_certain(v_dispatch.lead_id) THEN
    RETURN QUERY SELECT false, 'timezone_uncertain'::text; RETURN;
  END IF;
  IF NOT public.manual_charge_lead_locale_known(v_dispatch.lead_id) THEN
    RETURN QUERY SELECT false, 'locale_unknown'::text; RETURN;
  END IF;

  SELECT * INTO v_connection FROM public.evolution_instances WHERE id = v_dispatch.connection_id;
  IF v_connection IS NULL OR v_connection.status IS DISTINCT FROM 'connected' OR v_connection.is_active IS NOT TRUE THEN
    RETURN QUERY SELECT false, 'connection_unavailable'::text; RETURN;
  END IF;
  IF v_connection.organization_id IS DISTINCT FROM v_dispatch.organization_id THEN
    RETURN QUERY SELECT false, 'connection_organization_mismatch'::text; RETURN;
  END IF;

  v_now_local := (clock_timestamp() AT TIME ZONE v_lead.preferred_timezone)::time;
  IF v_now_local < v_config.window_start_local OR v_now_local > v_config.window_end_local THEN
    RETURN QUERY SELECT false, 'outside_local_window'::text; RETURN;
  END IF;

  SELECT max(a.claimed_at) INTO v_last_attempt_at
  FROM public.manual_charge_send_attempts a
  JOIN public.manual_charge_dispatches d ON d.id = a.dispatch_id
  WHERE d.connection_id = v_dispatch.connection_id;

  IF v_last_attempt_at IS NOT NULL
     AND v_last_attempt_at > clock_timestamp() - make_interval(secs => v_config.min_interval_seconds) THEN
    RETURN QUERY SELECT false, 'connection_rate_limited'::text; RETURN;
  END IF;

  v_review := public.manual_charge_pre_send_review_reason(p_dispatch_id);
  IF v_review IS NOT NULL THEN
    RETURN QUERY SELECT false, ('review_required:' || v_review)::text; RETURN;
  END IF;

  SELECT o.ok, o.reason INTO v_official FROM public.manual_charge_official_api_prevalidate(p_dispatch_id) o;
  IF v_official.ok IS NOT TRUE THEN
    RETURN QUERY SELECT false, ('official_api:' || v_official.reason)::text; RETURN;
  END IF;

  RETURN QUERY SELECT true, NULL::text;
END;
$function$;

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
  IF v_capture IN ('inputs_captured', 'inputs_unchanged') THEN
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

DROP VIEW IF EXISTS public.manual_charge_dispatches_panel;

CREATE VIEW public.manual_charge_dispatches_panel
WITH (security_invoker = true) AS
SELECT
  d.id AS dispatch_id, d.organization_id, d.lead_id, l.name AS lead_name, d.phone_normalized,
  d.campaign_key, d.charge_kind, d.status, d.disposition_reason, d.claim_token, d.claimed_by,
  d.claimed_at, d.sent_at, d.agreed_date, d.planned_send_at, d.scheduling_status, d.connection_id,
  ei.name AS connection_name, ei.status AS connection_status,
  COALESCE(NULLIF(btrim(ei.provider), ''), 'uazapi') AS connection_provider,
  l.preferred_locale AS lead_preferred_locale, l.locale_source AS lead_locale_source,
  l.preferred_timezone AS lead_preferred_timezone, l.timezone_source AS lead_timezone_source,
  l.timezone_confidence AS lead_timezone_confidence,
  cf.effective_promised_date, cf.promised_date_occurred_at_source, cf.promised_date_precision,
  cf.has_pending_ambiguous_signal,
  st.is_refused, st.refused_reason, st.is_payment_claimed, st.payment_claim_status,
  EXISTS (SELECT 1 FROM public.purchase_audit pa
          WHERE pa.lead_id = d.lead_id AND pa.purchase_status IN ('success', 'recognized')) AS payment_confirmed,
  'pending_criteria_approval'::text AS attribution_status,
  (SELECT count(*) FROM public.manual_charge_dispatch_reopen_events re WHERE re.dispatch_id = d.id) AS reopen_count,
  public.manual_charge_pre_send_review_reason(d.id) AS review_reason,
  d.created_at, d.updated_at
FROM public.manual_charge_dispatches d
JOIN public.leads l ON l.id = d.lead_id
LEFT JOIN public.evolution_instances ei ON ei.id = d.connection_id
LEFT JOIN LATERAL public.manual_charge_conversation_current_facts(d.id) cf ON true
LEFT JOIN LATERAL public.manual_charge_conversation_state(d.id) st ON true;

REVOKE ALL ON public.manual_charge_dispatches_panel FROM PUBLIC, anon;
GRANT SELECT ON public.manual_charge_dispatches_panel TO authenticated;
