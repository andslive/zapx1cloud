-- Add connection_id to webchat_conversations
ALTER TABLE public.webchat_conversations 
ADD COLUMN IF NOT EXISTS connection_id uuid;

-- Add connection_id to leads
ALTER TABLE public.leads 
ADD COLUMN IF NOT EXISTS connection_id uuid;

-- Grant permissions (standard requirement for new columns in existing tables accessible via API)
GRANT ALL ON TABLE public.webchat_conversations TO authenticated, service_role;
GRANT ALL ON TABLE public.leads TO authenticated, service_role;

-- Backfill connection_id from evolution_instance_id if it's currently used
UPDATE public.webchat_conversations 
SET connection_id = evolution_instance_id 
WHERE connection_id IS NULL AND evolution_instance_id IS NOT NULL;
