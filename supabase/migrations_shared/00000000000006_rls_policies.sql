-- ============================================================
-- 06_rls_policies.sql
-- ============================================================

-- ENABLE RLS on tables
ALTER TABLE public.admin_agent_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_action_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_activation_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_handoff_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_post_sale_scenarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_routing_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_safety_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_specialists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_tool_executions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_training_materials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_audits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_insights ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_knowledge_base ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_outreach_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_prompt_experiments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_prompt_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_quality_evaluations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_response_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_router_failures ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.auto_notification_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.availability_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.booking_event_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.booking_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_holidays ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_hours ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cadence_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cakto_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cakto_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cakto_recovery_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cakto_recovery_dispatches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.calendar_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.capture_funnels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_sync_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_flows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commission_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_transfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.custom_fields ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.distribution_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_send_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_send_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_unsubscribe_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evolution_instances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.facebook_lead_integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.facebook_lead_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.form_blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.form_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.form_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.forms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.funnel_analytics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.funnel_webhook_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.google_calendar_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.help_article_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.help_articles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.help_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hotmart_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hotmart_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hotmart_product_mapping ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.integration_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.interactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_semantic_memory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_stage_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_tag_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_transfer_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mass_email_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mass_email_recipients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.materials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.message_reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.objections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orchestration_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.org_ai_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.org_ai_routing ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_orchestrator_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pipeline_stages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_email_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_email_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_release_reads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_releases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.post_sale_event_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.post_sale_event_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_catalog_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_ctas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_knowledge_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_offers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_onboarding_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_suites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_training_videos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quick_replies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_squads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sankhya_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sankhya_sync_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scheduled_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sector_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sectors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.squad_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stage_values ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.suppressed_emails ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tag_automations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_availability ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_badges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_notification_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_product_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_status ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webchat_agent_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webchat_assignment_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webchat_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webchat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webchat_widgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhook_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhook_sample_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhooks ENABLE ROW LEVEL SECURITY;

-- POLICIES
CREATE POLICY "Admins can view their org admin agent messages" ON public.admin_agent_messages AS PERMISSIVE FOR SELECT TO authenticated
  USING ((user_belongs_to_organization(auth.uid(), organization_id) AND (has_role(auth.uid(), 'admin'::app_role) OR is_super_admin(auth.uid()))));
CREATE POLICY "Service role can insert admin agent messages" ON public.admin_agent_messages AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((user_belongs_to_organization(auth.uid(), organization_id) AND has_role(auth.uid(), 'admin'::app_role)));
CREATE POLICY "Admins and managers can create admin notifications" ON public.admin_notifications AS PERMISSIVE FOR INSERT TO public
  WITH CHECK ((user_belongs_to_organization(auth.uid(), organization_id) AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role))));
CREATE POLICY "Admins and managers can update admin notifications" ON public.admin_notifications AS PERMISSIVE FOR UPDATE TO public
  USING ((user_belongs_to_organization(auth.uid(), organization_id) AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role))));
CREATE POLICY "Admins and managers can view admin notifications" ON public.admin_notifications AS PERMISSIVE FOR SELECT TO public
  USING ((user_belongs_to_organization(auth.uid(), organization_id) AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role))));
CREATE POLICY "Service role can insert action logs" ON public.agent_action_logs AS PERMISSIVE FOR INSERT TO service_role
  WITH CHECK (true);
CREATE POLICY "Users can view action logs from their organization" ON public.agent_action_logs AS PERMISSIVE FOR SELECT TO public
  USING ((organization_id IN ( SELECT profiles.organization_id
   FROM profiles
  WHERE (profiles.id = auth.uid()))));
CREATE POLICY "Org admins/managers can view activation logs" ON public.agent_activation_logs AS PERMISSIVE FOR SELECT TO authenticated
  USING ((user_belongs_to_organization(auth.uid(), organization_id) AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role) OR is_super_admin(auth.uid()))));
CREATE POLICY "Service role inserts activation logs" ON public.agent_activation_logs AS PERMISSIVE FOR INSERT TO service_role
  WITH CHECK (true);
CREATE POLICY "Org members can read handoff history" ON public.agent_handoff_history AS PERMISSIVE FOR SELECT TO authenticated
  USING (user_belongs_to_organization(auth.uid(), organization_id));
CREATE POLICY "Service role full access on handoff history" ON public.agent_handoff_history AS PERMISSIVE FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);
CREATE POLICY "Admins/managers can delete scenarios" ON public.agent_post_sale_scenarios AS PERMISSIVE FOR DELETE TO public
  USING ((user_belongs_to_organization(auth.uid(), organization_id) AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role))));
CREATE POLICY "Admins/managers can insert scenarios" ON public.agent_post_sale_scenarios AS PERMISSIVE FOR INSERT TO public
  WITH CHECK ((user_belongs_to_organization(auth.uid(), organization_id) AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role))));
CREATE POLICY "Admins/managers can update scenarios" ON public.agent_post_sale_scenarios AS PERMISSIVE FOR UPDATE TO public
  USING ((user_belongs_to_organization(auth.uid(), organization_id) AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role))));
CREATE POLICY "Admins/managers can view scenarios" ON public.agent_post_sale_scenarios AS PERMISSIVE FOR SELECT TO public
  USING ((user_belongs_to_organization(auth.uid(), organization_id) AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role))));
CREATE POLICY "Org members can manage routing rules" ON public.agent_routing_rules AS PERMISSIVE FOR ALL TO authenticated
  USING (user_belongs_to_organization(auth.uid(), organization_id))
  WITH CHECK (user_belongs_to_organization(auth.uid(), organization_id));
CREATE POLICY "Service role full access on routing rules" ON public.agent_routing_rules AS PERMISSIVE FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);
CREATE POLICY "Org admin manages safety limits" ON public.agent_safety_limits AS PERMISSIVE FOR ALL TO authenticated
  USING ((user_belongs_to_organization(auth.uid(), organization_id) AND (has_role(auth.uid(), 'admin'::app_role) OR is_super_admin(auth.uid()))))
  WITH CHECK ((user_belongs_to_organization(auth.uid(), organization_id) AND (has_role(auth.uid(), 'admin'::app_role) OR is_super_admin(auth.uid()))));
CREATE POLICY "Org members read safety limits" ON public.agent_safety_limits AS PERMISSIVE FOR SELECT TO authenticated
  USING ((user_belongs_to_organization(auth.uid(), organization_id) OR is_super_admin(auth.uid())));
CREATE POLICY "Org members can manage specialists" ON public.agent_specialists AS PERMISSIVE FOR ALL TO authenticated
  USING (user_belongs_to_organization(auth.uid(), organization_id))
  WITH CHECK (user_belongs_to_organization(auth.uid(), organization_id));
CREATE POLICY "Service role full access on specialists" ON public.agent_specialists AS PERMISSIVE FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);
CREATE POLICY "Org members read tool executions" ON public.agent_tool_executions AS PERMISSIVE FOR SELECT TO authenticated
  USING ((user_belongs_to_organization(auth.uid(), organization_id) OR is_super_admin(auth.uid())));
CREATE POLICY "Service role inserts tool executions" ON public.agent_tool_executions AS PERMISSIVE FOR INSERT TO service_role
  WITH CHECK (true);
CREATE POLICY "Super admin reads all tool executions" ON public.agent_tool_executions AS PERMISSIVE FOR SELECT TO authenticated
  USING (is_super_admin(auth.uid()));
CREATE POLICY "Admins/Managers can manage training materials" ON public.agent_training_materials AS PERMISSIVE FOR ALL TO public
  USING (((organization_id IN ( SELECT profiles.organization_id
   FROM profiles
  WHERE (profiles.id = auth.uid()))) AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role))));
CREATE POLICY "Users can view training materials in their org" ON public.agent_training_materials AS PERMISSIVE FOR SELECT TO public
  USING ((organization_id IN ( SELECT profiles.organization_id
   FROM profiles
  WHERE (profiles.id = auth.uid()))));
CREATE POLICY "Authenticated users can insert audits" ON public.ai_audits AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (((EXISTS ( SELECT 1
   FROM interactions i
  WHERE ((i.id = ai_audits.interaction_id) AND (i.user_id = auth.uid())))) OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role)));
CREATE POLICY "Users can view audits of their interactions" ON public.ai_audits AS PERMISSIVE FOR SELECT TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM (interactions i
     JOIN leads l ON ((l.id = i.lead_id)))
  WHERE ((i.id = ai_audits.interaction_id) AND (l.organization_id = get_user_organization(auth.uid()))))));
CREATE POLICY "Authenticated users can insert insights" ON public.ai_insights AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (((user_id = auth.uid()) OR (organization_id = get_user_organization(auth.uid()))));
CREATE POLICY "Users can view their insights" ON public.ai_insights AS PERMISSIVE FOR SELECT TO authenticated
  USING (((user_id = auth.uid()) OR (organization_id = get_user_organization(auth.uid()))));
CREATE POLICY "Admins and managers can manage knowledge base" ON public.ai_knowledge_base AS PERMISSIVE FOR ALL TO public
  USING (((organization_id = get_user_organization(auth.uid())) AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role))));
CREATE POLICY "Users can view knowledge base of their org products" ON public.ai_knowledge_base AS PERMISSIVE FOR SELECT TO public
  USING ((EXISTS ( SELECT 1
   FROM products p
  WHERE ((p.id = ai_knowledge_base.product_id) AND (p.organization_id = get_user_organization(auth.uid()))))));
CREATE POLICY "Users can insert outreach in their org" ON public.ai_outreach_queue AS PERMISSIVE FOR INSERT TO public
  WITH CHECK ((organization_id IN ( SELECT profiles.organization_id
   FROM profiles
  WHERE (profiles.id = auth.uid()))));
CREATE POLICY "Users can update outreach in their org" ON public.ai_outreach_queue AS PERMISSIVE FOR UPDATE TO public
  USING ((organization_id IN ( SELECT profiles.organization_id
   FROM profiles
  WHERE (profiles.id = auth.uid()))));
CREATE POLICY "Users can view outreach in their org" ON public.ai_outreach_queue AS PERMISSIVE FOR SELECT TO public
  USING ((organization_id IN ( SELECT profiles.organization_id
   FROM profiles
  WHERE (profiles.id = auth.uid()))));
CREATE POLICY "Org members can manage experiments" ON public.ai_prompt_experiments AS PERMISSIVE FOR ALL TO authenticated
  USING (user_belongs_to_organization(auth.uid(), organization_id))
  WITH CHECK (user_belongs_to_organization(auth.uid(), organization_id));
CREATE POLICY "Service role full access on experiments" ON public.ai_prompt_experiments AS PERMISSIVE FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);
CREATE POLICY "Org members can manage variants" ON public.ai_prompt_variants AS PERMISSIVE FOR ALL TO authenticated
  USING (user_belongs_to_organization(auth.uid(), organization_id))
  WITH CHECK (user_belongs_to_organization(auth.uid(), organization_id));
CREATE POLICY "Service role full access on variants" ON public.ai_prompt_variants AS PERMISSIVE FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);
CREATE POLICY "Org members can read evaluations" ON public.ai_quality_evaluations AS PERMISSIVE FOR SELECT TO authenticated
  USING (user_belongs_to_organization(auth.uid(), organization_id));
CREATE POLICY "Service role full access on evaluations" ON public.ai_quality_evaluations AS PERMISSIVE FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);
CREATE POLICY "Users can create feedback for their organization" ON public.ai_response_feedback AS PERMISSIVE FOR INSERT TO public
  WITH CHECK ((organization_id IN ( SELECT profiles.organization_id
   FROM profiles
  WHERE (profiles.id = auth.uid()))));
