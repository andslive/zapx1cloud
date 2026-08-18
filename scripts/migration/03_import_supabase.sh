#!/usr/bin/env bash
# Import idempotente dos dados operacionais para o Supabase novo.
# Usa tabelas de staging (schema `stg`) + INSERT ... ON CONFLICT (id) DO NOTHING,
# reescrevendo colunas de usuário (created_by/owner_id/invited_by/user_id/etc.)
# usando <DATA_EXPORT_DIR>/user_id_map.csv gerado por 02_recreate_users_and_map.ts.
#
# Fonte dos dados: CSVs já fornecidos em DATA_EXPORT_DIR (default:
# /opt/x1zap/zapx1cloud/data-export), um arquivo por tabela — não conecta mais
# no banco Lovable (isso foi feito antes, fora deste script).
#
# Pode ser executado mais de uma vez sem duplicar dados:
# - staging é TRUNCATE a cada rodada (não é o destino final);
# - INSERT no destino final sempre usa ON CONFLICT (id) DO NOTHING.
set -euo pipefail

: "${NEW_DATABASE_URL:?defina NEW_DATABASE_URL antes de rodar}"
: "${SUPER_ADMIN_EMAIL:?defina SUPER_ADMIN_EMAIL antes de rodar (usado para nunca tocar no profile/roles dele)}"

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
EXPORT_DIR="${DATA_EXPORT_DIR:-/opt/x1zap/zapx1cloud/data-export}"
REPORT_DIR="$DIR/reports"
mkdir -p "$REPORT_DIR"

if [ ! -f "$EXPORT_DIR/user_id_map.csv" ]; then
  echo "$EXPORT_DIR/user_id_map.csv não encontrado. Rode 02_recreate_users_and_map.ts antes." >&2
  exit 1
fi

psql "$NEW_DATABASE_URL" -v ON_ERROR_STOP=1 <<'SQL'
CREATE SCHEMA IF NOT EXISTS stg;

-- Espelha a estrutura das tabelas reais (colunas/defaults), sem constraints de FK,
-- para aceitar o CSV bruto mesmo com FKs ainda não resolvidas.
CREATE TABLE IF NOT EXISTS stg.organizations         (LIKE public.organizations INCLUDING DEFAULTS);
CREATE TABLE IF NOT EXISTS stg.product_suites        (LIKE public.product_suites INCLUDING DEFAULTS);
CREATE TABLE IF NOT EXISTS stg.products              (LIKE public.products INCLUDING DEFAULTS);
CREATE TABLE IF NOT EXISTS stg.sectors               (LIKE public.sectors INCLUDING DEFAULTS);
CREATE TABLE IF NOT EXISTS stg.sales_squads          (LIKE public.sales_squads INCLUDING DEFAULTS);
CREATE TABLE IF NOT EXISTS stg.capture_funnels       (LIKE public.capture_funnels INCLUDING DEFAULTS);
CREATE TABLE IF NOT EXISTS stg.evolution_instances   (LIKE public.evolution_instances INCLUDING DEFAULTS);
CREATE TABLE IF NOT EXISTS stg.integration_settings  (LIKE public.integration_settings INCLUDING DEFAULTS);
CREATE TABLE IF NOT EXISTS stg.platform_plans        (LIKE public.platform_plans INCLUDING DEFAULTS);
CREATE TABLE IF NOT EXISTS stg.subscriptions         (LIKE public.subscriptions INCLUDING DEFAULTS);
CREATE TABLE IF NOT EXISTS stg.profiles              (LIKE public.profiles INCLUDING DEFAULTS);
CREATE TABLE IF NOT EXISTS stg.user_roles            (LIKE public.user_roles INCLUDING DEFAULTS);
CREATE TABLE IF NOT EXISTS stg.user_permissions      (LIKE public.user_permissions INCLUDING DEFAULTS);
CREATE TABLE IF NOT EXISTS stg.sector_members        (LIKE public.sector_members INCLUDING DEFAULTS);
CREATE TABLE IF NOT EXISTS stg.squad_members         (LIKE public.squad_members INCLUDING DEFAULTS);
CREATE TABLE IF NOT EXISTS stg.team_invitations      (LIKE public.team_invitations INCLUDING DEFAULTS);

