DROP POLICY "Admins can manage email templates" ON public.email_templates;

CREATE POLICY "Admins can manage email templates"
ON public.email_templates
FOR ALL
TO authenticated
USING (user_belongs_to_organization(organization_id, auth.uid()) AND has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (user_belongs_to_organization(organization_id, auth.uid()) AND has_role(auth.uid(), 'admin'::app_role));