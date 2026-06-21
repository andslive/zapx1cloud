GRANT SELECT, INSERT, UPDATE, DELETE ON public.lead_tracking TO authenticated;
GRANT ALL ON public.lead_tracking TO service_role;
GRANT SELECT, INSERT ON public.lead_tracking TO anon;