CREATE TABLE IF NOT EXISTS stg.user_id_map (
  old_user_id uuid,
  new_user_id uuid,
  email text,
  created boolean,
  is_super_admin boolean
);

TRUNCATE stg.organizations, stg.product_suites, stg.products, stg.sectors, stg.sales_squads,
         stg.capture_funnels, stg.evolution_instances, stg.integration_settings,
         stg.platform_plans, stg.subscriptions, stg.profiles, stg.user_roles,
         stg.user_permissions, stg.sector_members, stg.squad_members, stg.team_invitations,
         stg.user_id_map;
SQL

echo "Carregando CSVs em staging..."
for t in organizations product_suites products sectors sales_squads capture_funnels \
         evolution_instances integration_settings platform_plans subscriptions \
         profiles user_roles user_permissions sector_members squad_members team_invitations; do
  echo "  - $t"
  psql "$NEW_DATABASE_URL" -v ON_ERROR_STOP=1 -c \
    "\\copy stg.${t} FROM '${EXPORT_DIR}/${t}.csv' WITH CSV HEADER"
done
psql "$NEW_DATABASE_URL" -v ON_ERROR_STOP=1 -c \
  "\\copy stg.user_id_map FROM '${EXPORT_DIR}/user_id_map.csv' WITH CSV HEADER"

echo "Inserindo no destino final (ON CONFLICT DO NOTHING), na ordem de dependência..."
# Heredoc SEM aspas em 'SQL' de propósito: precisamos interpolar $SUPER_ADMIN_EMAIL_SQL
# (e-mail do super admin, escapado para uso em literal SQL) nos filtros abaixo.
SUPER_ADMIN_EMAIL_SQL="${SUPER_ADMIN_EMAIL//\'/\'\'}"
psql "$NEW_DATABASE_URL" -v ON_ERROR_STOP=1 <<SQL
BEGIN;

-- 1. platform_plans (sem FK de usuário; precisa vir antes de organizations, que tem
--    organizations.plan_id -> platform_plans.id)
INSERT INTO public.platform_plans SELECT * FROM stg.platform_plans
ON CONFLICT (id) DO NOTHING;

-- 2. organizations, 1º passe: owner_id SEMPRE NULL aqui.
--    Motivo: organizations.owner_id tem FK para public.profiles(id) (não auth.users), e
--    profiles.organization_id tem FK para organizations(id) — dependência circular real.
--    Resolvemos inserindo organizations sem owner, depois profiles (passo 3), e só então
--    fazendo UPDATE de owner_id no passo 4.
INSERT INTO public.organizations
SELECT o.id, o.name, o.logo_url, o.settings, o.created_at, o.updated_at, o.email, o.cnpj, o.phone,
       o.address, NULL::uuid AS owner_id, o.status, o.max_users, o.max_products, o.features,
       o.refund_policy, o.payment_policy, o.plan_id, o.max_connections, o.cakto_subscription_id,
       o.cakto_customer_email, o.ai_debounce_ms, o.ai_grouping_enabled, o.ai_grouping_window_ms,
       o.ai_grouping_max_ms, o.ai_typing_min_ms, o.ai_typing_max_ms, o.ai_dedup_enabled,
       o.ai_dedup_window_ms, o.ai_single_processing_per_conversation, o.presence_enabled,
       o.presence_recording_enabled, o.presence_typing_chars_per_sec, o.presence_jitter_pct,
       o.admin_status_notify_phone, o.admin_status_alerts_enabled
FROM stg.organizations o
ON CONFLICT (id) DO NOTHING;

