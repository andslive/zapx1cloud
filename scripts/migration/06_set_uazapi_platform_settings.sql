-- 06_set_uazapi_platform_settings.sql
-- Preenche as credenciais GLOBAIS da UazAPI em public.platform_settings, que ficaram
-- vazias no Supabase novo porque platform_settings foi deliberadamente excluído da
-- migração de dados (é UPDATE manual por design — ver 03_import_supabase.sh / README).
--
-- Sintoma corrigido: o botão "Gerar QR" (UazAPI) falha porque whatsapp-proxy lê
-- platform_settings.uazapi_url / uazapi_admin_token e chama a UazAPI com adminToken
-- vazio -> a UazAPI recusa a criação da instância -> nenhum QR é gerado.
--
-- SEGURANÇA: este arquivo NÃO contém segredos nem placeholders literais. Os valores
-- reais são injetados em tempo de execução via variáveis do psql (-v ...), lidas de
-- variáveis de ambiente. Assim o arquivo pode ser versionado sem vazar credenciais.
--
-- Execução (ver comando completo no rodapé):
--   psql "$NEW_DB_URL" \
--     -v uazapi_url="$UAZAPI_URL" \
--     -v uazapi_admin_token="$UAZAPI_ADMIN_TOKEN" \
--     -v uazapi_system_name="$UAZAPI_SYSTEM_NAME" \
--     -f scripts/migration/06_set_uazapi_platform_settings.sql
--
-- Escopo: só a linha singleton (id abaixo) e só as 3 colunas UazAPI.

\set ON_ERROR_STOP on

BEGIN;

-- Trava de segurança: aborta se a linha singleton esperada não existir.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.platform_settings
    WHERE id = 'c29da4b6-1dc2-44a5-8537-1c3be360cfb0'
  ) THEN
    RAISE EXCEPTION 'platform_settings singleton (id c29da4b6-…) não encontrado — verifique antes de aplicar.';
  END IF;
END $$;

UPDATE public.platform_settings
SET uazapi_url         = :'uazapi_url',
    uazapi_admin_token = :'uazapi_admin_token',
    uazapi_system_name = :'uazapi_system_name'
WHERE id = 'c29da4b6-1dc2-44a5-8537-1c3be360cfb0';

-- Validação pós-update (NÃO imprime valores reais — apenas "sim/nao"):
SELECT
  CASE WHEN coalesce(uazapi_url,'')         = '' THEN 'nao' ELSE 'sim' END AS uazapi_url_configurado,
  CASE WHEN coalesce(uazapi_admin_token,'') = '' THEN 'nao' ELSE 'sim' END AS uazapi_admin_token_configurado,
  CASE WHEN coalesce(uazapi_system_name,'') = '' THEN 'nao' ELSE 'sim' END AS uazapi_system_name_configurado
FROM public.platform_settings
WHERE id = 'c29da4b6-1dc2-44a5-8537-1c3be360cfb0';

-- Revise a saída acima (esperado: sim | sim | sim). Se estiver correto, troque
-- ROLLBACK por COMMIT. Enquanto estiver validando, mantenha ROLLBACK para não gravar.
-- ROLLBACK;
COMMIT;
