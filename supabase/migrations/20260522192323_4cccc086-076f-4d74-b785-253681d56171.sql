-- Add Uazapi fields to platform_settings
ALTER TABLE public.platform_settings 
ADD COLUMN IF NOT EXISTS uazapi_url TEXT,
ADD COLUMN IF NOT EXISTS uazapi_admin_token TEXT,
ADD COLUMN IF NOT EXISTS whatsapp_provider TEXT DEFAULT 'evolution';

-- Add check constraint for whatsapp_provider
ALTER TABLE public.platform_settings 
ADD CONSTRAINT check_whatsapp_provider 
CHECK (whatsapp_provider IN ('evolution', 'uazapi'));

-- Create a generic view or just use the table, but let's make sure we have indexes if needed
CREATE INDEX IF NOT EXISTS idx_platform_settings_whatsapp_provider ON public.platform_settings(whatsapp_provider);
