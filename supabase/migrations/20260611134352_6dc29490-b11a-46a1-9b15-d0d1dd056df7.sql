
-- 1. Security Definer View
ALTER VIEW public.webhook_stats SET (security_invoker = true);

-- 2. connection_health
DROP POLICY IF EXISTS "Users can view their own connection health" ON public.connection_health;
CREATE POLICY "Org members can view connection health"
  ON public.connection_health FOR SELECT TO authenticated
  USING (connection_id IN (SELECT id FROM public.evolution_instances WHERE organization_id = public.get_user_organization(auth.uid())));

-- 3. connection_watchdog_config
DROP POLICY IF EXISTS "Users can view watchdog config" ON public.connection_watchdog_config;
CREATE POLICY "Org members can view watchdog config"
  ON public.connection_watchdog_config FOR SELECT TO authenticated
  USING (organization_id = public.get_user_organization(auth.uid()));

-- 4. ghost_recovery_logs
DROP POLICY IF EXISTS "Users can view their own recovery logs" ON public.ghost_recovery_logs;
CREATE POLICY "Org members can view recovery logs"
  ON public.ghost_recovery_logs FOR SELECT TO authenticated
  USING (connection_id IN (SELECT id FROM public.evolution_instances WHERE organization_id = public.get_user_organization(auth.uid())));

-- 5. lead_funnel_history
DROP POLICY IF EXISTS "Enable select for authenticated" ON public.lead_funnel_history;
CREATE POLICY "Org members can view lead funnel history"
  ON public.lead_funnel_history FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.leads l WHERE l.id = lead_funnel_history.lead_id AND l.organization_id = public.get_user_organization(auth.uid())));

-- 6. lead_tracking
DROP POLICY IF EXISTS "Permitir select para anon" ON public.lead_tracking;
DROP POLICY IF EXISTS "Permitir insert para anon" ON public.lead_tracking;
DROP POLICY IF EXISTS "Permitir tudo para authenticated" ON public.lead_tracking;
CREATE POLICY "Org members manage lead tracking"
  ON public.lead_tracking FOR ALL TO authenticated
  USING (organization_id = public.get_user_organization(auth.uid()))
  WITH CHECK (organization_id = public.get_user_organization(auth.uid()));

-- 7. email_templates
DROP POLICY IF EXISTS "Users can view their org email templates" ON public.email_templates;
CREATE POLICY "Users can view their org email templates"
  ON public.email_templates FOR SELECT TO authenticated
  USING (public.user_belongs_to_organization(auth.uid(), organization_id));

-- 8. mass_email_campaigns
DROP POLICY IF EXISTS "Admins can manage campaigns" ON public.mass_email_campaigns;
DROP POLICY IF EXISTS "Users can view their org campaigns" ON public.mass_email_campaigns;
CREATE POLICY "Users can view their org campaigns"
  ON public.mass_email_campaigns FOR SELECT TO authenticated
  USING (public.user_belongs_to_organization(auth.uid(), organization_id));
CREATE POLICY "Admins can manage campaigns"
  ON public.mass_email_campaigns FOR ALL TO authenticated
  USING (public.user_belongs_to_organization(auth.uid(), organization_id)
    AND (public.has_role(auth.uid(),'admin'::app_role) OR public.has_role(auth.uid(),'manager'::app_role)))
  WITH CHECK (public.user_belongs_to_organization(auth.uid(), organization_id)
    AND (public.has_role(auth.uid(),'admin'::app_role) OR public.has_role(auth.uid(),'manager'::app_role)));

-- 9. mass_email_recipients
DROP POLICY IF EXISTS "Admins can manage recipients" ON public.mass_email_recipients;
DROP POLICY IF EXISTS "Users can view their org recipients" ON public.mass_email_recipients;
CREATE POLICY "Users can view their org recipients"
  ON public.mass_email_recipients FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.mass_email_campaigns c WHERE c.id = mass_email_recipients.campaign_id AND public.user_belongs_to_organization(auth.uid(), c.organization_id)));
CREATE POLICY "Admins can manage recipients"
  ON public.mass_email_recipients FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.mass_email_campaigns c WHERE c.id = mass_email_recipients.campaign_id AND public.user_belongs_to_organization(auth.uid(), c.organization_id) AND (public.has_role(auth.uid(),'admin'::app_role) OR public.has_role(auth.uid(),'manager'::app_role))))
  WITH CHECK (EXISTS (SELECT 1 FROM public.mass_email_campaigns c WHERE c.id = mass_email_recipients.campaign_id AND public.user_belongs_to_organization(auth.uid(), c.organization_id) AND (public.has_role(auth.uid(),'admin'::app_role) OR public.has_role(auth.uid(),'manager'::app_role))));

-- 10. funnel-assets storage: drop legacy unscoped policies
DROP POLICY IF EXISTS "Authenticated users can upload funnel assets" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update funnel assets" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete funnel assets" ON storage.objects;

-- 11. purchase_audit (connection_id is text)
DROP POLICY IF EXISTS "Enable all for authenticated users" ON public.purchase_audit;
CREATE POLICY "Org members can view purchase audit"
  ON public.purchase_audit FOR SELECT TO authenticated
  USING (
    (connection_id IS NOT NULL AND connection_id::uuid IN (SELECT id FROM public.evolution_instances WHERE organization_id = public.get_user_organization(auth.uid())))
    OR (lead_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.leads l WHERE l.id = purchase_audit.lead_id AND l.organization_id = public.get_user_organization(auth.uid())))
  );

-- 12. webhook_health (connection_id is text)
DROP POLICY IF EXISTS "Anyone can insert webhook health logs" ON public.webhook_health;
DROP POLICY IF EXISTS "Authenticated users can view webhook health logs" ON public.webhook_health;
CREATE POLICY "Service role manages webhook health"
  ON public.webhook_health FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Org members can view webhook health"
  ON public.webhook_health FOR SELECT TO authenticated
  USING (connection_id IS NOT NULL AND connection_id::uuid IN (SELECT id FROM public.evolution_instances WHERE organization_id = public.get_user_organization(auth.uid())));

-- 13. webhook_logs
DROP POLICY IF EXISTS "Enable select for authenticated" ON public.webhook_logs;
CREATE POLICY "Org members can view webhook logs"
  ON public.webhook_logs FOR SELECT TO authenticated
  USING (organization_id IS NOT NULL AND organization_id = public.get_user_organization(auth.uid()));
