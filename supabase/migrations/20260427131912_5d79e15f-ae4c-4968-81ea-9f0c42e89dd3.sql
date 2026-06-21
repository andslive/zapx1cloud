-- Bucket público para mídia do Inbox (áudio, imagem, vídeo, documento)
INSERT INTO storage.buckets (id, name, public)
VALUES ('chat-media', 'chat-media', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Leitura pública (URLs diretas funcionam em qualquer canal)
CREATE POLICY "chat-media public read"
ON storage.objects
FOR SELECT
USING (bucket_id = 'chat-media');

-- Upload por usuário autenticado
CREATE POLICY "chat-media authenticated upload"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'chat-media');

-- Update por usuário autenticado
CREATE POLICY "chat-media authenticated update"
ON storage.objects
FOR UPDATE
TO authenticated
USING (bucket_id = 'chat-media');

-- Delete por usuário autenticado
CREATE POLICY "chat-media authenticated delete"
ON storage.objects
FOR DELETE
TO authenticated
USING (bucket_id = 'chat-media');