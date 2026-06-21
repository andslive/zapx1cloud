-- Adicionar coluna product_id para isolar materiais por produto
ALTER TABLE agent_training_materials 
ADD COLUMN IF NOT EXISTS product_id UUID REFERENCES products(id);

-- Criar índice para performance
CREATE INDEX IF NOT EXISTS idx_training_materials_product 
ON agent_training_materials(product_id);

-- Criar índice composto para buscas comuns
CREATE INDEX IF NOT EXISTS idx_training_materials_product_active 
ON agent_training_materials(product_id, is_active) 
WHERE is_active = true;