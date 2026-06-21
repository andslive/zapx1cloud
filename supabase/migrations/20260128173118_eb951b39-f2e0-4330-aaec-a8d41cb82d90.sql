-- Adicionar coluna agent_id para materiais específicos por agente
ALTER TABLE agent_training_materials 
ADD COLUMN IF NOT EXISTS agent_id UUID REFERENCES product_agents(id) ON DELETE CASCADE;

-- Índice para performance
CREATE INDEX IF NOT EXISTS idx_training_materials_agent 
ON agent_training_materials(agent_id);

-- Índice composto para buscas de materiais ativos por agente
CREATE INDEX IF NOT EXISTS idx_training_materials_agent_active 
ON agent_training_materials(agent_id, is_active) 
WHERE is_active = true;