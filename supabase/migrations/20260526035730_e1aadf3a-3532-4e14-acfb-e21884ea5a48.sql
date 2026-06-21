UPDATE platform_settings SET whatsapp_provider = 'uazapi' WHERE whatsapp_provider IS NULL OR whatsapp_provider = 'evolution';

-- Ensure we have the uazapi fields if they don't exist (though they seem to exist in code)
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'platform_settings' AND column_name = 'uazapi_url') THEN
        ALTER TABLE platform_settings ADD COLUMN uazapi_url TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'platform_settings' AND column_name = 'uazapi_admin_token') THEN
        ALTER TABLE platform_settings ADD COLUMN uazapi_admin_token TEXT;
    END IF;
END $$;
