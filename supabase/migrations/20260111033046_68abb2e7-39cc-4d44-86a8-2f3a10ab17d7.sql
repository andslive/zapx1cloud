-- Quick Replies for Sellers
CREATE TABLE public.quick_replies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  category TEXT NOT NULL DEFAULT 'general',
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  shortcut TEXT,
  is_active BOOLEAN DEFAULT true,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.quick_replies ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view quick replies from their organization"
ON public.quick_replies FOR SELECT
USING (
  organization_id IN (
    SELECT organization_id FROM profiles WHERE id = auth.uid()
  )
);

CREATE POLICY "Users can create quick replies for their organization"
ON public.quick_replies FOR INSERT
WITH CHECK (
  organization_id IN (
    SELECT organization_id FROM profiles WHERE id = auth.uid()
  )
);

CREATE POLICY "Users can update quick replies from their organization"
ON public.quick_replies FOR UPDATE
USING (
  organization_id IN (
    SELECT organization_id FROM profiles WHERE id = auth.uid()
  )
);

CREATE POLICY "Users can delete quick replies from their organization"
ON public.quick_replies FOR DELETE
USING (
  organization_id IN (
    SELECT organization_id FROM profiles WHERE id = auth.uid()
  )
);

-- Internal Notes for Conversations
CREATE TABLE public.conversation_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES webchat_conversations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.conversation_notes ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view notes for conversations they have access to"
ON public.conversation_notes FOR SELECT
USING (
  conversation_id IN (
    SELECT wc.id FROM webchat_conversations wc
    JOIN webchat_widgets ww ON wc.widget_id = ww.id
    WHERE ww.organization_id IN (
      SELECT organization_id FROM profiles WHERE id = auth.uid()
    )
  )
);

CREATE POLICY "Users can create notes for conversations they have access to"
ON public.conversation_notes FOR INSERT
WITH CHECK (
  conversation_id IN (
    SELECT wc.id FROM webchat_conversations wc
    JOIN webchat_widgets ww ON wc.widget_id = ww.id
    WHERE ww.organization_id IN (
      SELECT organization_id FROM profiles WHERE id = auth.uid()
    )
  )
  AND user_id = auth.uid()
);

-- Conversation Transfer History
CREATE TABLE public.conversation_transfers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES webchat_conversations(id) ON DELETE CASCADE,
  from_user_id UUID REFERENCES profiles(id),
  to_user_id UUID REFERENCES profiles(id),
  to_queue_id UUID,
  internal_note TEXT,
  created_by UUID NOT NULL REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.conversation_transfers ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view transfers for conversations they have access to"
ON public.conversation_transfers FOR SELECT
USING (
  conversation_id IN (
    SELECT wc.id FROM webchat_conversations wc
    JOIN webchat_widgets ww ON wc.widget_id = ww.id
    WHERE ww.organization_id IN (
      SELECT organization_id FROM profiles WHERE id = auth.uid()
    )
  )
);

CREATE POLICY "Users can create transfers for conversations they have access to"
ON public.conversation_transfers FOR INSERT
WITH CHECK (
  conversation_id IN (
    SELECT wc.id FROM webchat_conversations wc
    JOIN webchat_widgets ww ON wc.widget_id = ww.id
    WHERE ww.organization_id IN (
      SELECT organization_id FROM profiles WHERE id = auth.uid()
    )
  )
  AND created_by = auth.uid()
);

-- Add indexes for performance
CREATE INDEX idx_quick_replies_org ON public.quick_replies(organization_id);
CREATE INDEX idx_quick_replies_category ON public.quick_replies(category);
CREATE INDEX idx_conversation_notes_conv ON public.conversation_notes(conversation_id);
CREATE INDEX idx_conversation_transfers_conv ON public.conversation_transfers(conversation_id);

-- Enable realtime for conversation_notes (for realtime updates)
ALTER PUBLICATION supabase_realtime ADD TABLE public.conversation_notes;