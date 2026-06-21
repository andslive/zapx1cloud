ALTER TABLE public.evolution_instances ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;
UPDATE public.evolution_instances SET is_active = false WHERE name IN ('chip221', 'chip32');
UPDATE public.evolution_instances SET is_active = true WHERE name IN ('canal21', 'canal32');