CREATE POLICY "Users can delete feedback from their organization" ON public.ai_response_feedback AS PERMISSIVE FOR DELETE TO public
  USING ((organization_id IN ( SELECT profiles.organization_id
   FROM profiles
  WHERE (profiles.id = auth.uid()))));
CREATE POLICY "Users can update feedback from their organization" ON public.ai_response_feedback AS PERMISSIVE FOR UPDATE TO public
  USING ((organization_id IN ( SELECT profiles.organization_id
   FROM profiles
  WHERE (profiles.id = auth.uid()))));
CREATE POLICY "Users can view feedback from their organization" ON public.ai_response_feedback AS PERMISSIVE FOR SELECT TO public
  USING ((organization_id IN ( SELECT profiles.organization_id
   FROM profiles
  WHERE (profiles.id = auth.uid()))));
CREATE POLICY "Org admins can view router failures" ON public.ai_router_failures AS PERMISSIVE FOR SELECT TO authenticated
  USING (((organization_id = get_user_organization(auth.uid())) AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role))));
CREATE POLICY "Admins can manage auto notification settings" ON public.auto_notification_settings AS PERMISSIVE FOR ALL TO public
  USING (((organization_id = get_user_organization(auth.uid())) AND has_role(auth.uid(), 'admin'::app_role)));
CREATE POLICY "Users can view their org auto notification settings" ON public.auto_notification_settings AS PERMISSIVE FOR SELECT TO public
  USING ((organization_id = get_user_organization(auth.uid())));
CREATE POLICY "Org members can view availability overrides" ON public.availability_overrides AS PERMISSIVE FOR SELECT TO authenticated
  USING (user_belongs_to_organization(auth.uid(), organization_id));
CREATE POLICY "Users can manage own overrides" ON public.availability_overrides AS PERMISSIVE FOR ALL TO authenticated
  USING ((user_id = auth.uid()))
  WITH CHECK ((user_id = auth.uid()));
CREATE POLICY "Org admins can view own billing history" ON public.billing_history AS PERMISSIVE FOR SELECT TO public
  USING ((organization_id = get_user_organization(auth.uid())));
CREATE POLICY "Super admins can manage all billing history" ON public.billing_history AS PERMISSIVE FOR ALL TO public
  USING (is_super_admin(auth.uid()));
CREATE POLICY "Anyone can view active event types" ON public.booking_event_types AS PERMISSIVE FOR SELECT TO public
  USING ((is_active = true));
CREATE POLICY "Org members can view all event types" ON public.booking_event_types AS PERMISSIVE FOR SELECT TO authenticated
  USING (user_belongs_to_organization(auth.uid(), organization_id));
CREATE POLICY "Users can manage own event types" ON public.booking_event_types AS PERMISSIVE FOR ALL TO authenticated
  USING ((user_id = auth.uid()))
  WITH CHECK ((user_id = auth.uid()));
CREATE POLICY "Anyone can create booking requests" ON public.booking_requests AS PERMISSIVE FOR INSERT TO public
  WITH CHECK (true);
CREATE POLICY "Hosts can view and manage their bookings" ON public.booking_requests AS PERMISSIVE FOR ALL TO authenticated
  USING ((host_user_id = auth.uid()));
CREATE POLICY "Public can cancel or reschedule by token" ON public.booking_requests AS PERMISSIVE FOR UPDATE TO anon, authenticated
  USING (((confirmation_token IS NOT NULL) AND (confirmation_token <> ''::text)))
  WITH CHECK (((confirmation_token IS NOT NULL) AND (confirmation_token <> ''::text)));
CREATE POLICY "Admins gerenciam feriados" ON public.business_holidays AS PERMISSIVE FOR ALL TO public
  USING ((is_super_admin(auth.uid()) OR (user_belongs_to_organization(auth.uid(), organization_id) AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role)))))
  WITH CHECK ((is_super_admin(auth.uid()) OR (user_belongs_to_organization(auth.uid(), organization_id) AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role)))));
CREATE POLICY "Feriados visiveis por organizacao" ON public.business_holidays AS PERMISSIVE FOR SELECT TO public
  USING ((is_super_admin(auth.uid()) OR user_belongs_to_organization(auth.uid(), organization_id)));
CREATE POLICY "Admins gerenciam horarios" ON public.business_hours AS PERMISSIVE FOR ALL TO public
  USING ((is_super_admin(auth.uid()) OR (user_belongs_to_organization(auth.uid(), organization_id) AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role)))))
  WITH CHECK ((is_super_admin(auth.uid()) OR (user_belongs_to_organization(auth.uid(), organization_id) AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role)))));
CREATE POLICY "Horarios visiveis por organizacao" ON public.business_hours AS PERMISSIVE FOR SELECT TO public
  USING ((is_super_admin(auth.uid()) OR user_belongs_to_organization(auth.uid(), organization_id)));
CREATE POLICY "Admins and managers can manage cadence templates" ON public.cadence_templates AS PERMISSIVE FOR ALL TO authenticated
  USING (((EXISTS ( SELECT 1
   FROM products p
  WHERE ((p.id = cadence_templates.product_id) AND (p.organization_id = get_user_organization(auth.uid()))))) AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role))));
CREATE POLICY "Users can view cadence templates" ON public.cadence_templates AS PERMISSIVE FOR SELECT TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM products p
  WHERE ((p.id = cadence_templates.product_id) AND (p.organization_id = get_user_organization(auth.uid()))))));
CREATE POLICY "Org admins manage their cakto credentials" ON public.cakto_credentials AS PERMISSIVE FOR ALL TO public
  USING (((scope = 'organization'::text) AND (organization_id = get_user_organization(auth.uid())) AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role))))
  WITH CHECK (((scope = 'organization'::text) AND (organization_id = get_user_organization(auth.uid())) AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role))));
CREATE POLICY "Org admins view their cakto credentials" ON public.cakto_credentials AS PERMISSIVE FOR SELECT TO public
  USING (((scope = 'organization'::text) AND (organization_id = get_user_organization(auth.uid())) AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role) OR is_super_admin(auth.uid()))));
CREATE POLICY "Super admins manage platform cakto credentials" ON public.cakto_credentials AS PERMISSIVE FOR ALL TO public
  USING (((scope = 'platform'::text) AND is_super_admin(auth.uid())))
  WITH CHECK (((scope = 'platform'::text) AND is_super_admin(auth.uid())));
CREATE POLICY "Org admins manage their cakto orders" ON public.cakto_orders AS PERMISSIVE FOR ALL TO public
  USING (((scope = 'organization'::text) AND (organization_id = get_user_organization(auth.uid())) AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role))))
  WITH CHECK (((scope = 'organization'::text) AND (organization_id = get_user_organization(auth.uid())) AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role))));
CREATE POLICY "Org members view their cakto orders" ON public.cakto_orders AS PERMISSIVE FOR SELECT TO public
  USING (((scope = 'organization'::text) AND (organization_id = get_user_organization(auth.uid())) AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role) OR is_super_admin(auth.uid()))));
CREATE POLICY "Super admins manage platform cakto orders" ON public.cakto_orders AS PERMISSIVE FOR ALL TO public
  USING (((scope = 'platform'::text) AND is_super_admin(auth.uid())))
  WITH CHECK (((scope = 'platform'::text) AND is_super_admin(auth.uid())));
CREATE POLICY "Super admins view platform cakto orders" ON public.cakto_orders AS PERMISSIVE FOR SELECT TO public
  USING (((scope = 'platform'::text) AND is_super_admin(auth.uid())));
CREATE POLICY "Admin org pode editar config recuperação" ON public.cakto_recovery_config AS PERMISSIVE FOR ALL TO authenticated
  USING ((user_belongs_to_organization(auth.uid(), organization_id) AND (has_role(auth.uid(), 'admin'::app_role) OR is_super_admin(auth.uid()))))
  WITH CHECK ((user_belongs_to_organization(auth.uid(), organization_id) AND (has_role(auth.uid(), 'admin'::app_role) OR is_super_admin(auth.uid()))));
CREATE POLICY "Admin org pode ver config recuperação" ON public.cakto_recovery_config AS PERMISSIVE FOR SELECT TO authenticated
  USING ((user_belongs_to_organization(auth.uid(), organization_id) AND (has_role(auth.uid(), 'admin'::app_role) OR is_super_admin(auth.uid()))));
CREATE POLICY "Admin org pode ver histórico recuperação" ON public.cakto_recovery_dispatches AS PERMISSIVE FOR SELECT TO authenticated
  USING ((user_belongs_to_organization(auth.uid(), organization_id) AND (has_role(auth.uid(), 'admin'::app_role) OR is_super_admin(auth.uid()))));
CREATE POLICY "Service role insere disparos" ON public.cakto_recovery_dispatches AS PERMISSIVE FOR INSERT TO service_role
  WITH CHECK (true);
CREATE POLICY "Admins can delete all org events" ON public.calendar_events AS PERMISSIVE FOR DELETE TO public
  USING (((organization_id = get_user_organization(auth.uid())) AND has_role(auth.uid(), 'admin'::app_role)));
CREATE POLICY "Admins can update all org events" ON public.calendar_events AS PERMISSIVE FOR UPDATE TO public
  USING (((organization_id = get_user_organization(auth.uid())) AND has_role(auth.uid(), 'admin'::app_role)));
CREATE POLICY "Admins can view all org events" ON public.calendar_events AS PERMISSIVE FOR SELECT TO public
  USING (((organization_id = get_user_organization(auth.uid())) AND has_role(auth.uid(), 'admin'::app_role)));
CREATE POLICY "Managers can view all org events" ON public.calendar_events AS PERMISSIVE FOR SELECT TO public
  USING (((organization_id = get_user_organization(auth.uid())) AND has_role(auth.uid(), 'manager'::app_role)));
CREATE POLICY "Users can create own events" ON public.calendar_events AS PERMISSIVE FOR INSERT TO public
  WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "Users can delete own events" ON public.calendar_events AS PERMISSIVE FOR DELETE TO public
  USING ((auth.uid() = user_id));
CREATE POLICY "Users can update own events" ON public.calendar_events AS PERMISSIVE FOR UPDATE TO public
  USING ((auth.uid() = user_id));
CREATE POLICY "Users can view own events" ON public.calendar_events AS PERMISSIVE FOR SELECT TO public
  USING ((auth.uid() = user_id));
CREATE POLICY "Admins can delete funnels" ON public.capture_funnels AS PERMISSIVE FOR DELETE TO authenticated
  USING ((((organization_id = get_user_organization(auth.uid())) AND has_role(auth.uid(), 'admin'::app_role)) OR is_super_admin(auth.uid())));
CREATE POLICY "Admins can insert funnels" ON public.capture_funnels AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((((organization_id = get_user_organization(auth.uid())) AND has_role(auth.uid(), 'admin'::app_role)) OR is_super_admin(auth.uid())));
CREATE POLICY "Admins can update funnels" ON public.capture_funnels AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((((organization_id = get_user_organization(auth.uid())) AND has_role(auth.uid(), 'admin'::app_role)) OR is_super_admin(auth.uid())));
CREATE POLICY "Public can view active funnels by slug" ON public.capture_funnels AS PERMISSIVE FOR SELECT TO anon
  USING ((status = 'active'::text));
CREATE POLICY "Users can view funnels of their organization" ON public.capture_funnels AS PERMISSIVE FOR SELECT TO authenticated
  USING (((organization_id = get_user_organization(auth.uid())) OR is_super_admin(auth.uid())));
