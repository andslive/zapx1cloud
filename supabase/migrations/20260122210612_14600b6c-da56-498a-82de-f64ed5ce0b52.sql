-- Create public read policy for active forms (allows anyone to view published forms)
CREATE POLICY "Anyone can view active forms by slug"
ON public.forms
FOR SELECT
USING (status = 'active');

-- Create public read policy for form blocks of active forms
CREATE POLICY "Anyone can view blocks of active forms"
ON public.form_blocks
FOR SELECT
USING (
  form_id IN (
    SELECT id FROM forms WHERE status = 'active'
  )
);