CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, is_active)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    true
  )
  ON CONFLICT (id) DO UPDATE
    SET email = EXCLUDED.email,
        full_name = COALESCE(public.profiles.full_name, EXCLUDED.full_name);

  IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = NEW.id) THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'seller'::public.app_role)
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

INSERT INTO public.profiles (id, email, full_name, is_active)
SELECT
  u.id,
  u.email,
  COALESCE(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name', split_part(u.email, '@', 1)),
  true
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
WHERE p.id IS NULL
ON CONFLICT (id) DO NOTHING;

DO $seed$
DECLARE
  v_user_id uuid;
  v_email text := 'superadmin@vendus.com.br';
  v_password text := '@Mudarsenha#123';
BEGIN
  IF EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'super_admin'::public.app_role) THEN
    RETURN;
  END IF;

  SELECT id INTO v_user_id FROM auth.users WHERE email = v_email LIMIT 1;

  IF v_user_id IS NULL THEN
    v_user_id := gen_random_uuid();

    INSERT INTO auth.users (
      instance_id, id, aud, role, email,
      encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at, confirmation_token,
      email_change, email_change_token_new, recovery_token
    ) VALUES (
      '00000000-0000-0000-0000-000000000000',
      v_user_id, 'authenticated', 'authenticated', v_email,
      crypt(v_password, gen_salt('bf')), now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('full_name','Super Admin'),
      now(), now(), '', '', '', ''
    );

    INSERT INTO auth.identities (
      id, provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at
    ) VALUES (
      gen_random_uuid(), v_user_id, v_user_id,
      jsonb_build_object('sub', v_user_id::text, 'email', v_email, 'email_verified', true),
      'email', now(), now(), now()
    );
  END IF;

  INSERT INTO public.profiles (id, email, full_name, is_active)
  VALUES (v_user_id, v_email, 'Super Admin', true)
  ON CONFLICT (id) DO UPDATE
    SET email = EXCLUDED.email,
        full_name = COALESCE(public.profiles.full_name, EXCLUDED.full_name),
        is_active = true;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (v_user_id, 'super_admin'::public.app_role)
  ON CONFLICT DO NOTHING;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (v_user_id, 'admin'::public.app_role)
  ON CONFLICT DO NOTHING;
END
$seed$;

CREATE OR REPLACE FUNCTION public.mark_default_password_changed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.email IN ('superadmin@vendus.com.br','admin@vendus.com.br')
     AND OLD.encrypted_password IS DISTINCT FROM NEW.encrypted_password THEN

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

DROP TRIGGER IF EXISTS on_default_password_changed ON auth.users;
CREATE TRIGGER on_default_password_changed
AFTER UPDATE OF encrypted_password ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.mark_default_password_changed();

CREATE OR REPLACE FUNCTION public.mark_super_admin_password_changed()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'super_admin'::public.app_role) THEN
    RAISE EXCEPTION 'Only super_admin can mark password changed';
  END IF;

  UPDATE public.platform_settings
  SET default_password_changed = true,
      updated_at = now()
  WHERE COALESCE(default_password_changed, false) = false;

  IF NOT EXISTS (SELECT 1 FROM public.platform_settings) THEN
    INSERT INTO public.platform_settings (default_password_changed)
    VALUES (true);
  END IF;

  RETURN true;
END;
$$;

DO $bf$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN auth.users u ON u.id = ur.user_id
    WHERE ur.role = 'super_admin'::public.app_role
      AND u.email NOT IN ('superadmin@vendus.com.br','admin@vendus.com.br')
  ) THEN
    UPDATE public.platform_settings
    SET default_password_changed = true,
        updated_at = now()
    WHERE COALESCE(default_password_changed, false) = false;
  END IF;
END
$bf$;