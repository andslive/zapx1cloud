
-- ========= STORAGE: org-folder scoping for catalog-media, chat-media, product-documents =========

-- Helper inline expression: (storage.foldername(name))[1] must equal caller's organization_id

-- ---------- catalog-media ----------
DROP POLICY IF EXISTS "catalog_media_auth_insert" ON storage.objects;
DROP POLICY IF EXISTS "catalog_media_auth_update" ON storage.objects;
DROP POLICY IF EXISTS "catalog_media_auth_delete" ON storage.objects;

CREATE POLICY "catalog_media_org_insert" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'catalog-media'
  AND (storage.foldername(name))[1] = (
    SELECT organization_id::text FROM public.profiles WHERE id = auth.uid()
  )
);

CREATE POLICY "catalog_media_org_update" ON storage.objects
FOR UPDATE TO authenticated
USING (
  bucket_id = 'catalog-media'
  AND (storage.foldername(name))[1] = (
    SELECT organization_id::text FROM public.profiles WHERE id = auth.uid()
  )
);

CREATE POLICY "catalog_media_org_delete" ON storage.objects
FOR DELETE TO authenticated
USING (
  bucket_id = 'catalog-media'
  AND (storage.foldername(name))[1] = (
    SELECT organization_id::text FROM public.profiles WHERE id = auth.uid()
  )
);

-- ---------- chat-media ----------
DROP POLICY IF EXISTS "chat-media authenticated upload" ON storage.objects;
DROP POLICY IF EXISTS "chat-media authenticated update" ON storage.objects;
DROP POLICY IF EXISTS "chat-media authenticated delete" ON storage.objects;

CREATE POLICY "chat_media_org_insert" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'chat-media'
  AND (storage.foldername(name))[1] = (
    SELECT organization_id::text FROM public.profiles WHERE id = auth.uid()
  )
);

CREATE POLICY "chat_media_org_update" ON storage.objects
FOR UPDATE TO authenticated
USING (
  bucket_id = 'chat-media'
  AND (storage.foldername(name))[1] = (
    SELECT organization_id::text FROM public.profiles WHERE id = auth.uid()
  )
);

CREATE POLICY "chat_media_org_delete" ON storage.objects
FOR DELETE TO authenticated
USING (
  bucket_id = 'chat-media'
  AND (storage.foldername(name))[1] = (
    SELECT organization_id::text FROM public.profiles WHERE id = auth.uid()
  )
);

-- ---------- product-documents ----------
DROP POLICY IF EXISTS "Users can upload product documents" ON storage.objects;
DROP POLICY IF EXISTS "Users can view their org product documents" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their org product documents" ON storage.objects;

CREATE POLICY "product_documents_org_select" ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'product-documents'
  AND (storage.foldername(name))[1] = (
    SELECT organization_id::text FROM public.profiles WHERE id = auth.uid()
  )
);

CREATE POLICY "product_documents_org_insert" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'product-documents'
  AND (storage.foldername(name))[1] = (
    SELECT organization_id::text FROM public.profiles WHERE id = auth.uid()
  )
);

CREATE POLICY "product_documents_org_update" ON storage.objects
FOR UPDATE TO authenticated
USING (
  bucket_id = 'product-documents'
  AND (storage.foldername(name))[1] = (
    SELECT organization_id::text FROM public.profiles WHERE id = auth.uid()
  )
);

CREATE POLICY "product_documents_org_delete" ON storage.objects
FOR DELETE TO authenticated
USING (
  bucket_id = 'product-documents'
  AND (storage.foldername(name))[1] = (
    SELECT organization_id::text FROM public.profiles WHERE id = auth.uid()
  )
);