CREATE POLICY "Admins can manage sync logs" ON public.catalog_sync_logs AS PERMISSIVE FOR ALL TO public
  USING (((user_belongs_to_organization(auth.uid(), organization_id) AND has_role(auth.uid(), 'admin'::app_role)) OR is_super_admin(auth.uid())))
  WITH CHECK (((user_belongs_to_organization(auth.uid(), organization_id) AND has_role(auth.uid(), 'admin'::app_role)) OR is_super_admin(auth.uid())));
CREATE POLICY "Members can view sync logs" ON public.catalog_sync_logs AS PERMISSIVE FOR SELECT TO public
  USING ((user_belongs_to_organization(auth.uid(), organization_id) OR is_super_admin(auth.uid())));
CREATE POLICY "Admins can manage flows" ON public.chat_flows AS PERMISSIVE FOR ALL TO public
  USING (((organization_id IN ( SELECT profiles.organization_id
   FROM profiles
  WHERE (profiles.id = auth.uid()))) AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role))));
CREATE POLICY "Users can view flows from their organization" ON public.chat_flows AS PERMISSIVE FOR SELECT TO public
  USING ((organization_id IN ( SELECT profiles.organization_id
   FROM profiles
  WHERE (profiles.id = auth.uid()))));
CREATE POLICY "Admins and managers can manage commission rules" ON public.commission_rules AS PERMISSIVE FOR ALL TO public
  USING (((organization_id = get_user_organization(auth.uid())) AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role))));
CREATE POLICY "Users can view commission rules of their org" ON public.commission_rules AS PERMISSIVE FOR SELECT TO public
  USING ((organization_id = get_user_organization(auth.uid())));
CREATE POLICY "Admins and managers can update commissions" ON public.commissions AS PERMISSIVE FOR UPDATE TO public
  USING (((organization_id = get_user_organization(auth.uid())) AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role))));
CREATE POLICY "System can insert commissions" ON public.commissions AS PERMISSIVE FOR INSERT TO public
  WITH CHECK ((organization_id = get_user_organization(auth.uid())));
CREATE POLICY "Users can view their commissions" ON public.commissions AS PERMISSIVE FOR SELECT TO public
  USING (((organization_id = get_user_organization(auth.uid())) AND ((user_id = auth.uid()) OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role))));
CREATE POLICY "Users can create notes for conversations they have access to" ON public.conversation_notes AS PERMISSIVE FOR INSERT TO public
  WITH CHECK (((conversation_id IN ( SELECT wc.id
   FROM (webchat_conversations wc
     JOIN webchat_widgets ww ON ((wc.widget_id = ww.id)))
  WHERE (ww.organization_id IN ( SELECT profiles.organization_id
           FROM profiles
          WHERE (profiles.id = auth.uid()))))) AND (user_id = auth.uid())));
CREATE POLICY "Users can view notes for conversations they have access to" ON public.conversation_notes AS PERMISSIVE FOR SELECT TO public
  USING ((conversation_id IN ( SELECT wc.id
   FROM (webchat_conversations wc
     JOIN webchat_widgets ww ON ((wc.widget_id = ww.id)))
  WHERE (ww.organization_id IN ( SELECT profiles.organization_id
           FROM profiles
          WHERE (profiles.id = auth.uid()))))));
CREATE POLICY "Users can create transfers for conversations they have access t" ON public.conversation_transfers AS PERMISSIVE FOR INSERT TO public
  WITH CHECK (((conversation_id IN ( SELECT wc.id
   FROM (webchat_conversations wc
     JOIN webchat_widgets ww ON ((wc.widget_id = ww.id)))
  WHERE (ww.organization_id IN ( SELECT profiles.organization_id
           FROM profiles
          WHERE (profiles.id = auth.uid()))))) AND (created_by = auth.uid())));
CREATE POLICY "Users can view transfers for conversations they have access to" ON public.conversation_transfers AS PERMISSIVE FOR SELECT TO public
  USING ((conversation_id IN ( SELECT wc.id
   FROM (webchat_conversations wc
     JOIN webchat_widgets ww ON ((wc.widget_id = ww.id)))
  WHERE (ww.organization_id IN ( SELECT profiles.organization_id
           FROM profiles
          WHERE (profiles.id = auth.uid()))))));
CREATE POLICY "Admins/managers can delete custom fields" ON public.custom_fields AS PERMISSIVE FOR DELETE TO public
  USING (((organization_id = get_user_organization(auth.uid())) AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role))));
CREATE POLICY "Admins/managers can insert custom fields" ON public.custom_fields AS PERMISSIVE FOR INSERT TO public
  WITH CHECK (((organization_id = get_user_organization(auth.uid())) AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role))));
CREATE POLICY "Admins/managers can update custom fields" ON public.custom_fields AS PERMISSIVE FOR UPDATE TO public
  USING (((organization_id = get_user_organization(auth.uid())) AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role))));
CREATE POLICY "Users can view custom fields of their org" ON public.custom_fields AS PERMISSIVE FOR SELECT TO public
  USING ((organization_id = get_user_organization(auth.uid())));
CREATE POLICY "Admins and managers can update deals" ON public.deals AS PERMISSIVE FOR UPDATE TO public
  USING (((organization_id = get_user_organization(auth.uid())) AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role))));
CREATE POLICY "Users can insert deals" ON public.deals AS PERMISSIVE FOR INSERT TO public
  WITH CHECK ((organization_id = get_user_organization(auth.uid())));
CREATE POLICY "Users can view deals in their org" ON public.deals AS PERMISSIVE FOR SELECT TO public
  USING (((organization_id = get_user_organization(auth.uid())) AND ((seller_id = auth.uid()) OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role))));
CREATE POLICY "Admins can manage distribution config" ON public.distribution_config AS PERMISSIVE FOR ALL TO authenticated
  USING ((user_belongs_to_organization(auth.uid(), organization_id) AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role))));
CREATE POLICY "Users can view distribution config in org" ON public.distribution_config AS PERMISSIVE FOR SELECT TO authenticated
  USING (user_belongs_to_organization(auth.uid(), organization_id));
CREATE POLICY "Service role can insert send log" ON public.email_send_log AS PERMISSIVE FOR INSERT TO public
  WITH CHECK ((auth.role() = 'service_role'::text));
CREATE POLICY "Service role can read send log" ON public.email_send_log AS PERMISSIVE FOR SELECT TO public
  USING ((auth.role() = 'service_role'::text));
CREATE POLICY "Service role can update send log" ON public.email_send_log AS PERMISSIVE FOR UPDATE TO public
  USING ((auth.role() = 'service_role'::text))
  WITH CHECK ((auth.role() = 'service_role'::text));
CREATE POLICY "Service role can manage send state" ON public.email_send_state AS PERMISSIVE FOR ALL TO public
  USING ((auth.role() = 'service_role'::text))
  WITH CHECK ((auth.role() = 'service_role'::text));
CREATE POLICY "Admins can manage email templates" ON public.email_templates AS PERMISSIVE FOR ALL TO authenticated
  USING ((user_belongs_to_organization(auth.uid(), organization_id) AND has_role(auth.uid(), 'admin'::app_role)))
  WITH CHECK ((user_belongs_to_organization(auth.uid(), organization_id) AND has_role(auth.uid(), 'admin'::app_role)));
CREATE POLICY "Users can view their org email templates" ON public.email_templates AS PERMISSIVE FOR SELECT TO public
  USING (user_belongs_to_organization(organization_id, auth.uid()));
CREATE POLICY "Service role can insert tokens" ON public.email_unsubscribe_tokens AS PERMISSIVE FOR INSERT TO public
  WITH CHECK ((auth.role() = 'service_role'::text));
CREATE POLICY "Service role can mark tokens as used" ON public.email_unsubscribe_tokens AS PERMISSIVE FOR UPDATE TO public
  USING ((auth.role() = 'service_role'::text))
  WITH CHECK ((auth.role() = 'service_role'::text));
CREATE POLICY "Service role can read tokens" ON public.email_unsubscribe_tokens AS PERMISSIVE FOR SELECT TO public
  USING ((auth.role() = 'service_role'::text));
CREATE POLICY "Admins and managers can update evolution instances" ON public.evolution_instances AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((is_super_admin(auth.uid()) OR (user_belongs_to_organization(auth.uid(), organization_id) AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role)))));
CREATE POLICY "Admins and managers can view evolution instances" ON public.evolution_instances AS PERMISSIVE FOR SELECT TO authenticated
  USING ((is_super_admin(auth.uid()) OR (user_belongs_to_organization(auth.uid(), organization_id) AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role)))));
CREATE POLICY "Only super admin can delete evolution instances" ON public.evolution_instances AS PERMISSIVE FOR DELETE TO public
  USING (is_super_admin(auth.uid()));
CREATE POLICY "Only super admin can insert evolution instances" ON public.evolution_instances AS PERMISSIVE FOR INSERT TO public
  WITH CHECK (is_super_admin(auth.uid()));
CREATE POLICY "Admins can delete integrations" ON public.facebook_lead_integrations AS PERMISSIVE FOR DELETE TO public
  USING (((organization_id = get_user_organization(auth.uid())) AND (has_role(auth.uid(), 'admin'::app_role) OR is_super_admin(auth.uid()))));
CREATE POLICY "Admins can insert integrations" ON public.facebook_lead_integrations AS PERMISSIVE FOR INSERT TO public
  WITH CHECK (((organization_id = get_user_organization(auth.uid())) AND (has_role(auth.uid(), 'admin'::app_role) OR is_super_admin(auth.uid()))));
CREATE POLICY "Admins can update integrations" ON public.facebook_lead_integrations AS PERMISSIVE FOR UPDATE TO public
  USING (((organization_id = get_user_organization(auth.uid())) AND (has_role(auth.uid(), 'admin'::app_role) OR is_super_admin(auth.uid()))));
CREATE POLICY "Admins/managers view org integrations" ON public.facebook_lead_integrations AS PERMISSIVE FOR SELECT TO public
  USING (((organization_id = get_user_organization(auth.uid())) AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role) OR is_super_admin(auth.uid()))));
CREATE POLICY "Users can view their org logs" ON public.facebook_lead_logs AS PERMISSIVE FOR SELECT TO public
  USING ((EXISTS ( SELECT 1
   FROM facebook_lead_integrations fi
  WHERE ((fi.id = facebook_lead_logs.integration_id) AND ((fi.organization_id = get_user_organization(auth.uid())) OR is_super_admin(auth.uid()))))));
CREATE POLICY "Anyone can view blocks of active forms" ON public.form_blocks AS PERMISSIVE FOR SELECT TO public
  USING ((form_id IN ( SELECT forms.id
   FROM forms
  WHERE (forms.status = 'active'::text))));
CREATE POLICY "Users can delete blocks in their org forms" ON public.form_blocks AS PERMISSIVE FOR DELETE TO public
  USING ((form_id IN ( SELECT f.id
   FROM (forms f
     JOIN profiles p ON ((p.organization_id = f.organization_id)))
  WHERE (p.id = auth.uid()))));
CREATE POLICY "Users can insert blocks in their org forms" ON public.form_blocks AS PERMISSIVE FOR INSERT TO public
  WITH CHECK ((form_id IN ( SELECT f.id
   FROM (forms f
     JOIN profiles p ON ((p.organization_id = f.organization_id)))
  WHERE (p.id = auth.uid()))));
