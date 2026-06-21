-- Permitir Super Admin atualizar roles de qualquer usuário
CREATE POLICY "Super admins can update all user roles"
ON public.user_roles FOR UPDATE
TO authenticated
USING (is_super_admin(auth.uid()))
WITH CHECK (is_super_admin(auth.uid()));

-- Permitir Super Admin deletar roles de qualquer usuário
CREATE POLICY "Super admins can delete all user roles"
ON public.user_roles FOR DELETE
TO authenticated
USING (is_super_admin(auth.uid()));

-- Permitir Super Admin inserir roles para qualquer usuário
CREATE POLICY "Super admins can insert all user roles"
ON public.user_roles FOR INSERT
TO authenticated
WITH CHECK (is_super_admin(auth.uid()));

-- Permitir Super Admin atualizar profiles (organization_id)
CREATE POLICY "Super admins can update all profiles"
ON public.profiles FOR UPDATE
TO authenticated
USING (is_super_admin(auth.uid()))
WITH CHECK (is_super_admin(auth.uid()));