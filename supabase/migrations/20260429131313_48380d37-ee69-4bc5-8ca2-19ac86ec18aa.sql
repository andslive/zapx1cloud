-- Garantir que cada usuário sempre consiga ler suas próprias roles,
-- independente do estado do profile/RLS. Isso previne que admins percam acesso
-- caso a policy baseada em profiles+EXISTS falhe por qualquer motivo.

DROP POLICY IF EXISTS "Users can view their own roles" ON public.user_roles;
CREATE POLICY "Users can view their own roles"
  ON public.user_roles
  FOR SELECT
  USING (user_id = auth.uid());

-- Manter também a policy original de visualização por organização (já existe).
-- Apenas garantimos que a leitura própria nunca seja bloqueada.
