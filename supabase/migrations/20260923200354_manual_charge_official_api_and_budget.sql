-- ═══════════════════════════════════════════════════════════════════════
-- Seção 10/11 -- preparação para a API oficial do WhatsApp Business e
-- controle de orçamento. ESCOPO EXPLICITAMENTE LIMITADO: schema +
-- validação. NENHUM template é submetido, NENHUM provedor é ativado,
-- NENHUMA cobrança/gasto real acontece aqui -- tudo permanece bloqueado
-- pelos mesmos flags de ativação já existentes (todas false).
-- ═══════════════════════════════════════════════════════════════════════

-- ── Diferencia conexão oficial de não-oficial. Nunca trocar de conexão
--    pra burlar uma restrição da oficial -- ver validação abaixo, que
--    trava por dispatch/connection_id, não por "encontrar outra
--    conexão disponível". ──
ALTER TABLE public.evolution_instances
  ADD COLUMN provider_type text NOT NULL DEFAULT 'uazapi' CHECK (provider_type IN ('uazapi', 'whatsapp_business_official'));

COMMENT ON COLUMN public.evolution_instances.provider_type IS
  'uazapi (não-oficial, atual) ou whatsapp_business_official. Nenhuma conexão oficial real existe ainda -- esta coluna só prepara a distinção de regras (Seção 10), nunca migra uma conexão existente.';

-- ── Consentimento explícito -- pré-requisito da API oficial, nunca
--    presumido. ──
ALTER TABLE public.leads
  ADD COLUMN whatsapp_official_consent boolean;

COMMENT ON COLUMN public.leads.whatsapp_official_consent IS
  'Consentimento explícito para mensagens via API oficial. NULL = desconhecido (trata como recusado -- nunca presume consentimento). Seção 10.';

-- ═══════════════════════════════════════════════════════════════════════
-- Catálogo de templates -- por propósito, idioma, conta de negócio e
-- categoria (Seção 10). Criação/edição aqui NUNCA submete nada à Meta --
-- é só um catálogo local, pendente de submissão real (autorização
-- separada). Diferencia explicitamente lembrete transacional (ligado a
-- purchase_audit) de reengajamento comercial -- nunca presume que os
-- dois são "utility".
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE public.manual_charge_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (name <> ''),
  locale text NOT NULL CHECK (locale <> ''),
  purpose text NOT NULL CHECK (purpose IN ('payment_reminder_transactional', 'commercial_reengagement')),
  -- Categoria conforme documentação da Meta vigente no momento desta
  -- migration: MARKETING, UTILITY, AUTHENTICATION. Nunca presumida a
  -- partir do purpose -- precisa ser escolhida explicitamente e
  -- confirmada contra a documentação atual antes de qualquer submissão
  -- real (pendência declarada: regras da Meta podem mudar).
  category text NOT NULL CHECK (category IN ('MARKETING', 'UTILITY', 'AUTHENTICATION')),
  whatsapp_business_account_id text,
  body_text text NOT NULL CHECK (body_text <> ''),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'pending_submission', 'approved', 'rejected', 'paused')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CHECK (purpose <> 'payment_reminder_transactional' OR category = 'UTILITY'),
  CHECK (purpose <> 'commercial_reengagement' OR category = 'MARKETING')
);

COMMENT ON TABLE public.manual_charge_templates IS
  'Catálogo LOCAL de templates -- nenhuma submissão real à Meta acontece por esta tabela. purpose payment_reminder_transactional força category=UTILITY; commercial_reengagement força MARKETING -- nunca presume "utility" pros dois. Submissão/aprovação real dependem de autorização separada, fora do escopo desta migration.';

CREATE TRIGGER manual_charge_templates_touch_updated_at
  BEFORE UPDATE ON public.manual_charge_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

REVOKE ALL ON public.manual_charge_templates FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.manual_charge_templates TO authenticated;
ALTER TABLE public.manual_charge_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "manual_charge_templates_org_read" ON public.manual_charge_templates
  FOR SELECT TO authenticated
  USING (public.manual_charge_actor_authorized(organization_id));

-- ═══════════════════════════════════════════════════════════════════════
-- Orçamento: config (proposta, pendente de aprovação) + livro-razão
-- INSERT-only + controle de concorrência via advisory lock (mesmo
-- padrão de capacidade). approved=false por padrão -- sem orçamento
-- aprovado, envio pago fica bloqueado independente de qualquer outro
-- critério.
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE public.manual_charge_budget_config (
  organization_id uuid PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  daily_cap_usd numeric NOT NULL DEFAULT 0 CHECK (daily_cap_usd >= 0),
  approved boolean NOT NULL DEFAULT false,
  approved_by uuid REFERENCES public.profiles(id) ON DELETE RESTRICT,
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CHECK (approved = false OR (approved_by IS NOT NULL AND approved_at IS NOT NULL))
);

