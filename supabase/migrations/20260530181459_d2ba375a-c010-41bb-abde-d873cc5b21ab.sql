
-- 1. CONNECTIONS: restrict to super_admin only (platform-level infra; UI uses external VPS API)
DROP POLICY IF EXISTS "Users can view connections" ON public.connections;
DROP POLICY IF EXISTS "Users can create connections" ON public.connections;
DROP POLICY IF EXISTS "Users can update connections" ON public.connections;
DROP POLICY IF EXISTS "Users can delete connections" ON public.connections;

CREATE POLICY "Super admins manage connections"
ON public.connections
FOR ALL
TO authenticated
USING (public.is_super_admin(auth.uid()))
WITH CHECK (public.is_super_admin(auth.uid()));

-- 2. PLATFORM_SETTINGS: remove broad SELECT; super_admin policy already exists; branding hook uses platform_branding_public view
DROP POLICY IF EXISTS "All authenticated users can view platform settings" ON public.platform_settings;

-- 3. FUNNEL_ANALYTICS: drop anon UPDATE; replace permissive anon INSERT with a scoped one
DROP POLICY IF EXISTS "Anon can update analytics" ON public.funnel_analytics;
DROP POLICY IF EXISTS "Anon can insert analytics" ON public.funnel_analytics;

CREATE POLICY "Anon can insert analytics for existing funnels"
ON public.funnel_analytics
FOR INSERT
TO anon
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.capture_funnels cf
    WHERE cf.id = funnel_analytics.funnel_id
  )
);
