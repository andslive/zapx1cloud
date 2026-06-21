CREATE TABLE public.pixel_event_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES public.webchat_conversations(id),
    lead_id UUID REFERENCES public.leads(id),
    block_id TEXT NOT NULL,
    event_name TEXT NOT NULL,
    pixel_id TEXT NOT NULL,
    payload JSONB,
    response JSONB,
    success BOOLEAN,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pixel_event_logs TO authenticated;
GRANT ALL ON public.pixel_event_logs TO service_role;

ALTER TABLE public.pixel_event_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all for authenticated" ON public.pixel_event_logs FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE UNIQUE INDEX idx_pixel_event_idempotency ON public.pixel_event_logs (conversation_id, block_id, event_name);