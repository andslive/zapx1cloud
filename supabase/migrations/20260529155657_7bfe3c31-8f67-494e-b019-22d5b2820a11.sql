ALTER TABLE public.evolution_instances 
ADD COLUMN IF NOT EXISTS channel TEXT DEFAULT 'whatsapp',
ADD COLUMN IF NOT EXISTS provider TEXT DEFAULT 'uazapi';

COMMENT ON COLUMN public.evolution_instances.channel IS 'Communication channel (whatsapp, instagram, messenger, telegram, email, etc)';
COMMENT ON COLUMN public.evolution_instances.provider IS 'Specific provider for the channel (uazapi, chromium, evolution, etc)';
