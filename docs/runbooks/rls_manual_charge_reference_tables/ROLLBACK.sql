-- CONTENÇÃO (fail-closed) da migration 20261006180000_rls_manual_charge_reference_tables.sql.
-- Isto NÃO restaura o estado anterior e NÃO desliga o RLS: mantém a proteção dos dados. Remove a leitura de
-- authenticated; as tabelas passam a ser lidas só por service_role/postgres (backend).
-- Efeito funcional: manual_charge_resolve_phone_timezone/official_market_prefix chamadas por authenticated passam a
-- falhar com "permission denied" (as funções DEFINER, executadas por service_role, continuam funcionando).
-- Para restaurar a leitura, reaplique a migration. Voltar a "RLS desligado" não é oferecido de propósito.
-- Idempotente: ignora tabelas que não existem.
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['manual_charge_br_ddd_timezones', 'manual_charge_country_defaults'] LOOP
    IF to_regclass('public.' || t) IS NULL THEN
      RAISE NOTICE 'tabela public.% não existe; ignorada', t;
      CONTINUE;
    END IF;
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_authenticated_read', t);
    EXECUTE format('REVOKE SELECT ON public.%I FROM authenticated', t);
  END LOOP;
END
$$;
