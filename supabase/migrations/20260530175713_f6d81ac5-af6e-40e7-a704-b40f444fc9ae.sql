-- Recreate views with security_invoker = true
DROP VIEW IF EXISTS public.platform_branding_public;
CREATE VIEW public.platform_branding_public WITH (security_invoker = true) AS
SELECT id, logo_url, logo_dark_url, favicon_url, platform_name, support_email, primary_color, accent_color, gradient_style, gradient_custom, border_radius, default_theme, font_family, font_url, base_font_size, footer_text, terms_url, privacy_url, login_headline, login_subheadline, login_stats_enabled, login_bg_image_url, login_bg_layout, login_logo_position, hide_widget_branding, widget_accent_color, powered_by_text, browser_title, meta_description, og_image_url, twitter_handle, default_language, created_at, updated_at
FROM public.platform_settings;

DROP VIEW IF EXISTS public.public_booking_profiles;
CREATE VIEW public.public_booking_profiles WITH (security_invoker = true) AS
SELECT id, full_name, avatar_url, booking_slug, booking_bio
FROM public.profiles
WHERE ((booking_slug IS NOT NULL) AND (booking_slug <> ''::text));

DROP VIEW IF EXISTS public.v_agent_quality_30d;
CREATE VIEW public.v_agent_quality_30d WITH (security_invoker = true) AS
SELECT organization_id, agent_id, (count(*))::integer AS evaluations, round(avg(score_overall), 2) AS avg_overall, round(avg(score_clarity), 2) AS avg_clarity, round(avg(score_tone), 2) AS avg_tone, round(avg(score_objectivity), 2) AS avg_objectivity, round(avg(score_accuracy), 2) AS avg_accuracy, round(avg(score_conversion_potential), 2) AS avg_conversion_potential
FROM public.ai_quality_evaluations
WHERE (created_at >= (now() - '30 days'::interval))
GROUP BY organization_id, agent_id;

-- Grant permissions back
GRANT SELECT ON public.platform_branding_public TO anon, authenticated;
GRANT SELECT ON public.public_booking_profiles TO anon, authenticated;
GRANT SELECT ON public.v_agent_quality_30d TO authenticated;

