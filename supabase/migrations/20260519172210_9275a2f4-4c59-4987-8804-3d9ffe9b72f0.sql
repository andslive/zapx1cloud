-- Add per-channel appearance configuration to capture_funnels
ALTER TABLE public.capture_funnels
  ADD COLUMN IF NOT EXISTS appearance jsonb;

-- Backfill existing rows: copy current `theme` to all four channels with sensible defaults for extras
UPDATE public.capture_funnels
SET appearance = jsonb_build_object(
  'chat', jsonb_build_object(
    'primary_color', COALESCE(theme->>'primary_color', '#3B82F6'),
    'secondary_color', COALESCE(theme->>'primary_color', '#3B82F6'),
    'background_color', COALESCE(theme->>'background_color', '#F8FAFC'),
    'text_color', COALESCE(theme->>'text_color', '#0F172A'),
    'background_image_url', NULL,
    'background_image_mode', 'cover',
    'background_image_opacity', 0.15,
    'font_family', COALESCE(theme->>'font_family', 'Inter'),
    'font_size_base', 14,
    'density', 'cozy',
    'border_radius', 16,
    'shadow', 'soft',
    'animations', 'subtle',
    'dark_mode', 'light',
    'custom_css', '',
    'logo_url', theme->>'logo_url',
    'logo_position', 'left',
    'avatar_enabled', true,
    'avatar_url', NULL,
    'avatar_shape', 'circle',
    'bot_name', 'Assistente',
    'show_online_status', true,
    'channel_options', jsonb_build_object(
      'bubble_style', 'rounded',
      'bot_bubble_color', COALESCE(theme->>'primary_color', '#3B82F6'),
      'user_bubble_color', '#E2E8F0',
      'show_typing', true,
      'header_gradient', true,
      'input_placeholder', 'Mensagem',
      'notification_sound', false
    )
  ),
  'form', jsonb_build_object(
    'primary_color', COALESCE(theme->>'primary_color', '#3B82F6'),
    'secondary_color', COALESCE(theme->>'primary_color', '#3B82F6'),
    'background_color', COALESCE(theme->>'background_color', '#FFFFFF'),
    'text_color', COALESCE(theme->>'text_color', '#0F172A'),
    'background_image_url', NULL,
    'background_image_mode', 'cover',
    'background_image_opacity', 0.15,
    'font_family', COALESCE(theme->>'font_family', 'Inter'),
    'font_size_base', 16,
    'density', 'spacious',
    'border_radius', 12,
    'shadow', 'medium',
    'animations', 'subtle',
    'dark_mode', 'light',
    'custom_css', '',
    'logo_url', theme->>'logo_url',
    'logo_position', 'center',
    'avatar_enabled', false,
    'avatar_url', NULL,
    'avatar_shape', 'circle',
    'bot_name', '',
    'show_online_status', false,
    'channel_options', jsonb_build_object(
      'layout', 'step',
      'max_width', 640,
      'alignment', 'center',
      'input_style', 'outlined',
      'button_style', 'filled',
      'show_progress', true,
      'side_image_url', NULL
    )
  ),
  'widget', jsonb_build_object(
    'primary_color', COALESCE(theme->>'primary_color', '#3B82F6'),
    'secondary_color', COALESCE(theme->>'primary_color', '#3B82F6'),
    'background_color', '#FFFFFF',
    'text_color', '#0F172A',
    'background_image_url', NULL,
    'background_image_mode', 'cover',
    'background_image_opacity', 0.15,
    'font_family', COALESCE(theme->>'font_family', 'Inter'),
    'font_size_base', 14,
    'density', 'cozy',
    'border_radius', 18,
    'shadow', 'strong',
    'animations', 'full',
    'dark_mode', 'light',
    'custom_css', '',
    'logo_url', theme->>'logo_url',
    'logo_position', 'left',
    'avatar_enabled', true,
    'avatar_url', NULL,
    'avatar_shape', 'circle',
    'bot_name', 'Atendimento',
    'show_online_status', true,
    'channel_options', jsonb_build_object(
      'position', 'bottom-right',
      'fab_size', 'md',
      'fab_icon', 'message-circle',
      'callout_text', 'Posso ajudar?',
      'auto_open_delay', 0,
      'show_notification_badge', true,
      'hide_on_mobile', false
    )
  ),
  'quiz', jsonb_build_object(
    'primary_color', COALESCE(theme->>'primary_color', '#3B82F6'),
    'secondary_color', COALESCE(theme->>'primary_color', '#3B82F6'),
    'background_color', COALESCE(theme->>'background_color', '#0F172A'),
    'text_color', COALESCE(theme->>'text_color', '#FFFFFF'),
    'background_image_url', NULL,
    'background_image_mode', 'cover',
    'background_image_opacity', 0.25,
    'font_family', COALESCE(theme->>'font_family', 'Inter'),
    'font_size_base', 16,
    'density', 'spacious',
    'border_radius', 20,
    'shadow', 'medium',
    'animations', 'full',
    'dark_mode', 'dark',
    'custom_css', '',
    'logo_url', theme->>'logo_url',
    'logo_position', 'center',
    'avatar_enabled', false,
    'avatar_url', NULL,
    'avatar_shape', 'circle',
    'bot_name', '',
    'show_online_status', false,
    'channel_options', jsonb_build_object(
      'layout', 'cards',
      'option_columns', 2,
      'show_counter', true,
      'transition', 'slide',
      'result_image_url', NULL,
      'result_message', 'Obrigado pela participação!'
    )
  )
)
WHERE appearance IS NULL;

