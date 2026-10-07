-- ═══════════════════════════════════════════════════════════════════════
-- View somente-leitura para o painel "Cobrança" -- junta dispatch +
-- lead + conexão + estado de conversa (promessa/recusa/pagamento) numa
-- única linha por dispatch, para filtro/paginação no cliente via
-- PostgREST. security_invoker=true: a RLS de CADA tabela subjacente
-- continua sendo aplicada com o papel de quem consulta a view, nunca com
-- privilégio elevado da view em si.
--
-- "Pagamento confirmado" (purchase_audit reconhecido) e "recuperação
-- atribuída" são mantidos como colunas SEPARADAS, nunca somadas: o
-- critério de atribuição (ex.: janela pós-envio) permanece
-- EXPLICITAMENTE PENDENTE DE APROVAÇÃO (a janela de 72h proposta
-- anteriormente foi rejeitada) -- attribution_status fica travado em
-- 'pending_criteria_approval' até uma decisão de negócio existir.
-- ═══════════════════════════════════════════════════════════════════════

CREATE VIEW public.manual_charge_dispatches_panel
WITH (security_invoker = true) AS
SELECT
  d.id AS dispatch_id,
  d.organization_id,
  d.lead_id,
  l.name AS lead_name,
  d.phone_normalized,
  d.campaign_key,
  d.status,
  d.disposition_reason,
  d.claim_token,
  d.claimed_by,
  d.claimed_at,
  d.sent_at,
  d.agreed_date,
  d.planned_send_at,
  d.scheduling_status,
  d.connection_id,
  ei.name AS connection_name,
  ei.status AS connection_status,
  l.preferred_locale AS lead_preferred_locale,
  l.preferred_timezone AS lead_preferred_timezone,
  l.timezone_source AS lead_timezone_source,
  cf.effective_promised_date,
  cf.promised_date_occurred_at_source,
  cf.has_pending_ambiguous_signal,
  st.is_refused,
  st.refused_reason,
  st.is_payment_claimed,
  st.payment_claim_status,
  EXISTS (
    SELECT 1 FROM public.purchase_audit pa
    WHERE pa.lead_id = d.lead_id AND pa.purchase_status IN ('success', 'recognized')
  ) AS payment_confirmed,
  -- Nunca calculado -- critério pendente de aprovação explícita (ver
  -- comentário acima). Painel deve mostrar "pendente de critério", nunca
  -- inflar recuperação com um valor inventado.
  'pending_criteria_approval'::text AS attribution_status,
  d.created_at,
  d.updated_at
FROM public.manual_charge_dispatches d
JOIN public.leads l ON l.id = d.lead_id
LEFT JOIN public.evolution_instances ei ON ei.id = d.connection_id
LEFT JOIN LATERAL public.manual_charge_conversation_current_facts(d.id) cf ON true
LEFT JOIN LATERAL public.manual_charge_conversation_state(d.id) st ON true;

COMMENT ON VIEW public.manual_charge_dispatches_panel IS
  'Leitura combinada para o painel Cobrança. security_invoker=true -- a RLS de cada tabela de origem (manual_charge_dispatches, leads, evolution_instances) continua valendo para quem consulta. attribution_status é sempre pending_criteria_approval -- o critério de atribuição de recuperação (janela pós-envio) permanece pendente de aprovação de negócio; nunca inflar recuperação com uma regra não aprovada.';

REVOKE ALL ON public.manual_charge_dispatches_panel FROM PUBLIC, anon;
GRANT SELECT ON public.manual_charge_dispatches_panel TO authenticated;
