-- Increase file size limit to 50MB for product-documents bucket
UPDATE storage.buckets 
SET file_size_limit = 52428800,
    public = true
WHERE id = 'product-documents';