-- Adicionar campos para Kanban premium
ALTER TABLE public.leads 
ADD COLUMN IF NOT EXISTS expected_close_date DATE,
ADD COLUMN IF NOT EXISTS deal_value NUMERIC DEFAULT 0;

-- Criar índice para performance
CREATE INDEX IF NOT EXISTS idx_leads_stage_value 
ON public.leads(current_stage_id, deal_value);

CREATE INDEX IF NOT EXISTS idx_leads_product_stage 
ON public.leads(product_id, current_stage_id);