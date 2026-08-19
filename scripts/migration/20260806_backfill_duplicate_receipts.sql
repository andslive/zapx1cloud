-- FASE 2 — backfill dos 7 casos históricos de comprovante reenviado que
-- geraram uma segunda venda (auditoria Fase 1, aprovada pelo usuário em
-- 2026-08-06). NÃO executar sem confirmação final — ver checklist no
-- relatório docs/reports/.
--
-- Pré-requisito: migration 20260806120000_receipt_fingerprint_dedup.sql já
-- aplicada (usa a coluna duplicate_of_purchase_audit_id).
--
-- O que este script faz:
--   1) Cria um backup lógico das 7 linhas ANTES de qualquer alteração.
--   2) Marca cada duplicata com purchase_status = 'duplicate' e
--      duplicate_of_purchase_audit_id apontando para a canônica.
--   3) NÃO apaga nada, NÃO toca meta_status/fbtrace_id/event_id/raw_payload/
--      raw_response (histórico do que realmente aconteceu com a Meta fica
--      intacto).
--   4) Idempotente: cada UPDATE só age se a linha ainda estiver como estava
--      no momento da auditoria (WHERE purchase_status = 'success').
--
-- O dashboard (src/hooks/useCommercialDashboard.ts:145) filtra
-- purchase_status = 'success' — então esta mudança sozinha já remove as 7
-- linhas da soma/cards/listagem sem precisar tocar em nenhum outro lugar.
--
-- Rollback: scripts/migration/20260806_rollback_duplicate_receipts.sql
-- (companion, gerado a partir do mesmo conjunto de IDs).

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════
-- 1) Backup lógico — mesmo padrão já usado neste banco (ver
--    backup_p11_locks_20260628, backup_p1_revert_20260628).
-- ═══════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.backup_purchase_audit_dedup_20260806 AS
SELECT *, now() AS snapshot_at
FROM public.purchase_audit
WHERE id IN (
  '0484a084-92e4-4d22-a178-da687d4b53f6', -- duplicata (lead fadd9d0f…, R$14,90)
  '3d2204b3-f506-4949-912c-463948f749af', -- duplicata (lead acdb4cc5…, R$10,00)
  'be1c5261-b707-478d-a281-9313c24ed877', -- duplicata (lead 002a50db…, R$10,00)
  'c6afb91a-2283-429b-be33-b2617bba8aca', -- duplicata (lead 16c13c67…, R$20,00)
  '52240358-221b-4bcd-b9e3-35d595eaf16c', -- duplicata (lead f971b880…, R$24,90)
  'af126479-02a8-4eb5-bca5-c2fc228ea63b', -- duplicata (lead cf38deb9…, R$25,00)
  '8ae64e0c-220d-4583-9caf-1e0a76c3dd7e', -- duplicata (lead cb525181…, R$30,00 — caso real reportado)
  -- canônicas também entram no backup, por completude/rastreabilidade
  'be5c9d32-3403-407e-add3-d2d0df381566',
  '87565b53-3e45-4448-abd8-68866cceacfa',
  '25c1f7a2-0a9e-4d71-ac72-60ce080bca01',
  '25f64176-ab47-49fc-8b59-83037efbb6a7',
  'c8ae02c8-e9c1-4868-8880-3bfc0322accd',
  'a346b7b1-da64-4d73-8322-6100e6e7599f',
  '70596872-c05b-4464-928a-cca7157390ab'
);

-- Confere que o backup pegou as 14 linhas esperadas (7 pares) antes de seguir.
DO $$
DECLARE v_count int;
BEGIN
  SELECT count(*) INTO v_count FROM public.backup_purchase_audit_dedup_20260806;
  IF v_count <> 14 THEN
    RAISE EXCEPTION 'Backup lógico com % linhas, esperado 14 — abortando antes de qualquer UPDATE.', v_count;
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════════════
-- 2) Marca as 7 duplicatas comprovadas. Idempotente via WHERE purchase_status = 'success'.
-- ═══════════════════════════════════════════════════════════════════════
UPDATE public.purchase_audit SET
  purchase_status = 'duplicate',
  duplicate_of_purchase_audit_id = 'be5c9d32-3403-407e-add3-d2d0df381566',
  duplicate_reason = 'confirmed_duplicate_receipt_backfill_2026-08-06'
