
-- Custom Fields table
CREATE TABLE public.custom_fields (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  field_key text NOT NULL,
  field_type text NOT NULL DEFAULT 'text' CHECK (field_type IN ('text', 'number', 'select', 'boolean', 'date')),
  description text,
  options jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(organization_id, field_key)
);

-- RLS
ALTER TABLE public.custom_fields ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view custom fields of their org"
ON public.custom_fields FOR SELECT
USING (organization_id = public.get_user_organization(auth.uid()));

CREATE POLICY "Admins/managers can insert custom fields"
ON public.custom_fields FOR INSERT
WITH CHECK (
  organization_id = public.get_user_organization(auth.uid())
  AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'))
);

CREATE POLICY "Admins/managers can update custom fields"
ON public.custom_fields FOR UPDATE
USING (
  organization_id = public.get_user_organization(auth.uid())
  AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'))
);

CREATE POLICY "Admins/managers can delete custom fields"
ON public.custom_fields FOR DELETE
USING (
  organization_id = public.get_user_organization(auth.uid())
  AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'))
);

-- Updated at trigger
CREATE TRIGGER update_custom_fields_updated_at
BEFORE UPDATE ON public.custom_fields
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
