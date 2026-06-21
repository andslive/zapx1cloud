-- Tabela para mapeamento de dados Sankhya
CREATE TABLE sankhya_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) NOT NULL,
  entity_type TEXT NOT NULL, -- 'lead', 'product', 'deal'
  local_id UUID NOT NULL,
  sankhya_id TEXT NOT NULL, -- CODPARC, CODPROD, NUNOTA
  last_sync_at TIMESTAMPTZ,
  sync_status TEXT DEFAULT 'pending',
  sync_direction TEXT DEFAULT 'from_sankhya', -- 'from_sankhya', 'to_sankhya'
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(organization_id, entity_type, local_id)
);

-- Tabela para logs de sincronização
CREATE TABLE sankhya_sync_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) NOT NULL,
  sync_type TEXT NOT NULL, -- 'full', 'incremental', 'manual'
  entity_type TEXT NOT NULL, -- 'clients', 'products', 'orders'
  records_processed INTEGER DEFAULT 0,
  records_success INTEGER DEFAULT 0,
  records_failed INTEGER DEFAULT 0,
  error_details JSONB,
  started_at TIMESTAMPTZ DEFAULT now(),
  finished_at TIMESTAMPTZ,
  status TEXT DEFAULT 'running' -- 'running', 'completed', 'failed'
);

-- Enable RLS
ALTER TABLE sankhya_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE sankhya_sync_logs ENABLE ROW LEVEL SECURITY;

-- RLS policies for sankhya_mappings
CREATE POLICY "Users can view org sankhya mappings" 
ON sankhya_mappings FOR SELECT 
USING (organization_id = get_user_organization(auth.uid()));

CREATE POLICY "Admins can manage org sankhya mappings" 
ON sankhya_mappings FOR ALL 
USING (organization_id = get_user_organization(auth.uid()) AND has_role(auth.uid(), 'admin'));

-- RLS policies for sankhya_sync_logs
CREATE POLICY "Users can view org sync logs" 
ON sankhya_sync_logs FOR SELECT 
USING (organization_id = get_user_organization(auth.uid()));

CREATE POLICY "System can insert sync logs" 
ON sankhya_sync_logs FOR INSERT 
WITH CHECK (organization_id = get_user_organization(auth.uid()));

CREATE POLICY "System can update sync logs" 
ON sankhya_sync_logs FOR UPDATE 
USING (organization_id = get_user_organization(auth.uid()));

-- Index for faster lookups
CREATE INDEX idx_sankhya_mappings_org_entity ON sankhya_mappings(organization_id, entity_type);
CREATE INDEX idx_sankhya_mappings_local_id ON sankhya_mappings(local_id);
CREATE INDEX idx_sankhya_sync_logs_org ON sankhya_sync_logs(organization_id, started_at DESC);