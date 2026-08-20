-- FASE 14D — reforço de unicidade das credenciais HookCloud no próprio
-- banco, como defesa em profundidade adicional à checagem já existente no
-- código (`resolveMetaCloudConnectionByCallbackSecretHash`, em
-- meta-cloud-webhook/index.ts, falha fechado para 0 OU N>1 resultados —
-- ver revisão Fase 14B, seção "unicidade do hash", que já registrava a
-- ausência desta constraint como possível reforço futuro).
--
-- Impede no banco:
--   1) dois registros com o mesmo `hookcloud_webhook_secret_hash` (POST);
--   2) dois registros com o mesmo `hookcloud_verify_token_hash` (GET).
--
-- Índices ÚNICOS PARCIAIS (`WHERE ... IS NOT NULL`), não `UNIQUE
-- CONSTRAINT` — uma constraint UNIQUE comum trataria só UM `NULL` como
-- distinto por linha em algumas leituras ingênuas, mas o comportamento
-- real do Postgres já permite múltiplos NULLs mesmo em UNIQUE CONSTRAINT
-- (NULL nunca é igual a NULL). Ainda assim, o índice parcial é a forma
-- mais explícita e auditável de expressar a intenção real: "só linhas
-- com hash PREENCHIDO participam da regra de unicidade" — conexões
-- legadas, `direct_meta`, e registros ainda não provisionados (hash
-- NULL) continuam livres, em qualquer quantidade.
--
-- `CREATE UNIQUE INDEX IF NOT EXISTS` — idempotente quanto à EXISTÊNCIA
-- do índice. Nenhum backfill, nenhuma linha atualizada — a tabela está
-- vazia hoje (0 linhas, confirmado por leitura direta do Cloud na Fase
-- 14D antes desta migration), e mesmo que não estivesse, criar um índice
-- nunca modifica os dados da tabela.
--
-- NÃO aplicada nesta fase. Mesma ordem operacional das migrations
-- anteriores desta linha de trabalho: aplicar → verificar schema real →
-- só então deployar o código consumidor (`meta-cloud-webhook` com o gate
-- HookCloud e o GET individual da Fase 14A/14B seguem bloqueados para
-- deploy até esta migration ser revisada, mergeada e aplicada).
--
-- FASE 15A.1 — correção de nome (achado bloqueador da revisão Fase 15A):
-- o nome original do primeiro índice
-- (`evolution_instances_meta_cloud_hookcloud_webhook_secret_hash_uidx`)
-- tinha 65 bytes, 2 acima do limite de 63 bytes (`NAMEDATALEN`) do
-- PostgreSQL — o Postgres não rejeitaria isso com erro, apenas truncaria
-- o identificador silenciosamente no catálogo, divergindo do nome
-- documentado em todo lugar. Ambos os nomes foram encurtados
-- (`hookcloud` → `hc`) para caber com folga sob o limite: 58 bytes e 56
-- bytes respectivamente — sem alterar tabela, colunas, predicados ou
-- qualquer outro conteúdo desta migration.

CREATE UNIQUE INDEX IF NOT EXISTS
  evolution_instances_meta_cloud_hc_webhook_secret_hash_uidx
ON public.evolution_instances_meta_cloud (hookcloud_webhook_secret_hash)
WHERE hookcloud_webhook_secret_hash IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS
  evolution_instances_meta_cloud_hc_verify_token_hash_uidx
ON public.evolution_instances_meta_cloud (hookcloud_verify_token_hash)
WHERE hookcloud_verify_token_hash IS NOT NULL;

-- ══════════════════════════════════════════════════════════════════════
-- ROLLBACK (documentado, NÃO executado):
--
-- DROP INDEX IF EXISTS public.evolution_instances_meta_cloud_hc_webhook_secret_hash_uidx;
-- DROP INDEX IF EXISTS public.evolution_instances_meta_cloud_hc_verify_token_hash_uidx;
--
-- Nota: esta migration NÃO foi aplicada — este rollback é só
-- documentação preventiva, nunca executado nesta fase.
-- ══════════════════════════════════════════════════════════════════════
