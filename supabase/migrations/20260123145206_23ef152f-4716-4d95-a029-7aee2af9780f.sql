-- Create DELETE policy for leads - only admin/manager can delete leads in their org
CREATE POLICY "Admins and managers can delete leads in their org"
ON public.leads
FOR DELETE
USING (
  organization_id = get_user_organization(auth.uid())
  AND (
    has_role(auth.uid(), 'admin'::app_role) 
    OR has_role(auth.uid(), 'manager'::app_role)
  )
);