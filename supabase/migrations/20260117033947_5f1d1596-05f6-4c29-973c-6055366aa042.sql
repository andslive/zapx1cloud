-- Create product_ctas table for CTA configurations
CREATE TABLE public.product_ctas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID REFERENCES public.products(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  
  -- CTA Type
  cta_type TEXT NOT NULL CHECK (cta_type IN ('checkout', 'whatsapp', 'calendar', 'callback', 'custom')),
  
  -- Configuration
  label TEXT NOT NULL,
  action_url TEXT,
  whatsapp_number TEXT,
  whatsapp_message TEXT,
  icon TEXT DEFAULT 'link',
  
  -- Display conditions (AI uses this)
  trigger_keywords TEXT[],
  intent_level TEXT DEFAULT 'medium' CHECK (intent_level IN ('high', 'medium', 'low')),
  
  -- Order and status
  display_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Add message_type and buttons to webchat_messages
ALTER TABLE public.webchat_messages
ADD COLUMN IF NOT EXISTS message_type TEXT DEFAULT 'text',
ADD COLUMN IF NOT EXISTS buttons JSONB;

-- Enable RLS on product_ctas
ALTER TABLE public.product_ctas ENABLE ROW LEVEL SECURITY;

-- RLS Policies for product_ctas
CREATE POLICY "Users can view CTAs from their organization"
ON public.product_ctas FOR SELECT
USING (public.user_belongs_to_organization(auth.uid(), organization_id));

CREATE POLICY "Admins can insert CTAs"
ON public.product_ctas FOR INSERT
WITH CHECK (
  public.user_belongs_to_organization(auth.uid(), organization_id) 
  AND public.has_role(auth.uid(), 'admin')
);

CREATE POLICY "Admins can update CTAs"
ON public.product_ctas FOR UPDATE
USING (
  public.user_belongs_to_organization(auth.uid(), organization_id) 
  AND public.has_role(auth.uid(), 'admin')
);

CREATE POLICY "Admins can delete CTAs"
ON public.product_ctas FOR DELETE
USING (
  public.user_belongs_to_organization(auth.uid(), organization_id) 
  AND public.has_role(auth.uid(), 'admin')
);

-- Create trigger for updated_at
CREATE TRIGGER update_product_ctas_updated_at
BEFORE UPDATE ON public.product_ctas
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create index for faster lookups
CREATE INDEX idx_product_ctas_product_id ON public.product_ctas(product_id);
CREATE INDEX idx_product_ctas_organization_id ON public.product_ctas(organization_id);