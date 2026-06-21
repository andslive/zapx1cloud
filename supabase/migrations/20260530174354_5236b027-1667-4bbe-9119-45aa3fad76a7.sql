-- Add new columns to evolution_instances
ALTER TABLE public.evolution_instances 
ADD COLUMN IF NOT EXISTS push_name TEXT,
ADD COLUMN IF NOT EXISTS profile_picture_url TEXT,
ADD COLUMN IF NOT EXISTS custom_name TEXT;

-- Update existing records to have a default custom_name if needed
UPDATE public.evolution_instances SET custom_name = name WHERE custom_name IS NULL;
