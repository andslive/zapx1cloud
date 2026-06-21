-- Função que aplica automações de etiquetas baseadas em evento
-- IMPORTANTE: só ADICIONA tags, nunca remove (preserva histórico do cliente)
CREATE OR REPLACE FUNCTION public.apply_tag_automations(
  p_lead_id uuid,
  p_event_type text,
  p_product_id uuid DEFAULT NULL,
  p_organization_id uuid DEFAULT NULL
)
RETURNS TABLE(tag_id uuid, action text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id uuid := p_organization_id;
  v_automation RECORD;
  v_tag_name text;
  v_inserted boolean;
BEGIN
  -- Resolve organization_id pelo lead se não passado
  IF v_org_id IS NULL THEN
    SELECT organization_id INTO v_org_id FROM leads WHERE id = p_lead_id;
    IF v_org_id IS NULL THEN
      RETURN;
    END IF;
  END IF;

  -- Itera automações ativas que casam com o evento
  -- Regras com product_id específico têm prioridade sobre globais (NULL)
  FOR v_automation IN
    SELECT ta.id, ta.tag_id_to_add, ta.product_id
    FROM tag_automations ta
    WHERE ta.organization_id = v_org_id
      AND ta.event_type = p_event_type
      AND ta.is_active = true
      AND (
        ta.product_id IS NULL
        OR ta.product_id = p_product_id
      )
    ORDER BY ta.product_id NULLS LAST -- específicas primeiro
  LOOP
    -- Tenta inserir; se já existe, ignora silenciosamente (preserva histórico original)
    INSERT INTO lead_tag_assignments (lead_id, tag_id, source, applied_by)
    VALUES (p_lead_id, v_automation.tag_id_to_add, 'automation', NULL)
    ON CONFLICT (lead_id, tag_id) DO NOTHING;

    GET DIAGNOSTICS v_inserted = ROW_COUNT;

    IF v_inserted::int > 0 THEN
      -- Busca nome da tag pra nota de auditoria
      SELECT name INTO v_tag_name FROM lead_tags WHERE id = v_automation.tag_id_to_add;

      -- Registra nota de auditoria
      INSERT INTO lead_notes (lead_id, organization_id, content, note_type, created_by)
      VALUES (
        p_lead_id,
        v_org_id,
        format('Etiqueta "%s" aplicada automaticamente (evento: %s)', COALESCE(v_tag_name, 'desconhecida'), p_event_type),
        'system',
        NULL
      );

      tag_id := v_automation.tag_id_to_add;
      action := 'added';
      RETURN NEXT;
    END IF;
  END LOOP;

  RETURN;
END;
$$;