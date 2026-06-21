
-- 1) Marca tags transitórias (status de checkout) que podem ser removidas automaticamente
ALTER TABLE public.lead_tags
  ADD COLUMN IF NOT EXISTS is_lifecycle_status boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.lead_tags.is_lifecycle_status IS
  'Quando true, esta tag pode ser removida automaticamente por automações (ex: PIX Gerado, Aguardando Pagamento). Quando false, é permanente para histórico.';

-- 2) Garante unicidade da atribuição (necessário para ON CONFLICT idempotente)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'lead_tag_assignments_lead_tag_unique'
  ) THEN
    BEGIN
      ALTER TABLE public.lead_tag_assignments
        ADD CONSTRAINT lead_tag_assignments_lead_tag_unique UNIQUE (lead_id, tag_id);
    EXCEPTION WHEN duplicate_table OR unique_violation THEN
      NULL;
    END;
  END IF;
END $$;

-- 3) Função: REMOVE tags transitórias para um produto específico quando ocorre evento (ex: compra_aprovada limpa PIX/Boleto)
CREATE OR REPLACE FUNCTION public.remove_lifecycle_tags_on_event(
  p_lead_id uuid,
  p_event_type text,
  p_product_id uuid DEFAULT NULL,
  p_organization_id uuid DEFAULT NULL
)
RETURNS TABLE(tag_id uuid, action text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_org_id uuid := p_organization_id;
  v_tag RECORD;
  v_tag_name text;
BEGIN
  IF v_org_id IS NULL THEN
    SELECT organization_id INTO v_org_id FROM leads WHERE id = p_lead_id;
    IF v_org_id IS NULL THEN RETURN; END IF;
  END IF;

  -- Remove TODAS as tags transitórias (is_lifecycle_status=true) atualmente atribuídas ao lead
  -- que pertencem a automações do MESMO produto (ou globais sem produto).
  -- NUNCA toca em tags permanentes (is_lifecycle_status=false).
  FOR v_tag IN
    SELECT DISTINCT lta.tag_id, lt.name AS tag_name
    FROM lead_tag_assignments lta
    JOIN lead_tags lt ON lt.id = lta.tag_id
    WHERE lta.lead_id = p_lead_id
      AND lt.organization_id = v_org_id
      AND lt.is_lifecycle_status = true
      AND EXISTS (
        SELECT 1 FROM tag_automations ta
        WHERE ta.tag_id_to_add = lta.tag_id
          AND ta.organization_id = v_org_id
          AND (
            ta.product_id = p_product_id
            OR (ta.product_id IS NULL AND p_product_id IS NULL)
          )
      )
  LOOP
    DELETE FROM lead_tag_assignments
    WHERE lead_id = p_lead_id AND lead_tag_assignments.tag_id = v_tag.tag_id;

    -- Auditoria
    INSERT INTO lead_notes (lead_id, organization_id, content, note_type, created_by)
    VALUES (
      p_lead_id,
      v_org_id,
      format('Etiqueta "%s" removida automaticamente (evento: %s)', v_tag.tag_name, p_event_type),
      'system',
      NULL
    );

    tag_id := v_tag.tag_id;
    action := 'removed';
    RETURN NEXT;
  END LOOP;

  RETURN;
END;
$$;

-- 4) Pacote: cria 6 tags + 6 automações para um produto, idempotente
CREATE OR REPLACE FUNCTION public.create_product_tag_package(
  p_organization_id uuid,
  p_product_id uuid,
  p_product_label text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_specs jsonb := jsonb_build_array(
    jsonb_build_object('event','pix_gerado',          'name','PIX Gerado',          'color','#EAB308', 'lifecycle', true),
    jsonb_build_object('event','boleto_gerado',       'name','Boleto Gerado',       'color','#3B82F6', 'lifecycle', true),
    jsonb_build_object('event','pix_gerado',          'name','Aguardando Pagamento','color','#F97316', 'lifecycle', true, 'also_event','boleto_gerado'),
    jsonb_build_object('event','checkout_abandonado', 'name','Checkout Abandonado', 'color','#6B7280', 'lifecycle', true),
    jsonb_build_object('event','compra_aprovada',     'name','Cliente',             'color','#22C55E', 'lifecycle', false),
    jsonb_build_object('event','reembolso',           'name','Reembolso',           'color','#EF4444', 'lifecycle', false)
  );
  v_spec jsonb;
  v_tag_id uuid;
  v_full_name text;
  v_created jsonb := '[]'::jsonb;
BEGIN
  IF p_organization_id IS NULL OR p_product_id IS NULL OR p_product_label IS NULL THEN
    RAISE EXCEPTION 'organization_id, product_id e product_label são obrigatórios';
  END IF;

  FOR v_spec IN SELECT * FROM jsonb_array_elements(v_specs)
  LOOP
    v_full_name := (v_spec->>'name') || ' · ' || p_product_label;

    -- Tag (idempotente por nome+org)
    SELECT id INTO v_tag_id
    FROM lead_tags
    WHERE organization_id = p_organization_id AND name = v_full_name
    LIMIT 1;

    IF v_tag_id IS NULL THEN
      INSERT INTO lead_tags (organization_id, name, color, is_automatic, is_lifecycle_status)
      VALUES (
        p_organization_id,
        v_full_name,
        v_spec->>'color',
        true,
        (v_spec->>'lifecycle')::boolean
      )
      RETURNING id INTO v_tag_id;
    ELSE
      -- Garante que o flag de lifecycle esteja correto
      UPDATE lead_tags
      SET is_lifecycle_status = (v_spec->>'lifecycle')::boolean
      WHERE id = v_tag_id;
    END IF;

    -- Automação principal (idempotente por org+evento+produto+tag)
    INSERT INTO tag_automations (organization_id, product_id, event_type, tag_id_to_add, is_active)
    SELECT p_organization_id, p_product_id, v_spec->>'event', v_tag_id, true
    WHERE NOT EXISTS (
      SELECT 1 FROM tag_automations
      WHERE organization_id = p_organization_id
        AND product_id = p_product_id
        AND event_type = v_spec->>'event'
        AND tag_id_to_add = v_tag_id
    );

    -- Caso especial "Aguardando Pagamento": vincula também a boleto_gerado
    IF v_spec ? 'also_event' THEN
      INSERT INTO tag_automations (organization_id, product_id, event_type, tag_id_to_add, is_active)
      SELECT p_organization_id, p_product_id, v_spec->>'also_event', v_tag_id, true
      WHERE NOT EXISTS (
        SELECT 1 FROM tag_automations
        WHERE organization_id = p_organization_id
          AND product_id = p_product_id
          AND event_type = v_spec->>'also_event'
          AND tag_id_to_add = v_tag_id
      );
    END IF;

    v_created := v_created || jsonb_build_object('tag_id', v_tag_id, 'name', v_full_name);
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'tags', v_created);
END;
$$;
