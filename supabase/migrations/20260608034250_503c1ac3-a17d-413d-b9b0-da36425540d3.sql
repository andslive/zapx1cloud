GRANT SELECT, INSERT, UPDATE, DELETE ON public.lead_tracking TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lead_tracking TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lead_tracking TO anon;

-- Garante que o service_role e anon podem ver a tabela (necessário para PostgREST via Edge Function)
GRANT ALL ON public.lead_tracking TO postgres, service_role;