-- 3. profiles (id É o user_id -> reescrito para o novo; EXCLUI explicitamente o
--    super admin por e-mail — mesmo estando no mapa (para resolver FKs como owner_id/
--    created_by/invited_by), seu profile/roles/permissions NUNCA são tocados aqui.
--    O profile do super admin já existe de antes — não é criado nem alterado.)
--    Precisa vir logo após organizations (FK profiles.organization_id) e antes de
--    qualquer tabela que referencie profiles (organizations.owner_id, capture_funnels,
--    team_invitations, sector_members).
INSERT INTO public.profiles
SELECT m.new_user_id, p.organization_id, p.full_name, p.email, p.avatar_url, p.phone,
       p.is_active, p.created_at, p.updated_at, p.booking_slug, p.booking_bio,
       p.recovery_whatsapp, p.work_start_time, p.work_end_time, p.farewell_message,
       p.default_theme, p.default_menu_state, p.default_connection_id,
       p.guided_onboarding_completed_at, p.guided_onboarding_skipped_at
FROM stg.profiles p
JOIN stg.user_id_map m ON m.old_user_id = p.id
WHERE lower(m.email) <> lower('${SUPER_ADMIN_EMAIL_SQL}')
ON CONFLICT (id) DO NOTHING;

-- 4. organizations, 2º passe: agora que profiles existem (as recém-inseridas e o super
--    admin, que já existia), reescreve owner_id via user_id_map. Se o dono mapeado não
--    tiver profile (caso não esperado), mantém NULL em vez de violar a FK.
UPDATE public.organizations o
SET owner_id = m.new_user_id
FROM stg.organizations so
JOIN stg.user_id_map m ON m.old_user_id = so.owner_id
WHERE o.id = so.id
  AND EXISTS (SELECT 1 FROM public.profiles pr WHERE pr.id = m.new_user_id);

-- 5. product_suites (created_by reescrito; sem FK constraint nesta coluna, ordem não é crítica)
INSERT INTO public.product_suites
SELECT s.id, s.organization_id, s.name, s.slug, s.description, s.icon_url, s.color, s.status,
       m.new_user_id AS created_by, s.created_at, s.updated_at
FROM stg.product_suites s
LEFT JOIN stg.user_id_map m ON m.old_user_id = s.created_by
ON CONFLICT (id) DO NOTHING;

-- 6. products (created_by reescrito)
INSERT INTO public.products
SELECT p.id, p.organization_id, p.name, p.description, p.pitch_15s, p.pitch_30s, p.pitch_2min,
       p.icp, p.differentials, p.pricing, p.status, p.settings, m.new_user_id AS created_by,
       p.created_at, p.updated_at, p.logo_url, p.banner_url, p.product_image_url, p.category,
       p.short_description, p.external_links, p.benefits, p.objections, p.plans,
       p.payment_conditions, p.guarantee, p.bonuses, p.discount_policy, p.knowledge_base, p.suite_id
FROM stg.products p
LEFT JOIN stg.user_id_map m ON m.old_user_id = p.created_by
ON CONFLICT (id) DO NOTHING;

-- 7. sectors (created_by reescrito)
INSERT INTO public.sectors
SELECT s.id, s.organization_id, s.name, s.color, s.description, s.bot_order, s.greeting_message,
       s.farewell_message, s.auto_close_ticket, s.enable_scheduling, s.rotation_enabled,
       s.rotation_strategy, s.is_active, m.new_user_id AS created_by, s.created_at, s.updated_at,
       s.icon, s.is_default
FROM stg.sectors s
LEFT JOIN stg.user_id_map m ON m.old_user_id = s.created_by
ON CONFLICT (id) DO NOTHING;

-- 8. sales_squads (leader_id e created_by reescritos)
INSERT INTO public.sales_squads
SELECT q.id, q.name, q.description, q.icon_url, q.product_id, q.organization_id,
       ml.new_user_id AS leader_id, q.color, q.is_active, q.created_at, q.updated_at,
       mc.new_user_id AS created_by
FROM stg.sales_squads q
LEFT JOIN stg.user_id_map ml ON ml.old_user_id = q.leader_id
LEFT JOIN stg.user_id_map mc ON mc.old_user_id = q.created_by
ON CONFLICT (id) DO NOTHING;

