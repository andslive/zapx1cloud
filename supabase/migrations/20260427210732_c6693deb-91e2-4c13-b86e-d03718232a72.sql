ALTER TABLE public.webchat_conversations
  ADD COLUMN IF NOT EXISTS product_id uuid REFERENCES public.products(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_webchat_conversations_product
  ON public.webchat_conversations(product_id);

UPDATE public.webchat_conversations c
SET product_id = l.product_id
FROM public.leads l
WHERE c.lead_id = l.id
  AND c.product_id IS NULL
  AND l.product_id IS NOT NULL;