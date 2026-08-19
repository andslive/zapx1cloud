-- FASE 11A — segredo opaco de callback para o modo webhook direto
-- HookCloud (POST vindo diretamente da Meta, sem possibilidade de validar
-- X-Hub-Signature-256 porque o App Secret pertence ao app da HookCloud,
-- não ao X1Zap — ver auditoria HookCloud, Fase 8B, seção 21.2).
--
-- Este segredo é uma MITIGAÇÃO, NÃO substitui HMAC. Ele só participa do
-- gate quando `onboarding_source = 'hookcloud'`; o caminho `direct_meta`
-- continua exigindo exclusivamente HMAC válido (meta-webhook-signature.ts,
-- intocado nesta migration e nesta fase).
--
-- Requisitos atendidos por este schema (ver
-- supabase/functions/_shared/meta-webhook-hookcloud-secret.ts para a
-- lógica de hash/comparação):
--   - valor bruto NUNCA persistido — só o hash SHA-256 (hex) é
--     armazenado; a geração do segredo bruto (>= 256 bits de entropia)
--     acontece fora do banco, no momento do cadastro manual da conexão
--     (fora do escopo desta fase — nenhuma conexão HookCloud existe
--     ainda), e o valor bruto só é mostrado uma vez ao operador.
--   - hash separado por conexão — coluna vive em
--     `evolution_instances_meta_cloud`, uma linha por conexão, já
--     vinculada a `organization_id` + `evolution_instance_id`
--     (connection_id) pela FK composta existente
--     (`evolution_instances_meta_cloud_conn_org_fk`) — nenhuma coluna
--     nova de vínculo é necessária.
--   - rotação possível: sobrescrever o hash (UPDATE futuro, fora desta
--     migration) invalida o segredo anterior imediatamente;
--     `hookcloud_webhook_secret_rotated_at` registra quando a última
--     rotação ocorreu, para auditoria/observabilidade.
--   - revogação possível: `hookcloud_webhook_secret_hash = NULL` invalida
--     o segredo sem precisar de uma coluna de status separada — o gate
--     (Fase 11A, código) trata hash ausente como "nenhum segredo
--     configurado", que reprova qualquer POST no modo hookcloud.
--   - não reutiliza `access_token_secret_ref` (referência ao Vault do
--     token de acesso Meta) nem nenhum outro secret — é um valor
--     inteiramente separado, com propósito distinto (autenticar a ORIGEM
--     do webhook, não autorizar chamadas à Graph API).
--
-- NÃO É INSERT/UPDATE: esta migration só adiciona colunas, idempotente,
-- sem tocar em nenhuma linha existente (a tabela está vazia hoje — 0
-- conexões Meta/HookCloud, confirmado na Fase 10C).
--
-- ORDEM OPERACIONAL: mesma regra já estabelecida na Fase 10A/10C — esta
-- migration deve ser aplicada e verificada por leitura ANTES de qualquer
-- deploy de código que a consuma. NÃO aplicada nesta fase.

ALTER TABLE public.evolution_instances_meta_cloud
  ADD COLUMN IF NOT EXISTS hookcloud_webhook_secret_hash text;

ALTER TABLE public.evolution_instances_meta_cloud
  ADD COLUMN IF NOT EXISTS hookcloud_webhook_secret_rotated_at timestamptz;

COMMENT ON COLUMN public.evolution_instances_meta_cloud.hookcloud_webhook_secret_hash IS
  'Hash SHA-256 (hex) de um segredo opaco de >= 256 bits usado para autenticar POSTs do webhook direto da Meta no modo onboarding_source=hookcloud (mitigação compensatória à ausência de HMAC verificável nesse modo — NUNCA substitui HMAC). O valor bruto nunca é persistido. NULL = nenhum segredo configurado (gate reprova). Ver /tmp/x1zap-hookcloud-audit-20260818.md, Fase 11A.';

COMMENT ON COLUMN public.evolution_instances_meta_cloud.hookcloud_webhook_secret_rotated_at IS
  'Timestamp da última rotação de hookcloud_webhook_secret_hash — só para auditoria/observabilidade, não participa da validação em si.';
