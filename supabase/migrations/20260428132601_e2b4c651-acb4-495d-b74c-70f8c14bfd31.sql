-- Fix: super admin policy missing WITH CHECK clause blocks INSERT/UPDATE
DROP POLICY IF EXISTS "Super admins can manage all organizations" ON public.organizations;

CREATE POLICY "Super admins can manage all organizations"
ON public.organizations
FOR ALL
USING (public.is_super_admin(auth.uid()))
WITH CHECK (public.is_super_admin(auth.uid()));