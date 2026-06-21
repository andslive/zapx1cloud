-- Drop existing constraint and add updated one with 'video' type
ALTER TABLE public.product_ctas DROP CONSTRAINT IF EXISTS product_ctas_cta_type_check;

ALTER TABLE public.product_ctas ADD CONSTRAINT product_ctas_cta_type_check 
CHECK (cta_type = ANY (ARRAY['checkout'::text, 'whatsapp'::text, 'calendar'::text, 'callback'::text, 'video'::text, 'custom'::text]));