-- Garante permissões básicas para as roles do sistema
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lead_tracking TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lead_tracking TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lead_tracking TO anon;

-- Garante que as roles podem usar sequências se houver (id serial/bigserial)
-- GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated, service_role, anon;

-- Verifica e reaplica RLS se necessário (embora o linter diga que está sem política)
ALTER TABLE public.lead_tracking ENABLE ROW LEVEL SECURITY;

-- Cria uma política permissiva para o service_role e anon (webhook) enquanto não temos políticas granulares
CREATE POLICY "Permitir tudo para service_role" ON public.lead_tracking FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Permitir insert para anon" ON public.lead_tracking FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Permitir select para anon" ON public.lead_tracking FOR SELECT TO anon USING (true);
CREATE POLICY "Permitir tudo para authenticated" ON public.lead_tracking FOR ALL TO authenticated USING (true) WITH CHECK (true);