-- Set search_path for SECURITY DEFINER functions
 ALTER FUNCTION public.booking_log_status_change() SET search_path = public;
 ALTER FUNCTION public.increment_form_submissions_count(p_form_id uuid) SET search_path = public;
 ALTER FUNCTION public.increment_form_views(p_form_id uuid) SET search_path = public;
 ALTER FUNCTION public.enforce_single_attendant() SET search_path = public;
 ALTER FUNCTION public.create_product_tag_package(p_organization_id uuid, p_product_id uuid, p_product_label text) SET search_path = public;
 ALTER FUNCTION public.increment_webhook_requests(p_webhook_id uuid) SET search_path = public;
 ALTER FUNCTION public.mark_super_admin_password_changed() SET search_path = public;
 ALTER FUNCTION public.protect_booking_public_updates() SET search_path = public;
 ALTER FUNCTION public.search_lead_memory(p_lead_id uuid, p_query_embedding vector, p_match_count integer, p_min_similarity numeric) SET search_path = public;
 ALTER FUNCTION public.delete_product_safe(p_product_id uuid) SET search_path = public;
 ALTER FUNCTION public.accept_invitation(invitation_token text, user_id uuid) SET search_path = public;
 ALTER FUNCTION public.move_to_dlq(source_queue text, dlq_name text, message_id bigint, payload jsonb) SET search_path = public;
 ALTER FUNCTION public.try_acquire_conversation_lock(p_conv uuid, p_ttl_ms integer) SET search_path = public;
 ALTER FUNCTION public.search_catalog_smart(p_organization_id uuid, p_product_id uuid, p_query text, p_price_min numeric, p_price_max numeric, p_tags text[], p_attribute_filters jsonb, p_limit integer) SET search_path = public;
 ALTER FUNCTION public.remove_lifecycle_tags_on_event(p_lead_id uuid, p_event_type text, p_product_id uuid, p_organization_id uuid) SET search_path = public;
 ALTER FUNCTION public.ensure_first_user_is_admin() SET search_path = public;
 ALTER FUNCTION public.sync_active_leads_count() SET search_path = public;
 ALTER FUNCTION public.mark_default_password_changed() SET search_path = public;
 ALTER FUNCTION public.delete_team_member(p_user_id uuid) SET search_path = public;
 ALTER FUNCTION public.delete_email(queue_name text, message_id bigint) SET search_path = public;
 ALTER FUNCTION public.record_variant_score(p_variant_id uuid, p_score numeric) SET search_path = public;
 ALTER FUNCTION public.is_super_admin(_user_id uuid) SET search_path = public;
 ALTER FUNCTION public.pick_prompt_variant(p_experiment_id uuid, p_seed text) SET search_path = public;
 ALTER FUNCTION public.is_within_business_hours(p_org_id uuid) SET search_path = public;
 ALTER FUNCTION public.reset_monthly_webhook_requests() SET search_path = public;
 ALTER FUNCTION public.user_sector_ids(_user_id uuid) SET search_path = public;
 ALTER FUNCTION public.has_sector_access(_user_id uuid, _sector_id uuid) SET search_path = public;
 ALTER FUNCTION public.user_in_sector_organization(_user_id uuid, _sector_id uuid) SET search_path = public;
 ALTER FUNCTION public.increment_funnel_views(p_funnel_id uuid, p_channel text) SET search_path = public;
 ALTER FUNCTION public.update_ticket_on_new_message() SET search_path = public;
 ALTER FUNCTION public.fill_default_sector() SET search_path = public;
 ALTER FUNCTION public.inbox_count_conversations(p_user_id uuid, p_product_ids uuid[], p_include_no_product boolean, p_sector_ids uuid[], p_include_no_sector boolean, p_assigned_user_ids uuid[], p_include_unassigned boolean, p_tag_ids uuid[], p_channel text, p_search text) SET search_path = public;
 ALTER FUNCTION public.initialize_user_permissions(p_user_id uuid, p_organization_id uuid, p_role text) SET search_path = public;
 ALTER FUNCTION public.delete_lead_cascade(_lead_ids uuid[]) SET search_path = public;
 ALTER FUNCTION public.is_system_initialized() SET search_path = public;
 ALTER FUNCTION public.inbox_list_conversations(p_user_id uuid, p_tab text, p_product_ids uuid[], p_include_no_product boolean, p_sector_ids uuid[], p_include_no_sector boolean, p_assigned_user_ids uuid[], p_include_unassigned boolean, p_tag_ids uuid[], p_channel text, p_search text, p_cursor_last_message_at timestamp with time zone, p_limit integer) SET search_path = public;
 ALTER FUNCTION public.claim_first_super_admin() SET search_path = public;
 ALTER FUNCTION public.get_product_performance(p_org_id uuid, p_from timestamp with time zone, p_to timestamp with time zone) SET search_path = public;
 ALTER FUNCTION public.has_role(_user_id uuid, _role app_role) SET search_path = public;
 ALTER FUNCTION public.handle_new_user() SET search_path = public;
 ALTER FUNCTION public.increment_funnel_leads(p_funnel_id uuid, p_channel text) SET search_path = public;
 ALTER FUNCTION public.read_email_batch(queue_name text, batch_size integer, vt integer) SET search_path = public;
 ALTER FUNCTION public.get_organization_effective_limits(p_org_id uuid) SET search_path = public;
 ALTER FUNCTION public.calculate_commission(p_deal_id uuid, p_deal_value numeric, p_product_id uuid, p_seller_id uuid, p_organization_id uuid) SET search_path = public;
 ALTER FUNCTION public.process_pending_queue(p_user_id uuid) SET search_path = public;
 ALTER FUNCTION public.apply_tag_automations(p_lead_id uuid, p_event_type text, p_product_id uuid, p_organization_id uuid) SET search_path = public;
 ALTER FUNCTION public.user_belongs_to_organization(_user_id uuid, _org_id uuid) SET search_path = public;
 ALTER FUNCTION public.release_bot_lock(p_conv uuid) SET search_path = public;
 ALTER FUNCTION public.get_booking_by_token(p_token text) SET search_path = public;
 ALTER FUNCTION public.evaluate_routing_rules(p_organization_id uuid, p_lead_id uuid, p_stage_id uuid, p_tag_ids uuid[], p_product_id uuid, p_channel text, p_event text, p_deal_value numeric) SET search_path = public;
 ALTER FUNCTION public.enqueue_email(queue_name text, payload jsonb) SET search_path = public;
 ALTER FUNCTION public.get_user_organization(_user_id uuid) SET search_path = public;
 ALTER FUNCTION public.record_variant_impression(p_variant_id uuid) SET search_path = public;
 ALTER FUNCTION public.distribute_lead(p_lead_id uuid, p_squad_id uuid, p_organization_id uuid, p_product_id uuid) SET search_path = public;
 ALTER FUNCTION public.ensure_org_owner_is_admin() SET search_path = public;
 ALTER FUNCTION public.try_lock_bot(p_conv uuid, p_ttl_seconds integer) SET search_path = public;
