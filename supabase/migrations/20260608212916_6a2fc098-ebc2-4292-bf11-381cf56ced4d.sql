-- 1. Remover tabela conflituosa
DROP TABLE IF EXISTS public.admin_status_alerts CASCADE;

-- 2. Criar a tabela correta para CONFIGURAÇÕES se não existir
CREATE TABLE IF NOT EXISTS public.admin_status_alert_configs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    phone_numbers TEXT[] DEFAULT '{}',
    enabled BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    UNIQUE(organization_id)
);

-- 3. Criar a tabela para LOGS se não existir
CREATE TABLE IF NOT EXISTS public.admin_status_alert_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES public.organizations(id),
    connection_id UUID REFERENCES public.evolution_instances(id),
    connection_name TEXT,
    old_status TEXT,
    new_status TEXT,
    simulation BOOLEAN DEFAULT false,
    sender_instance_id UUID REFERENCES public.evolution_instances(id),
    request_id TEXT,
    status TEXT,
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- 4. Permissões
GRANT SELECT, INSERT, UPDATE, DELETE ON public.admin_status_alert_configs TO authenticated;
GRANT ALL ON public.admin_status_alert_configs TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.admin_status_alert_logs TO authenticated;
GRANT ALL ON public.admin_status_alert_logs TO service_role;

-- 5. RLS
ALTER TABLE public.admin_status_alert_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_status_alert_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own org alert configs" ON public.admin_status_alert_configs
    FOR ALL USING (
        EXISTS ( SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.organization_id = admin_status_alert_configs.organization_id )
    );

CREATE POLICY "Users can view their own org alert logs" ON public.admin_status_alert_logs
    FOR SELECT USING (
        EXISTS ( SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.organization_id = admin_status_alert_logs.organization_id )
    );

-- 6. Trigger updated_at
CREATE OR REPLACE FUNCTION public.update_updated_at_column() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_admin_status_alert_configs_updated_at ON public.admin_status_alert_configs;
CREATE TRIGGER update_admin_status_alert_configs_updated_at 
    BEFORE UPDATE ON public.admin_status_alert_configs 
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
