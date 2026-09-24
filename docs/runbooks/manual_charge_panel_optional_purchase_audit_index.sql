-- ═══════════════════════════════════════════════════════════════════════
-- OPCIONAL — NÃO APLICADO e NÃO necessário para a correção do painel (que deixa de consultar purchase_audit).
-- Só faça sentido se o diagnóstico (docs/runbooks/manual_charge_panel_diagnose_readonly.sql) mostrar que a view continua
-- sendo consultada por outros caminhos com o EXISTS em purchase_audit, ou se outras rotinas se beneficiarem.
-- Efeito medido em banco efêmero (1,04 M linhas, 692 mil success/recognized): consulta ANTIGA do painel
-- 8,04 s (HTTP 500, 57014) -> 0,56 s. Índice: ~9 MB, criado em ~1 s com 1 M linhas.
--
-- COMO APLICAR (manual, conexão direta, fora de transação): CREATE INDEX CONCURRENTLY não roda dentro de BEGIN/COMMIT
-- (por isso não usar `apply_pending.sh`, que usa --single-transaction), como as migrations CONCURRENTLY já existentes no repositório.
--   PGOPTIONS="-c lock_timeout=5s -c statement_timeout=900s" psql "$MC_DB_URL" -X -v ON_ERROR_STOP=1 -f <este arquivo>
-- Verificação: o índice deve estar válido:
--   SELECT indexrelid::regclass, indisvalid, indisready FROM pg_index WHERE indexrelid = 'public.idx_purchase_audit_lead_status'::regclass;
-- Se ficar inválido (interrompido): DROP INDEX CONCURRENTLY IF EXISTS public.idx_purchase_audit_lead_status; e repita.
-- Reversão: DROP INDEX CONCURRENTLY IF EXISTS public.idx_purchase_audit_lead_status;  (sem efeito em dados; só volta o plano anterior)
-- ═══════════════════════════════════════════════════════════════════════
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_purchase_audit_lead_status
  ON public.purchase_audit (lead_id, purchase_status);
