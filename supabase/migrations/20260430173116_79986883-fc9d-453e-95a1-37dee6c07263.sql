-- Backfill evolution_instance_id em conversas WhatsApp ativas
UPDATE webchat_conversations c
SET evolution_instance_id = sub.id
FROM (
  SELECT DISTINCT ON (organization_id) organization_id, id
  FROM evolution_instances
  WHERE status = 'connected'
  ORDER BY organization_id, is_default DESC, created_at DESC
) sub
WHERE c.evolution_instance_id IS NULL
  AND c.channel = 'whatsapp'
  AND c.organization_id = sub.organization_id;

-- Remove configurações órfãs de provedores legados
DELETE FROM integration_settings
WHERE integration_type = 'whatsapp_provider'
  AND (settings->>'provider' IN ('botconversa','isichat'));