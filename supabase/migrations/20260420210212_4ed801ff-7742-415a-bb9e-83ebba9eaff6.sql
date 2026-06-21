-- Add activation trigger fields to product_agents
ALTER TABLE public.product_agents
  ADD COLUMN IF NOT EXISTS activation_keywords text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS activation_phrases text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS activation_priority int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS activation_scope text NOT NULL DEFAULT 'all',
  ADD COLUMN IF NOT EXISTS takeover_on_match boolean NOT NULL DEFAULT true;

-- Index to help match queries (one row per product, small set)
CREATE INDEX IF NOT EXISTS idx_product_agents_activation_priority
  ON public.product_agents (product_id, is_active, activation_priority DESC);

-- Activation audit log
CREATE TABLE IF NOT EXISTS public.agent_activation_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  conversation_id uuid REFERENCES public.webchat_conversations(id) ON DELETE SET NULL,
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  from_agent_id uuid REFERENCES public.product_agents(id) ON DELETE SET NULL,
  to_agent_id uuid REFERENCES public.product_agents(id) ON DELETE SET NULL,
  matched_term text,
  match_type text,
  channel text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agent_activation_logs_to_agent_created
  ON public.agent_activation_logs (to_agent_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_agent_activation_logs_org_created
  ON public.agent_activation_logs (organization_id, created_at DESC);

ALTER TABLE public.agent_activation_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Org admins/managers can view activation logs" ON public.agent_activation_logs;
CREATE POLICY "Org admins/managers can view activation logs"
  ON public.agent_activation_logs
  FOR SELECT
  TO authenticated
  USING (
    public.user_belongs_to_organization(auth.uid(), organization_id)
    AND (
      public.has_role(auth.uid(), 'admin'::app_role)
      OR public.has_role(auth.uid(), 'manager'::app_role)
      OR public.is_super_admin(auth.uid())
    )
  );

DROP POLICY IF EXISTS "Service role inserts activation logs" ON public.agent_activation_logs;
CREATE POLICY "Service role inserts activation logs"
  ON public.agent_activation_logs
  FOR INSERT
  TO authenticated, anon
  WITH CHECK (true);
