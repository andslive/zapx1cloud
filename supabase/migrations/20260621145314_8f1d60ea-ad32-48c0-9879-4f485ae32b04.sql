-- Branding cleanup: redefine mark_default_password_changed to drop hardcoded
-- vendus emails. New behavior: flip default_password_changed=true whenever the
-- super_admin user changes their password (no email comparison).

CREATE OR REPLACE FUNCTION public.mark_default_password_changed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only react when the password actually changed
  IF OLD.encrypted_password IS DISTINCT FROM NEW.encrypted_password
     AND EXISTS (
       SELECT 1 FROM public.user_roles
       WHERE user_id = NEW.id
         AND role = 'super_admin'::public.app_role
     ) THEN

    IF EXISTS (SELECT 1 FROM public.platform_settings) THEN
      UPDATE public.platform_settings
      SET default_password_changed = true,
          updated_at = now()
      WHERE COALESCE(default_password_changed, false) = false;
    ELSE
      INSERT INTO public.platform_settings (default_password_changed)
      VALUES (true);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;