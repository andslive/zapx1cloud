DO $$
DECLARE
  new_user_id UUID := gen_random_uuid();
  new_product_id UUID := gen_random_uuid();
  org_id UUID;
BEGIN
  -- Get the first organization ID
  SELECT id INTO org_id FROM public.organizations LIMIT 1;

  -- 1. Create user in auth.users
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'dudu.jua20@gmail.com') THEN
    INSERT INTO auth.users (
      id,
      instance_id,
      email,
      encrypted_password,
      email_confirmed_at,
      raw_app_meta_data,
      raw_user_meta_data,
      is_super_admin,
      role,
      aud
    )
    VALUES (
      new_user_id,
      '00000000-0000-0000-0000-000000000000',
      'dudu.jua20@gmail.com',
      crypt('X1pix1234*', gen_salt('bf')),
      now(),
      '{"provider":"email","providers":["email"]}',
      '{}',
      false,
      'authenticated',
      'authenticated'
    );

    -- 2. Create profile
    INSERT INTO public.profiles (id, organization_id, email, full_name)
    VALUES (new_user_id, org_id, 'dudu.jua20@gmail.com', 'Dudu Jua');

    -- 3. Assign admin role
    INSERT INTO public.user_roles (user_id, role)
    VALUES (new_user_id, 'admin');

    -- 4. Create product
    INSERT INTO public.products (
      id,
      organization_id,
      name,
      description,
      status,
      created_by
    )
    VALUES (
      new_product_id,
      org_id,
      'Produtoteste',
      'Produto de teste criado automaticamente',
      'published',
      new_user_id
    );

    -- 5. Link user to product
    INSERT INTO public.user_product_assignments (
      user_id,
      product_id,
      assigned_by
    )
    VALUES (
      new_user_id,
      new_product_id,
      new_user_id
    );
  END IF;
END $$;