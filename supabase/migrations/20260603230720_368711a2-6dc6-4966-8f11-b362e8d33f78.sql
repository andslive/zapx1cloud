-- Fix Function Search Path for functions owned by postgres (user-defined)
DO $$ 
DECLARE 
    func_record record;
BEGIN
    FOR func_record IN 
        SELECT p.proname, oidvectortypes(p.proargtypes) as args
        FROM pg_proc p 
        JOIN pg_namespace n ON p.pronamespace = n.oid 
        WHERE n.nspname = 'public' 
        AND pg_get_userbyid(p.proowner) = 'postgres'
    LOOP
        EXECUTE format('ALTER FUNCTION public.%I(%s) SET search_path = public', func_record.proname, func_record.args);
    END LOOP;
END $$;

-- Hardening storage policies - restrict listing
-- Materials bucket
DROP POLICY IF EXISTS "Public can view materials" ON storage.objects;
CREATE POLICY "Public can view materials" ON storage.objects
    FOR SELECT TO anon USING (bucket_id = 'materials'::text AND (storage.foldername(name))[1] IS NOT NULL);
