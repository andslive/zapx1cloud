-- FASE 2 — rollback do backfill de comprovantes duplicados
-- (companion de 20260806_backfill_duplicate_receipts.sql).
--
-- Reverte SOMENTE as 7 linhas marcadas por esse backfill específico
-- (filtra por duplicate_reason, não por lista de IDs solta, para nunca
-- reverter uma duplicata marcada por outro motivo no futuro).
--
-- Não depende do backup lógico para reverter (o UPDATE original só mudou
-- purchase_status/duplicate_of_purchase_audit_id/duplicate_reason — todos
-- os demais campos, incluindo meta_status/fbtrace_id/event_id, nunca foram
-- tocados). A tabela de backup (backup_purchase_audit_dedup_20260806)
-- permanece disponível para conferência, não é apagada por este script.

BEGIN;

UPDATE public.purchase_audit
SET
  purchase_status = 'success',
  duplicate_of_purchase_audit_id = NULL,
  duplicate_reason = NULL
WHERE duplicate_reason = 'confirmed_duplicate_receipt_backfill_2026-08-06';

DO $$
DECLARE v_count int;
BEGIN
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE 'Rollback OK: % linhas revertidas para purchase_status = success.', v_count;
END $$;

COMMIT;
