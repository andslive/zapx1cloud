-- 05_restore_supabase_grants.sql
-- Restaura os privilégios de tabela/sequência/rotina para os papéis do Supabase
-- (anon, authenticated, service_role) no schema public.
--
-- Motivo: o import de schema (schema_full.prepared.v3.sql) recriou as tabelas de
-- public SEM os GRANTs para anon/authenticated (dump DDL sem ACLs). Resultado:
-- has_table_privilege('authenticated', <tabela>, 'SELECT') = false em todas as
-- tabelas, e o app logado recebe "permission denied for table ..." — aparecendo
-- como telas vazias, mesmo com os dados presentes e o RLS correto.
--
-- Segurança: conceder ALL a anon/authenticated é o padrão de um projeto Supabase
-- novo. A proteção real continua sendo o RLS (habilitado, com policies) — este
-- patch NÃO altera dados nem policies, apenas os privilégios de acesso base que o
-- RLS depois restringe linha a linha.
--
-- Idempotente: GRANT/ALTER DEFAULT PRIVILEGES podem ser reaplicados sem efeito
-- colateral.

BEGIN;

-- Acesso ao schema
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

-- Privilégios nos objetos JÁ existentes
GRANT ALL ON ALL TABLES    IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL ROUTINES  IN SCHEMA public TO anon, authenticated, service_role;

-- Privilégios para objetos FUTUROS (evita o problema se novas tabelas/sequências/
-- rotinas forem criadas depois). Aplica-se ao papel que cria os objetos (postgres).
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON TABLES TO anon, authenticated, service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON ROUTINES TO anon, authenticated, service_role;

COMMIT;
