
-- Novas colunas de permissão para product_agents
ALTER TABLE public.product_agents
  ADD COLUMN IF NOT EXISTS can_apply_tags BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_update_lead BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_send_emails BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_send_materials BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_trigger_flows BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_transfer BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_notify BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_add_notes BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_start_cadence BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_qualify BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS tool_configs JSONB NOT NULL DEFAULT '{}';

-- Tabela de logs de ações do agente
CREATE TABLE public.agent_action_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  conversation_id UUID REFERENCES public.webchat_conversations(id) ON DELETE SET NULL,
  product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  agent_id UUID REFERENCES public.product_agents(id) ON DELETE SET NULL,
  lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
  action_type VARCHAR(100) NOT NULL,
  action_data JSONB DEFAULT '{}',
  result JSONB DEFAULT '{}',
  success BOOLEAN NOT NULL DEFAULT true,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.agent_action_logs ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view action logs from their organization"
  ON public.agent_action_logs
  FOR SELECT
  USING (organization_id IN (
    SELECT organization_id FROM public.profiles WHERE id = auth.uid()
  ));

CREATE POLICY "Service role can insert action logs"
  ON public.agent_action_logs
  FOR INSERT
  WITH CHECK (true);

-- Index for performance
CREATE INDEX idx_agent_action_logs_conversation ON public.agent_action_logs(conversation_id);
CREATE INDEX idx_agent_action_logs_agent ON public.agent_action_logs(agent_id);
CREATE INDEX idx_agent_action_logs_lead ON public.agent_action_logs(lead_id);
CREATE INDEX idx_agent_action_logs_created ON public.agent_action_logs(created_at DESC);
