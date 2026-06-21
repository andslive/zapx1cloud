CREATE TABLE public.webhook_health (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    phone TEXT,
    connection_id TEXT,
    message_id TEXT,
    message_type TEXT,
    webhook_received BOOLEAN DEFAULT TRUE,
    processed BOOLEAN DEFAULT FALSE,
    flow_started BOOLEAN DEFAULT FALSE,
    pixel_sent BOOLEAN DEFAULT FALSE,
    error TEXT,
    raw_payload JSONB
);

-- Grants
GRANT SELECT, INSERT, UPDATE ON public.webhook_health TO anon;
GRANT SELECT, INSERT, UPDATE ON public.webhook_health TO authenticated;
GRANT ALL ON public.webhook_health TO service_role;

-- RLS
ALTER TABLE public.webhook_health ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can insert webhook health logs" ON public.webhook_health
    FOR INSERT WITH CHECK (true);

CREATE POLICY "Authenticated users can view webhook health logs" ON public.webhook_health
    FOR SELECT USING (auth.role() = 'authenticated');

-- Indexes
CREATE INDEX idx_webhook_health_created_at ON public.webhook_health(created_at);
CREATE INDEX idx_webhook_health_message_id ON public.webhook_health(message_id);
CREATE INDEX idx_webhook_health_phone ON public.webhook_health(phone);
CREATE INDEX idx_webhook_health_connection_id ON public.webhook_health(connection_id);

-- View for Dashboard Stats
CREATE OR REPLACE VIEW public.webhook_stats AS
SELECT
    COUNT(*) AS total_received,
    COUNT(*) FILTER (WHERE processed = TRUE) AS total_processed,
    COUNT(*) FILTER (WHERE processed = FALSE) AS total_lost,
    COUNT(*) FILTER (WHERE flow_started = TRUE) AS total_flow_started,
    COUNT(*) FILTER (WHERE pixel_sent = TRUE) AS total_pixel_sent,
    CASE 
        WHEN COUNT(*) > 0 THEN (COUNT(*) FILTER (WHERE processed = TRUE)::FLOAT / COUNT(*)::FLOAT) * 100 
        ELSE 100 
    END AS success_rate,
    MAX(created_at) FILTER (WHERE processed = FALSE OR error IS NOT NULL) AS last_failure_at
FROM public.webhook_health
WHERE created_at >= CURRENT_DATE;

GRANT SELECT ON public.webhook_stats TO authenticated;
GRANT SELECT ON public.webhook_stats TO service_role;
