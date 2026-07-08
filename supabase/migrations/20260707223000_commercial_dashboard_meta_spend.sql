-- FASE Dashboard: investimento Meta manual por organização/dia.
-- Alimenta o card "Investimento Meta" do Dashboard comercial até a
-- integração com a Meta Ads API existir.
CREATE TABLE IF NOT EXISTS public.commercial_dashboard_meta_spend (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  spend_date date NOT NULL,
  amount numeric NOT NULL DEFAULT 0 CHECK (amount >= 0),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (organization_id, spend_date)
);

ALTER TABLE public.commercial_dashboard_meta_spend ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view meta spend"
  ON public.commercial_dashboard_meta_spend FOR SELECT
  USING (organization_id = get_user_organization(auth.uid()));

CREATE POLICY "Org members can insert meta spend"
  ON public.commercial_dashboard_meta_spend FOR INSERT
  WITH CHECK (organization_id = get_user_organization(auth.uid()));

CREATE POLICY "Org members can update meta spend"
  ON public.commercial_dashboard_meta_spend FOR UPDATE
  USING (organization_id = get_user_organization(auth.uid()))
  WITH CHECK (organization_id = get_user_organization(auth.uid()));

CREATE OR REPLACE FUNCTION public.touch_commercial_dashboard_meta_spend()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_touch_commercial_dashboard_meta_spend
  BEFORE UPDATE ON public.commercial_dashboard_meta_spend
  FOR EACH ROW EXECUTE FUNCTION public.touch_commercial_dashboard_meta_spend();
