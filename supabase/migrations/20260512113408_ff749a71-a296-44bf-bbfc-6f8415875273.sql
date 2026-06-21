ALTER TABLE public.post_sale_event_actions
ADD COLUMN IF NOT EXISTS agent_outreach_mode TEXT NOT NULL DEFAULT 'direct'
CHECK (agent_outreach_mode IN ('direct','conversational'));