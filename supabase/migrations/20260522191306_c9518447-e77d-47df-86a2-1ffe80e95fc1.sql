DO $$
DECLARE
  new_user_id UUID := gen_random_uuid();
BEGIN
  -- Insert into auth.users if not exists
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'anderson.nads@gmail.com') THEN
    INSERT INTO auth.users (
      id,
      instance_id,
      email,
      encrypted_password,
      email_confirmed_at,
      raw_app_meta_data,
      raw_user_meta_data,
      aud,
      role,
      created_at,
      updated_at,
      confirmation_token,
      recovery_token,
      email_change_token_new,
      email_change
    ) VALUES (
      new_user_id,
      '00000000-0000-0000-0000-000000000000',
      'anderson.nads@gmail.com',
      crypt('X1pix123*', gen_salt('bf')),
      now(),
      '{"provider":"email","providers":["email"]}',
      '{"full_name":"Anderson Nads"}',
      'authenticated',
      'authenticated',
      now(),
      now(),
      '',
      '',
      '',
      ''
    );

    -- Insert into auth.identities
    INSERT INTO auth.identities (
      id,
      user_id,
      identity_data,
      provider,
      provider_id,
      last_sign_in_at,
      created_at,
      updated_at
    ) VALUES (
      gen_random_uuid(),
      new_user_id,
      format('{"sub":"%s","email":"anderson.nads@gmail.com"}', new_user_id)::jsonb,
      'email',
      new_user_id::text,
      now(),
      now(),
      now()
    );

    -- Insert into public.profiles
    INSERT INTO public.profiles (id, email, full_name, is_active)
    VALUES (new_user_id, 'anderson.nads@gmail.com', 'Anderson Nads', true);

    -- Insert into public.user_roles
    INSERT INTO public.user_roles (user_id, role)
    VALUES (new_user_id, 'super_admin');
  ELSE
    -- If user exists, ensure they are super admin
    UPDATE public.user_roles 
    SET role = 'super_admin' 
    WHERE user_id = (SELECT id FROM auth.users WHERE email = 'anderson.nads@gmail.com');
    
    IF NOT FOUND THEN
      INSERT INTO public.user_roles (user_id, role)
      SELECT id, 'super_admin' FROM auth.users WHERE email = 'anderson.nads@gmail.com';
    END IF;
  END IF;
END $$;