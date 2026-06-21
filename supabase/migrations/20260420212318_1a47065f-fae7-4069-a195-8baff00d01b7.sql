-- 1. Add new fields to webchat_conversations for orchestration state
ALTER TABLE public.webchat_conversations
  ADD COLUMN IF NOT EXISTS orchestrator_state text NOT NULL DEFAULT 'triagem',
  ADD COLUMN IF NOT EXISTS orchestrator_context text,
  ADD COLUMN IF NOT EXISTS orchestrator_question_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS detected_intent text;

-- 2. Enrich products table with content used to inject into agent prompts
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS benefits text,
  ADD COLUMN IF NOT EXISTS objections text,
  ADD COLUMN IF NOT EXISTS plans text,
  ADD COLUMN IF NOT EXISTS payment_conditions text,
  ADD COLUMN IF NOT EXISTS guarantee text,
  ADD COLUMN IF NOT EXISTS bonuses text,
  ADD COLUMN IF NOT EXISTS discount_policy text,
  ADD COLUMN IF NOT EXISTS knowledge_base text;

-- Add policy fields to organizations for refund/payment policies (used by global agents)
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS refund_policy text,
  ADD COLUMN IF NOT EXISTS payment_policy text;

-- 3. Organization orchestrator config
CREATE TABLE IF NOT EXISTS public.organization_orchestrator_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL UNIQUE REFERENCES public.organizations(id) ON DELETE CASCADE,
  is_enabled boolean NOT NULL DEFAULT false,
  orchestrator_agent_id uuid REFERENCES public.product_agents(id) ON DELETE SET NULL,
  max_triage_questions integer NOT NULL DEFAULT 2,
  min_confidence numeric NOT NULL DEFAULT 0.6,
  fallback_to_human_after integer NOT NULL DEFAULT 2,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.organization_orchestrator_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org members can view orchestrator config"
  ON public.organization_orchestrator_config
  FOR SELECT
  TO authenticated
  USING (public.user_belongs_to_organization(auth.uid(), organization_id));

CREATE POLICY "org admins can insert orchestrator config"
  ON public.organization_orchestrator_config
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.user_belongs_to_organization(auth.uid(), organization_id)
    AND (public.has_role(auth.uid(), 'admin'::app_role) OR public.is_super_admin(auth.uid()))
  );

CREATE POLICY "org admins can update orchestrator config"
  ON public.organization_orchestrator_config
  FOR UPDATE
  TO authenticated
  USING (
    public.user_belongs_to_organization(auth.uid(), organization_id)
    AND (public.has_role(auth.uid(), 'admin'::app_role) OR public.is_super_admin(auth.uid()))
  );

CREATE POLICY "org admins can delete orchestrator config"
  ON public.organization_orchestrator_config
  FOR DELETE
  TO authenticated
  USING (
    public.user_belongs_to_organization(auth.uid(), organization_id)
    AND (public.has_role(auth.uid(), 'admin'::app_role) OR public.is_super_admin(auth.uid()))
  );

CREATE TRIGGER update_org_orchestrator_config_updated_at
  BEFORE UPDATE ON public.organization_orchestrator_config
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- 4. Orchestration logs (audit)
CREATE TABLE IF NOT EXISTS public.orchestration_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  conversation_id uuid REFERENCES public.webchat_conversations(id) ON DELETE SET NULL,
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  channel text,
  message_in text,
  produto_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  produto_nome text,
  intencao text,
  confianca numeric,
  contexto_extraido text,
  agent_routed_to uuid REFERENCES public.product_agents(id) ON DELETE SET NULL,
  action text NOT NULL,
  raw_response jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_orchestration_logs_org_created
  ON public.orchestration_logs (organization_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_orchestration_logs_conversation
  ON public.orchestration_logs (conversation_id, created_at DESC);

ALTER TABLE public.orchestration_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org members can view orchestration logs"
  ON public.orchestration_logs
  FOR SELECT
  TO authenticated
  USING (public.user_belongs_to_organization(auth.uid(), organization_id));

-- (Inserts come from edge functions using service role, no INSERT policy needed for clients)
