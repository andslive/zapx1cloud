-- ═══════════════════════════════════════════════════════════════════════
-- CORREÇÃO ESTRUTURAL REAL -- achada ao investigar, no código de
-- produção real (não no fixture de teste), os valores de fato usados em
-- purchase_audit.purchase_status. Confirmado por pesquisa direta no
-- repositório (supabase/functions/uazapi-webhook, meta-replay-recovery,
-- receipt-production-write): os únicos valores realmente gravados são
-- 'success' (evento Meta CAPI aceito), 'failed' (tentativa de evento/
-- envio falhou), 'duplicate' (eco bloqueado, nunca uma venda nova), e
-- 'recognized' (comprovante reconhecido por OCR/IA). NUNCA existe um
-- valor 'pending'/'waiting' -- essa tabela é um log de auditoria de
-- pixel/atribuição, NUNCA uma tabela de dívidas/faturas.
--
-- Isso significa que a migration anterior (20260923195721) presumia
-- errado: tratar QUALQUER purchase_audit com status fora de
-- ('success','recognized') como "obrigação pendente" na verdade incluía
-- 'failed' (tentativa que falhou -- pode não representar dívida
-- nenhuma) e 'duplicate' (nunca uma cobrança nova) como se fossem
-- dívida real, e EXCLUÍA leads que prometeram pagar mas ainda não têm
-- NENHUMA linha em purchase_audit (o caso mais comum de venda
-- negociada manualmente, ainda não passou pelo pixel).
--
-- CORREÇÃO: a identidade real de uma ocasião de cobrança volta a ser
-- (organization_id, phone_normalized, campaign_key) -- a MESMA proteção
-- já madura e testada da própria Fase A -- nunca purchase_audit_id.
-- purchase_audit_id (source_purchase_audit_id) passa a ser EVIDÊNCIA
-- OPCIONAL DE APOIO (nunca a fonte da obrigação): quando informado, só
-- serve para excluir quem já está confirmado pago (success/recognized)
-- -- nunca para AFIRMAR que existe dívida. A evidência real de que existe
-- algo a cobrar é sempre a PRÓPRIA PROMESSA EXPLÍCITA do lead (fato
-- promised_date ou um compromisso voluntário explícito), nunca inferida
-- de um log de pixel.
-- ═══════════════════════════════════════════════════════════════════════

-- ── charge_kind -- distingue lembrete de DÍVIDA (compra/obrigação real)
--    de lembrete de CONTRIBUIÇÃO voluntária explicitamente prometida.
--    Mesma mecânica (agendamento, silêncio após tentativa, recusa,
--    pagamento fecha) para os dois -- só o ENQUADRAMENTO da mensagem
--    muda (nunca afirmar dívida para quem prometeu contribuir). ──
ALTER TABLE public.manual_charge_dispatches
  ADD COLUMN charge_kind text NOT NULL DEFAULT 'debt_reminder'
    CHECK (charge_kind IN ('debt_reminder', 'voluntary_contribution_reminder'));

COMMENT ON COLUMN public.manual_charge_dispatches.charge_kind IS
  'debt_reminder (obrigação real, ex.: compra) ou voluntary_contribution_reminder (contribuição explicitamente prometida, nunca uma dívida). Mesmas regras de agendamento/silêncio/recusa/pagamento para os dois -- só o texto da mensagem (catálogo de templates, fora do escopo desta migration) precisa refletir a diferença.';

-- charge_kind precisa ser parâmetro real da function de criação -- uma
-- coluna com DEFAULT não basta, o CHAMADOR precisa escolher
-- explicitamente. Muda a lista de parâmetros -- exige DROP explícito
-- (achado já documentado nesta feature: CREATE OR REPLACE com novo
-- parâmetro cria um OVERLOAD em vez de substituir).
DROP FUNCTION IF EXISTS public.manual_charge_create_dispatch_for_obligation(uuid, uuid, uuid, text);

