
-- Configuração da recuperação automática por organização
CREATE TABLE public.cakto_recovery_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL UNIQUE REFERENCES public.organizations(id) ON DELETE CASCADE,
  is_enabled BOOLEAN NOT NULL DEFAULT false,
  -- Agente responsável pela recuperação (mesmo agente para todos os eventos por enquanto)
  recovery_agent_id UUID REFERENCES public.product_agents(id) ON DELETE SET NULL,
  -- Quais eventos disparam a recuperação
  trigger_on_abandoned BOOLEAN NOT NULL DEFAULT true,    -- pending / waiting_payment
  trigger_on_paid BOOLEAN NOT NULL DEFAULT true,         -- pós-venda / upsell
  trigger_on_refunded BOOLEAN NOT NULL DEFAULT false,    -- reembolso / chargeback
  -- Atraso (segundos) antes de disparar — útil pra evitar barulho em status efêmeros
  delay_seconds INTEGER NOT NULL DEFAULT 0,
  -- Janela mínima entre disparos para o mesmo lead/evento (anti-spam)
  cooldown_minutes INTEGER NOT NULL DEFAULT 60,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.cakto_recovery_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin org pode ver config recuperação"
ON public.cakto_recovery_config FOR SELECT
TO authenticated
USING (
  public.user_belongs_to_organization(auth.uid(), organization_id)
  AND (public.has_role(auth.uid(), 'admin') OR public.is_super_admin(auth.uid()))
);

CREATE POLICY "Admin org pode editar config recuperação"
ON public.cakto_recovery_config FOR ALL
TO authenticated
USING (
  public.user_belongs_to_organization(auth.uid(), organization_id)
  AND (public.has_role(auth.uid(), 'admin') OR public.is_super_admin(auth.uid()))
)
WITH CHECK (
  public.user_belongs_to_organization(auth.uid(), organization_id)
  AND (public.has_role(auth.uid(), 'admin') OR public.is_super_admin(auth.uid()))
);

CREATE TRIGGER cakto_recovery_config_updated_at
BEFORE UPDATE ON public.cakto_recovery_config
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Histórico de disparos (auditoria + idempotência)
CREATE TABLE public.cakto_recovery_dispatches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  cakto_order_id UUID REFERENCES public.cakto_orders(id) ON DELETE SET NULL,
  cakto_event TEXT NOT NULL, -- ex: 'abandoned', 'paid', 'refunded'
  cakto_status TEXT,
  lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
  agent_id UUID REFERENCES public.product_agents(id) ON DELETE SET NULL,
  conversation_id UUID,
  customer_phone TEXT,
  customer_email TEXT,
  message_sent TEXT,
  success BOOLEAN NOT NULL DEFAULT false,
  error_message TEXT,
  skipped_reason TEXT, -- 'no_phone', 'cooldown', 'already_customer', 'agent_disabled', etc.
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_recovery_dispatches_org_created ON public.cakto_recovery_dispatches(organization_id, created_at DESC);
CREATE INDEX idx_recovery_dispatches_lead_event ON public.cakto_recovery_dispatches(lead_id, cakto_event, created_at DESC);
CREATE INDEX idx_recovery_dispatches_order ON public.cakto_recovery_dispatches(cakto_order_id);

ALTER TABLE public.cakto_recovery_dispatches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin org pode ver histórico recuperação"
ON public.cakto_recovery_dispatches FOR SELECT
TO authenticated
USING (
  public.user_belongs_to_organization(auth.uid(), organization_id)
  AND (public.has_role(auth.uid(), 'admin') OR public.is_super_admin(auth.uid()))
);

-- Service role precisa inserir (edge function)
CREATE POLICY "Service role insere disparos"
ON public.cakto_recovery_dispatches FOR INSERT
TO service_role
WITH CHECK (true);
