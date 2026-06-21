
ALTER TABLE public.webchat_messages 
  ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS edited_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS original_content TEXT,
  ADD COLUMN IF NOT EXISTS reply_to_message_id UUID REFERENCES public.webchat_messages(id),
  ADD COLUMN IF NOT EXISTS is_starred BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS forwarded_from_message_id UUID REFERENCES public.webchat_messages(id);
