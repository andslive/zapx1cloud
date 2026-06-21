ALTER TABLE public.product_agents
  ADD COLUMN IF NOT EXISTS evolution_instance_id uuid 
  REFERENCES public.evolution_instances(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_product_agents_evolution_instance
  ON public.product_agents(evolution_instance_id);