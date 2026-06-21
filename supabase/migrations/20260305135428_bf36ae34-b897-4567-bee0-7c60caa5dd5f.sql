
DROP POLICY IF EXISTS "Admins can manage email templates" ON public.email_templates;

CREATE POLICY "Admins can manage email templates"
ON public.email_templates
FOR ALL
TO authenticated
USING (public.user_belongs_to_organization(auth.uid(), organization_id) AND public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (public.user_belongs_to_organization(auth.uid(), organization_id) AND public.has_role(auth.uid(), 'admin'::app_role));
