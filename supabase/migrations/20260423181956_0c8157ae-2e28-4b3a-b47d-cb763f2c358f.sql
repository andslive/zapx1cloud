-- Cria bucket catalog-media (público para WhatsApp baixar mídia)
INSERT INTO storage.buckets (id, name, public)
VALUES ('catalog-media', 'catalog-media', true)
ON CONFLICT (id) DO NOTHING;

-- Policies do bucket
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'catalog_media_public_read') THEN
    CREATE POLICY "catalog_media_public_read" ON storage.objects
      FOR SELECT USING (bucket_id = 'catalog-media');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'catalog_media_auth_insert') THEN
    CREATE POLICY "catalog_media_auth_insert" ON storage.objects
      FOR INSERT WITH CHECK (bucket_id = 'catalog-media' AND auth.uid() IS NOT NULL);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'catalog_media_auth_update') THEN
    CREATE POLICY "catalog_media_auth_update" ON storage.objects
      FOR UPDATE USING (bucket_id = 'catalog-media' AND auth.uid() IS NOT NULL);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'catalog_media_auth_delete') THEN
    CREATE POLICY "catalog_media_auth_delete" ON storage.objects
      FOR DELETE USING (bucket_id = 'catalog-media' AND auth.uid() IS NOT NULL);
  END IF;
END$$;

-- Novos campos em product_catalog_items
ALTER TABLE public.product_catalog_items
  ADD COLUMN IF NOT EXISTS videos text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS documents jsonb NOT NULL DEFAULT '[]'::jsonb;