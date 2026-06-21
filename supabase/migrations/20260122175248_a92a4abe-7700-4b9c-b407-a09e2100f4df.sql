-- Fix RLS policy for integration_settings - parameter order was wrong
DROP POLICY IF EXISTS "Admins can manage integration settings" ON public.integration_settings;
DROP POLICY IF EXISTS "Users can view their org integration settings" ON public.integration_settings;

-- Recreate with correct parameter order
CREATE POLICY "Admins can manage integration settings" 
ON public.integration_settings 
FOR ALL 
USING (
  user_belongs_to_organization(auth.uid(), organization_id) 
  AND has_role(auth.uid(), 'admin'::app_role)
)
WITH CHECK (
  user_belongs_to_organization(auth.uid(), organization_id) 
  AND has_role(auth.uid(), 'admin'::app_role)
);

CREATE POLICY "Users can view their org integration settings" 
ON public.integration_settings 
FOR SELECT 
USING (user_belongs_to_organization(auth.uid(), organization_id));