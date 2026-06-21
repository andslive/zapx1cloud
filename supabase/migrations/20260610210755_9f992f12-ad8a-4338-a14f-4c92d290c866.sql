CREATE TABLE IF NOT EXISTS public.funnel_execution_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL,
    conversation_id UUID NOT NULL REFERENCES public.webchat_conversations(id) ON DELETE CASCADE,
    lead_id UUID NOT NULL,
    connection_id UUID NOT NULL,
    flow_id UUID NOT NULL REFERENCES public.capture_funnels(id) ON DELETE CASCADE,
    start_block_id TEXT,
    trigger_type TEXT DEFAULT 'manual_funnel_start',
    created_by UUID,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed', 'cancelled')),
    attempts INTEGER DEFAULT 0,
    last_error TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    started_at TIMESTAMP WITH TIME ZONE,
    finished_at TIMESTAMP WITH TIME ZONE,
    metadata JSONB DEFAULT '{}'::jsonb
);

-- Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON public.funnel_execution_jobs TO authenticated;
GRANT ALL ON public.funnel_execution_jobs TO service_role;

-- RLS
ALTER TABLE public.funnel_execution_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view jobs from their organization" 
ON public.funnel_execution_jobs FOR SELECT 
USING (organization_id IN (SELECT organization_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Users can insert jobs for their organization" 
ON public.funnel_execution_jobs FOR INSERT 
WITH CHECK (organization_id IN (SELECT organization_id FROM public.profiles WHERE id = auth.uid()));

-- Index para performance do runner e prevenção de duplicidade
CREATE INDEX IF NOT EXISTS idx_funnel_jobs_pending ON public.funnel_execution_jobs (status) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_funnel_jobs_active_conv ON public.funnel_execution_jobs (conversation_id, flow_id) WHERE status IN ('pending', 'running');

-- Trigger para updated_at se necessário futuramente
