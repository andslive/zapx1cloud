-- ===========================================
-- FASE 1: Melhorias no WebChat para Produto
-- ===========================================

-- 1.1 Adicionar product_id na tabela webchat_widgets
ALTER TABLE webchat_widgets 
ADD COLUMN IF NOT EXISTS product_id uuid REFERENCES products(id) ON DELETE CASCADE;

-- Cada produto pode ter apenas um widget (índice único parcial)
CREATE UNIQUE INDEX IF NOT EXISTS webchat_widgets_product_unique 
ON webchat_widgets(product_id) WHERE product_id IS NOT NULL;

-- 1.2 Adicionar configurações avançadas de IA na tabela webchat_agent_configs
ALTER TABLE webchat_agent_configs 
ADD COLUMN IF NOT EXISTS temperature numeric DEFAULT 0.7;

ALTER TABLE webchat_agent_configs 
ADD COLUMN IF NOT EXISTS max_tokens integer DEFAULT 500;

ALTER TABLE webchat_agent_configs 
ADD COLUMN IF NOT EXISTS persona_style text DEFAULT 'friendly';

ALTER TABLE webchat_agent_configs 
ADD COLUMN IF NOT EXISTS use_product_brain boolean DEFAULT true;

ALTER TABLE webchat_agent_configs 
ADD COLUMN IF NOT EXISTS collect_before_chat boolean DEFAULT true;

ALTER TABLE webchat_agent_configs 
ADD COLUMN IF NOT EXISTS required_fields text[] DEFAULT ARRAY['name', 'whatsapp'];

ALTER TABLE webchat_agent_configs 
ADD COLUMN IF NOT EXISTS welcome_flow jsonb DEFAULT '[]'::jsonb;

ALTER TABLE webchat_agent_configs 
ADD COLUMN IF NOT EXISTS handoff_triggers text[] DEFAULT ARRAY['falar com humano', 'atendente', 'pessoa real'];

ALTER TABLE webchat_agent_configs 
ADD COLUMN IF NOT EXISTS auto_handoff_enabled boolean DEFAULT true;

-- 1.3 Melhorar captura de dados do visitante na tabela webchat_conversations
ALTER TABLE webchat_conversations 
ADD COLUMN IF NOT EXISTS visitor_whatsapp text;

ALTER TABLE webchat_conversations 
ADD COLUMN IF NOT EXISTS lead_created_at timestamptz;

ALTER TABLE webchat_conversations 
ADD COLUMN IF NOT EXISTS data_collected boolean DEFAULT false;

ALTER TABLE webchat_conversations 
ADD COLUMN IF NOT EXISTS collected_data jsonb DEFAULT '{}'::jsonb;

-- Adicionar índice para buscar conversas por produto (via widget)
CREATE INDEX IF NOT EXISTS idx_webchat_widgets_product_id 
ON webchat_widgets(product_id);

-- Comentários explicativos
COMMENT ON COLUMN webchat_agent_configs.temperature IS 'Criatividade da IA (0.1 = preciso, 1.0 = criativo)';
COMMENT ON COLUMN webchat_agent_configs.max_tokens IS 'Limite de tokens por resposta (100-1000)';
COMMENT ON COLUMN webchat_agent_configs.persona_style IS 'Estilo: friendly, professional, casual';
COMMENT ON COLUMN webchat_agent_configs.use_product_brain IS 'Se true, usa conhecimento do Cérebro do Produto';
COMMENT ON COLUMN webchat_agent_configs.collect_before_chat IS 'Se true, coleta dados antes de iniciar conversa';
COMMENT ON COLUMN webchat_agent_configs.required_fields IS 'Campos obrigatórios: name, whatsapp, email';
COMMENT ON COLUMN webchat_agent_configs.welcome_flow IS 'Fluxo customizado de boas-vindas em JSON';
COMMENT ON COLUMN webchat_agent_configs.handoff_triggers IS 'Palavras que trigam transferência para humano';
COMMENT ON COLUMN webchat_conversations.visitor_whatsapp IS 'WhatsApp coletado do visitante';
COMMENT ON COLUMN webchat_conversations.data_collected IS 'Se os dados foram coletados no onboarding';
COMMENT ON COLUMN webchat_conversations.collected_data IS 'Dados coletados no onboarding (JSON)';