-- Add new columns for super sales AI to webchat_agent_configs
ALTER TABLE webchat_agent_configs 
ADD COLUMN IF NOT EXISTS sales_prompt TEXT,
ADD COLUMN IF NOT EXISTS sales_context TEXT,
ADD COLUMN IF NOT EXISTS chunked_messages_enabled BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS typing_delay_ms INTEGER DEFAULT 1500,
ADD COLUMN IF NOT EXISTS max_message_length INTEGER DEFAULT 150;

-- Create table for agent training materials (PDFs, sales techniques, etc.)
CREATE TABLE IF NOT EXISTS agent_training_materials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  material_type TEXT NOT NULL CHECK (material_type IN ('pdf', 'video', 'text', 'website')),
  category TEXT NOT NULL DEFAULT 'general' CHECK (category IN ('sales_techniques', 'communication', 'objections', 'closing', 'prospecting', 'negotiation', 'general')),
  description TEXT,
  file_url TEXT,
  extracted_content TEXT,
  is_active BOOLEAN DEFAULT true,
  processing_status TEXT DEFAULT 'pending' CHECK (processing_status IN ('pending', 'processing', 'completed', 'failed')),
  processing_error TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE agent_training_materials ENABLE ROW LEVEL SECURITY;

-- RLS policies for agent_training_materials
CREATE POLICY "Users can view training materials in their org"
  ON agent_training_materials FOR SELECT
  USING (organization_id IN (
    SELECT organization_id FROM profiles WHERE id = auth.uid()
  ));

CREATE POLICY "Admins/Managers can manage training materials"
  ON agent_training_materials FOR ALL
  USING (
    organization_id IN (SELECT organization_id FROM profiles WHERE id = auth.uid())
    AND (
      public.has_role(auth.uid(), 'admin') OR 
      public.has_role(auth.uid(), 'manager')
    )
  );

-- Create trigger for updated_at
CREATE TRIGGER update_agent_training_materials_updated_at
  BEFORE UPDATE ON agent_training_materials
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Add comment for documentation
COMMENT ON TABLE agent_training_materials IS 'Stores sales training materials (PDFs, techniques) that the AI agent uses for improved sales responses';
COMMENT ON COLUMN webchat_agent_configs.sales_prompt IS 'Advanced sales-focused prompt with sales techniques and behavior rules';
COMMENT ON COLUMN webchat_agent_configs.chunked_messages_enabled IS 'Enable typing effect with chunked messages';
COMMENT ON COLUMN webchat_agent_configs.typing_delay_ms IS 'Delay in ms between chunked messages';