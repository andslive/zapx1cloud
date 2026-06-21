-- ============================================================
-- 05_triggers_and_views.sql
-- ============================================================

-- TRIGGERS
CREATE TRIGGER trg_post_sale_scenarios_updated_at BEFORE UPDATE ON public.agent_post_sale_scenarios FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER agent_routing_rules_updated_at BEFORE UPDATE ON public.agent_routing_rules FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_agent_safety_limits_updated_at BEFORE UPDATE ON public.agent_safety_limits FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER agent_specialists_updated_at BEFORE UPDATE ON public.agent_specialists FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_agent_training_materials_updated_at BEFORE UPDATE ON public.agent_training_materials FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_ai_knowledge_base_updated_at BEFORE UPDATE ON public.ai_knowledge_base FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER ai_experiments_updated_at BEFORE UPDATE ON public.ai_prompt_experiments FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER ai_variants_updated_at BEFORE UPDATE ON public.ai_prompt_variants FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_auto_notification_settings_updated_at BEFORE UPDATE ON public.auto_notification_settings FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_booking_event_types_updated_at BEFORE UPDATE ON public.booking_event_types FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trg_protect_booking_public_updates BEFORE UPDATE ON public.booking_requests FOR EACH ROW EXECUTE FUNCTION protect_booking_public_updates();
CREATE TRIGGER update_business_hours_updated_at BEFORE UPDATE ON public.business_hours FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_cadence_templates_updated_at BEFORE UPDATE ON public.cadence_templates FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER cakto_credentials_updated_at BEFORE UPDATE ON public.cakto_credentials FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER cakto_orders_updated_at BEFORE UPDATE ON public.cakto_orders FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER cakto_recovery_config_updated_at BEFORE UPDATE ON public.cakto_recovery_config FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_calendar_events_updated_at BEFORE UPDATE ON public.calendar_events FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_capture_funnels_updated_at BEFORE UPDATE ON public.capture_funnels FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_chat_flows_updated_at BEFORE UPDATE ON public.chat_flows FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_commission_rules_updated_at BEFORE UPDATE ON public.commission_rules FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_custom_fields_updated_at BEFORE UPDATE ON public.custom_fields FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_deals_updated_at BEFORE UPDATE ON public.deals FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_distribution_config_updated_at BEFORE UPDATE ON public.distribution_config FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_email_templates_updated_at BEFORE UPDATE ON public.email_templates FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_evolution_instances_updated_at BEFORE UPDATE ON public.evolution_instances FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_facebook_lead_integrations_updated_at BEFORE UPDATE ON public.facebook_lead_integrations FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_form_templates_updated_at BEFORE UPDATE ON public.form_templates FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_forms_updated_at BEFORE UPDATE ON public.forms FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_google_calendar_connections_updated_at BEFORE UPDATE ON public.google_calendar_connections FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_help_articles_updated_at BEFORE UPDATE ON public.help_articles FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_help_categories_updated_at BEFORE UPDATE ON public.help_categories FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trg_hotmart_credentials_updated_at BEFORE UPDATE ON public.hotmart_credentials FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trg_hotmart_orders_updated_at BEFORE UPDATE ON public.hotmart_orders FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trg_hotmart_product_mapping_updated_at BEFORE UPDATE ON public.hotmart_product_mapping FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_integration_settings_updated_at BEFORE UPDATE ON public.integration_settings FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_lead_tags_updated_at BEFORE UPDATE ON public.lead_tags FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER leads_assignee_change AFTER UPDATE OF assigned_to ON public.leads FOR EACH ROW EXECUTE FUNCTION sync_active_leads_count();
CREATE TRIGGER leads_assignee_insert AFTER INSERT ON public.leads FOR EACH ROW WHEN ((new.assigned_to IS NOT NULL)) EXECUTE FUNCTION sync_active_leads_count();
CREATE TRIGGER update_leads_updated_at BEFORE UPDATE ON public.leads FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_materials_updated_at BEFORE UPDATE ON public.materials FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_objections_updated_at BEFORE UPDATE ON public.objections FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_org_ai_credentials_updated_at BEFORE UPDATE ON public.org_ai_credentials FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_org_ai_routing_updated_at BEFORE UPDATE ON public.org_ai_routing FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_org_orchestrator_config_updated_at BEFORE UPDATE ON public.organization_orchestrator_config FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trg_ensure_org_owner_is_admin AFTER INSERT OR UPDATE OF owner_id ON public.organizations FOR EACH ROW EXECUTE FUNCTION ensure_org_owner_is_admin();
CREATE TRIGGER update_organizations_updated_at BEFORE UPDATE ON public.organizations FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER payment_links_updated_at BEFORE UPDATE ON public.payment_links FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_platform_email_settings_updated_at BEFORE UPDATE ON public.platform_email_settings FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_platform_email_templates_updated_at BEFORE UPDATE ON public.platform_email_templates FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_platform_plans_updated_at BEFORE UPDATE ON public.platform_plans FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_platform_releases_updated_at BEFORE UPDATE ON public.platform_releases FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_platform_settings_updated_at BEFORE UPDATE ON public.platform_settings FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_post_sale_event_actions_updated_at BEFORE UPDATE ON public.post_sale_event_actions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_product_agents_updated_at BEFORE UPDATE ON public.product_agents FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER product_catalog_items_search_vector_trigger BEFORE INSERT OR UPDATE ON public.product_catalog_items FOR EACH ROW EXECUTE FUNCTION update_catalog_search_vector();
CREATE TRIGGER update_product_ctas_updated_at BEFORE UPDATE ON public.product_ctas FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_product_knowledge_sources_updated_at BEFORE UPDATE ON public.product_knowledge_sources FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trg_product_offers_updated BEFORE UPDATE ON public.product_offers FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_product_onboarding_state_updated_at BEFORE UPDATE ON public.product_onboarding_state FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trg_product_suites_updated BEFORE UPDATE ON public.product_suites FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_product_training_videos_updated_at BEFORE UPDATE ON public.product_training_videos FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_products_updated_at BEFORE UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trg_ensure_first_user_is_admin AFTER INSERT OR UPDATE OF organization_id ON public.profiles FOR EACH ROW EXECUTE FUNCTION ensure_first_user_is_admin();
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_sales_goals_updated_at BEFORE UPDATE ON public.sales_goals FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_sales_squads_updated_at BEFORE UPDATE ON public.sales_squads FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trg_validate_scheduled_message_status BEFORE INSERT OR UPDATE ON public.scheduled_messages FOR EACH ROW EXECUTE FUNCTION validate_scheduled_message_status();
CREATE TRIGGER update_sectors_updated_at BEFORE UPDATE ON public.sectors FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_stage_values_updated_at BEFORE UPDATE ON public.stage_values FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_subscriptions_updated_at BEFORE UPDATE ON public.subscriptions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trg_support_message_updates_ticket AFTER INSERT ON public.support_messages FOR EACH ROW EXECUTE FUNCTION update_ticket_on_new_message();
CREATE TRIGGER update_support_tickets_updated_at BEFORE UPDATE ON public.support_tickets FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_tag_automations_updated_at BEFORE UPDATE ON public.tag_automations FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_tasks_updated_at BEFORE UPDATE ON public.tasks FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_user_notification_settings_updated_at BEFORE UPDATE ON public.user_notification_settings FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_user_status_updated_at BEFORE UPDATE ON public.user_status FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_webchat_agent_configs_updated_at BEFORE UPDATE ON public.webchat_agent_configs FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trg_enforce_single_attendant BEFORE UPDATE OF assigned_user_id, current_agent_id ON public.webchat_conversations FOR EACH ROW EXECUTE FUNCTION enforce_single_attendant();
CREATE TRIGGER trg_fill_default_sector BEFORE INSERT ON public.webchat_conversations FOR EACH ROW EXECUTE FUNCTION fill_default_sector();
CREATE TRIGGER update_webchat_conversations_updated_at BEFORE UPDATE ON public.webchat_conversations FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_webchat_widgets_updated_at BEFORE UPDATE ON public.webchat_widgets FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_webhooks_updated_at BEFORE UPDATE ON public.webhooks FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- VIEWS
CREATE OR REPLACE VIEW public.platform_branding_public AS

CREATE OR REPLACE VIEW public.public_booking_profiles AS

CREATE OR REPLACE VIEW public.v_agent_quality_30d AS

