-- Add video_url column to product_ctas
ALTER TABLE product_ctas ADD COLUMN IF NOT EXISTS video_url TEXT;

-- Add video_url column to webchat_messages for storing video data
ALTER TABLE webchat_messages ADD COLUMN IF NOT EXISTS video_url TEXT;