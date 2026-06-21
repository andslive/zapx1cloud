-- Table for product knowledge sources (Product Brain)
CREATE TABLE public.product_knowledge_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID REFERENCES public.products(id) ON DELETE CASCADE NOT NULL,
  organization_id UUID REFERENCES public.organizations(id) NOT NULL,
  
  -- Source type
  source_type VARCHAR NOT NULL CHECK (source_type IN ('file', 'website', 'youtube', 'faq', 'data', 'training')),
  
  -- Metadata
  title VARCHAR NOT NULL,
  description TEXT,
  
  -- Extracted content (for AI training)
  extracted_content TEXT,
  raw_content TEXT,
  
  -- For files
  file_url TEXT,
  file_type VARCHAR,
  file_size INTEGER,
  
  -- For websites
  source_url TEXT,
  last_crawled_at TIMESTAMPTZ,
  
  -- For YouTube
  video_id VARCHAR,
  video_duration INTEGER,
  transcript TEXT,
  
  -- For FAQ
  question TEXT,
  answer TEXT,
  
  -- For structured data
  data_category VARCHAR,
  data_json JSONB,
  
  -- Processing status
  processing_status VARCHAR DEFAULT 'pending' CHECK (processing_status IN ('pending', 'processing', 'completed', 'failed')),
  processing_error TEXT,
  processed_at TIMESTAMPTZ,
  
  -- Flags
  is_active BOOLEAN DEFAULT true,
  is_synced BOOLEAN DEFAULT false,
  
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  created_by UUID
);

-- Table for product onboarding state
CREATE TABLE public.product_onboarding_state (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID REFERENCES public.products(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  organization_id UUID REFERENCES public.organizations(id) NOT NULL,
  
  current_step INTEGER DEFAULT 1,
  total_steps INTEGER DEFAULT 8,
  
  -- Partial responses (to not lose progress)
  draft_data JSONB DEFAULT '{}',
  
  -- AI optimization history
  ai_optimizations JSONB DEFAULT '[]',
  
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.product_knowledge_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_onboarding_state ENABLE ROW LEVEL SECURITY;

-- RLS Policies for product_knowledge_sources
CREATE POLICY "Users can view their org knowledge sources"
ON public.product_knowledge_sources
FOR SELECT
USING (
  organization_id IN (
    SELECT organization_id FROM public.profiles WHERE id = auth.uid()
  )
);

CREATE POLICY "Users can create knowledge sources for their org"
ON public.product_knowledge_sources
FOR INSERT
WITH CHECK (
  organization_id IN (
    SELECT organization_id FROM public.profiles WHERE id = auth.uid()
  )
);

CREATE POLICY "Users can update their org knowledge sources"
ON public.product_knowledge_sources
FOR UPDATE
USING (
  organization_id IN (
    SELECT organization_id FROM public.profiles WHERE id = auth.uid()
  )
);

CREATE POLICY "Users can delete their org knowledge sources"
ON public.product_knowledge_sources
FOR DELETE
USING (
  organization_id IN (
    SELECT organization_id FROM public.profiles WHERE id = auth.uid()
  )
);

-- RLS Policies for product_onboarding_state
CREATE POLICY "Users can view their own onboarding state"
ON public.product_onboarding_state
FOR SELECT
USING (user_id = auth.uid());

CREATE POLICY "Users can create their own onboarding state"
ON public.product_onboarding_state
FOR INSERT
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their own onboarding state"
ON public.product_onboarding_state
FOR UPDATE
USING (user_id = auth.uid());

CREATE POLICY "Users can delete their own onboarding state"
ON public.product_onboarding_state
FOR DELETE
USING (user_id = auth.uid());

-- Storage bucket for product documents
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('product-documents', 'product-documents', false, 10485760)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for product-documents bucket
CREATE POLICY "Users can upload product documents"
ON storage.objects
FOR INSERT
WITH CHECK (
  bucket_id = 'product-documents' AND
  auth.uid() IS NOT NULL
);

CREATE POLICY "Users can view their org product documents"
ON storage.objects
FOR SELECT
USING (
  bucket_id = 'product-documents' AND
  auth.uid() IS NOT NULL
);

CREATE POLICY "Users can delete their org product documents"
ON storage.objects
FOR DELETE
USING (
  bucket_id = 'product-documents' AND
  auth.uid() IS NOT NULL
);

-- Updated at trigger for new tables
CREATE TRIGGER update_product_knowledge_sources_updated_at
BEFORE UPDATE ON public.product_knowledge_sources
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_product_onboarding_state_updated_at
BEFORE UPDATE ON public.product_onboarding_state
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();