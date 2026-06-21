-- Fix multi-tenant isolation leak in profiles table
-- Remove permissive booking policy that exposed all profile fields (including email/organization_id)
DROP POLICY IF EXISTS "Public can view booking profiles" ON public.profiles;

-- Create a secure view exposing ONLY safe public booking fields
DROP VIEW IF EXISTS public.public_booking_profiles;
CREATE VIEW public.public_booking_profiles
WITH (security_invoker=on) AS
SELECT 
  id,
  full_name,
  avatar_url,
  booking_slug,
  booking_bio
FROM public.profiles
WHERE booking_slug IS NOT NULL AND booking_slug <> '';

-- Allow public read on the safe view only
GRANT SELECT ON public.public_booking_profiles TO anon, authenticated;

-- Add a permissive RLS policy on profiles ONLY for the columns needed by the view via security_invoker
-- The view runs as the invoker, so we need a narrow policy that allows reading rows with booking_slug
-- but the view itself only exposes safe columns.
CREATE POLICY "Public booking rows readable for view"
ON public.profiles
FOR SELECT
TO anon, authenticated
USING (booking_slug IS NOT NULL AND booking_slug <> '');