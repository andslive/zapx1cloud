CREATE TABLE IF NOT EXISTS public.payment_links (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  conversation_id UUID REFERENCES public.webchat_conversations(id) ON DELETE SET NULL,
  lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  amount NUMERIC(12,2) NOT NULL CHECK (amount >= 0),
  currency TEXT NOT NULL DEFAULT 'BRL',
  url TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'sent' CHECK (status IN ('sent','opened','paid','expired','cancelled')),
  opened_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payment_links_org ON public.payment_links(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payment_links_conv ON public.payment_links(conversation_id);
CREATE INDEX IF NOT EXISTS idx_payment_links_lead ON public.payment_links(lead_id);

ALTER TABLE public.payment_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view payment links"
  ON public.payment_links FOR SELECT TO authenticated
  USING (organization_id = public.get_user_organization(auth.uid()));

CREATE POLICY "Org members can create payment links"
  ON public.payment_links FOR INSERT TO authenticated
  WITH CHECK (organization_id = public.get_user_organization(auth.uid()) AND created_by = auth.uid());

CREATE POLICY "Org members can update payment links"
  ON public.payment_links FOR UPDATE TO authenticated
  USING (organization_id = public.get_user_organization(auth.uid()));

CREATE POLICY "Org members can delete payment links"
  ON public.payment_links FOR DELETE TO authenticated
  USING (organization_id = public.get_user_organization(auth.uid()));

CREATE TRIGGER payment_links_updated_at
  BEFORE UPDATE ON public.payment_links
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();