CREATE POLICY "Users can update blocks in their org forms" ON public.form_blocks AS PERMISSIVE FOR UPDATE TO public
  USING ((form_id IN ( SELECT f.id
   FROM (forms f
     JOIN profiles p ON ((p.organization_id = f.organization_id)))
  WHERE (p.id = auth.uid()))));
CREATE POLICY "Users can view blocks from their org forms" ON public.form_blocks AS PERMISSIVE FOR SELECT TO public
  USING ((form_id IN ( SELECT f.id
   FROM (forms f
     JOIN profiles p ON ((p.organization_id = f.organization_id)))
  WHERE (p.id = auth.uid()))));
CREATE POLICY "Anyone can submit to active forms" ON public.form_submissions AS PERMISSIVE FOR INSERT TO public
  WITH CHECK ((form_id IN ( SELECT forms.id
   FROM forms
  WHERE (forms.status = 'active'::text))));
CREATE POLICY "Users can view submissions from their org" ON public.form_submissions AS PERMISSIVE FOR SELECT TO public
  USING ((form_id IN ( SELECT f.id
   FROM (forms f
     JOIN profiles p ON ((p.organization_id = f.organization_id)))
  WHERE (p.id = auth.uid()))));
CREATE POLICY "Users can delete templates in their org" ON public.form_templates AS PERMISSIVE FOR DELETE TO public
  USING ((organization_id IN ( SELECT profiles.organization_id
   FROM profiles
  WHERE (profiles.id = auth.uid()))));
CREATE POLICY "Users can insert templates in their org" ON public.form_templates AS PERMISSIVE FOR INSERT TO public
  WITH CHECK ((organization_id IN ( SELECT profiles.organization_id
   FROM profiles
  WHERE (profiles.id = auth.uid()))));
CREATE POLICY "Users can update templates in their org" ON public.form_templates AS PERMISSIVE FOR UPDATE TO public
  USING ((organization_id IN ( SELECT profiles.organization_id
   FROM profiles
  WHERE (profiles.id = auth.uid()))));
CREATE POLICY "Users can view public and org templates" ON public.form_templates AS PERMISSIVE FOR SELECT TO public
  USING (((is_public = true) OR (is_system = true) OR (organization_id IN ( SELECT profiles.organization_id
   FROM profiles
  WHERE (profiles.id = auth.uid())))));
CREATE POLICY "Anyone can view active forms by slug" ON public.forms AS PERMISSIVE FOR SELECT TO public
  USING ((status = 'active'::text));
CREATE POLICY "Users can delete forms in their organization" ON public.forms AS PERMISSIVE FOR DELETE TO public
  USING ((organization_id IN ( SELECT profiles.organization_id
   FROM profiles
  WHERE (profiles.id = auth.uid()))));
CREATE POLICY "Users can insert forms in their organization" ON public.forms AS PERMISSIVE FOR INSERT TO public
  WITH CHECK ((organization_id IN ( SELECT profiles.organization_id
   FROM profiles
  WHERE (profiles.id = auth.uid()))));
CREATE POLICY "Users can update forms in their organization" ON public.forms AS PERMISSIVE FOR UPDATE TO public
  USING ((organization_id IN ( SELECT profiles.organization_id
   FROM profiles
  WHERE (profiles.id = auth.uid()))));
CREATE POLICY "Users can view forms from their organization" ON public.forms AS PERMISSIVE FOR SELECT TO public
  USING ((organization_id IN ( SELECT profiles.organization_id
   FROM profiles
  WHERE (profiles.id = auth.uid()))));
CREATE POLICY "Anon can insert analytics" ON public.funnel_analytics AS PERMISSIVE FOR INSERT TO anon
  WITH CHECK (true);
CREATE POLICY "Anon can update analytics" ON public.funnel_analytics AS PERMISSIVE FOR UPDATE TO anon
  USING (true);
CREATE POLICY "System can manage analytics" ON public.funnel_analytics AS PERMISSIVE FOR ALL TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM capture_funnels cf
  WHERE ((cf.id = funnel_analytics.funnel_id) AND ((cf.organization_id = get_user_organization(auth.uid())) OR is_super_admin(auth.uid()))))));
CREATE POLICY "Users can view analytics of their funnels" ON public.funnel_analytics AS PERMISSIVE FOR SELECT TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM capture_funnels cf
  WHERE ((cf.id = funnel_analytics.funnel_id) AND ((cf.organization_id = get_user_organization(auth.uid())) OR is_super_admin(auth.uid()))))));
CREATE POLICY "Org admins can view webhook logs" ON public.funnel_webhook_logs AS PERMISSIVE FOR SELECT TO public
  USING ((is_super_admin(auth.uid()) OR user_belongs_to_organization(auth.uid(), organization_id)));
CREATE POLICY "Service role can insert webhook logs" ON public.funnel_webhook_logs AS PERMISSIVE FOR INSERT TO public
  WITH CHECK (true);
CREATE POLICY "Users can manage own connection" ON public.google_calendar_connections AS PERMISSIVE FOR ALL TO public
  USING ((auth.uid() = user_id));
CREATE POLICY "Users create their own feedback" ON public.help_article_feedback AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((user_id = auth.uid()));
CREATE POLICY "Users delete their own feedback" ON public.help_article_feedback AS PERMISSIVE FOR DELETE TO authenticated
  USING ((user_id = auth.uid()));
CREATE POLICY "Users update their own feedback" ON public.help_article_feedback AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((user_id = auth.uid()));
CREATE POLICY "Users view all feedback" ON public.help_article_feedback AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);
CREATE POLICY "Anyone authenticated can view published help articles" ON public.help_articles AS PERMISSIVE FOR SELECT TO authenticated
  USING (((is_published = true) OR is_super_admin(auth.uid())));
CREATE POLICY "Super admin manages help articles" ON public.help_articles AS PERMISSIVE FOR ALL TO authenticated
  USING (is_super_admin(auth.uid()))
  WITH CHECK (is_super_admin(auth.uid()));
CREATE POLICY "Anyone authenticated can view active help categories" ON public.help_categories AS PERMISSIVE FOR SELECT TO authenticated
  USING (((is_active = true) OR is_super_admin(auth.uid())));
CREATE POLICY "Super admin manages help categories" ON public.help_categories AS PERMISSIVE FOR ALL TO authenticated
  USING (is_super_admin(auth.uid()))
  WITH CHECK (is_super_admin(auth.uid()));
CREATE POLICY "Admins manage hotmart credentials of their org" ON public.hotmart_credentials AS PERMISSIVE FOR ALL TO authenticated
  USING (((organization_id = get_user_organization(auth.uid())) AND has_role(auth.uid(), 'admin'::app_role)))
  WITH CHECK (((organization_id = get_user_organization(auth.uid())) AND has_role(auth.uid(), 'admin'::app_role)));
CREATE POLICY "Super admins manage all hotmart credentials" ON public.hotmart_credentials AS PERMISSIVE FOR ALL TO authenticated
  USING (is_super_admin(auth.uid()))
  WITH CHECK (is_super_admin(auth.uid()));
CREATE POLICY "Admins manage hotmart orders" ON public.hotmart_orders AS PERMISSIVE FOR ALL TO authenticated
  USING (((organization_id = get_user_organization(auth.uid())) AND has_role(auth.uid(), 'admin'::app_role)))
  WITH CHECK (((organization_id = get_user_organization(auth.uid())) AND has_role(auth.uid(), 'admin'::app_role)));
CREATE POLICY "Org members view hotmart orders" ON public.hotmart_orders AS PERMISSIVE FOR SELECT TO authenticated
  USING ((organization_id = get_user_organization(auth.uid())));
CREATE POLICY "Super admins manage all hotmart orders" ON public.hotmart_orders AS PERMISSIVE FOR ALL TO authenticated
  USING (is_super_admin(auth.uid()))
  WITH CHECK (is_super_admin(auth.uid()));
CREATE POLICY "Admins manage hotmart product mapping" ON public.hotmart_product_mapping AS PERMISSIVE FOR ALL TO authenticated
  USING (((organization_id = get_user_organization(auth.uid())) AND has_role(auth.uid(), 'admin'::app_role)))
  WITH CHECK (((organization_id = get_user_organization(auth.uid())) AND has_role(auth.uid(), 'admin'::app_role)));
CREATE POLICY "Org members view hotmart product mapping" ON public.hotmart_product_mapping AS PERMISSIVE FOR SELECT TO authenticated
  USING ((organization_id = get_user_organization(auth.uid())));
CREATE POLICY "Super admins manage all hotmart product mapping" ON public.hotmart_product_mapping AS PERMISSIVE FOR ALL TO authenticated
  USING (is_super_admin(auth.uid()))
  WITH CHECK (is_super_admin(auth.uid()));
CREATE POLICY "Admins can manage integration settings" ON public.integration_settings AS PERMISSIVE FOR ALL TO public
  USING ((user_belongs_to_organization(auth.uid(), organization_id) AND has_role(auth.uid(), 'admin'::app_role)))
  WITH CHECK ((user_belongs_to_organization(auth.uid(), organization_id) AND has_role(auth.uid(), 'admin'::app_role)));
CREATE POLICY "Users can view their org integration settings" ON public.integration_settings AS PERMISSIVE FOR SELECT TO public
  USING (user_belongs_to_organization(auth.uid(), organization_id));
CREATE POLICY "Users can insert interactions" ON public.interactions AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((user_id = auth.uid()));
CREATE POLICY "Users can view interactions" ON public.interactions AS PERMISSIVE FOR SELECT TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM leads l
  WHERE ((l.id = interactions.lead_id) AND (l.organization_id = get_user_organization(auth.uid())) AND ((l.assigned_to = auth.uid()) OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role))))));
CREATE POLICY "Users can insert notes" ON public.lead_notes AS PERMISSIVE FOR INSERT TO public
  WITH CHECK ((author_id = auth.uid()));
CREATE POLICY "Users can view notes from same org" ON public.lead_notes AS PERMISSIVE FOR SELECT TO public
  USING ((EXISTS ( SELECT 1
   FROM (leads l
     JOIN profiles p ON ((p.organization_id = l.organization_id)))
  WHERE ((l.id = lead_notes.lead_id) AND (p.id = auth.uid())))));
CREATE POLICY "Admins can view all queue in org" ON public.lead_queue AS PERMISSIVE FOR SELECT TO authenticated
  USING ((user_belongs_to_organization(auth.uid(), organization_id) AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role) OR (squad_id IN ( SELECT squad_members.squad_id
   FROM squad_members
  WHERE (squad_members.user_id = auth.uid()))))));
CREATE POLICY "Service role can manage queue" ON public.lead_queue AS PERMISSIVE FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Squad members can view their squad queue" ON public.lead_queue AS PERMISSIVE FOR SELECT TO public
  USING ((squad_id IN ( SELECT squad_members.squad_id
   FROM squad_members
  WHERE (squad_members.user_id = auth.uid()))));
CREATE POLICY "Org members can insert lead memory" ON public.lead_semantic_memory AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (user_belongs_to_organization(auth.uid(), organization_id));
CREATE POLICY "Org members can read own lead memory" ON public.lead_semantic_memory AS PERMISSIVE FOR SELECT TO authenticated
  USING (user_belongs_to_organization(auth.uid(), organization_id));
CREATE POLICY "Service role full access on lead memory" ON public.lead_semantic_memory AS PERMISSIVE FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);
CREATE POLICY "Users can insert lead history" ON public.lead_stage_history AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((EXISTS ( SELECT 1
   FROM leads l
  WHERE ((l.id = lead_stage_history.lead_id) AND (l.organization_id = get_user_organization(auth.uid())) AND ((l.assigned_to = auth.uid()) OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role) OR ((l.squad_id IS NOT NULL) AND (l.squad_id IN ( SELECT squad_members.squad_id
           FROM squad_members
          WHERE (squad_members.user_id = auth.uid())))))))));
