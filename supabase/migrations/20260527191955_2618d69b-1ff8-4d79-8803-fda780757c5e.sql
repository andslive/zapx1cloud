-- Add health monitoring columns to evolution_instances
ALTER TABLE public.evolution_instances 
ADD COLUMN IF NOT EXISTS last_health_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS health_data JSONB DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS is_stable BOOLEAN DEFAULT true;

-- Index for heartbeat performance
CREATE INDEX IF NOT EXISTS idx_instances_last_health ON public.evolution_instances (last_health_at);
CREATE INDEX IF NOT EXISTS idx_instances_is_stable ON public.evolution_instances (is_stable);