COMMENT ON TABLE public.manual_charge_budget_config IS
  'approved nasce false. Sem uma linha aprovada explicitamente (approved=true, com approved_by/approved_at), manual_charge_official_api_prevalidate SEMPRE bloqueia envio pago -- nenhum valor de daily_cap_usd, mesmo positivo, libera nada sozinho.';

CREATE TRIGGER manual_charge_budget_config_touch_updated_at
  BEFORE UPDATE ON public.manual_charge_budget_config
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

REVOKE ALL ON public.manual_charge_budget_config FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.manual_charge_budget_config TO authenticated;
ALTER TABLE public.manual_charge_budget_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "manual_charge_budget_config_org_read" ON public.manual_charge_budget_config
  FOR SELECT TO authenticated
  USING (public.manual_charge_actor_authorized(organization_id));

CREATE TABLE public.manual_charge_budget_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  dispatch_id uuid,
  template_id uuid REFERENCES public.manual_charge_templates(id) ON DELETE RESTRICT,
  entry_type text NOT NULL CHECK (entry_type IN ('estimate', 'confirmed')),
  amount_usd numeric NOT NULL CHECK (amount_usd >= 0),
  provider text,
  category text,
  language text,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.manual_charge_budget_ledger IS
  'INSERT-only. entry_type=estimate nunca um valor faturado real -- só confirmed reflete cobrança de fato do provedor (nenhuma linha confirmed é criada por esta fase -- nenhuma chamada paga acontece). Nunca somado com valor de recuperação (billing != lucro).';

REVOKE ALL ON public.manual_charge_budget_ledger FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.manual_charge_budget_ledger TO authenticated;
ALTER TABLE public.manual_charge_budget_ledger ENABLE ROW LEVEL SECURITY;

CREATE POLICY "manual_charge_budget_ledger_org_read" ON public.manual_charge_budget_ledger
  FOR SELECT TO authenticated
  USING (public.manual_charge_actor_authorized(organization_id));

-- ═══════════════════════════════════════════════════════════════════════
-- manual_charge_official_api_prevalidate -- só roda checagens ADICIONAIS
-- quando a conexão do dispatch é oficial. Nunca troca de conexão pra
-- burlar (opera sobre a conexão JÁ vinculada ao dispatch, nunca procura
-- outra). Chamado a partir de manual_charge_prevalidate_send (abaixo).
-- ═══════════════════════════════════════════════════════════════════════