-- 9. capture_funnels (created_by e assigned_user_id reescritos)
INSERT INTO public.capture_funnels
SELECT f.id, f.organization_id, f.product_id, f.name, f.description, f.slug, f.status,
       f.flow_blocks, f.start_block_id, f.channels, f.widget_config, f.distribution_rule,
       f.assigned_squad_id, mu.new_user_id AS assigned_user_id, f.round_robin_config,
       f.default_temperature, f.default_tags, f.facebook_pixel_id, f.google_tag_id,
       f.custom_scripts, f.utm_capture, f.theme, f.ai_enabled, f.ai_context, f.total_views,
       f.total_leads, mc.new_user_id AS created_by, f.created_at, f.updated_at, f.appearance,
       f.allow_reentry
FROM stg.capture_funnels f
LEFT JOIN stg.user_id_map mu ON mu.old_user_id = f.assigned_user_id
LEFT JOIN stg.user_id_map mc ON mc.old_user_id = f.created_by
ON CONFLICT (id) DO NOTHING;

-- 9b. Reescreve IDs de usuário embutidos em capture_funnels.round_robin_config->'users'.
--     Onde o ID antigo tem mapeamento, troca pelo novo. Onde NÃO tem (usuário não migrado/
--     não encontrado), mantém o ID antigo como está (não apaga o item da lista) para não
--     mudar silenciosamente o comportamento de distribuição — esses casos são listados no
--     relatório gerado logo abaixo, para revisão manual antes do corte.
UPDATE public.capture_funnels f
SET round_robin_config = jsonb_set(
  f.round_robin_config,
  '{users}',
  (
    SELECT COALESCE(jsonb_agg(COALESCE(m.new_user_id::text, u.old_id)), '[]'::jsonb)
    FROM jsonb_array_elements_text(f.round_robin_config -> 'users') AS u(old_id)
    LEFT JOIN stg.user_id_map m ON m.old_user_id::text = u.old_id
  )
)
WHERE f.round_robin_config ? 'users'
  AND jsonb_typeof(f.round_robin_config -> 'users') = 'array'
  AND jsonb_array_length(f.round_robin_config -> 'users') > 0;

-- 10. evolution_instances (sem FK de usuário)
INSERT INTO public.evolution_instances SELECT * FROM stg.evolution_instances
ON CONFLICT (id) DO NOTHING;

-- 11. integration_settings (sem FK de usuário)
INSERT INTO public.integration_settings SELECT * FROM stg.integration_settings
ON CONFLICT (id) DO NOTHING;

-- 12. subscriptions (depende de organizations + platform_plans, ambos já inseridos acima)
INSERT INTO public.subscriptions SELECT * FROM stg.subscriptions
ON CONFLICT (id) DO NOTHING;

-- 13. user_roles (user_id reescrito; super admin excluído explicitamente)
--     Conflito resolvido por (user_id, role) — não por id — porque o banco novo tem um
--     trigger em profiles (ensure_first_user_is_admin) que pode inserir uma linha em
--     user_roles automaticamente antes deste INSERT rodar; o id gerado pelo trigger é
--     diferente do id vindo do CSV, então o conflito real está na constraint única
--     user_roles_user_id_role_key, não em id.
INSERT INTO public.user_roles
SELECT r.id, m.new_user_id, r.role, r.created_at
FROM stg.user_roles r
JOIN stg.user_id_map m ON m.old_user_id = r.user_id
WHERE lower(m.email) <> lower('${SUPER_ADMIN_EMAIL_SQL}')
ON CONFLICT (user_id, role) DO NOTHING;