CREATE POLICY "Users can view lead history" ON public.lead_stage_history AS PERMISSIVE FOR SELECT TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM leads l
  WHERE ((l.id = lead_stage_history.lead_id) AND (l.organization_id = get_user_organization(auth.uid())) AND ((l.assigned_to = auth.uid()) OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role))))));
CREATE POLICY "Atribuicoes visiveis por organizacao" ON public.lead_tag_assignments AS PERMISSIVE FOR SELECT TO public
  USING ((is_super_admin(auth.uid()) OR (EXISTS ( SELECT 1
   FROM leads l
  WHERE ((l.id = lead_tag_assignments.lead_id) AND user_belongs_to_organization(auth.uid(), l.organization_id))))));
CREATE POLICY "Membros da organizacao podem atribuir tags" ON public.lead_tag_assignments AS PERMISSIVE FOR ALL TO public
  USING ((is_super_admin(auth.uid()) OR (EXISTS ( SELECT 1
   FROM leads l
  WHERE ((l.id = lead_tag_assignments.lead_id) AND user_belongs_to_organization(auth.uid(), l.organization_id))))))
  WITH CHECK ((is_super_admin(auth.uid()) OR (EXISTS ( SELECT 1
   FROM leads l
  WHERE ((l.id = lead_tag_assignments.lead_id) AND user_belongs_to_organization(auth.uid(), l.organization_id))))));
CREATE POLICY "Admins gerenciam tags" ON public.lead_tags AS PERMISSIVE FOR ALL TO public
  USING ((is_super_admin(auth.uid()) OR (user_belongs_to_organization(auth.uid(), organization_id) AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role)))))
  WITH CHECK ((is_super_admin(auth.uid()) OR (user_belongs_to_organization(auth.uid(), organization_id) AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role)))));
CREATE POLICY "Tags visiveis para a organizacao" ON public.lead_tags AS PERMISSIVE FOR SELECT TO public
  USING ((is_super_admin(auth.uid()) OR user_belongs_to_organization(auth.uid(), organization_id)));
CREATE POLICY "Users can create transfer history" ON public.lead_transfer_history AS PERMISSIVE FOR INSERT TO public
  WITH CHECK ((EXISTS ( SELECT 1
   FROM (leads l
     JOIN profiles p ON ((p.organization_id = l.organization_id)))
  WHERE ((l.id = lead_transfer_history.lead_id) AND (p.id = auth.uid())))));
CREATE POLICY "Users can view transfer history for leads in their org" ON public.lead_transfer_history AS PERMISSIVE FOR SELECT TO public
  USING ((EXISTS ( SELECT 1
   FROM (leads l
     JOIN profiles p ON ((p.organization_id = l.organization_id)))
  WHERE ((l.id = lead_transfer_history.lead_id) AND (p.id = auth.uid())))));
CREATE POLICY "Admins and managers can delete leads in their org" ON public.leads AS PERMISSIVE FOR DELETE TO public
  USING (((organization_id = get_user_organization(auth.uid())) AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role))));
CREATE POLICY "Squad members can view squad leads" ON public.leads AS PERMISSIVE FOR SELECT TO authenticated
  USING (((organization_id = get_user_organization(auth.uid())) AND (squad_id IN ( SELECT squad_members.squad_id
   FROM squad_members
  WHERE (squad_members.user_id = auth.uid())))));
CREATE POLICY "Users can insert leads in their org" ON public.leads AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((organization_id = get_user_organization(auth.uid())));
CREATE POLICY "Users can update leads in their org" ON public.leads AS PERMISSIVE FOR UPDATE TO authenticated
  USING (((organization_id = get_user_organization(auth.uid())) AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role) OR (assigned_to = auth.uid()) OR ((squad_id IS NOT NULL) AND (squad_id IN ( SELECT squad_members.squad_id
   FROM squad_members
  WHERE (squad_members.user_id = auth.uid())))))));
CREATE POLICY "Users can view leads" ON public.leads AS PERMISSIVE FOR SELECT TO authenticated
  USING (((organization_id = get_user_organization(auth.uid())) AND ((assigned_to = auth.uid()) OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role))));
CREATE POLICY "Admins can manage campaigns" ON public.mass_email_campaigns AS PERMISSIVE FOR ALL TO public
  USING ((user_belongs_to_organization(organization_id, auth.uid()) AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role))));
CREATE POLICY "Users can view their org campaigns" ON public.mass_email_campaigns AS PERMISSIVE FOR SELECT TO public
  USING (user_belongs_to_organization(organization_id, auth.uid()));
CREATE POLICY "Admins can manage recipients" ON public.mass_email_recipients AS PERMISSIVE FOR ALL TO public
  USING ((EXISTS ( SELECT 1
   FROM mass_email_campaigns c
  WHERE ((c.id = mass_email_recipients.campaign_id) AND user_belongs_to_organization(c.organization_id, auth.uid()) AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role))))));
CREATE POLICY "Users can view their org recipients" ON public.mass_email_recipients AS PERMISSIVE FOR SELECT TO public
  USING ((EXISTS ( SELECT 1
   FROM mass_email_campaigns c
  WHERE ((c.id = mass_email_recipients.campaign_id) AND user_belongs_to_organization(c.organization_id, auth.uid())))));
CREATE POLICY "Admins and managers can manage materials" ON public.materials AS PERMISSIVE FOR ALL TO authenticated
  USING (((organization_id = get_user_organization(auth.uid())) AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role))));
CREATE POLICY "Users can view materials" ON public.materials AS PERMISSIVE FOR SELECT TO authenticated
  USING (((organization_id = get_user_organization(auth.uid())) OR (EXISTS ( SELECT 1
   FROM products p
  WHERE ((p.id = materials.product_id) AND (p.organization_id = get_user_organization(auth.uid())))))));
CREATE POLICY "Agents can delete their own reactions" ON public.message_reactions AS PERMISSIVE FOR DELETE TO public
  USING (((reactor_type = 'agent'::text) AND (user_id = auth.uid())));
CREATE POLICY "Agents can insert their own reactions" ON public.message_reactions AS PERMISSIVE FOR INSERT TO public
  WITH CHECK (((reactor_type = 'agent'::text) AND (user_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM (webchat_conversations c
     JOIN profiles p ON ((p.organization_id = c.organization_id)))
  WHERE ((c.id = message_reactions.conversation_id) AND (p.id = auth.uid()))))));
CREATE POLICY "Org members can view reactions" ON public.message_reactions AS PERMISSIVE FOR SELECT TO public
  USING ((EXISTS ( SELECT 1
   FROM (webchat_conversations c
     JOIN profiles p ON ((p.organization_id = c.organization_id)))
  WHERE ((c.id = message_reactions.conversation_id) AND (p.id = auth.uid())))));
CREATE POLICY "System can insert notification logs" ON public.notification_logs AS PERMISSIVE FOR INSERT TO public
  WITH CHECK ((organization_id = get_user_organization(auth.uid())));
CREATE POLICY "Users can view their notification logs" ON public.notification_logs AS PERMISSIVE FOR SELECT TO public
  USING ((organization_id = get_user_organization(auth.uid())));
CREATE POLICY "Authenticated users can insert notifications" ON public.notifications AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((user_id IS NOT NULL));
CREATE POLICY "Users can delete their own notifications" ON public.notifications AS PERMISSIVE FOR DELETE TO public
  USING ((user_id = auth.uid()));
CREATE POLICY "Users can update their notifications" ON public.notifications AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((user_id = auth.uid()));
CREATE POLICY "Users can view their notifications" ON public.notifications AS PERMISSIVE FOR SELECT TO authenticated
  USING ((user_id = auth.uid()));
CREATE POLICY "Admins and managers can manage objections" ON public.objections AS PERMISSIVE FOR ALL TO authenticated
  USING (((organization_id = get_user_organization(auth.uid())) AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role))));
CREATE POLICY "Users can view objections" ON public.objections AS PERMISSIVE FOR SELECT TO authenticated
  USING (((organization_id = get_user_organization(auth.uid())) OR (EXISTS ( SELECT 1
   FROM products p
  WHERE ((p.id = objections.product_id) AND (p.organization_id = get_user_organization(auth.uid())))))));
CREATE POLICY "org members can view orchestration logs" ON public.orchestration_logs AS PERMISSIVE FOR SELECT TO authenticated
  USING (user_belongs_to_organization(auth.uid(), organization_id));
CREATE POLICY "Org admins can delete AI credentials" ON public.org_ai_credentials AS PERMISSIVE FOR DELETE TO authenticated
  USING (((organization_id = get_user_organization(auth.uid())) AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role))));
CREATE POLICY "Org admins can insert AI credentials" ON public.org_ai_credentials AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (((organization_id = get_user_organization(auth.uid())) AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role))));
CREATE POLICY "Org admins can update AI credentials" ON public.org_ai_credentials AS PERMISSIVE FOR UPDATE TO authenticated
  USING (((organization_id = get_user_organization(auth.uid())) AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role))));
CREATE POLICY "Org admins can view their AI credentials status" ON public.org_ai_credentials AS PERMISSIVE FOR SELECT TO authenticated
  USING (((organization_id = get_user_organization(auth.uid())) AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role))));
CREATE POLICY "Org admins can delete AI routing" ON public.org_ai_routing AS PERMISSIVE FOR DELETE TO authenticated
  USING (((organization_id = get_user_organization(auth.uid())) AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role))));
CREATE POLICY "Org admins can insert AI routing" ON public.org_ai_routing AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (((organization_id = get_user_organization(auth.uid())) AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role))));
CREATE POLICY "Org admins can update AI routing" ON public.org_ai_routing AS PERMISSIVE FOR UPDATE TO authenticated
  USING (((organization_id = get_user_organization(auth.uid())) AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role))));
CREATE POLICY "Org members can view AI routing" ON public.org_ai_routing AS PERMISSIVE FOR SELECT TO authenticated
  USING ((organization_id = get_user_organization(auth.uid())));
CREATE POLICY "org admins can delete orchestrator config" ON public.organization_orchestrator_config AS PERMISSIVE FOR DELETE TO authenticated
  USING ((user_belongs_to_organization(auth.uid(), organization_id) AND (has_role(auth.uid(), 'admin'::app_role) OR is_super_admin(auth.uid()))));
CREATE POLICY "org admins can insert orchestrator config" ON public.organization_orchestrator_config AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((user_belongs_to_organization(auth.uid(), organization_id) AND (has_role(auth.uid(), 'admin'::app_role) OR is_super_admin(auth.uid()))));
CREATE POLICY "org admins can update orchestrator config" ON public.organization_orchestrator_config AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((user_belongs_to_organization(auth.uid(), organization_id) AND (has_role(auth.uid(), 'admin'::app_role) OR is_super_admin(auth.uid()))));
CREATE POLICY "org members can view orchestrator config" ON public.organization_orchestrator_config AS PERMISSIVE FOR SELECT TO authenticated
  USING (user_belongs_to_organization(auth.uid(), organization_id));
CREATE POLICY "Admins can update their organization" ON public.organizations AS PERMISSIVE FOR UPDATE TO authenticated
  USING (((id = get_user_organization(auth.uid())) AND has_role(auth.uid(), 'admin'::app_role)));
