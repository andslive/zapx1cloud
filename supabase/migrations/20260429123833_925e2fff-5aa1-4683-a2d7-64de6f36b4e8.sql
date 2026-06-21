-- Bucket público para logos de empresas (uploads pelo onboarding)
INSERT INTO storage.buckets (id, name, public)
VALUES ('company-logos', 'company-logos', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Leitura pública
DROP POLICY IF EXISTS "Anyone can view company logos" ON storage.objects;
CREATE POLICY "Anyone can view company logos"
ON storage.objects FOR SELECT
USING (bucket_id = 'company-logos');

-- INSERT: admin da própria org (path começa com organization_id)
DROP POLICY IF EXISTS "Org admins can upload company logos" ON storage.objects;
CREATE POLICY "Org admins can upload company logos"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'company-logos'
  AND public.has_role(auth.uid(), 'admin'::public.app_role)
  AND (storage.foldername(name))[1] = (
    SELECT organization_id::text FROM public.profiles WHERE id = auth.uid()
  )
);

-- UPDATE
DROP POLICY IF EXISTS "Org admins can update company logos" ON storage.objects;
CREATE POLICY "Org admins can update company logos"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'company-logos'
  AND public.has_role(auth.uid(), 'admin'::public.app_role)
  AND (storage.foldername(name))[1] = (
    SELECT organization_id::text FROM public.profiles WHERE id = auth.uid()
  )
);

-- DELETE
DROP POLICY IF EXISTS "Org admins can delete company logos" ON storage.objects;
CREATE POLICY "Org admins can delete company logos"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'company-logos'
  AND public.has_role(auth.uid(), 'admin'::public.app_role)
  AND (storage.foldername(name))[1] = (
    SELECT organization_id::text FROM public.profiles WHERE id = auth.uid()
  )
);