-- ═══════════════════════════════════════════════════════════════════════
-- Nova data acordada DEPOIS de um envio já concluído -- ponto real que
-- faltava: 'sent' é terminal (Fase A/v4), sem NENHUM caminho de volta
-- para 'eligible'. Isso protegia corretamente contra reenvio indevido,
-- mas também bloqueava uma reabertura LEGÍTIMA quando o próprio lead
-- responde, depois do envio, combinando uma data nova e explícita.
--
-- Corrigido com um caminho de reabertura CONTROLADO -- nunca
-- automático, sempre exigindo evidência: uma linha de
-- manual_charge_conversation_facts (fact_type='promised_date') cuja
-- message_occurred_at seja REALMENTE posterior ao sent_at do dispatch.
-- Sem essa evidência -- silêncio, "ok", emoji, qualquer resposta
-- ambígua -- a reabertura é recusada. A obrigação (source_purchase_
-- audit_id) permanece a MESMA -- isto é a MESMA ocasião ganhando um novo
-- ciclo de tentativa, não uma ocasião nova (por isso não colide com a
-- UNIQUE por obrigação -- é a mesma linha, não uma segunda). O envio
-- anterior nunca é apagado/alterado -- continua no histórico append-only
-- de manual_charge_send_attempts/manual_charge_send_attempt_events.
-- Cada reabertura permite EXATAMENTE um novo ciclo de tentativa (o
-- dispatch volta a ser terminal ao ser enviado de novo) -- nunca uma
-- fila de reenvios.
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE public.manual_charge_dispatch_reopen_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  dispatch_id uuid NOT NULL,
  reason_fact_id uuid NOT NULL REFERENCES public.manual_charge_conversation_facts(id) ON DELETE RESTRICT,
  previous_sent_at timestamptz NOT NULL,
  new_promised_date date NOT NULL,
  reopened_at timestamptz NOT NULL DEFAULT now(),

  FOREIGN KEY (organization_id, dispatch_id)
    REFERENCES public.manual_charge_dispatches (organization_id, id) ON DELETE RESTRICT
);

COMMENT ON TABLE public.manual_charge_dispatch_reopen_events IS
  'INSERT-only. Cada linha é uma reabertura controlada e auditada de um dispatch que já estava sent, com a evidência exata (reason_fact_id) que a autorizou. O envio anterior permanece intocado no histórico de attempts -- isto documenta um NOVO ciclo, nunca reescreve o antigo.';

REVOKE ALL ON public.manual_charge_dispatch_reopen_events FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.manual_charge_dispatch_reopen_events TO authenticated;
ALTER TABLE public.manual_charge_dispatch_reopen_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "manual_charge_dispatch_reopen_events_org_read" ON public.manual_charge_dispatch_reopen_events
  FOR SELECT TO authenticated
  USING (public.manual_charge_actor_authorized(organization_id));

CREATE FUNCTION public.manual_charge_reopen_dispatch_for_new_commitment(
  p_dispatch_id uuid
) RETURNS TABLE(status text, reopen_event_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_dispatch RECORD;
  v_fact RECORD;
  v_event_id uuid;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_dispatch_id::text, 0));

  SELECT * INTO v_dispatch FROM public.manual_charge_dispatches WHERE id = p_dispatch_id;
  IF v_dispatch IS NULL THEN
    RETURN QUERY SELECT 'dispatch_not_found'::text, NULL::uuid; RETURN;
  END IF;

  -- Só a partir de 'sent' -- nunca de 'paid'/'cancelled_permanent' (esses
  -- são terminais por motivos diferentes, nunca reabertos por uma nova
  -- data) nem de qualquer estado já reavaliável (não precisa reabrir o
  -- que já pode ser reavaliado normalmente).
  IF v_dispatch.status <> 'sent' THEN
    RETURN QUERY SELECT ('not_reopenable:' || v_dispatch.status)::text, NULL::uuid; RETURN;
  END IF;

  IF v_dispatch.sent_at IS NULL THEN
    RETURN QUERY SELECT 'missing_sent_at'::text, NULL::uuid; RETURN;
  END IF;

  -- Evidência exigida: a promessa VIGENTE (cabeça da cadeia de revisão,
  -- mesma lógica de manual_charge_conversation_current_facts) precisa
  -- ter ocorrido estritamente DEPOIS do envio anterior. "ok"/emoji/
  -- silêncio nunca produzem fact_type=promised_date -- nunca chegam
  -- aqui.
  SELECT f.id AS fact_id, f.message_occurred_at, f.promised_date
  INTO v_fact
  FROM public.manual_charge_conversation_facts f
  WHERE f.dispatch_id = p_dispatch_id AND f.fact_type = 'promised_date'
    AND NOT EXISTS (
      SELECT 1 FROM public.manual_charge_conversation_facts f2 WHERE f2.supersedes_fact_id = f.id
    )
  ORDER BY f.message_occurred_at DESC
  LIMIT 1;

  IF v_fact.fact_id IS NULL OR v_fact.message_occurred_at <= v_dispatch.sent_at THEN
    RETURN QUERY SELECT 'no_new_commitment_after_send'::text, NULL::uuid; RETURN;
  END IF;

  INSERT INTO public.manual_charge_dispatch_reopen_events
    (organization_id, dispatch_id, reason_fact_id, previous_sent_at, new_promised_date)
  VALUES (v_dispatch.organization_id, p_dispatch_id, v_fact.fact_id, v_dispatch.sent_at, v_fact.promised_date)
  RETURNING id INTO v_event_id;

  -- Volta a ser clamável -- limpa também active_attempt_id (v4): sem
  -- isso, claim_charge_for_send nunca aceitaria um novo claim, já que
  -- seu gate exige active_attempt_id IS NULL. O attempt ANTERIOR
  -- permanece intocado no histórico -- só o PONTEIRO no dispatch é
  -- limpo, preparando o próximo ciclo.
  UPDATE public.manual_charge_dispatches
  SET status = 'eligible',
      active_attempt_id = NULL,
      claim_token = NULL,
      claimed_by = NULL,
      claimed_at = NULL,
      scheduling_status = 'unscheduled',
      planned_send_at = NULL,
      disposition_reason = 'reopened_new_commitment_after_send'
  WHERE id = p_dispatch_id;

  RETURN QUERY SELECT 'reopened'::text, v_event_id;
END;
$$;

COMMENT ON FUNCTION public.manual_charge_reopen_dispatch_for_new_commitment IS
  'Único caminho para reabrir um dispatch ''sent''. Exige uma promessa VIGENTE (cabeça da cadeia) com message_occurred_at estritamente posterior ao sent_at anterior -- silêncio/''ok''/emoji nunca produzem essa evidência, então nunca reabrem nada. O envio anterior permanece intocado no histórico; a mesma obrigação (source_purchase_audit_id) é preservada -- é um novo CICLO da mesma ocasião, não uma ocasião nova.';

REVOKE ALL ON FUNCTION public.manual_charge_reopen_dispatch_for_new_commitment(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.manual_charge_reopen_dispatch_for_new_commitment(uuid) TO service_role;