CREATE POLICY "Super admins can manage all organizations" ON public.organizations AS PERMISSIVE FOR ALL TO public
  USING (is_super_admin(auth.uid()))
  WITH CHECK (is_super_admin(auth.uid()));
CREATE POLICY "Users can view their organization" ON public.organizations AS PERMISSIVE FOR SELECT TO authenticated
  USING ((id = get_user_organization(auth.uid())));
CREATE POLICY "Org members can create payment links" ON public.payment_links AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (((organization_id = get_user_organization(auth.uid())) AND (created_by = auth.uid())));
CREATE POLICY "Org members can delete payment links" ON public.payment_links AS PERMISSIVE FOR DELETE TO authenticated
  USING ((organization_id = get_user_organization(auth.uid())));
CREATE POLICY "Org members can update payment links" ON public.payment_links AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((organization_id = get_user_organization(auth.uid())));
CREATE POLICY "Org members can view payment links" ON public.payment_links AS PERMISSIVE FOR SELECT TO authenticated
  USING ((organization_id = get_user_organization(auth.uid())));
CREATE POLICY "Admins and managers can manage stages" ON public.pipeline_stages AS PERMISSIVE FOR ALL TO authenticated
  USING (((EXISTS ( SELECT 1
   FROM products p
  WHERE ((p.id = pipeline_stages.product_id) AND (p.organization_id = get_user_organization(auth.uid()))))) AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role))));
CREATE POLICY "Users can view stages of their org products" ON public.pipeline_stages AS PERMISSIVE FOR SELECT TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM products p
  WHERE ((p.id = pipeline_stages.product_id) AND (p.organization_id = get_user_organization(auth.uid()))))));
CREATE POLICY "Super admins can manage audit logs" ON public.platform_audit_logs AS PERMISSIVE FOR ALL TO public
  USING (is_super_admin(auth.uid()));
CREATE POLICY "Super admins can manage email settings" ON public.platform_email_settings AS PERMISSIVE FOR ALL TO public
  USING (is_super_admin(auth.uid()));
CREATE POLICY "Authenticated can view active platform templates" ON public.platform_email_templates AS PERMISSIVE FOR SELECT TO authenticated
  USING ((is_active = true));
CREATE POLICY "Super admins manage platform email templates" ON public.platform_email_templates AS PERMISSIVE FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));
CREATE POLICY "Anyone authenticated can view active plans" ON public.platform_plans AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);
CREATE POLICY "Super admins can delete plans" ON public.platform_plans AS PERMISSIVE FOR DELETE TO authenticated
  USING (is_super_admin(auth.uid()));
CREATE POLICY "Super admins can insert plans" ON public.platform_plans AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (is_super_admin(auth.uid()));
CREATE POLICY "Super admins can update plans" ON public.platform_plans AS PERMISSIVE FOR UPDATE TO authenticated
  USING (is_super_admin(auth.uid()));
CREATE POLICY "Users delete their own release reads" ON public.platform_release_reads AS PERMISSIVE FOR DELETE TO authenticated
  USING ((user_id = auth.uid()));
CREATE POLICY "Users mark releases as read" ON public.platform_release_reads AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((user_id = auth.uid()));
CREATE POLICY "Users view their own release reads" ON public.platform_release_reads AS PERMISSIVE FOR SELECT TO authenticated
  USING ((user_id = auth.uid()));
CREATE POLICY "Anyone authenticated can view published releases" ON public.platform_releases AS PERMISSIVE FOR SELECT TO authenticated
  USING (((is_published = true) OR is_super_admin(auth.uid())));
CREATE POLICY "Super admin manages releases" ON public.platform_releases AS PERMISSIVE FOR ALL TO authenticated
  USING (is_super_admin(auth.uid()))
  WITH CHECK (is_super_admin(auth.uid()));
CREATE POLICY "Super admins can manage platform settings" ON public.platform_settings AS PERMISSIVE FOR ALL TO public
  USING (is_super_admin(auth.uid()));
CREATE POLICY "Acoes pos-venda visiveis pela organizacao" ON public.post_sale_event_actions AS PERMISSIVE FOR SELECT TO public
  USING ((is_super_admin(auth.uid()) OR user_belongs_to_organization(auth.uid(), organization_id)));
CREATE POLICY "Admins gerenciam acoes pos-venda" ON public.post_sale_event_actions AS PERMISSIVE FOR ALL TO public
  USING ((is_super_admin(auth.uid()) OR (user_belongs_to_organization(auth.uid(), organization_id) AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role)))))
  WITH CHECK ((is_super_admin(auth.uid()) OR (user_belongs_to_organization(auth.uid(), organization_id) AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role)))));
CREATE POLICY "Logs visiveis pela organizacao" ON public.post_sale_event_logs AS PERMISSIVE FOR SELECT TO public
  USING ((is_super_admin(auth.uid()) OR user_belongs_to_organization(auth.uid(), organization_id)));
CREATE POLICY "Users can delete agents in their organization" ON public.product_agents AS PERMISSIVE FOR DELETE TO public
  USING ((organization_id = get_user_organization(auth.uid())));
CREATE POLICY "Users can insert agents in their organization" ON public.product_agents AS PERMISSIVE FOR INSERT TO public
  WITH CHECK ((organization_id = get_user_organization(auth.uid())));
CREATE POLICY "Users can update agents in their organization" ON public.product_agents AS PERMISSIVE FOR UPDATE TO public
  USING ((organization_id = get_user_organization(auth.uid())));
CREATE POLICY "Users can view agents in their organization" ON public.product_agents AS PERMISSIVE FOR SELECT TO public
  USING ((organization_id = get_user_organization(auth.uid())));
CREATE POLICY "Admins can delete catalog items" ON public.product_catalog_items AS PERMISSIVE FOR DELETE TO public
  USING (((user_belongs_to_organization(auth.uid(), organization_id) AND has_role(auth.uid(), 'admin'::app_role)) OR is_super_admin(auth.uid())));
CREATE POLICY "Admins can insert catalog items" ON public.product_catalog_items AS PERMISSIVE FOR INSERT TO public
  WITH CHECK (((user_belongs_to_organization(auth.uid(), organization_id) AND has_role(auth.uid(), 'admin'::app_role)) OR is_super_admin(auth.uid())));
CREATE POLICY "Admins can update catalog items" ON public.product_catalog_items AS PERMISSIVE FOR UPDATE TO public
  USING (((user_belongs_to_organization(auth.uid(), organization_id) AND has_role(auth.uid(), 'admin'::app_role)) OR is_super_admin(auth.uid())));
CREATE POLICY "Members can view catalog items" ON public.product_catalog_items AS PERMISSIVE FOR SELECT TO public
  USING ((user_belongs_to_organization(auth.uid(), organization_id) OR is_super_admin(auth.uid())));
CREATE POLICY "Admins can delete CTAs" ON public.product_ctas AS PERMISSIVE FOR DELETE TO public
  USING ((user_belongs_to_organization(auth.uid(), organization_id) AND has_role(auth.uid(), 'admin'::app_role)));
CREATE POLICY "Admins can insert CTAs" ON public.product_ctas AS PERMISSIVE FOR INSERT TO public
  WITH CHECK ((user_belongs_to_organization(auth.uid(), organization_id) AND has_role(auth.uid(), 'admin'::app_role)));
CREATE POLICY "Admins can update CTAs" ON public.product_ctas AS PERMISSIVE FOR UPDATE TO public
  USING ((user_belongs_to_organization(auth.uid(), organization_id) AND has_role(auth.uid(), 'admin'::app_role)));
CREATE POLICY "Users can view CTAs from their organization" ON public.product_ctas AS PERMISSIVE FOR SELECT TO public
  USING (user_belongs_to_organization(auth.uid(), organization_id));
CREATE POLICY "Users can create knowledge sources for their org" ON public.product_knowledge_sources AS PERMISSIVE FOR INSERT TO public
  WITH CHECK ((organization_id IN ( SELECT profiles.organization_id
   FROM profiles
  WHERE (profiles.id = auth.uid()))));
CREATE POLICY "Users can delete their org knowledge sources" ON public.product_knowledge_sources AS PERMISSIVE FOR DELETE TO public
  USING ((organization_id IN ( SELECT profiles.organization_id
   FROM profiles
  WHERE (profiles.id = auth.uid()))));
CREATE POLICY "Users can update their org knowledge sources" ON public.product_knowledge_sources AS PERMISSIVE FOR UPDATE TO public
  USING ((organization_id IN ( SELECT profiles.organization_id
   FROM profiles
  WHERE (profiles.id = auth.uid()))));
CREATE POLICY "Users can view their org knowledge sources" ON public.product_knowledge_sources AS PERMISSIVE FOR SELECT TO public
  USING ((organization_id IN ( SELECT profiles.organization_id
   FROM profiles
  WHERE (profiles.id = auth.uid()))));
CREATE POLICY "Org members can delete offers" ON public.product_offers AS PERMISSIVE FOR DELETE TO public
  USING (user_belongs_to_organization(auth.uid(), organization_id));
CREATE POLICY "Org members can insert offers" ON public.product_offers AS PERMISSIVE FOR INSERT TO public
  WITH CHECK (user_belongs_to_organization(auth.uid(), organization_id));
CREATE POLICY "Org members can update offers" ON public.product_offers AS PERMISSIVE FOR UPDATE TO public
  USING (user_belongs_to_organization(auth.uid(), organization_id));
CREATE POLICY "Org members can view offers" ON public.product_offers AS PERMISSIVE FOR SELECT TO public
  USING (user_belongs_to_organization(auth.uid(), organization_id));
CREATE POLICY "Users can create their own onboarding state" ON public.product_onboarding_state AS PERMISSIVE FOR INSERT TO public
  WITH CHECK ((user_id = auth.uid()));
CREATE POLICY "Users can delete their own onboarding state" ON public.product_onboarding_state AS PERMISSIVE FOR DELETE TO public
  USING ((user_id = auth.uid()));
CREATE POLICY "Users can update their own onboarding state" ON public.product_onboarding_state AS PERMISSIVE FOR UPDATE TO public
  USING ((user_id = auth.uid()));
CREATE POLICY "Users can view their own onboarding state" ON public.product_onboarding_state AS PERMISSIVE FOR SELECT TO public
  USING ((user_id = auth.uid()));
CREATE POLICY "Org members can delete suites" ON public.product_suites AS PERMISSIVE FOR DELETE TO public
  USING (user_belongs_to_organization(auth.uid(), organization_id));
CREATE POLICY "Org members can insert suites" ON public.product_suites AS PERMISSIVE FOR INSERT TO public
  WITH CHECK (user_belongs_to_organization(auth.uid(), organization_id));
CREATE POLICY "Org members can update suites" ON public.product_suites AS PERMISSIVE FOR UPDATE TO public
  USING (user_belongs_to_organization(auth.uid(), organization_id));
CREATE POLICY "Org members can view suites" ON public.product_suites AS PERMISSIVE FOR SELECT TO public
  USING (user_belongs_to_organization(auth.uid(), organization_id));
CREATE POLICY "Admins and managers can manage training videos" ON public.product_training_videos AS PERMISSIVE FOR ALL TO public
  USING (((organization_id IN ( SELECT profiles.organization_id
   FROM profiles
  WHERE (profiles.id = auth.uid()))) AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role))));
CREATE POLICY "Users can view training videos from their organization" ON public.product_training_videos AS PERMISSIVE FOR SELECT TO public
  USING ((organization_id IN ( SELECT profiles.organization_id
   FROM profiles
  WHERE (profiles.id = auth.uid()))));
