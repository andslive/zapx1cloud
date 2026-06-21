-- Create sales_squads table
CREATE TABLE public.sales_squads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  icon_url TEXT,
  product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  leader_id UUID,
  color TEXT DEFAULT '#6366F1',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  created_by UUID
);

-- Create squad_members table
CREATE TABLE public.squad_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  squad_id UUID NOT NULL REFERENCES public.sales_squads(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  role TEXT DEFAULT 'member',
  joined_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(squad_id, user_id)
);

-- Enable RLS
ALTER TABLE public.sales_squads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.squad_members ENABLE ROW LEVEL SECURITY;

-- RLS for sales_squads
CREATE POLICY "Users can view squads in their org"
ON public.sales_squads FOR SELECT
USING (organization_id = get_user_organization(auth.uid()));

CREATE POLICY "Admins and managers can manage squads"
ON public.sales_squads FOR ALL
USING (
  organization_id = get_user_organization(auth.uid()) 
  AND (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'manager'))
);

-- RLS for squad_members
CREATE POLICY "Users can view squad members in their org"
ON public.squad_members FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.sales_squads s
    WHERE s.id = squad_members.squad_id
    AND s.organization_id = get_user_organization(auth.uid())
  )
);

CREATE POLICY "Admins and managers can manage squad members"
ON public.squad_members FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.sales_squads s
    WHERE s.id = squad_members.squad_id
    AND s.organization_id = get_user_organization(auth.uid())
  )
  AND (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'manager'))
);

-- Create storage bucket for squad icons
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'squad-icons',
  'squad-icons',
  true,
  1048576,
  ARRAY['image/png', 'image/jpeg', 'image/webp', 'image/gif']
);

-- Storage policies for squad icons
CREATE POLICY "Squad icons are publicly accessible"
ON storage.objects FOR SELECT
USING (bucket_id = 'squad-icons');

CREATE POLICY "Admins and managers can upload squad icons"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'squad-icons' 
  AND (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'manager'))
);

CREATE POLICY "Admins and managers can update squad icons"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'squad-icons'
  AND (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'manager'))
);

CREATE POLICY "Admins and managers can delete squad icons"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'squad-icons'
  AND (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'manager'))
);

-- Trigger for updated_at
CREATE TRIGGER update_sales_squads_updated_at
BEFORE UPDATE ON public.sales_squads
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();