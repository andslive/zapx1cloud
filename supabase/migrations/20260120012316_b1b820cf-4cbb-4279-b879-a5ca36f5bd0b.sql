-- Tabela para armazenar fluxos de chat
CREATE TABLE public.chat_flows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID REFERENCES public.products(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  
  name TEXT NOT NULL DEFAULT 'Fluxo de Qualificação',
  description TEXT,
  
  -- Estrutura do fluxo (array de blocos JSON)
  blocks JSONB NOT NULL DEFAULT '[]'::jsonb,
  start_block_id TEXT,
  
  -- Configurações
  is_active BOOLEAN DEFAULT true,
  trigger_type TEXT DEFAULT 'always', -- 'always', 'first_visit', 'utm_match', 'none'
  trigger_conditions JSONB DEFAULT '{}'::jsonb,
  
  -- Variáveis que o fluxo coleta
  collected_variables JSONB DEFAULT '[]'::jsonb,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  created_by UUID REFERENCES public.profiles(id)
);

-- Habilitar RLS
ALTER TABLE public.chat_flows ENABLE ROW LEVEL SECURITY;

-- Políticas RLS para chat_flows
CREATE POLICY "Users can view flows from their organization"
ON public.chat_flows
FOR SELECT
USING (organization_id IN (
  SELECT organization_id FROM profiles WHERE id = auth.uid()
));

CREATE POLICY "Admins can manage flows"
ON public.chat_flows
FOR ALL
USING (
  organization_id IN (SELECT organization_id FROM profiles WHERE id = auth.uid())
  AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role))
);

-- Adicionar colunas de estado do fluxo em webchat_conversations
ALTER TABLE public.webchat_conversations
ADD COLUMN IF NOT EXISTS current_flow_id UUID REFERENCES public.chat_flows(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS current_block_id TEXT,
ADD COLUMN IF NOT EXISTS flow_variables JSONB DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS flow_completed BOOLEAN DEFAULT false;

-- Trigger para updated_at
CREATE TRIGGER update_chat_flows_updated_at
BEFORE UPDATE ON public.chat_flows
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Índices para performance
CREATE INDEX idx_chat_flows_product ON public.chat_flows(product_id);
CREATE INDEX idx_chat_flows_org_active ON public.chat_flows(organization_id, is_active);
CREATE INDEX idx_webchat_conversations_flow ON public.webchat_conversations(current_flow_id) WHERE current_flow_id IS NOT NULL;