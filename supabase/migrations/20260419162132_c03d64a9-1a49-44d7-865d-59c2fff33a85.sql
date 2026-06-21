-- 1. Adicionar colunas globais em platform_settings
ALTER TABLE public.platform_settings 
  ADD COLUMN IF NOT EXISTS evolution_go_url TEXT,
  ADD COLUMN IF NOT EXISTS evolution_go_global_api_key TEXT;

-- 2. Adicionar flag de origem em evolution_instances
ALTER TABLE public.evolution_instances 
  ADD COLUMN IF NOT EXISTS created_by_super_admin BOOLEAN NOT NULL DEFAULT false;

-- 3. Restringir INSERT/DELETE em evolution_instances apenas para super_admin
DROP POLICY IF EXISTS "Admins and managers can insert evolution instances" ON public.evolution_instances;
DROP POLICY IF EXISTS "Admins and managers can delete evolution instances" ON public.evolution_instances;

CREATE POLICY "Only super admin can insert evolution instances"
  ON public.evolution_instances 
  FOR INSERT
  WITH CHECK (public.is_super_admin(auth.uid()));

CREATE POLICY "Only super admin can delete evolution instances"
  ON public.evolution_instances 
  FOR DELETE
  USING (public.is_super_admin(auth.uid()));

-- 4. Migrar a configuração que já existia em integration_settings para platform_settings (one-shot)
UPDATE public.platform_settings ps
SET 
  evolution_go_url = COALESCE(ps.evolution_go_url, sub.url),
  evolution_go_global_api_key = COALESCE(ps.evolution_go_global_api_key, sub.api_key)
FROM (
  SELECT 
    settings->>'evolution_go_url' as url,
    settings->>'evolution_go_global_api_key' as api_key
  FROM public.integration_settings
  WHERE integration_type = 'whatsapp_provider'
    AND settings->>'provider' = 'evolution_go'
    AND settings->>'evolution_go_url' IS NOT NULL
  LIMIT 1
) sub
WHERE ps.evolution_go_url IS NULL;