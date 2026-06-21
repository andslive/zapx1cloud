-- Reverter granularidade de coluna que pode quebrar admins legítimos
GRANT SELECT ON public.platform_settings TO authenticated;
-- anon segue sem SELECT direto
REVOKE SELECT ON public.platform_settings FROM anon;

-- Remover policy permissiva criada antes
DROP POLICY IF EXISTS "Public can read branding columns" ON public.platform_settings;

-- Recriar a view com SECURITY DEFINER (bypassa RLS) para servir branding público
DROP VIEW IF EXISTS public.platform_branding_public;

CREATE VIEW public.platform_branding_public AS
SELECT
  id, logo_url, logo_dark_url, favicon_url, platform_name, support_email,
  primary_color, accent_color, gradient_style, gradient_custom, border_radius,
  default_theme, font_family, font_url, base_font_size, footer_text,
  terms_url, privacy_url, login_headline, login_subheadline,
  login_stats_enabled, login_bg_image_url, login_bg_layout,
  login_logo_position, hide_widget_branding, widget_accent_color,
  powered_by_text, browser_title, meta_description, og_image_url,
  twitter_handle, default_language, created_at, updated_at
FROM public.platform_settings;

-- View criada por postgres é dona; ela bypassa RLS por padrão
ALTER VIEW public.platform_branding_public OWNER TO postgres;
GRANT SELECT ON public.platform_branding_public TO anon, authenticated;

-- Garantir que SELECT direto na tabela só funcione para super admin
-- (a policy "Super admins can manage platform settings" já cobre ALL)
-- Authenticated users sem role super_admin não verão linhas via RLS.

-- ============================================================
-- Profiles: refazer view pública com SECURITY DEFINER também
-- ============================================================
DROP POLICY IF EXISTS "Public booking rows minimal" ON public.profiles;

-- Restaurar grants normais
GRANT SELECT ON public.profiles TO anon;

DROP VIEW IF EXISTS public.public_booking_profiles;

CREATE VIEW public.public_booking_profiles AS
SELECT id, full_name, avatar_url, booking_slug, booking_bio
FROM public.profiles
WHERE booking_slug IS NOT NULL AND booking_slug <> '';

ALTER VIEW public.public_booking_profiles OWNER TO postgres;
GRANT SELECT ON public.public_booking_profiles TO anon, authenticated;

-- Anon não deve ler a tabela profiles diretamente (sem policy permissiva = sem acesso)
REVOKE SELECT ON public.profiles FROM anon;