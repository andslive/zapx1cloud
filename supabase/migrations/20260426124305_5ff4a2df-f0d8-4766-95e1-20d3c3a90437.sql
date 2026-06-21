-- Tabela de auditoria de execuções de ferramentas pelos agentes
CREATE TABLE public.agent_tool_executions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL,
  agent_id UUID,
  agent_name TEXT,
  lead_id UUID,
  conversation_id UUID,
  channel TEXT,
  tool_name TEXT NOT NULL,
  input JSONB NOT NULL DEFAULT '{}'::jsonb,
  output JSONB,
  success BOOLEAN NOT NULL DEFAULT true,
  error_message TEXT,
  duration_ms INTEGER,
  estimated_cost_cents INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_agent_tool_exec_org ON public.agent_tool_executions(organization_id, created_at DESC);
CREATE INDEX idx_agent_tool_exec_lead ON public.agent_tool_executions(lead_id, created_at DESC);
CREATE INDEX idx_agent_tool_exec_tool ON public.agent_tool_executions(tool_name, created_at DESC);
CREATE INDEX idx_agent_tool_exec_conv ON public.agent_tool_executions(conversation_id, created_at DESC);

ALTER TABLE public.agent_tool_executions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members read tool executions"
ON public.agent_tool_executions
FOR SELECT
TO authenticated
USING (
  public.user_belongs_to_organization(auth.uid(), organization_id)
  OR public.is_super_admin(auth.uid())
);

CREATE POLICY "Super admin reads all tool executions"
ON public.agent_tool_executions
FOR SELECT
TO authenticated
USING (public.is_super_admin(auth.uid()));

-- Inserts somente via service role (edge functions)
CREATE POLICY "Service role inserts tool executions"
ON public.agent_tool_executions
FOR INSERT
TO service_role
WITH CHECK (true);

-- Limites de segurança por organização (orçamento e taxa)
CREATE TABLE public.agent_safety_limits (
  organization_id UUID NOT NULL PRIMARY KEY,
  max_tools_per_turn INTEGER NOT NULL DEFAULT 5,
  max_tool_executions_per_day INTEGER NOT NULL DEFAULT 5000,
  max_cost_cents_per_day INTEGER NOT NULL DEFAULT 50000,
  cooldown_seconds_between_same_tool INTEGER NOT NULL DEFAULT 2,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.agent_safety_limits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org admin manages safety limits"
ON public.agent_safety_limits
FOR ALL
TO authenticated
USING (
  public.user_belongs_to_organization(auth.uid(), organization_id)
  AND (public.has_role(auth.uid(), 'admin') OR public.is_super_admin(auth.uid()))
)
WITH CHECK (
  public.user_belongs_to_organization(auth.uid(), organization_id)
  AND (public.has_role(auth.uid(), 'admin') OR public.is_super_admin(auth.uid()))
);

CREATE POLICY "Org members read safety limits"
ON public.agent_safety_limits
FOR SELECT
TO authenticated
USING (
  public.user_belongs_to_organization(auth.uid(), organization_id)
  OR public.is_super_admin(auth.uid())
);

CREATE TRIGGER update_agent_safety_limits_updated_at
BEFORE UPDATE ON public.agent_safety_limits
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();