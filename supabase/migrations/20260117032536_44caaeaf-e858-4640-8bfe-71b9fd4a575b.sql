-- Create ai_response_feedback table for training corrections
CREATE TABLE public.ai_response_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID REFERENCES public.webchat_messages(id) ON DELETE CASCADE,
  conversation_id UUID REFERENCES public.webchat_conversations(id) ON DELETE CASCADE,
  original_response TEXT NOT NULL,
  suggested_response TEXT NOT NULL,
  feedback_type TEXT DEFAULT 'correction' CHECK (feedback_type IN ('correction', 'tone', 'accuracy', 'content')),
  created_by UUID REFERENCES public.profiles(id),
  organization_id UUID NOT NULL REFERENCES public.organizations(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  applied_to_training BOOLEAN DEFAULT false,
  applied_at TIMESTAMPTZ
);

-- Enable RLS
ALTER TABLE public.ai_response_feedback ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view feedback from their organization"
ON public.ai_response_feedback FOR SELECT
USING (
  organization_id IN (
    SELECT organization_id FROM public.profiles WHERE id = auth.uid()
  )
);

CREATE POLICY "Users can create feedback for their organization"
ON public.ai_response_feedback FOR INSERT
WITH CHECK (
  organization_id IN (
    SELECT organization_id FROM public.profiles WHERE id = auth.uid()
  )
);

CREATE POLICY "Users can update feedback from their organization"
ON public.ai_response_feedback FOR UPDATE
USING (
  organization_id IN (
    SELECT organization_id FROM public.profiles WHERE id = auth.uid()
  )
);

CREATE POLICY "Users can delete feedback from their organization"
ON public.ai_response_feedback FOR DELETE
USING (
  organization_id IN (
    SELECT organization_id FROM public.profiles WHERE id = auth.uid()
  )
);

-- Create index for faster queries
CREATE INDEX idx_ai_response_feedback_org ON public.ai_response_feedback(organization_id);
CREATE INDEX idx_ai_response_feedback_conversation ON public.ai_response_feedback(conversation_id);
CREATE INDEX idx_ai_response_feedback_applied ON public.ai_response_feedback(applied_to_training);