-- Add policy to allow users to view their own profile
CREATE POLICY "Users can view their own profile" 
ON public.profiles 
FOR SELECT 
USING (auth.uid() = id);

-- Ensure user has both admin and super_admin roles for maximum compatibility
INSERT INTO public.user_roles (user_id, role)
VALUES ('06f5b16f-988e-41bf-b515-9ad299e6dda3', 'super_admin')
ON CONFLICT (user_id, role) DO NOTHING;

INSERT INTO public.user_roles (user_id, role)
VALUES ('06f5b16f-988e-41bf-b515-9ad299e6dda3', 'admin')
ON CONFLICT (user_id, role) DO NOTHING;
