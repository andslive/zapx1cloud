
-- Fix security warnings

-- 1. Fix function search paths
CREATE OR REPLACE FUNCTION public.increment_form_views(p_form_id UUID)
RETURNS void AS $$
BEGIN
  UPDATE forms SET views_count = views_count + 1 WHERE id = p_form_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.increment_form_submissions_count(p_form_id UUID)
RETURNS void AS $$
BEGIN
  UPDATE forms SET submissions_count = submissions_count + 1 WHERE id = p_form_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 2. Fix permissive RLS policy - require form to be active for public submissions
DROP POLICY IF EXISTS "Anyone can submit forms" ON form_submissions;

CREATE POLICY "Anyone can submit to active forms"
  ON form_submissions FOR INSERT
  WITH CHECK (
    form_id IN (
      SELECT id FROM forms WHERE status = 'active'
    )
  );
