ALTER TABLE public.evolution_instances 
ADD COLUMN IF NOT EXISTS last_real_whatsapp_ping TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS last_real_whatsapp_state TEXT;

-- Grant access
GRANT ALL ON public.evolution_instances TO service_role;
GRANT SELECT, UPDATE ON public.evolution_instances TO authenticated;