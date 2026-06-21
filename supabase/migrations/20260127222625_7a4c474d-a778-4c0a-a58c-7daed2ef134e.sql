-- Criar tabela product_agents
CREATE TABLE public.product_agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
  product_id UUID REFERENCES products(id) ON DELETE CASCADE NOT NULL,
  
  -- Identificacao
  name VARCHAR(100) NOT NULL,
  description TEXT,
  avatar_url TEXT,
  
  -- Tipo/Papel
  agent_type VARCHAR(50) NOT NULL DEFAULT 'custom',
  
  -- Objetivo
  primary_objective TEXT NOT NULL,
  
  -- Regras de Comportamento
  can_do TEXT[] DEFAULT '{}',
  cannot_do TEXT[] DEFAULT '{}',
  handoff_triggers TEXT[] DEFAULT '{}',
  end_conversation_triggers TEXT[] DEFAULT '{}',
  
  -- Tom de Voz
  tone_style VARCHAR(30) DEFAULT 'friendly',
  message_style VARCHAR(20) DEFAULT 'balanced',
  always_end_with_question BOOLEAN DEFAULT true,
  
  -- Prompt Complementar
  additional_prompt TEXT,
  required_phrases TEXT[] DEFAULT '{}',
  prohibited_phrases TEXT[] DEFAULT '{}',
  
  -- Integracao com CRM
  auto_tag_leads BOOLEAN DEFAULT true,
  default_tags TEXT[] DEFAULT '{}',
  can_update_pipeline BOOLEAN DEFAULT true,
  can_create_tasks BOOLEAN DEFAULT true,
  can_schedule_meetings BOOLEAN DEFAULT true,
  
  -- Onde atua
  active_in_funnels BOOLEAN DEFAULT true,
  active_in_chat BOOLEAN DEFAULT true,
  active_in_widget BOOLEAN DEFAULT true,
  active_in_inbox BOOLEAN DEFAULT true,
  active_in_copilot BOOLEAN DEFAULT false,
  
  -- Status
  is_active BOOLEAN DEFAULT true,
  is_default BOOLEAN DEFAULT false,
  
  -- Metadata
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Indices
CREATE INDEX idx_product_agents_product ON product_agents(product_id);
CREATE INDEX idx_product_agents_org ON product_agents(organization_id);
CREATE INDEX idx_product_agents_type ON product_agents(agent_type);
CREATE INDEX idx_product_agents_active ON product_agents(is_active);

-- RLS
ALTER TABLE product_agents ENABLE ROW LEVEL SECURITY;

-- Politicas
CREATE POLICY "Users can view agents in their organization"
  ON product_agents FOR SELECT
  USING (organization_id = public.get_user_organization(auth.uid()));

CREATE POLICY "Users can insert agents in their organization"
  ON product_agents FOR INSERT
  WITH CHECK (organization_id = public.get_user_organization(auth.uid()));

CREATE POLICY "Users can update agents in their organization"
  ON product_agents FOR UPDATE
  USING (organization_id = public.get_user_organization(auth.uid()));

CREATE POLICY "Users can delete agents in their organization"
  ON product_agents FOR DELETE
  USING (organization_id = public.get_user_organization(auth.uid()));

-- Trigger para updated_at
CREATE TRIGGER update_product_agents_updated_at
  BEFORE UPDATE ON product_agents
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();