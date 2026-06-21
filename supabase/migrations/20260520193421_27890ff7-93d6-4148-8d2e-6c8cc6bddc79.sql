
CREATE OR REPLACE FUNCTION public.try_acquire_conversation_lock(
  p_conv uuid,
  p_ttl_ms int DEFAULT 30000
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lock_id uuid := gen_random_uuid();
  v_locked  uuid;
BEGIN
  INSERT INTO public.conversation_processing_locks (conversation_id, locked_until, locked_by, updated_at)
  VALUES (p_conv, now() + (p_ttl_ms || ' milliseconds')::interval, v_lock_id, now())
  ON CONFLICT (conversation_id) DO UPDATE
    SET locked_until = EXCLUDED.locked_until,
        locked_by    = EXCLUDED.locked_by,
        updated_at   = now()
    WHERE conversation_processing_locks.locked_until < now()
  RETURNING locked_by INTO v_locked;

  RETURN v_locked = v_lock_id;
END;
$$;
