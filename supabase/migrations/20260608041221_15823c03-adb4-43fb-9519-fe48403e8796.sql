-- Allow authenticated users to upload files to funnel-assets bucket
-- Path structure: folder/unique-id-filename
-- We allow any authenticated user to upload for now, as the folder structure is managed by the app
CREATE POLICY "Authenticated users can upload funnel assets"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'funnel-assets');

-- Allow anyone to view funnel assets (since they are public assets for the funnels)
CREATE POLICY "Anyone can view funnel assets"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'funnel-assets');

-- Allow authenticated users to delete their own uploads or any funnel asset if they are admins
CREATE POLICY "Authenticated users can delete funnel assets"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'funnel-assets');

-- Allow authenticated users to update funnel assets
CREATE POLICY "Authenticated users can update funnel assets"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'funnel-assets')
WITH CHECK (bucket_id = 'funnel-assets');
