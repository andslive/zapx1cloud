-- Create storage bucket for cadence media
INSERT INTO storage.buckets (id, name, public)
VALUES ('cadence-media', 'cadence-media', true)
ON CONFLICT (id) DO NOTHING;

-- Policy for authenticated users to upload cadence media
CREATE POLICY "Authenticated users can upload cadence media"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'cadence-media');

-- Policy to view cadence media (public bucket)
CREATE POLICY "Anyone can view cadence media"
ON storage.objects FOR SELECT
USING (bucket_id = 'cadence-media');

-- Policy for authenticated users to delete their own media
CREATE POLICY "Authenticated users can delete cadence media"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'cadence-media');