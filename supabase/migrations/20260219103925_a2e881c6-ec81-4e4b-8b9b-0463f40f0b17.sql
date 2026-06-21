-- Refresh PostgREST schema cache
NOTIFY pgrst, 'reload schema';