-- 14. user_permissions (user_id reescrito; super admin excluído explicitamente)
INSERT INTO public.user_permissions
SELECT up.id, m.new_user_id, up.organization_id, up.view_queue_conversations,
       up.view_other_users_conversations, up.view_other_queues_conversations,
       up.allow_close_pending_tickets, up.view_all_contacts, up.allow_pipeline,
       up.allow_manage_client_portfolio, up.view_all_kanban_cards, up.view_all_schedules,
       up.allow_dashboard, up.allow_inbox_panel, up.allow_groups, up.allow_connection_actions,
       up.created_at, up.updated_at, up.view_unassigned_sector_tickets, up.view_schedules_mode
FROM stg.user_permissions up
JOIN stg.user_id_map m ON m.old_user_id = up.user_id
WHERE lower(m.email) <> lower('${SUPER_ADMIN_EMAIL_SQL}')
ON CONFLICT (id) DO NOTHING;

-- 15. sector_members (user_id reescrito; super admin excluído explicitamente)
INSERT INTO public.sector_members
SELECT sm.id, sm.sector_id, m.new_user_id, sm.joined_at
FROM stg.sector_members sm
JOIN stg.user_id_map m ON m.old_user_id = sm.user_id
WHERE lower(m.email) <> lower('${SUPER_ADMIN_EMAIL_SQL}')
ON CONFLICT (id) DO NOTHING;

-- 16. squad_members (user_id reescrito; super admin excluído explicitamente)
INSERT INTO public.squad_members
SELECT sm.id, sm.squad_id, m.new_user_id, sm.role, sm.joined_at
FROM stg.squad_members sm
JOIN stg.user_id_map m ON m.old_user_id = sm.user_id
WHERE lower(m.email) <> lower('${SUPER_ADMIN_EMAIL_SQL}')
ON CONFLICT (id) DO NOTHING;

-- 17. team_invitations (invited_by reescrito; convites do super admin ficam com invited_by NULL)
INSERT INTO public.team_invitations
SELECT ti.id, ti.email, ti.role, ti.squad_id, m.new_user_id AS invited_by, ti.organization_id,
       ti.token, ti.status, ti.expires_at, ti.created_at
FROM stg.team_invitations ti
LEFT JOIN stg.user_id_map m ON m.old_user_id = ti.invited_by
ON CONFLICT (id) DO NOTHING;

COMMIT;
SQL

echo "Gerando relatório de funis com round_robin_config->users não totalmente mapeado..."
psql "$NEW_DATABASE_URL" -v ON_ERROR_STOP=1 -c "
\\copy (
  SELECT f.id AS capture_funnel_id, f.organization_id, f.name,
         (
           SELECT jsonb_agg(u.old_id)
           FROM jsonb_array_elements_text(f.round_robin_config -> 'users') AS u(old_id)
           WHERE NOT EXISTS (
             SELECT 1 FROM stg.user_id_map m WHERE m.old_user_id::text = u.old_id
           )
         ) AS unmapped_old_user_ids
  FROM public.capture_funnels f
  WHERE f.distribution_rule = 'round_robin'
    AND f.round_robin_config ? 'users'
    AND EXISTS (
      SELECT 1
      FROM jsonb_array_elements_text(f.round_robin_config -> 'users') AS u(old_id)
      WHERE NOT EXISTS (SELECT 1 FROM stg.user_id_map m WHERE m.old_user_id::text = u.old_id)
    )
) TO '${REPORT_DIR}/round_robin_unmapped.csv' WITH CSV HEADER
"

if [ -s "$REPORT_DIR/round_robin_unmapped.csv" ] && [ "$(wc -l < "$REPORT_DIR/round_robin_unmapped.csv")" -gt 1 ]; then
  echo "  ATENÇÃO: existem funis com IDs de usuário em round_robin_config que não puderam ser"
  echo "  mapeados (usuário não migrado ou não encontrado). Ver: $REPORT_DIR/round_robin_unmapped.csv"
  echo "  Esses funis mantêm os IDs antigos na lista — revise manualmente antes de habilitar round-robin."
else
  echo "  Nenhum funil com IDs não mapeados em round_robin_config."
fi

echo "Import concluído. platform_settings NÃO foi tocado (é UPDATE manual, ver README)."
