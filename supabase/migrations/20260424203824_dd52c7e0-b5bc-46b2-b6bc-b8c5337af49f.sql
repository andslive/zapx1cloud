CREATE UNIQUE INDEX IF NOT EXISTS cakto_orders_scope_org_cakto_id_key
ON public.cakto_orders (scope, organization_id, cakto_id);