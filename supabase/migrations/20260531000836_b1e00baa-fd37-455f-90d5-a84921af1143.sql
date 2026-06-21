-- Update INSERT policy for capture_funnels
DROP POLICY IF EXISTS "Admins can insert funnels" ON public.capture_funnels;
CREATE POLICY "Admins and managers can insert funnels"
ON public.capture_funnels
FOR INSERT
WITH CHECK (
  ((organization_id = get_user_organization(auth.uid())) AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role)))
  OR is_super_admin(auth.uid())
);

-- Update UPDATE policy for capture_funnels
DROP POLICY IF EXISTS "Admins can update funnels" ON public.capture_funnels;
CREATE POLICY "Admins and managers can update funnels"
ON public.capture_funnels
FOR UPDATE
USING (
  ((organization_id = get_user_organization(auth.uid())) AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role)))
  OR is_super_admin(auth.uid())
);

-- Update DELETE policy for capture_funnels
DROP POLICY IF EXISTS "Admins can delete funnels" ON public.capture_funnels;
CREATE POLICY "Admins and managers can delete funnels"
ON public.capture_funnels
FOR DELETE
USING (
  ((organization_id = get_user_organization(auth.uid())) AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role)))
  OR is_super_admin(auth.uid())
);