CREATE FUNCTION public.manual_charge_create_dispatch_for_obligation(
  p_organization_id uuid,
  p_lead_id uuid,
  p_purchase_audit_id uuid,
  p_campaign_key text,
  p_charge_kind text DEFAULT 'debt_reminder'
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
  IF p_charge_kind NOT IN ('debt_reminder', 'voluntary_contribution_reminder') THEN
    RETURN QUERY SELECT 'invalid_charge_kind'::text, NULL::uuid; RETURN;
  END IF;

  SELECT * INTO v_lead FROM public.leads WHERE id = p_lead_id AND organization_id = p_organization_id;
  IF v_lead IS NULL THEN
    RETURN QUERY SELECT 'lead_not_found_in_organization'::text, NULL::uuid; RETURN;
  END IF;

  -- purchase_audit_id agora é OPCIONAL -- só validado quando informado.
  -- Nunca exigido para criar o dispatch (a evidência real é a promessa
  -- do lead, verificada pelo CHAMADOR antes de invocar esta function --
  -- ver manual_charge_september_2026_ingest).
  IF p_purchase_audit_id IS NOT NULL THEN
    SELECT * INTO v_pa FROM public.purchase_audit WHERE id = p_purchase_audit_id;
    IF v_pa IS NULL THEN
      RETURN QUERY SELECT 'purchase_audit_not_found'::text, NULL::uuid; RETURN;
    END IF;
    IF v_pa.lead_id IS DISTINCT FROM p_lead_id THEN
      RETURN QUERY SELECT 'purchase_audit_belongs_to_different_lead'::text, NULL::uuid; RETURN;
    END IF;
    -- 'success'/'recognized' são os ÚNICOS 2 valores reais que
    -- significam "já pago" (achado confirmado em produção) -- 'failed'/
    -- 'duplicate' NÃO bloqueiam a criação (não significam "já pago", só
    -- que uma tentativa de evento/notificação anterior falhou ou foi um
    -- eco).
    IF v_pa.purchase_status IN ('success', 'recognized') THEN
      RETURN QUERY SELECT 'obligation_already_paid'::text, NULL::uuid; RETURN;
    END IF;
  END IF;

  -- Identidade real da ocasião: (organization_id, phone_normalized,
  -- campaign_key) -- a UNIQUE já existente e testada da Fase A
  -- (manual_charge_dispatches_org_phone_campaign_uk), nunca
  -- purchase_audit_id.
  INSERT INTO public.manual_charge_dispatches
    (organization_id, lead_id, campaign_key, source_purchase_audit_id, charge_kind, status)
  VALUES (p_organization_id, p_lead_id, p_campaign_key, p_purchase_audit_id, p_charge_kind, 'eligible')
  ON CONFLICT ON CONSTRAINT manual_charge_dispatches_org_phone_campaign_uk DO NOTHING
  RETURNING id INTO v_id;

  IF v_id IS NULL THEN
    -- Já existe um dispatch para ESTA MESMA campanha+telefone -- nunca
    -- cria outro. Isso é exatamente a proteção contra "recobrar sem
    -- resposta" -- nova ocasião exige um campaign_key genuinamente
    -- distinto (decisão humana), nunca uma chamada repetida com o mesmo.
    SELECT d.id INTO v_id FROM public.manual_charge_dispatches d
    WHERE d.organization_id = p_organization_id AND d.phone_normalized = v_lead.phone_normalized
      AND d.campaign_key = p_campaign_key;
    RETURN QUERY SELECT 'already_exists_for_this_campaign'::text, v_id; RETURN;
  END IF;

  RETURN QUERY SELECT 'created'::text, v_id;
END;
$$;

COMMENT ON FUNCTION public.manual_charge_create_dispatch_for_obligation(uuid, uuid, uuid, text, text) IS
  'Identidade real da ocasião é (organization_id, phone_normalized, campaign_key) -- a UNIQUE já madura da Fase A -- nunca purchase_audit_id. p_purchase_audit_id é evidência OPCIONAL de apoio (só exclui quem já está confirmado pago -- success/recognized são os únicos 2 valores reais com esse significado). p_charge_kind distingue dívida real de contribuição voluntária -- nunca a mesma redação para as duas.';

REVOKE ALL ON FUNCTION public.manual_charge_create_dispatch_for_obligation(uuid, uuid, uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.manual_charge_create_dispatch_for_obligation(uuid, uuid, uuid, text, text) TO service_role;

COMMENT ON CONSTRAINT manual_charge_dispatches_org_phone_purchase_uk ON public.manual_charge_dispatches IS
  'Proteção SECUNDÁRIA (só relevante quando source_purchase_audit_id é informado): impede duas linhas para a MESMA obrigação de compra real explicitamente vinculada. A proteção PRIMÁRIA contra recobrança sem resposta é manual_charge_dispatches_org_phone_campaign_uk (Fase A).';

-- ═══════════════════════════════════════════════════════════════════════
-- Panel view precisa expor charge_kind -- recriada (LATERAL sobre
-- current_facts não muda, só a lista de colunas de d.*).
-- ═══════════════════════════════════════════════════════════════════════

DROP VIEW IF EXISTS public.manual_charge_dispatches_panel;

CREATE VIEW public.manual_charge_dispatches_panel
WITH (security_invoker = true) AS
SELECT
  d.id AS dispatch_id, d.organization_id, d.lead_id, l.name AS lead_name, d.phone_normalized,
  d.campaign_key, d.charge_kind, d.status, d.disposition_reason, d.claim_token, d.claimed_by, d.claimed_at, d.sent_at,
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
  'Adiciona charge_kind, para o painel nunca apresentar uma contribuição voluntária como dívida.';

REVOKE ALL ON public.manual_charge_dispatches_panel FROM PUBLIC, anon;
GRANT SELECT ON public.manual_charge_dispatches_panel TO authenticated;
