ALTER TABLE public.cakto_orders 
ADD COLUMN IF NOT EXISTS items JSONB DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.cakto_orders.items IS 'Lista de itens do pedido: [{name, role, amount, product_cakto_id, quantity}]. role pode ser main, orderbump, upsell.';

CREATE INDEX IF NOT EXISTS idx_cakto_orders_items ON public.cakto_orders USING GIN (items);