CREATE POLICY "Admins and managers can insert products" ON public.products AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (((organization_id = get_user_organization(auth.uid())) AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role))));
CREATE POLICY "Admins and managers can update products" ON public.products AS PERMISSIVE FOR UPDATE TO authenticated
  USING (((organization_id = get_user_organization(auth.uid())) AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role))));
CREATE POLICY "Admins can delete products" ON public.products AS PERMISSIVE FOR DELETE TO authenticated
  USING (((organization_id = get_user_organization(auth.uid())) AND has_role(auth.uid(), 'admin'::app_role)));
CREATE POLICY "Users can view products in their org" ON public.products AS PERMISSIVE FOR SELECT TO authenticated
  USING ((organization_id = get_user_organization(auth.uid())));
CREATE POLICY "Super admins can update all profiles" ON public.profiles AS PERMISSIVE FOR UPDATE TO authenticated
  USING (is_super_admin(auth.uid()))
  WITH CHECK (is_super_admin(auth.uid()));
CREATE POLICY "Super admins can view all profiles" ON public.profiles AS PERMISSIVE FOR SELECT TO public
  USING (is_super_admin(auth.uid()));
CREATE POLICY "Users can insert their own profile" ON public.profiles AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((id = auth.uid()));
CREATE POLICY "Users can update their own profile" ON public.profiles AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((id = auth.uid()));
CREATE POLICY "Users can view profiles in their org" ON public.profiles AS PERMISSIVE FOR SELECT TO authenticated
  USING ((organization_id = get_user_organization(auth.uid())));
CREATE POLICY "Users can create quick replies for their organization" ON public.quick_replies AS PERMISSIVE FOR INSERT TO public
  WITH CHECK ((organization_id IN ( SELECT profiles.organization_id
   FROM profiles
  WHERE (profiles.id = auth.uid()))));
CREATE POLICY "Users can delete quick replies from their organization" ON public.quick_replies AS PERMISSIVE FOR DELETE TO public
  USING ((organization_id IN ( SELECT profiles.organization_id
   FROM profiles
  WHERE (profiles.id = auth.uid()))));
CREATE POLICY "Users can update quick replies from their organization" ON public.quick_replies AS PERMISSIVE FOR UPDATE TO public
  USING ((organization_id IN ( SELECT profiles.organization_id
   FROM profiles
  WHERE (profiles.id = auth.uid()))));
CREATE POLICY "Users can view quick replies from their organization" ON public.quick_replies AS PERMISSIVE FOR SELECT TO public
  USING ((organization_id IN ( SELECT profiles.organization_id
   FROM profiles
  WHERE (profiles.id = auth.uid()))));
CREATE POLICY "Admins and managers can insert goals" ON public.sales_goals AS PERMISSIVE FOR INSERT TO public
  WITH CHECK (((organization_id = get_user_organization(auth.uid())) AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role))));
CREATE POLICY "Admins and managers can update goals" ON public.sales_goals AS PERMISSIVE FOR UPDATE TO public
  USING (((organization_id = get_user_organization(auth.uid())) AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role))));
CREATE POLICY "Admins can delete goals" ON public.sales_goals AS PERMISSIVE FOR DELETE TO public
  USING (((organization_id = get_user_organization(auth.uid())) AND has_role(auth.uid(), 'admin'::app_role)));
CREATE POLICY "Users can view goals in their org" ON public.sales_goals AS PERMISSIVE FOR SELECT TO public
  USING (((organization_id = get_user_organization(auth.uid())) AND ((user_id = auth.uid()) OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role))));
CREATE POLICY "Anyone can insert sales leads" ON public.sales_leads AS PERMISSIVE FOR INSERT TO public
  WITH CHECK (true);
CREATE POLICY "Super admins manage sales leads" ON public.sales_leads AS PERMISSIVE FOR ALL TO public
  USING (is_super_admin(auth.uid()));
CREATE POLICY "Admins and managers can manage squads" ON public.sales_squads AS PERMISSIVE FOR ALL TO public
  USING (((organization_id = get_user_organization(auth.uid())) AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role))));
CREATE POLICY "Users can view squads in their org" ON public.sales_squads AS PERMISSIVE FOR SELECT TO public
  USING ((organization_id = get_user_organization(auth.uid())));
CREATE POLICY "Admins can manage org sankhya mappings" ON public.sankhya_mappings AS PERMISSIVE FOR ALL TO public
  USING (((organization_id = get_user_organization(auth.uid())) AND has_role(auth.uid(), 'admin'::app_role)));
CREATE POLICY "Users can view org sankhya mappings" ON public.sankhya_mappings AS PERMISSIVE FOR SELECT TO public
  USING ((organization_id = get_user_organization(auth.uid())));
CREATE POLICY "System can insert sync logs" ON public.sankhya_sync_logs AS PERMISSIVE FOR INSERT TO public
  WITH CHECK ((organization_id = get_user_organization(auth.uid())));
CREATE POLICY "System can update sync logs" ON public.sankhya_sync_logs AS PERMISSIVE FOR UPDATE TO public
  USING ((organization_id = get_user_organization(auth.uid())));
CREATE POLICY "Users can view org sync logs" ON public.sankhya_sync_logs AS PERMISSIVE FOR SELECT TO public
  USING ((organization_id = get_user_organization(auth.uid())));
CREATE POLICY "Users can manage own scheduled messages" ON public.scheduled_messages AS PERMISSIVE FOR ALL TO public
  USING ((created_by = auth.uid()));
CREATE POLICY "Admins/managers manage sector members - delete" ON public.sector_members AS PERMISSIVE FOR DELETE TO public
  USING ((user_in_sector_organization(auth.uid(), sector_id) AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role) OR is_super_admin(auth.uid()))));
CREATE POLICY "Admins/managers manage sector members - insert" ON public.sector_members AS PERMISSIVE FOR INSERT TO public
  WITH CHECK ((user_in_sector_organization(auth.uid(), sector_id) AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role) OR is_super_admin(auth.uid()))));
CREATE POLICY "View sector members in same org" ON public.sector_members AS PERMISSIVE FOR SELECT TO public
  USING ((user_in_sector_organization(auth.uid(), sector_id) OR is_super_admin(auth.uid())));
CREATE POLICY "Admins can delete sectors" ON public.sectors AS PERMISSIVE FOR DELETE TO public
  USING (((organization_id = get_user_organization(auth.uid())) AND (has_role(auth.uid(), 'admin'::app_role) OR is_super_admin(auth.uid()))));
CREATE POLICY "Admins/managers can insert sectors" ON public.sectors AS PERMISSIVE FOR INSERT TO public
  WITH CHECK (((organization_id = get_user_organization(auth.uid())) AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role) OR is_super_admin(auth.uid()))));
CREATE POLICY "Admins/managers can update sectors" ON public.sectors AS PERMISSIVE FOR UPDATE TO public
  USING (((organization_id = get_user_organization(auth.uid())) AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role) OR is_super_admin(auth.uid()))));
CREATE POLICY "Org members can view their sectors" ON public.sectors AS PERMISSIVE FOR SELECT TO public
  USING (((organization_id = get_user_organization(auth.uid())) OR is_super_admin(auth.uid())));
CREATE POLICY "Admins and managers can manage squad members" ON public.squad_members AS PERMISSIVE FOR ALL TO public
  USING (((EXISTS ( SELECT 1
   FROM sales_squads s
  WHERE ((s.id = squad_members.squad_id) AND (s.organization_id = get_user_organization(auth.uid()))))) AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role))));
CREATE POLICY "Users can view squad members in their org" ON public.squad_members AS PERMISSIVE FOR SELECT TO public
  USING ((EXISTS ( SELECT 1
   FROM sales_squads s
  WHERE ((s.id = squad_members.squad_id) AND (s.organization_id = get_user_organization(auth.uid()))))));
CREATE POLICY "Admins and managers can manage stage values" ON public.stage_values AS PERMISSIVE FOR ALL TO public
  USING (((EXISTS ( SELECT 1
   FROM products p
  WHERE ((p.id = stage_values.product_id) AND (p.organization_id = get_user_organization(auth.uid()))))) AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role))));
CREATE POLICY "Users can view stage values of their org products" ON public.stage_values AS PERMISSIVE FOR SELECT TO public
  USING ((EXISTS ( SELECT 1
   FROM products p
  WHERE ((p.id = stage_values.product_id) AND (p.organization_id = get_user_organization(auth.uid()))))));
CREATE POLICY "Org admins can view own subscription" ON public.subscriptions AS PERMISSIVE FOR SELECT TO public
  USING ((organization_id = get_user_organization(auth.uid())));
CREATE POLICY "Super admins can manage all subscriptions" ON public.subscriptions AS PERMISSIVE FOR ALL TO public
  USING (is_super_admin(auth.uid()));
CREATE POLICY "Mensagens podem ser criadas por envolvidos" ON public.support_messages AS PERMISSIVE FOR INSERT TO public
  WITH CHECK (((author_id = auth.uid()) AND (is_super_admin(auth.uid()) OR (EXISTS ( SELECT 1
   FROM support_tickets t
  WHERE ((t.id = support_messages.ticket_id) AND user_belongs_to_organization(auth.uid(), t.organization_id)))))));
CREATE POLICY "Mensagens visiveis para envolvidos" ON public.support_messages AS PERMISSIVE FOR SELECT TO public
  USING ((is_super_admin(auth.uid()) OR (EXISTS ( SELECT 1
   FROM support_tickets t
  WHERE ((t.id = support_messages.ticket_id) AND user_belongs_to_organization(auth.uid(), t.organization_id))))));
CREATE POLICY "Membros podem criar tickets" ON public.support_tickets AS PERMISSIVE FOR INSERT TO public
  WITH CHECK ((user_belongs_to_organization(auth.uid(), organization_id) AND (created_by = auth.uid())));
CREATE POLICY "Super admins podem deletar tickets" ON public.support_tickets AS PERMISSIVE FOR DELETE TO public
  USING (is_super_admin(auth.uid()));
CREATE POLICY "Tickets editaveis por dono ou super admin" ON public.support_tickets AS PERMISSIVE FOR UPDATE TO public
  USING ((is_super_admin(auth.uid()) OR user_belongs_to_organization(auth.uid(), organization_id)))
  WITH CHECK ((is_super_admin(auth.uid()) OR user_belongs_to_organization(auth.uid(), organization_id)));
CREATE POLICY "Tickets visiveis para a organizacao ou super admin" ON public.support_tickets AS PERMISSIVE FOR SELECT TO public
  USING ((is_super_admin(auth.uid()) OR user_belongs_to_organization(auth.uid(), organization_id)));
CREATE POLICY "Service role can insert suppressed emails" ON public.suppressed_emails AS PERMISSIVE FOR INSERT TO public
  WITH CHECK ((auth.role() = 'service_role'::text));
CREATE POLICY "Service role can read suppressed emails" ON public.suppressed_emails AS PERMISSIVE FOR SELECT TO public
  USING ((auth.role() = 'service_role'::text));
CREATE POLICY "Admins gerenciam automacoes de tag" ON public.tag_automations AS PERMISSIVE FOR ALL TO public
  USING ((is_super_admin(auth.uid()) OR (user_belongs_to_organization(auth.uid(), organization_id) AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role)))))
  WITH CHECK ((is_super_admin(auth.uid()) OR (user_belongs_to_organization(auth.uid(), organization_id) AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role)))));
CREATE POLICY "Automacoes visiveis por organizacao" ON public.tag_automations AS PERMISSIVE FOR SELECT TO public
  USING ((is_super_admin(auth.uid()) OR user_belongs_to_organization(auth.uid(), organization_id)));
