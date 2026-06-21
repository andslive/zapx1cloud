-- Criar bucket público para assets da plataforma
INSERT INTO storage.buckets (id, name, public)
VALUES ('platform-assets', 'platform-assets', true)
ON CONFLICT (id) DO NOTHING;

-- Política: Super admins podem gerenciar platform assets
CREATE POLICY "Super admins can manage platform assets"
ON storage.objects FOR ALL
USING (bucket_id = 'platform-assets' AND public.is_super_admin(auth.uid()))
WITH CHECK (bucket_id = 'platform-assets' AND public.is_super_admin(auth.uid()));

-- Política: Todos podem visualizar (público)
CREATE POLICY "Anyone can view platform assets"
ON storage.objects FOR SELECT
USING (bucket_id = 'platform-assets');