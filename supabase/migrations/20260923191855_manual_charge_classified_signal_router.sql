-- ═══════════════════════════════════════════════════════════════════════
-- Elo faltante, apontado explicitamente na revisão: remover
-- refused_contact/payment_claimed de manual_charge_conversation_facts
-- (correção anterior, 20260923183859) documentou QUE o classificador
-- deveria chamar create_suppression_candidate/register_payment_claim
-- diretamente, mas não implementou NENHUM ponto de entrada único que
-- faça esse roteamento de verdade -- um futuro classificador teria que
-- decidir sozinho, em cada lugar que o chama, qual das 3 functions
-- invocar. Isso é exatamente a "ligação sem implementação" apontada.
--
-- manual_charge_record_classified_signal -- ÚNICO ponto de entrada para
-- QUALQUER classificador (regra determinística nesta fase; IA real fica
-- para depois, fora deste escopo) registrar um sinal detectado numa
-- mensagem do lead. Roteia internamente para o mecanismo certo -- o
-- chamador nunca decide isso, elimina a possibilidade de um novo
-- classificador esquecer de plugar payment_claimed/refused_contact nos
-- lugares certos.
-- ═══════════════════════════════════════════════════════════════════════

CREATE FUNCTION public.manual_charge_record_classified_signal(
  p_dispatch_id uuid,
  p_lead_id uuid,
  p_conversation_id uuid,
  p_source_message_id uuid,
  p_signal_type text,
  p_promised_date date DEFAULT NULL,
  p_raw_excerpt text DEFAULT NULL,
  p_classifier_source text DEFAULT 'rule_v1',
  p_classifier_version text DEFAULT '1'
) RETURNS TABLE(routed_to text, outcome text, reference_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_org uuid;
  v_phone_normalized text;
  v_claim RECORD;
  v_suppression_id uuid;
  v_fact RECORD;
BEGIN
  SELECT organization_id INTO v_org FROM public.manual_charge_dispatches WHERE id = p_dispatch_id;
  IF v_org IS NULL THEN
    RETURN QUERY SELECT NULL::text, 'dispatch_not_found'::text, NULL::uuid; RETURN;
  END IF;

  IF p_signal_type = 'payment_claimed' THEN
    -- register_payment_claim já garante, sozinha: cadeia
    -- organização/conversa/lead/mensagem-inbound-do-lead válida,
    -- dedup atômico via payment_claim_intake, e vínculo ao dispatch
    -- CANDIDATO certo (ou abre uma revisão se zero/vários candidatos).
    SELECT c.outcome, c.claim_event_id, c.review_id INTO v_claim
    FROM public.register_payment_claim(v_org, p_conversation_id, p_lead_id, p_source_message_id, p_classifier_source) c;

    RETURN QUERY SELECT 'payment_claim'::text, v_claim.outcome,
      COALESCE(v_claim.claim_event_id, v_claim.review_id);
    RETURN;
  END IF;

  IF p_signal_type = 'refused_contact' THEN
    SELECT phone_normalized INTO v_phone_normalized
    FROM public.manual_charge_dispatches WHERE id = p_dispatch_id;

    -- create_suppression_candidate nunca promove sozinha a confirmed --
    -- fica como candidate até revisão humana (confirm_suppression),
    -- exatamente como qualquer outra recusa detectada.
    SELECT public.create_suppression_candidate(
      v_org, v_phone_normalized, 'all_contact', 'stop_contact',
      NULL, NULL, p_conversation_id, p_source_message_id,
      p_classifier_source, NULL, NULL
    ) INTO v_suppression_id;

    RETURN QUERY SELECT 'suppression'::text, 'candidate_created'::text, v_suppression_id;
    RETURN;
  END IF;

  IF p_signal_type NOT IN ('promised_date', 'postponement_requested', 'ambiguous', 'no_signal') THEN
    RETURN QUERY SELECT NULL::text, 'unknown_signal_type'::text, NULL::uuid; RETURN;
  END IF;

  SELECT f.status, f.fact_id INTO v_fact
  FROM public.record_conversation_fact(
    p_dispatch_id, p_lead_id, p_conversation_id, p_source_message_id,
    p_signal_type, p_promised_date, p_raw_excerpt, p_classifier_source, p_classifier_version
  ) f;

  RETURN QUERY SELECT 'conversation_fact'::text, v_fact.status, v_fact.fact_id;
END;
$$;

COMMENT ON FUNCTION public.manual_charge_record_classified_signal IS
  'ÚNICO ponto de entrada para um classificador registrar um sinal detectado. Roteia payment_claimed->register_payment_claim, refused_contact->create_suppression_candidate(stop_contact, candidate), e os 4 fact_types restantes->record_conversation_fact. Existe para que a remoção de refused_contact/payment_claimed de manual_charge_conversation_facts (20260923183859) não deixe essa ligação apenas documentada -- um classificador que só conhece esta function automaticamente aciona o mecanismo certo para qualquer um dos 6 tipos de sinal.';

REVOKE ALL ON FUNCTION public.manual_charge_record_classified_signal(uuid, uuid, uuid, uuid, text, date, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.manual_charge_record_classified_signal(uuid, uuid, uuid, uuid, text, date, text, text, text) TO service_role;
