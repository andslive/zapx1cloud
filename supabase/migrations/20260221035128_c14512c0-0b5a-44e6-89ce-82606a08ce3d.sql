
-- Create ai_outreach_queue table for managing AI agent outreach and follow-ups
CREATE TABLE public.ai_outreach_queue (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  conversation_id UUID REFERENCES public.webchat_conversations(id) ON DELETE SET NULL,
  product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  agent_id UUID REFERENCES public.product_agents(id) ON DELETE SET NULL,
  webhook_id UUID REFERENCES public.webhooks(id) ON DELETE SET NULL,
  objective TEXT,
  extra_context TEXT,
  lead_data JSONB DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'replied', 'completed', 'failed')),
  followup_enabled BOOLEAN NOT NULL DEFAULT false,
  followup_interval_hours INTEGER DEFAULT 24,
  max_followups INTEGER DEFAULT 3,
  followups_sent INTEGER NOT NULL DEFAULT 0,
  last_outreach_at TIMESTAMPTZ,
  next_followup_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_ai_outreach_queue_org ON public.ai_outreach_queue(organization_id);
CREATE INDEX idx_ai_outreach_queue_lead ON public.ai_outreach_queue(lead_id);
CREATE INDEX idx_ai_outreach_queue_status ON public.ai_outreach_queue(status);
CREATE INDEX idx_ai_outreach_queue_followup ON public.ai_outreach_queue(next_followup_at) 
  WHERE status = 'sent' AND followup_enabled = true;

-- Enable RLS
ALTER TABLE public.ai_outreach_queue ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view outreach in their org"
ON public.ai_outreach_queue FOR SELECT
USING (organization_id IN (
  SELECT organization_id FROM public.profiles WHERE id = auth.uid()
));

CREATE POLICY "Users can insert outreach in their org"
ON public.ai_outreach_queue FOR INSERT
WITH CHECK (organization_id IN (
  SELECT organization_id FROM public.profiles WHERE id = auth.uid()
));

CREATE POLICY "Users can update outreach in their org"
ON public.ai_outreach_queue FOR UPDATE
USING (organization_id IN (
  SELECT organization_id FROM public.profiles WHERE id = auth.uid()
));

CREATE POLICY "Service role full access to outreach"
ON public.ai_outreach_queue FOR ALL
USING (true)
WITH CHECK (true);
