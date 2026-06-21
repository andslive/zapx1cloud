
-- Create lead_notes table for audit trail
CREATE TABLE public.lead_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  content text NOT NULL,
  role_label text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_lead_notes_lead_id ON public.lead_notes(lead_id);
CREATE INDEX idx_lead_notes_author_id ON public.lead_notes(author_id);

ALTER TABLE public.lead_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view notes from same org"
  ON public.lead_notes FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM leads l
      JOIN profiles p ON p.organization_id = l.organization_id
      WHERE l.id = lead_notes.lead_id AND p.id = auth.uid()
    )
  );

CREATE POLICY "Users can insert notes"
  ON public.lead_notes FOR INSERT
  WITH CHECK (author_id = auth.uid());

-- Add created_by to tasks table
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL;
