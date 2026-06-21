
-- 1) apply_tag_automations: honra tag_id_to_remove
CREATE OR REPLACE FUNCTION public.apply_tag_automations(p_lead_id uuid, p_event_type text, p_product_id uuid DEFAULT NULL::uuid, p_organization_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(tag_id uuid, action text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_org_id uuid := p_organization_id;
  v_automation RECORD;
  v_tag_name text;
  v_inserted boolean;
  v_deleted integer;
BEGIN
  IF v_org_id IS NULL THEN
    SELECT organization_id INTO v_org_id FROM leads WHERE id = p_lead_id;
    IF v_org_id IS NULL THEN RETURN; END IF;
  END IF;

  FOR v_automation IN
    SELECT ta.id, ta.tag_id_to_add, ta.tag_id_to_remove, ta.product_id
    FROM tag_automations ta
    WHERE ta.organization_id = v_org_id
      AND ta.event_type = p_event_type
      AND ta.is_active = true
      AND (ta.product_id IS NULL OR ta.product_id = p_product_id)
    ORDER BY ta.product_id NULLS LAST
  LOOP
    -- ADD
    INSERT INTO lead_tag_assignments (lead_id, tag_id, source, applied_by)
    VALUES (p_lead_id, v_automation.tag_id_to_add, 'automation', NULL)
    ON CONFLICT (lead_id, tag_id) DO NOTHING;
    GET DIAGNOSTICS v_inserted = ROW_COUNT;

    IF v_inserted::int > 0 THEN
      SELECT name INTO v_tag_name FROM lead_tags WHERE id = v_automation.tag_id_to_add;
      INSERT INTO lead_notes (lead_id, organization_id, content, note_type, created_by)
      VALUES (p_lead_id, v_org_id,
        format('Etiqueta "%s" aplicada automaticamente (evento: %s)', COALESCE(v_tag_name,'desconhecida'), p_event_type),
        'system', NULL);
      tag_id := v_automation.tag_id_to_add; action := 'added'; RETURN NEXT;
    END IF;

    -- REMOVE (ordem de exclusão)
    IF v_automation.tag_id_to_remove IS NOT NULL THEN
      DELETE FROM lead_tag_assignments
      WHERE lead_id = p_lead_id AND tag_id = v_automation.tag_id_to_remove;
      GET DIAGNOSTICS v_deleted = ROW_COUNT;
      IF v_deleted > 0 THEN
        SELECT name INTO v_tag_name FROM lead_tags WHERE id = v_automation.tag_id_to_remove;
        INSERT INTO lead_notes (lead_id, organization_id, content, note_type, created_by)
        VALUES (p_lead_id, v_org_id,
          format('Etiqueta "%s" removida automaticamente (evento: %s)', COALESCE(v_tag_name,'desconhecida'), p_event_type),
          'system', NULL);
        tag_id := v_automation.tag_id_to_remove; action := 'removed'; RETURN NEXT;
      END IF;
    END IF;
  END LOOP;

  RETURN;
END;
$function$;

-- 2) create_product_tag_package: cria também as regras de exclusão
CREATE OR REPLACE FUNCTION public.create_product_tag_package(p_organization_id uuid, p_product_id uuid, p_product_label text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  v_tag_pix uuid; v_tag_boleto uuid; v_tag_aguardando uuid;
  v_tag_abandonado uuid; v_tag_cliente uuid; v_tag_reembolso uuid;
BEGIN
  IF p_organization_id IS NULL OR p_product_id IS NULL OR p_product_label IS NULL THEN
    RAISE EXCEPTION 'organization_id, product_id e product_label são obrigatórios';
  END IF;

  FOR v_spec IN SELECT * FROM jsonb_array_elements(v_specs)
  LOOP
    v_full_name := (v_spec->>'name') || ' · ' || p_product_label;

    SELECT id INTO v_tag_id FROM lead_tags
    WHERE organization_id = p_organization_id AND name = v_full_name LIMIT 1;

    IF v_tag_id IS NULL THEN
      INSERT INTO lead_tags (organization_id, name, color, is_automatic, is_lifecycle_status)
      VALUES (p_organization_id, v_full_name, v_spec->>'color', true, (v_spec->>'lifecycle')::boolean)
      RETURNING id INTO v_tag_id;
    ELSE
      UPDATE lead_tags SET is_lifecycle_status = (v_spec->>'lifecycle')::boolean WHERE id = v_tag_id;
    END IF;

    -- Guarda referência por papel
    IF v_spec->>'name' = 'PIX Gerado' THEN v_tag_pix := v_tag_id;
    ELSIF v_spec->>'name' = 'Boleto Gerado' THEN v_tag_boleto := v_tag_id;
    ELSIF v_spec->>'name' = 'Aguardando Pagamento' THEN v_tag_aguardando := v_tag_id;
    ELSIF v_spec->>'name' = 'Checkout Abandonado' THEN v_tag_abandonado := v_tag_id;
    ELSIF v_spec->>'name' = 'Cliente' THEN v_tag_cliente := v_tag_id;
    ELSIF v_spec->>'name' = 'Reembolso' THEN v_tag_reembolso := v_tag_id;
    END IF;

    INSERT INTO tag_automations (organization_id, product_id, event_type, tag_id_to_add, is_active)
    SELECT p_organization_id, p_product_id, v_spec->>'event', v_tag_id, true
    WHERE NOT EXISTS (
      SELECT 1 FROM tag_automations
      WHERE organization_id = p_organization_id AND product_id = p_product_id
        AND event_type = v_spec->>'event' AND tag_id_to_add = v_tag_id
    );

    IF v_spec ? 'also_event' THEN
      INSERT INTO tag_automations (organization_id, product_id, event_type, tag_id_to_add, is_active)
      SELECT p_organization_id, p_product_id, v_spec->>'also_event', v_tag_id, true
      WHERE NOT EXISTS (
        SELECT 1 FROM tag_automations
        WHERE organization_id = p_organization_id AND product_id = p_product_id
          AND event_type = v_spec->>'also_event' AND tag_id_to_add = v_tag_id
      );
    END IF;

    v_created := v_created || jsonb_build_object('tag_id', v_tag_id, 'name', v_full_name);
  END LOOP;

  -- ORDEM DE EXCLUSÃO:
  -- compra_aprovada (Cliente) remove transitórias
  IF v_tag_cliente IS NOT NULL THEN
    UPDATE tag_automations SET tag_id_to_remove = v_tag_pix
      WHERE organization_id = p_organization_id AND product_id = p_product_id
        AND event_type = 'compra_aprovada' AND tag_id_to_add = v_tag_cliente
        AND tag_id_to_remove IS NULL;
  END IF;

  -- pix_gerado remove "Checkout Abandonado" via a tag "Aguardando Pagamento"
  IF v_tag_aguardando IS NOT NULL AND v_tag_abandonado IS NOT NULL THEN
    UPDATE tag_automations SET tag_id_to_remove = v_tag_abandonado
      WHERE organization_id = p_organization_id AND product_id = p_product_id
        AND event_type IN ('pix_gerado','boleto_gerado') AND tag_id_to_add = v_tag_aguardando
        AND tag_id_to_remove IS NULL;
  END IF;

  -- reembolso remove Cliente
  IF v_tag_reembolso IS NOT NULL AND v_tag_cliente IS NOT NULL THEN
    UPDATE tag_automations SET tag_id_to_remove = v_tag_cliente
      WHERE organization_id = p_organization_id AND product_id = p_product_id
        AND event_type = 'reembolso' AND tag_id_to_add = v_tag_reembolso
        AND tag_id_to_remove IS NULL;
  END IF;

  -- Cliente também remove Boleto, PIX e Aguardando — precisamos de regras adicionais
  -- (tag_automations só tem 1 tag_id_to_remove por linha → criamos linhas extras com tag_id_to_add = Cliente)
  IF v_tag_cliente IS NOT NULL THEN
    -- helper inline: inserir limpezas adicionais como regras independentes
    -- usamos a própria tag Cliente como tag_id_to_add (ON CONFLICT lead_id,tag_id ignora duplicatas no apply)
    INSERT INTO tag_automations (organization_id, product_id, event_type, tag_id_to_add, tag_id_to_remove, is_active)
    SELECT p_organization_id, p_product_id, 'compra_aprovada', v_tag_cliente, t, true
    FROM (VALUES (v_tag_boleto), (v_tag_aguardando), (v_tag_abandonado)) AS x(t)
    WHERE t IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM tag_automations
        WHERE organization_id = p_organization_id AND product_id = p_product_id
          AND event_type = 'compra_aprovada' AND tag_id_to_add = v_tag_cliente
          AND tag_id_to_remove = x.t
      );
  END IF;

  RETURN jsonb_build_object('ok', true, 'tags', v_created);
END;
$function$;

-- 3) Backfill: re-roda o pacote para cada produto que já tem automações geradas pelo pacote
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT DISTINCT ta.organization_id, ta.product_id, p.name AS product_label
    FROM tag_automations ta
    JOIN products p ON p.id = ta.product_id
    JOIN lead_tags lt ON lt.id = ta.tag_id_to_add
    WHERE ta.product_id IS NOT NULL
      AND lt.name LIKE '% · ' || p.name
  LOOP
    PERFORM public.create_product_tag_package(r.organization_id, r.product_id, r.product_label);
  END LOOP;
END $$;
