-- Add new columns to products table for enhanced product pages
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS logo_url TEXT;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS banner_url TEXT;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS product_image_url TEXT;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS category TEXT;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS short_description TEXT;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS external_links JSONB DEFAULT '{}';

-- Create product_training_videos table for playbook video courses
CREATE TABLE public.product_training_videos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  video_url TEXT NOT NULL,
  thumbnail_url TEXT,
  duration_seconds INTEGER,
  order_index INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.product_training_videos ENABLE ROW LEVEL SECURITY;

-- RLS Policies for product_training_videos
CREATE POLICY "Users can view training videos from their organization"
ON public.product_training_videos
FOR SELECT
USING (
  organization_id IN (
    SELECT organization_id FROM public.profiles WHERE id = auth.uid()
  )
);

CREATE POLICY "Admins and managers can manage training videos"
ON public.product_training_videos
FOR ALL
USING (
  organization_id IN (
    SELECT organization_id FROM public.profiles WHERE id = auth.uid()
  )
  AND (
    public.has_role(auth.uid(), 'admin') OR 
    public.has_role(auth.uid(), 'manager')
  )
);

-- Create index for performance
CREATE INDEX idx_product_training_videos_product ON public.product_training_videos(product_id);
CREATE INDEX idx_product_training_videos_org ON public.product_training_videos(organization_id);

-- Add trigger for updated_at
CREATE TRIGGER update_product_training_videos_updated_at
BEFORE UPDATE ON public.product_training_videos
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();