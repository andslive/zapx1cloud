
DO $$
DECLARE
  v_conv RECORD;
  v_ai_block BOOLEAN;
  v_received_at TIMESTAMPTZ;
  v_cleaned INT := 0;
BEGIN
  FOR v_conv IN
    SELECT id, organization_id, current_flow_id, current_block_id, flow_variables
    FROM webchat_conversations
    WHERE flow_variables ? '__pending_receipt_media'
  LOOP
    -- Idade > 30 min
    BEGIN
      v_received_at := (v_conv.flow_variables->'__pending_receipt_media'->>'received_at')::timestamptz;
    EXCEPTION WHEN OTHERS THEN
      v_received_at := NULL;
    END;

    IF v_received_at IS NOT NULL AND v_received_at > now() - interval '30 minutes' THEN
      CONTINUE;
    END IF;

    -- Bloco atual é ai_receipt?
    SELECT EXISTS (
      SELECT 1
      FROM chat_flows cf, jsonb_array_elements(cf.blocks) b
      WHERE cf.id = v_conv.current_flow_id
        AND b->>'id' = v_conv.current_block_id
        AND b->>'type' = 'ai_receipt'
    ) INTO v_ai_block;

    IF v_ai_block THEN
      CONTINUE;
    END IF;

    -- Remove apenas a chave; nada mais é alterado
    UPDATE webchat_conversations
    SET flow_variables = flow_variables - '__pending_receipt_media'
    WHERE id = v_conv.id;

    INSERT INTO ai_receipt_audits (conversation_id, organization_id, decision, metadata, created_at)
    VALUES (
      v_conv.id,
      v_conv.organization_id,
      'PENDING_RECEIPT_MEDIA_EXPIRED_CLEANUP',
      jsonb_build_object(
        'reason', 'orphan_buffer_older_than_30min_outside_ai_receipt',
        'received_at', v_received_at,
        'current_block_id', v_conv.current_block_id,
        'current_flow_id', v_conv.current_flow_id,
        'removed_payload', v_conv.flow_variables->'__pending_receipt_media'
      ),
      now()
    );

    v_cleaned := v_cleaned + 1;
  END LOOP;

  RAISE NOTICE 'cleaned=%', v_cleaned;
END $$;
