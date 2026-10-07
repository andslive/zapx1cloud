-- ═══════════════════════════════════════════════════════════════════════
-- CORREÇÃO CRÍTICA -- achado real, reproduzido empiricamente em Postgres
-- efêmero, na função manual_charge_evaluate JÁ APLICADA EM PRODUÇÃO
-- (Fase A, 20260915120000, hash c8357365913936b66f73768c037e03c3985bf03
-- 6a8fc1531e3098042e62d9235). NÃO reedita o arquivo da Fase A -- corrige
-- via CREATE OR REPLACE FUNCTION nesta migration nova, prática padrão do
-- Postgres para versionar funções sem tocar a migration original.
--
-- O BUG: as 3 consultas de manual_charge_suppressions dentro de
-- manual_charge_evaluate comparam
--   manual_charge_suppressions.phone_normalized = v_lead.phone
-- usando leads.phone (campo BRUTO, como o usuário digitou/importou -- ex.:
-- "+5581999990000"), quando deveriam comparar contra
-- leads.phone_normalized (campo normalizado, mesmo formato usado em
-- manual_charge_suppressions.phone_normalized e em
-- manual_charge_dispatches.phone_normalized -- ex.: "5581999990000").
--
-- IMPACTO REAL, CONFIRMADO POR TESTE DIRETO CONTRA POSTGRES (não
-- hipótese): uma recusa (stop_contact) CONFIRMADA em
-- manual_charge_suppressions NUNCA bloqueia o dispatch correspondente
-- quando leads.phone não está, por acaso, já no formato normalizado --
-- que é o caso comum (o schema mantém phone bruto E phone_normalized
-- exatamente para tratar esse descompasso). manual_charge_evaluate
-- retorna 'eligible' para um lead com recusa confirmada, silenciosamente.
-- O MESMO problema afeta as 3 categorias: supressão permanente
-- (cancelled_permanent), supressão candidata (hold_suppression_review) e
-- supressão de revisão (needs_review_suppression) -- todas as 3
-- consultas usavam o mesmo campo errado.
--
-- MITIGANTE JÁ EXISTENTE: nenhum envio real ocorreu -- Gate 1
-- (manual_charge_dispatch_claim_enabled) nasceu false e continua false;
-- nenhum disparo automático ou manual foi ativado nesta fase. O risco é
-- estrutural (a barreira de segurança está com defeito), não um envio
-- indevido já ocorrido.
--
-- ESCOPO DESTA CORREÇÃO: só troca v_lead.phone por v_lead.phone_normalized
-- nas 3 ocorrências (linhas correspondentes a suppression_permanent_reason,
-- suppression_candidate, suppression_review_reason). Nenhuma outra
-- mudança de comportamento -- toda a função foi reproduzida
-- integralmente (via pg_get_functiondef contra a instância efêmera onde
-- a Fase A real foi aplicada) para garantir que nada além do bug seja
-- alterado.
-- ═══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.manual_charge_evaluate(p_dispatch_id uuid)
 RETURNS TABLE(disposition text, disposition_reason text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  -- CORRIGIDO (era v_lead.phone -- campo bruto -- agora
  -- v_lead.phone_normalized, mesmo formato armazenado em
  -- manual_charge_suppressions.phone_normalized):
  SELECT reason INTO v_fact_suppression_permanent_reason
  FROM public.manual_charge_suppressions
  WHERE organization_id = v_dispatch.organization_id
    AND phone_normalized = v_lead.phone_normalized
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
      AND phone_normalized = v_lead.phone_normalized
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
    AND phone_normalized = v_lead.phone_normalized
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
$function$;

COMMENT ON FUNCTION public.manual_charge_evaluate IS
  'FASE A (corrigida) — calcula todos os fatos independentes (sem short-circuit entre eles, exceto o conflito de integridade que interrompe só o cálculo de pagamento) e aplica a precedência única de 12 níveis. Nunca apaga/altera uma linha de manual_charge_suppressions como efeito colateral. CORREÇÃO 20260923184904: as 3 consultas de supressão agora comparam contra v_lead.phone_normalized (era v_lead.phone, campo bruto -- fazia recusas confirmadas nunca bloquearem quando o telefone bruto não estava já no formato normalizado).';

-- Grants idênticos ao original (achado ao conferir: authenticated NUNCA
-- teve EXECUTE direto -- só service_role. manual_charge_trigger_manual_send
-- consegue chamar mesmo assim porque também é SECURITY DEFINER.)
REVOKE ALL ON FUNCTION public.manual_charge_evaluate(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.manual_charge_evaluate(uuid) TO service_role;
