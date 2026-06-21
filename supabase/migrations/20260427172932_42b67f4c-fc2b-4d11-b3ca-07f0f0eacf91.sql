ALTER TABLE public.leads REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.leads;
ALTER TABLE public.webchat_conversations REPLICA IDENTITY FULL;