-- Set default for future rows (uses the same structure but with neutral fallbacks)
ALTER TABLE public.capture_funnels
  ALTER COLUMN appearance SET DEFAULT jsonb_build_object(
    'chat', jsonb_build_object(
      'primary_color', '#3B82F6', 'secondary_color', '#3B82F6',
      'background_color', '#F8FAFC', 'text_color', '#0F172A',
      'background_image_url', NULL, 'background_image_mode', 'cover', 'background_image_opacity', 0.15,
      'font_family', 'Inter', 'font_size_base', 14, 'density', 'cozy',
      'border_radius', 16, 'shadow', 'soft', 'animations', 'subtle', 'dark_mode', 'light', 'custom_css', '',
      'logo_url', NULL, 'logo_position', 'left',
      'avatar_enabled', true, 'avatar_url', NULL, 'avatar_shape', 'circle',
      'bot_name', 'Assistente', 'show_online_status', true,
      'channel_options', jsonb_build_object('bubble_style','rounded','bot_bubble_color','#3B82F6','user_bubble_color','#E2E8F0','show_typing',true,'header_gradient',true,'input_placeholder','Mensagem','notification_sound',false)
    ),
    'form', jsonb_build_object(
      'primary_color', '#3B82F6', 'secondary_color', '#3B82F6',
      'background_color', '#FFFFFF', 'text_color', '#0F172A',
      'background_image_url', NULL, 'background_image_mode', 'cover', 'background_image_opacity', 0.15,
      'font_family', 'Inter', 'font_size_base', 16, 'density', 'spacious',
      'border_radius', 12, 'shadow', 'medium', 'animations', 'subtle', 'dark_mode', 'light', 'custom_css', '',
      'logo_url', NULL, 'logo_position', 'center',
      'avatar_enabled', false, 'avatar_url', NULL, 'avatar_shape', 'circle',
      'bot_name', '', 'show_online_status', false,
      'channel_options', jsonb_build_object('layout','step','max_width',640,'alignment','center','input_style','outlined','button_style','filled','show_progress',true,'side_image_url',NULL)
    ),
    'widget', jsonb_build_object(
      'primary_color', '#3B82F6', 'secondary_color', '#3B82F6',
      'background_color', '#FFFFFF', 'text_color', '#0F172A',
      'background_image_url', NULL, 'background_image_mode', 'cover', 'background_image_opacity', 0.15,
      'font_family', 'Inter', 'font_size_base', 14, 'density', 'cozy',
      'border_radius', 18, 'shadow', 'strong', 'animations', 'full', 'dark_mode', 'light', 'custom_css', '',
      'logo_url', NULL, 'logo_position', 'left',
      'avatar_enabled', true, 'avatar_url', NULL, 'avatar_shape', 'circle',
      'bot_name', 'Atendimento', 'show_online_status', true,
      'channel_options', jsonb_build_object('position','bottom-right','fab_size','md','fab_icon','message-circle','callout_text','Posso ajudar?','auto_open_delay',0,'show_notification_badge',true,'hide_on_mobile',false)
    ),
    'quiz', jsonb_build_object(
      'primary_color', '#3B82F6', 'secondary_color', '#3B82F6',
      'background_color', '#0F172A', 'text_color', '#FFFFFF',
      'background_image_url', NULL, 'background_image_mode', 'cover', 'background_image_opacity', 0.25,
      'font_family', 'Inter', 'font_size_base', 16, 'density', 'spacious',
      'border_radius', 20, 'shadow', 'medium', 'animations', 'full', 'dark_mode', 'dark', 'custom_css', '',
      'logo_url', NULL, 'logo_position', 'center',
      'avatar_enabled', false, 'avatar_url', NULL, 'avatar_shape', 'circle',
      'bot_name', '', 'show_online_status', false,
      'channel_options', jsonb_build_object('layout','cards','option_columns',2,'show_counter',true,'transition','slide','result_image_url',NULL,'result_message','Obrigado pela participação!')
    )
  );

-- Create public storage bucket for funnel assets (logos, avatars, backgrounds) if missing
INSERT INTO storage.buckets (id, name, public)
VALUES ('funnel-assets', 'funnel-assets', true)
ON CONFLICT (id) DO NOTHING;

-- Public read for funnel-assets bucket
DO $$ BEGIN
  CREATE POLICY "funnel_assets_public_read"
    ON storage.objects FOR SELECT
    USING (bucket_id = 'funnel-assets');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Authenticated users can upload to funnel-assets within their org folder (org_id is first segment)
DO $$ BEGIN
  CREATE POLICY "funnel_assets_auth_insert"
    ON storage.objects FOR INSERT TO authenticated
    WITH CHECK (bucket_id = 'funnel-assets');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "funnel_assets_auth_update"
    ON storage.objects FOR UPDATE TO authenticated
    USING (bucket_id = 'funnel-assets');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "funnel_assets_auth_delete"
    ON storage.objects FOR DELETE TO authenticated
    USING (bucket_id = 'funnel-assets');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;