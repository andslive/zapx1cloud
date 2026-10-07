-- Habilita RLS nas duas tabelas globais de referência apontadas pelo Security Advisor
-- ("RLS Disabled in Public"): manual_charge_br_ddd_timezones e manual_charge_country_defaults.
--
-- Contexto (diagnóstico de produção):
--   * São dados de configuração GLOBAIS (sem organization_id): 66 DDDs e 8 países.
--   * Estado anterior: RLS desligado, sem policies; SELECT para authenticated, tudo para service_role/postgres,
--     nada para anon/PUBLIC.
--   * Consumidores: só SQL. manual_charge_resolve_phone_timezone e manual_charge_official_market_prefix são
--     SECURITY INVOKER (precisam de SELECT para quem as chama); manual_charge_official_api_prevalidate e
--     manual_charge_update_lead_locale_timezone são SECURITY DEFINER (dono postgres, EXECUTE só service_role)
--     e não são afetadas pelo RLS. Nenhum uso em frontend, Edge Function ou script.
--
-- Efeito: leitura preservada para authenticated (mesmo acesso de antes); anon e PUBLIC continuam sem acesso;
-- NENHUMA policy de INSERT/UPDATE/DELETE (alterações só pelo backend, service_role, que ignora RLS).
-- Idempotente, aditiva, sem DROP de dados. Se as tabelas não existirem neste banco, não faz nada.

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

    -- Privilégios mínimos: sem acesso para PUBLIC/anon; authenticated só lê; escrita fica com o backend.
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC, anon', t);
    EXECUTE format('REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.%I FROM authenticated', t);
    EXECUTE format('GRANT SELECT ON public.%I TO authenticated, service_role', t);

    -- Única policy: leitura dos dados de referência por usuários autenticados (dado global, não sensível).
    -- Cria só se ainda não existir: um reaplicar não sobrescreve ajuste posterior da policy.
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = t AND policyname = t || '_authenticated_read') THEN
      EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (true)', t || '_authenticated_read', t);
    END IF;
  END LOOP;
END
$$;
