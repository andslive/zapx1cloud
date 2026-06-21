-- Create sales_goals table
CREATE TABLE public.sales_goals (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  product_id UUID REFERENCES public.products(id) ON DELETE CASCADE,
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  target_value NUMERIC NOT NULL DEFAULT 0,
  target_deals INTEGER NOT NULL DEFAULT 0,
  achieved_value NUMERIC DEFAULT 0,
  achieved_deals INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID
);

-- Enable RLS
ALTER TABLE public.sales_goals ENABLE ROW LEVEL SECURITY;

-- Policies for sales_goals
CREATE POLICY "Users can view goals in their org"
ON public.sales_goals
FOR SELECT
USING (
  organization_id = get_user_organization(auth.uid())
  AND (
    user_id = auth.uid()
    OR has_role(auth.uid(), 'admin')
    OR has_role(auth.uid(), 'manager')
  )
);

CREATE POLICY "Admins and managers can insert goals"
ON public.sales_goals
FOR INSERT
WITH CHECK (
  organization_id = get_user_organization(auth.uid())
  AND (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'manager'))
);

CREATE POLICY "Admins and managers can update goals"
ON public.sales_goals
FOR UPDATE
USING (
  organization_id = get_user_organization(auth.uid())
  AND (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'manager'))
);

CREATE POLICY "Admins can delete goals"
ON public.sales_goals
FOR DELETE
USING (
  organization_id = get_user_organization(auth.uid())
  AND has_role(auth.uid(), 'admin')
);

-- Create trigger for updated_at
CREATE TRIGGER update_sales_goals_updated_at
BEFORE UPDATE ON public.sales_goals
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create badges table for gamification
CREATE TABLE public.user_badges (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  badge_type TEXT NOT NULL,
  badge_name TEXT NOT NULL,
  description TEXT,
  earned_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  metadata JSONB DEFAULT '{}'::jsonb
);

-- Enable RLS for badges
ALTER TABLE public.user_badges ENABLE ROW LEVEL SECURITY;

-- Policies for badges
CREATE POLICY "Users can view badges in their org"
ON public.user_badges
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = user_badges.user_id
    AND p.organization_id = get_user_organization(auth.uid())
  )
);

CREATE POLICY "System can insert badges"
ON public.user_badges
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = user_badges.user_id
    AND p.organization_id = get_user_organization(auth.uid())
  )
);