CREATE POLICY "Admins and managers can manage all tasks" ON public.tasks AS PERMISSIVE FOR ALL TO authenticated
  USING ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role)));
CREATE POLICY "Users can manage their own tasks" ON public.tasks AS PERMISSIVE FOR ALL TO authenticated
  USING ((user_id = auth.uid()));
CREATE POLICY "Users can view their own tasks" ON public.tasks AS PERMISSIVE FOR SELECT TO authenticated
  USING (((user_id = auth.uid()) OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role)));
CREATE POLICY "Admins and managers can manage invitations" ON public.team_invitations AS PERMISSIVE FOR ALL TO public
  USING (((organization_id = get_user_organization(auth.uid())) AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role))));
CREATE POLICY "Public can view pending invitations by token" ON public.team_invitations AS PERMISSIVE FOR SELECT TO anon, authenticated
  USING (((status = 'pending'::text) AND (expires_at > now()) AND (token IS NOT NULL) AND (token <> ''::text)));
CREATE POLICY "Super admins can manage all invitations" ON public.team_invitations AS PERMISSIVE FOR ALL TO authenticated
  USING (is_super_admin(auth.uid()))
  WITH CHECK (is_super_admin(auth.uid()));
CREATE POLICY "Anyone can view user availability" ON public.user_availability AS PERMISSIVE FOR SELECT TO public
  USING (true);
CREATE POLICY "Users can manage own availability" ON public.user_availability AS PERMISSIVE FOR ALL TO authenticated
  USING ((user_id = auth.uid()))
  WITH CHECK ((user_id = auth.uid()));
CREATE POLICY "System can insert badges" ON public.user_badges AS PERMISSIVE FOR INSERT TO public
  WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = user_badges.user_id) AND (p.organization_id = get_user_organization(auth.uid()))))));
CREATE POLICY "Users can view badges in their org" ON public.user_badges AS PERMISSIVE FOR SELECT TO public
  USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = user_badges.user_id) AND (p.organization_id = get_user_organization(auth.uid()))))));
CREATE POLICY "Users delete their notification settings" ON public.user_notification_settings AS PERMISSIVE FOR DELETE TO public
  USING (((user_id = auth.uid()) OR is_super_admin(auth.uid())));
CREATE POLICY "Users insert their notification settings" ON public.user_notification_settings AS PERMISSIVE FOR INSERT TO public
  WITH CHECK (((user_id = auth.uid()) OR ((organization_id = get_user_organization(auth.uid())) AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role) OR is_super_admin(auth.uid())))));
CREATE POLICY "Users update their notification settings" ON public.user_notification_settings AS PERMISSIVE FOR UPDATE TO public
  USING (((user_id = auth.uid()) OR ((organization_id = get_user_organization(auth.uid())) AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role) OR is_super_admin(auth.uid())))));
CREATE POLICY "Users view their notification settings" ON public.user_notification_settings AS PERMISSIVE FOR SELECT TO public
  USING (((user_id = auth.uid()) OR ((organization_id = get_user_organization(auth.uid())) AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role) OR is_super_admin(auth.uid())))));
CREATE POLICY "Admins can manage permissions" ON public.user_permissions AS PERMISSIVE FOR ALL TO authenticated
  USING (((organization_id = get_user_organization(auth.uid())) AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role))))
  WITH CHECK (((organization_id = get_user_organization(auth.uid())) AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role))));
CREATE POLICY "Super admins can manage all permissions" ON public.user_permissions AS PERMISSIVE FOR ALL TO authenticated
  USING (is_super_admin(auth.uid()))
  WITH CHECK (is_super_admin(auth.uid()));
CREATE POLICY "Users can view own permissions" ON public.user_permissions AS PERMISSIVE FOR SELECT TO authenticated
  USING ((user_id = auth.uid()));
CREATE POLICY "Admins and managers can manage assignments" ON public.user_product_assignments AS PERMISSIVE FOR ALL TO authenticated
  USING ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role)))
  WITH CHECK ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role)));
CREATE POLICY "Users can view their own assignments" ON public.user_product_assignments AS PERMISSIVE FOR SELECT TO authenticated
  USING (((user_id = auth.uid()) OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role)));
CREATE POLICY "Admins can delete roles" ON public.user_roles AS PERMISSIVE FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can insert roles" ON public.user_roles AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Super admins can delete all user roles" ON public.user_roles AS PERMISSIVE FOR DELETE TO authenticated
  USING (is_super_admin(auth.uid()));
CREATE POLICY "Super admins can insert all user roles" ON public.user_roles AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (is_super_admin(auth.uid()));
CREATE POLICY "Super admins can update all user roles" ON public.user_roles AS PERMISSIVE FOR UPDATE TO authenticated
  USING (is_super_admin(auth.uid()))
  WITH CHECK (is_super_admin(auth.uid()));
CREATE POLICY "Super admins can view all user roles" ON public.user_roles AS PERMISSIVE FOR SELECT TO public
  USING (is_super_admin(auth.uid()));
CREATE POLICY "Users can view roles in their org" ON public.user_roles AS PERMISSIVE FOR SELECT TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = user_roles.user_id) AND (p.organization_id = get_user_organization(auth.uid()))))));
CREATE POLICY "Users can view their own roles" ON public.user_roles AS PERMISSIVE FOR SELECT TO public
  USING ((user_id = auth.uid()));
CREATE POLICY "Users can insert own status" ON public.user_status AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((user_id = auth.uid()));
CREATE POLICY "Users can update own status" ON public.user_status AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((user_id = auth.uid()));
CREATE POLICY "Users can view statuses in their org" ON public.user_status AS PERMISSIVE FOR SELECT TO authenticated
  USING (user_belongs_to_organization(auth.uid(), organization_id));
CREATE POLICY "Admins and managers can manage agent configs" ON public.webchat_agent_configs AS PERMISSIVE FOR ALL TO public
  USING (((organization_id = get_user_organization(auth.uid())) AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role))));
CREATE POLICY "Users can view their org agent configs" ON public.webchat_agent_configs AS PERMISSIVE FOR SELECT TO public
  USING ((organization_id = get_user_organization(auth.uid())));
CREATE POLICY "Users can insert assignment events for their org" ON public.webchat_assignment_events AS PERMISSIVE FOR INSERT TO public
  WITH CHECK ((EXISTS ( SELECT 1
   FROM webchat_conversations c
  WHERE ((c.id = webchat_assignment_events.conversation_id) AND (c.organization_id = get_user_organization(auth.uid()))))));
CREATE POLICY "Users can view assignment events from their org" ON public.webchat_assignment_events AS PERMISSIVE FOR SELECT TO public
  USING ((EXISTS ( SELECT 1
   FROM webchat_conversations c
  WHERE ((c.id = webchat_assignment_events.conversation_id) AND (c.organization_id = get_user_organization(auth.uid()))))));
CREATE POLICY "Allow conversation inserts via valid widget" ON public.webchat_conversations AS PERMISSIVE FOR INSERT TO public
  WITH CHECK ((EXISTS ( SELECT 1
   FROM webchat_widgets w
  WHERE ((w.id = webchat_conversations.widget_id) AND (w.organization_id = webchat_conversations.organization_id) AND (w.is_active = true)))));
CREATE POLICY "Users can update their org conversations" ON public.webchat_conversations AS PERMISSIVE FOR UPDATE TO public
  USING ((organization_id = get_user_organization(auth.uid())));
CREATE POLICY "Users can view their org conversations" ON public.webchat_conversations AS PERMISSIVE FOR SELECT TO public
  USING ((organization_id = get_user_organization(auth.uid())));
CREATE POLICY "Users can insert messages to their org conversations" ON public.webchat_messages AS PERMISSIVE FOR INSERT TO public
  WITH CHECK ((EXISTS ( SELECT 1
   FROM webchat_conversations c
  WHERE (c.id = webchat_messages.conversation_id))));
CREATE POLICY "Users can view messages from their org conversations" ON public.webchat_messages AS PERMISSIVE FOR SELECT TO public
  USING ((EXISTS ( SELECT 1
   FROM webchat_conversations c
  WHERE ((c.id = webchat_messages.conversation_id) AND (c.organization_id = get_user_organization(auth.uid()))))));
CREATE POLICY "Admins and managers can manage webchat widgets" ON public.webchat_widgets AS PERMISSIVE FOR ALL TO public
  USING (((organization_id = get_user_organization(auth.uid())) AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role))));
CREATE POLICY "Users can view their org webchat widgets" ON public.webchat_widgets AS PERMISSIVE FOR SELECT TO public
  USING ((organization_id = get_user_organization(auth.uid())));
CREATE POLICY "System can insert webhook logs" ON public.webhook_logs AS PERMISSIVE FOR INSERT TO public
  WITH CHECK (true);
CREATE POLICY "Users can view logs for webhooks in their organization" ON public.webhook_logs AS PERMISSIVE FOR SELECT TO public
  USING ((EXISTS ( SELECT 1
   FROM webhooks w
  WHERE ((w.id = webhook_logs.webhook_id) AND (w.organization_id = get_user_organization(auth.uid()))))));
CREATE POLICY "Users can manage samples for webhooks in their organization" ON public.webhook_sample_requests AS PERMISSIVE FOR ALL TO public
  USING ((EXISTS ( SELECT 1
   FROM webhooks w
  WHERE ((w.id = webhook_sample_requests.webhook_id) AND (w.organization_id = get_user_organization(auth.uid())) AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role))))));
CREATE POLICY "Users can view samples for webhooks in their organization" ON public.webhook_sample_requests AS PERMISSIVE FOR SELECT TO public
  USING ((EXISTS ( SELECT 1
   FROM webhooks w
  WHERE ((w.id = webhook_sample_requests.webhook_id) AND (w.organization_id = get_user_organization(auth.uid()))))));
CREATE POLICY "Admins and managers can delete webhooks" ON public.webhooks AS PERMISSIVE FOR DELETE TO public
  USING (((organization_id = get_user_organization(auth.uid())) AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role))));
CREATE POLICY "Admins and managers can insert webhooks" ON public.webhooks AS PERMISSIVE FOR INSERT TO public
  WITH CHECK (((organization_id = get_user_organization(auth.uid())) AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role))));
CREATE POLICY "Admins and managers can update webhooks" ON public.webhooks AS PERMISSIVE FOR UPDATE TO public
  USING (((organization_id = get_user_organization(auth.uid())) AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role))));
CREATE POLICY "Users can view webhooks in their organization" ON public.webhooks AS PERMISSIVE FOR SELECT TO public
  USING ((organization_id = get_user_organization(auth.uid())));

-- REALTIME PUBLICATION
ALTER PUBLICATION supabase_realtime ADD TABLE public.cakto_orders;
ALTER PUBLICATION supabase_realtime ADD TABLE public.conversation_notes;
ALTER PUBLICATION supabase_realtime ADD TABLE public.lead_queue;
ALTER PUBLICATION supabase_realtime ADD TABLE public.lead_tag_assignments;
ALTER PUBLICATION supabase_realtime ADD TABLE public.leads;
ALTER PUBLICATION supabase_realtime ADD TABLE public.message_reactions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.scheduled_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.support_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.support_tickets;
ALTER PUBLICATION supabase_realtime ADD TABLE public.user_status;
ALTER PUBLICATION supabase_realtime ADD TABLE public.webchat_conversations;
ALTER PUBLICATION supabase_realtime ADD TABLE public.webchat_messages;