WHERE id = '0484a084-92e4-4d22-a178-da687d4b53f6' AND purchase_status = 'success';

UPDATE public.purchase_audit SET
  purchase_status = 'duplicate',
  duplicate_of_purchase_audit_id = '87565b53-3e45-4448-abd8-68866cceacfa',
  duplicate_reason = 'confirmed_duplicate_receipt_backfill_2026-08-06'
WHERE id = '3d2204b3-f506-4949-912c-463948f749af' AND purchase_status = 'success';

UPDATE public.purchase_audit SET
  purchase_status = 'duplicate',
  duplicate_of_purchase_audit_id = '25c1f7a2-0a9e-4d71-ac72-60ce080bca01',
  duplicate_reason = 'confirmed_duplicate_receipt_backfill_2026-08-06'
WHERE id = 'be1c5261-b707-478d-a281-9313c24ed877' AND purchase_status = 'success';

UPDATE public.purchase_audit SET
  purchase_status = 'duplicate',
  duplicate_of_purchase_audit_id = '25f64176-ab47-49fc-8b59-83037efbb6a7',
  duplicate_reason = 'confirmed_duplicate_receipt_backfill_2026-08-06'
WHERE id = 'c6afb91a-2283-429b-be33-b2617bba8aca' AND purchase_status = 'success';

UPDATE public.purchase_audit SET
  purchase_status = 'duplicate',
  duplicate_of_purchase_audit_id = 'c8ae02c8-e9c1-4868-8880-3bfc0322accd',
  duplicate_reason = 'confirmed_duplicate_receipt_backfill_2026-08-06'
WHERE id = '52240358-221b-4bcd-b9e3-35d595eaf16c' AND purchase_status = 'success';

UPDATE public.purchase_audit SET
  purchase_status = 'duplicate',
  duplicate_of_purchase_audit_id = 'a346b7b1-da64-4d73-8322-6100e6e7599f',
  duplicate_reason = 'confirmed_duplicate_receipt_backfill_2026-08-06'
WHERE id = 'af126479-02a8-4eb5-bca5-c2fc228ea63b' AND purchase_status = 'success';

UPDATE public.purchase_audit SET
  purchase_status = 'duplicate',
  duplicate_of_purchase_audit_id = '70596872-c05b-4464-928a-cca7157390ab',
  duplicate_reason = 'confirmed_duplicate_receipt_backfill_2026-08-06'
WHERE id = '8ae64e0c-220d-4583-9caf-1e0a76c3dd7e' AND purchase_status = 'success';

-- ═══════════════════════════════════════════════════════════════════════
-- 3) Confere: exatamente 7 linhas devem ter sido marcadas, valor total
--    removido da soma deve ser R$134,80.
-- ═══════════════════════════════════════════════════════════════════════
DO $$
DECLARE v_count int; v_total numeric;
BEGIN
  SELECT count(*), COALESCE(sum(purchase_value), 0) INTO v_count, v_total
  FROM public.purchase_audit
  WHERE duplicate_reason = 'confirmed_duplicate_receipt_backfill_2026-08-06';
  IF v_count <> 7 THEN
    RAISE EXCEPTION 'Backfill marcou % linhas, esperado 7 — revertendo (ROLLBACK manual necessário se COMMIT já rodou).', v_count;
  END IF;
  IF v_total <> 134.80 THEN
    RAISE EXCEPTION 'Valor total marcado como duplicata = %, esperado 134.80 — revertendo.', v_total;
  END IF;
  RAISE NOTICE 'Backfill OK: % linhas marcadas, R$ % removidos da soma do dashboard.', v_count, v_total;
END $$;

-- Revisar o resultado abaixo ANTES do COMMIT (rode este arquivo com psql -1
-- ou remova o COMMIT e inspecione manualmente antes de confirmar).
COMMIT;
