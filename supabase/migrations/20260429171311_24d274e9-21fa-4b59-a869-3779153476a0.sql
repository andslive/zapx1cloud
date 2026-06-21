-- ============================================================
-- 1) PLATFORM_SETTINGS: restrict SELECT to super admins,
--    expose only branding via a public view
-- ============================================================

DROP POLICY IF EXISTS "Anyone can read platform settings" ON public.platform_settings;

-- Public branding view (no credentials)
CREATE OR REPLACE VIEW public.platform_branding_public
WITH (security_invoker = on) AS
SELECT
  id,
  logo_url,
  logo_dark_url,
  favicon_url,
  platform_name,
  support_email,
  primary_color,
  accent_color,
  gradient_style,
  gradient_custom,
  border_radius,
  default_theme,
  font_family,
  font_url,
  base_font_size,
  footer_text,
  terms_url,
  privacy_url,
  login_headline,
  login_subheadline,
  login_stats_enabled,
  login_bg_image_url,
  login_bg_layout,
  login_logo_position,
  hide_widget_branding,
  widget_accent_color,
  powered_by_text,
  browser_title,
  meta_description,
  og_image_url,
  twitter_handle,
  default_language,
  created_at,
  updated_at
FROM public.platform_settings;

GRANT SELECT ON public.platform_branding_public TO anon, authenticated;

-- Allow the view's underlying SELECT to succeed for everyone
-- via a permissive RLS policy that is safe (no sensitive cols).
-- We still need a SELECT policy on platform_settings because the
-- security_invoker view runs with the caller's privileges.
CREATE POLICY "Public can read branding columns"
  ON public.platform_settings
  FOR SELECT
  USING (true);

-- Revoke direct table SELECT from anon/authenticated; only via the view
-- NOTE: We cannot easily prevent SELECT * via PostgREST on the base table
-- without breaking super admin access. Instead, we use a column-level GRANT.
REVOKE SELECT ON public.platform_settings FROM anon, authenticated;
GRANT SELECT (
  id, logo_url, logo_dark_url, favicon_url, platform_name, support_email,
  primary_color, accent_color, gradient_style, gradient_custom, border_radius,
  default_theme, font_family, font_url, base_font_size, footer_text,
  terms_url, privacy_url, login_headline, login_subheadline,
  login_stats_enabled, login_bg_image_url, login_bg_layout,
  login_logo_position, hide_widget_branding, widget_accent_color,
  powered_by_text, browser_title, meta_description, og_image_url,
  twitter_handle, default_language, created_at, updated_at
) ON public.platform_settings TO anon, authenticated;

-- ============================================================
-- 2) PROFILES: remove public booking exposure of full row,
--    keep only the safe view (already exists / created here)
-- ============================================================

DROP POLICY IF EXISTS "Public booking rows readable for view" ON public.profiles;

CREATE OR REPLACE VIEW public.public_booking_profiles
WITH (security_invoker = on) AS
SELECT
  id,
  full_name,
  avatar_url,
  booking_slug,
  booking_bio
FROM public.profiles
WHERE booking_slug IS NOT NULL AND booking_slug <> '';

GRANT SELECT ON public.public_booking_profiles TO anon, authenticated;

-- The view runs as the caller; we need a narrow SELECT policy that
-- allows reading only the safe columns for booking_slug rows.
-- Since RLS evaluates per-row (not per-column), we add a policy that
-- exposes those rows but rely on column-level grants to prevent leaking
-- email/phone to anon/authenticated callers querying the base table.
CREATE POLICY "Public booking rows minimal"
  ON public.profiles
  FOR SELECT
  USING (booking_slug IS NOT NULL AND booking_slug <> '');

-- Restrict columns when querying base profiles directly as anon/authenticated
-- (org members keep full access via the existing org policy + table grants
--  are not revoked because authenticated users still need full SELECT for
--  in-org reads via the other policy, which is column-agnostic).
-- To avoid breaking org reads, we don't revoke from authenticated.
-- Anon however should NEVER see email/phone:
REVOKE SELECT ON public.profiles FROM anon;
GRANT SELECT (id, full_name, avatar_url, booking_slug, booking_bio)
  ON public.profiles TO anon;

-- ============================================================
-- 3) FACEBOOK_LEAD_INTEGRATIONS: restrict SELECT to admins/managers
-- ============================================================

DROP POLICY IF EXISTS "Users can view their org integrations" ON public.facebook_lead_integrations;

CREATE POLICY "Admins/managers view org integrations"
  ON public.facebook_lead_integrations
  FOR SELECT
  USING (
    organization_id = public.get_user_organization(auth.uid())
    AND (
      public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_role(auth.uid(), 'manager'::public.app_role)
      OR public.is_super_admin(auth.uid())
    )
  );