-- Adicionar descrição às etapas do pipeline
ALTER TABLE public.pipeline_stages 
ADD COLUMN IF NOT EXISTS description TEXT;

-- Atualizar descrições padrão para etapas existentes
UPDATE public.pipeline_stages SET description = 'Primeiro contato com o cliente' WHERE name ILIKE '%novo%' OR name ILIKE '%prospecção%';
UPDATE public.pipeline_stages SET description = 'Estabelecendo primeiro contato' WHERE name ILIKE '%primeiro contato%';
UPDATE public.pipeline_stages SET description = 'Avaliando necessidades e fit' WHERE name ILIKE '%qualificação%';
UPDATE public.pipeline_stages SET description = 'Proposta comercial enviada' WHERE name ILIKE '%proposta%';
UPDATE public.pipeline_stages SET description = 'Negociando termos e condições' WHERE name ILIKE '%negociação%';
UPDATE public.pipeline_stages SET description = 'Negócio fechado com sucesso' WHERE name ILIKE '%fechado%' AND is_won = true;
UPDATE public.pipeline_stages SET description = 'Oportunidade perdida' WHERE name ILIKE '%perdido%' OR is_lost = true;