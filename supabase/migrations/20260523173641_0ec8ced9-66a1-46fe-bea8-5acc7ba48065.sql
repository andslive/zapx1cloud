-- Create storage bucket for funnel assets
INSERT INTO storage.buckets (id, name, public) 
VALUES ('funnel-assets', 'funnel-assets', true)
ON CONFLICT (id) DO NOTHING;

-- Policies for funnel-assets bucket
CREATE POLICY "Public Access" 
ON storage.objects FOR SELECT 
USING (bucket_id = 'funnel-assets');

CREATE POLICY "Authenticated users can upload" 
ON storage.objects FOR INSERT 
WITH CHECK (bucket_id = 'funnel-assets' AND auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can update" 
ON storage.objects FOR UPDATE 
USING (bucket_id = 'funnel-assets' AND auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can delete" 
ON storage.objects FOR DELETE 
USING (bucket_id = 'funnel-assets' AND auth.role() = 'authenticated');