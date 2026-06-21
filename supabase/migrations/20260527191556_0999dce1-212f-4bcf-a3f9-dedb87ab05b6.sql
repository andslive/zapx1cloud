-- Table for tracking messages that need ACK confirmation
CREATE TABLE IF NOT EXISTS public.whatsapp_message_retries (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    instance_id UUID NOT NULL,
    message_id TEXT NOT NULL,
    remote_jid TEXT NOT NULL,
    content TEXT,
    retry_count INTEGER DEFAULT 0,
    last_status TEXT DEFAULT 'sent',
    next_retry_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Table for instance health metrics and logs
CREATE TABLE IF NOT EXISTS public.instance_health_logs (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    instance_id UUID NOT NULL,
    event_type TEXT NOT NULL, -- 'ack_1', 'ack_2', 'reconnect', 'ping', 'error'
    message_id TEXT,
    details JSONB,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON public.whatsapp_message_retries TO authenticated;
GRANT ALL ON public.whatsapp_message_retries TO service_role;

GRANT SELECT, INSERT ON public.instance_health_logs TO authenticated;
GRANT ALL ON public.instance_health_logs TO service_role;

-- Enable RLS
ALTER TABLE public.whatsapp_message_retries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.instance_health_logs ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Users can view their own organization's retries" 
ON public.whatsapp_message_retries 
FOR SELECT 
USING (auth.uid() IN (SELECT id FROM public.profiles WHERE organization_id = public.whatsapp_message_retries.organization_id));

CREATE POLICY "Users can view their own organization's health logs" 
ON public.instance_health_logs 
FOR SELECT 
USING (auth.uid() IN (SELECT id FROM public.profiles WHERE organization_id = public.instance_health_logs.organization_id));

-- Indexes
CREATE INDEX IF NOT EXISTS idx_whatsapp_message_retries_next_retry ON public.whatsapp_message_retries (next_retry_at);
CREATE INDEX IF NOT EXISTS idx_whatsapp_message_retries_msg_id ON public.whatsapp_message_retries (message_id);
CREATE INDEX IF NOT EXISTS idx_instance_health_logs_instance_id ON public.instance_health_logs (instance_id);
CREATE INDEX IF NOT EXISTS idx_instance_health_logs_timestamp ON public.instance_health_logs (timestamp DESC);