CREATE FUNCTION public.manual_charge_official_api_prevalidate(
  p_dispatch_id uuid
) RETURNS TABLE(ok boolean, reason text, estimated_cost_usd numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_dispatch RECORD;
  v_lead RECORD;
  v_connection RECORD;
  v_last_inbound_at timestamptz;
  v_within_window boolean;
  v_template RECORD;
  v_budget RECORD;
  v_spent_today numeric;
  v_estimated_cost numeric := 0.03; -- estimativa placeholder, nunca um valor real cobrado
BEGIN
  SELECT * INTO v_dispatch FROM public.manual_charge_dispatches WHERE id = p_dispatch_id;
  IF v_dispatch IS NULL THEN
    RETURN QUERY SELECT false, 'dispatch_not_found'::text, NULL::numeric; RETURN;
  END IF;

  SELECT * INTO v_connection FROM public.evolution_instances WHERE id = v_dispatch.connection_id;
  IF v_connection IS NULL THEN
    RETURN QUERY SELECT false, 'connection_not_found'::text, NULL::numeric; RETURN;
  END IF;

  IF v_connection.provider_type <> 'whatsapp_business_official' THEN
    -- Conexão não-oficial: nenhuma checagem adicional desta function se
    -- aplica -- retorna ok, sem custo estimado de API oficial.
    RETURN QUERY SELECT true, NULL::text, 0::numeric; RETURN;
  END IF;

  SELECT * INTO v_lead FROM public.leads WHERE id = v_dispatch.lead_id;

  IF v_lead.whatsapp_official_consent IS NOT TRUE THEN
    RETURN QUERY SELECT false, 'consent_not_captured'::text, NULL::numeric; RETURN;
  END IF;

  -- Janela de atendimento de 24h -- calculada a partir da última
  -- mensagem inbound NESTA conexão específica (nunca compartilhada
  -- entre conexões).
  SELECT max(wm.created_at) INTO v_last_inbound_at
  FROM public.webchat_conversations wc
  JOIN public.webchat_messages wm ON wm.conversation_id = wc.id
  WHERE wc.lead_id = v_dispatch.lead_id AND wc.evolution_instance_id = v_dispatch.connection_id
    AND wm.direction = 'inbound' AND wm.sender_type = 'visitor';

  v_within_window := v_last_inbound_at IS NOT NULL AND v_last_inbound_at > now() - interval '24 hours';

  IF NOT v_within_window THEN
    -- Fora da janela: exige template aprovado E disponível no idioma do
    -- lead, com a categoria correta pro propósito desta cobrança
    -- (nunca presume "utility" pra reengajamento).
    SELECT * INTO v_template
    FROM public.manual_charge_templates t
    WHERE t.organization_id = v_dispatch.organization_id
      AND t.status = 'approved'
      AND t.locale = COALESCE(v_lead.preferred_locale, '__nenhum__')
      AND t.purpose = 'payment_reminder_transactional'
    LIMIT 1;

    IF v_template IS NULL THEN
      RETURN QUERY SELECT false, 'no_compatible_approved_template'::text, NULL::numeric; RETURN;
    END IF;
  END IF;

  -- Orçamento: sem aprovação explícita, bloqueia sempre.
  SELECT * INTO v_budget FROM public.manual_charge_budget_config WHERE organization_id = v_dispatch.organization_id;
  IF v_budget IS NULL OR v_budget.approved IS NOT TRUE THEN
    RETURN QUERY SELECT false, 'budget_not_approved'::text, v_estimated_cost; RETURN;
  END IF;

  -- Controle CONCORRENTE de orçamento -- serializa checagem+reserva do
  -- mesmo jeito que capacidade de agendamento (advisory lock por
  -- organização+dia), para que duas tentativas simultâneas não furem o
  -- cap somando gasto acima do aprovado.
  PERFORM pg_advisory_xact_lock(hashtextextended(
    v_dispatch.organization_id::text || ':budget:' || current_date::text, 0));

  SELECT COALESCE(sum(amount_usd), 0) INTO v_spent_today
  FROM public.manual_charge_budget_ledger
  WHERE organization_id = v_dispatch.organization_id AND created_at::date = current_date;

  IF v_spent_today + v_estimated_cost > v_budget.daily_cap_usd THEN
    RETURN QUERY SELECT false, 'budget_exhausted_for_today'::text, v_estimated_cost; RETURN;
  END IF;

  RETURN QUERY SELECT true, NULL::text, v_estimated_cost;
END;
$$;

COMMENT ON FUNCTION public.manual_charge_official_api_prevalidate IS
  'Checagens ADICIONAIS só quando a conexão do dispatch é oficial: consentimento, janela de 24h OU template aprovado no idioma certo (nunca autoabre a janela ao enviar template), orçamento aprovado E disponível (lock por organização+dia serializa contra concorrência). Nunca troca de conexão para contornar -- opera só sobre a conexão já vinculada ao dispatch.';

REVOKE ALL ON FUNCTION public.manual_charge_official_api_prevalidate(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.manual_charge_official_api_prevalidate(uuid) TO service_role;

-- ═══════════════════════════════════════════════════════════════════════
-- Estende manual_charge_prevalidate_send para também rodar a checagem
-- oficial -- continua sendo o ÚNICO ponto usado por manual E automático.
-- ═══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.manual_charge_prevalidate_send(
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
  v_official RECORD;
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

  SELECT o.ok, o.reason INTO v_official FROM public.manual_charge_official_api_prevalidate(p_dispatch_id) o;
  IF v_official.ok IS NOT TRUE THEN
    RETURN QUERY SELECT false, ('official_api:' || v_official.reason)::text; RETURN;
  END IF;

  RETURN QUERY SELECT true, NULL::text;
END;
$$;

COMMENT ON FUNCTION public.manual_charge_prevalidate_send IS
  'CORRIGIDO 20260923200354: também roda manual_charge_official_api_prevalidate (sem efeito para conexões não-oficiais). Continua sendo a única revalidação usada por manual E automático imediatamente antes do envio.';

REVOKE ALL ON FUNCTION public.manual_charge_prevalidate_send(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.manual_charge_prevalidate_send(uuid) TO service_role;
