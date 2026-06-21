ALTER TABLE public.evolution_instances ADD COLUMN IF NOT EXISTS offer_name TEXT;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.evolution_instances TO authenticated;
GRANT ALL ON public.evolution_instances TO service_role;