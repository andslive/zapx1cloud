-- ═══════════════════════════════════════════════════════════════════════
-- Painel Cobrança — diagnóstico de desempenho em produção. SOMENTE LEITURA (BEGIN READ ONLY + ROLLBACK).
-- Não devolve telefone, nome nem texto de mensagem: só tamanhos, índices, políticas e planos de execução.
-- O `EXPLAIN (ANALYZE)` EXECUTA a consulta (lê dados; não grava). O limite de tempo abaixo vale só para esta transação
-- (investigação); NÃO é uma mudança de configuração.
-- Uso:  psql "$MC_DB_URL" -X -v ON_ERROR_STOP=1 -v admin_user_id=<uuid de um administrador da organização> \
--         -f docs/runbooks/manual_charge_panel_diagnose_readonly.sql | tee diag_painel_$(date -u +%Y%m%dT%H%M%SZ).out
-- ═══════════════════════════════════════════════════════════════════════
\if :{?admin_user_id}
\else
  \echo 'ERRO: passe -v admin_user_id=<uuid>'
  \quit 3
\endif
\pset pager off
BEGIN TRANSACTION READ ONLY;
SET LOCAL statement_timeout = '90s';

\echo '--- 1. tamanho e estatísticas das tabelas envolvidas'
SELECT c.relname, c.reltuples::bigint AS linhas_estimadas, pg_size_pretty(pg_total_relation_size(c.oid)) AS tamanho_total,
       s.last_analyze, s.last_autoanalyze, s.n_dead_tup
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace LEFT JOIN pg_stat_user_tables s ON s.relid = c.oid
WHERE n.nspname = 'public' AND c.relname IN ('purchase_audit','webchat_messages','webchat_conversations','leads','manual_charge_dispatches',
  'manual_charge_classification_jobs','manual_charge_conversation_facts') ORDER BY c.relname;

\echo '--- 2. índices de purchase_audit (há algum começando por lead_id?)'
SELECT indexname, indexdef FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'purchase_audit' ORDER BY 1;

\echo '--- 3. políticas RLS de purchase_audit (todas as permissivas são combinadas com OR)'
SELECT policyname, permissive, roles, cmd, qual FROM pg_policies WHERE schemaname = 'public' AND tablename = 'purchase_audit' ORDER BY 1;

\echo '--- 4. linhas de purchase_audit que satisfazem o EXISTS da view (success/recognized) — define se o plano é hasheado ou por dispatch'
SELECT count(*) FILTER (WHERE purchase_status IN ('success','recognized')) AS success_recognized, count(*) AS total FROM public.purchase_audit;

\echo '--- 5. work_mem e timeout do papel authenticated'
SHOW work_mem;
SELECT rolname, rolconfig FROM pg_roles WHERE rolname IN ('authenticated', 'authenticator', 'anon');

\echo '--- 6. PLANO da consulta ANTIGA do painel (select=* sem paginação) como usuário authenticated'
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub', :'admin_user_id', 'role', 'authenticated')::text, true);
EXPLAIN (ANALYZE, BUFFERS, COSTS OFF, TIMING ON) SELECT * FROM public.manual_charge_dispatches_panel;

\echo '--- 7. PLANO da consulta NOVA (colunas explícitas, página de 20, ordenada)'
EXPLAIN (ANALYZE, BUFFERS, COSTS OFF, TIMING ON)
SELECT dispatch_id, lead_name, charge_kind, status, scheduling_status, review_reason, created_at
FROM public.manual_charge_dispatches_panel ORDER BY created_at DESC, dispatch_id ASC LIMIT 20 OFFSET 0;

ROLLBACK;
\echo DIAGNOSTICO_CONCLUIDO
