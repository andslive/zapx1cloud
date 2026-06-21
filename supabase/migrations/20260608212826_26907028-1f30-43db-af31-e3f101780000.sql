-- Garantir que a coluna de ativação existe na organization
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'organizations' AND column_name = 'admin_status_alerts_enabled') THEN
        ALTER TABLE public.organizations ADD COLUMN admin_status_alerts_enabled BOOLEAN DEFAULT true;
    END IF;
END $$;

-- Criar tabela de configuração de alertas se não existir
CREATE TABLE IF NOT EXISTS public.admin_status_alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    phone_numbers TEXT[] DEFAULT '{}',
    enabled BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    UNIQUE(organization_id)
);

-- Permissões
GRANT SELECT, INSERT, UPDATE, DELETE ON public.admin_status_alerts TO authenticated;
GRANT ALL ON public.admin_status_alerts TO service_role;

-- RLS
ALTER TABLE public.admin_status_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own org alerts" ON public.admin_status_alerts
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.id = auth.uid()
            AND profiles.organization_id = admin_status_alerts.organization_id
        )
    );

-- Trigger para updated_at
CREATE OR REPLACE FUNCTION public.update_updated_at_column() RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_admin_status_alerts_updated_at ON public.admin_status_alerts;
CREATE TRIGGER update_admin_status_alerts_updated_at 
    BEFORE UPDATE ON public.admin_status_alerts 
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
