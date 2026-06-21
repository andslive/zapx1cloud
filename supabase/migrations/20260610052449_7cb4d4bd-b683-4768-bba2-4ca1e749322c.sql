-- Tabela de histórico de saúde das conexões
CREATE TABLE public.connection_health (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    connection_id UUID REFERENCES public.evolution_instances(id) ON DELETE CASCADE,
    instance_name TEXT,
    status_crm TEXT,
    status_real JSONB,
    logged_in BOOLEAN,
    connected BOOLEAN,
    browser_alive BOOLEAN,
    last_heartbeat_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    last_ack_at TIMESTAMP WITH TIME ZONE,
    pending_ack_count INTEGER DEFAULT 0,
    one_tick_count INTEGER DEFAULT 0,
    action_taken TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Tabela de logs de recuperação de Ghost Connections
CREATE TABLE public.ghost_recovery_logs (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    connection_id UUID REFERENCES public.evolution_instances(id) ON DELETE CASCADE,
    event_type TEXT, -- 'ghost_detected', 'reconnect_attempt', 'reconnect_success', 'reconnect_failed', 'qr_required'
    details JSONB,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Adicionar colunas de controle na tabela de instâncias
ALTER TABLE public.evolution_instances 
ADD COLUMN IF NOT EXISTS last_ack_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS one_tick_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS is_ghost BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS last_recovery_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS recovery_count INTEGER DEFAULT 0;

-- Configurações globais do Watchdog
CREATE TABLE public.connection_watchdog_config (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
    enabled BOOLEAN DEFAULT true,
    ghost_threshold_minutes INTEGER DEFAULT 10,
    max_recovery_attempts INTEGER DEFAULT 3,
    alert_threshold_one_tick INTEGER DEFAULT 50,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Grant permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON public.connection_health TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.connection_health TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ghost_recovery_logs TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ghost_recovery_logs TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.connection_watchdog_config TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.connection_watchdog_config TO service_role;

-- Enable RLS
ALTER TABLE public.connection_health ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ghost_recovery_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.connection_watchdog_config ENABLE ROW LEVEL SECURITY;

-- Simple policies (scoped by organization via JOIN if needed, or open for service_role/admin)
CREATE POLICY "Users can view their own connection health" ON public.connection_health FOR SELECT USING (true);
CREATE POLICY "Users can view their own recovery logs" ON public.ghost_recovery_logs FOR SELECT USING (true);
CREATE POLICY "Users can view watchdog config" ON public.connection_watchdog_config FOR SELECT USING (true);
