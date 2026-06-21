-- Remover a tabela antiga para evitar conflitos de colunas (phone/webhook_id)
DROP TABLE IF EXISTS public.webhook_logs CASCADE;

-- Criar a nova tabela com a estrutura solicitada
CREATE TABLE public.webhook_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ DEFAULT now(),
    request_id TEXT,
    event_type TEXT,
    instance_name TEXT,
    owner TEXT,
    phone TEXT,
    chatid TEXT,
    messageid TEXT,
    from_me BOOLEAN,
    message_type TEXT,
    raw_payload JSONB NOT NULL,
    processing_status TEXT DEFAULT 'received', -- received, lead_resolved, lead_created, lead_updated, flow_started, processed, failed
    lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
    conversation_id UUID,
    organization_id UUID,
    error_message TEXT,
    processed_at TIMESTAMPTZ,
    processing_time_ms INTEGER
);

-- Permissões CRÍTICAS para Edge Functions (service_role) e API
GRANT ALL ON public.webhook_logs TO service_role;
GRANT ALL ON public.webhook_logs TO authenticated;
GRANT INSERT ON public.webhook_logs TO anon;

-- Habilitar RLS
ALTER TABLE public.webhook_logs ENABLE ROW LEVEL SECURITY;

-- Políticas de acesso
CREATE POLICY "Enable all for service_role" ON public.webhook_logs FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Enable insert for all" ON public.webhook_logs FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Enable select for authenticated" ON public.webhook_logs FOR SELECT TO authenticated USING (true);

-- Índices para auditoria rápida
CREATE INDEX idx_webhook_logs_created_at ON public.webhook_logs (created_at DESC);
CREATE INDEX idx_webhook_logs_phone ON public.webhook_logs (phone);
CREATE INDEX idx_webhook_logs_messageid ON public.webhook_logs (messageid);
CREATE INDEX idx_webhook_logs_event_type ON public.webhook_logs (event_type);
CREATE INDEX idx_webhook_logs_processing_status ON public.webhook_logs (processing_status);
CREATE INDEX idx_webhook_logs_lead_id ON public.webhook_logs (lead_id);
CREATE INDEX idx_webhook_logs_conversation_id ON public.webhook_logs (conversation_id);