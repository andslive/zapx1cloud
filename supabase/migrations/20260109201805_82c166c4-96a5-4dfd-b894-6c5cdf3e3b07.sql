-- Drop the existing policy that's missing WITH CHECK
DROP POLICY IF EXISTS "Admins and managers can manage assignments" ON public.user_product_assignments;

-- Recreate with proper WITH CHECK clause for INSERT/UPDATE
CREATE POLICY "Admins and managers can manage assignments"
ON public.user_product_assignments
FOR ALL
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role) OR 
  has_role(auth.uid(), 'manager'::app_role)
)
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role) OR 
  has_role(auth.uid(), 'manager'::app_role)
);