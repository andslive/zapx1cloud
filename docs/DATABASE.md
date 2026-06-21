# Banco de dados — inventário

Baseline gerado em 2026-05-04 a partir do estado real do banco (`pg_catalog`).
As 161 migrations históricas foram movidas para `supabase/migrations/_archive/` e não executam.
Os 7 arquivos baseline em `supabase/migrations/` reproduzem 100% da estrutura em qualquer remix novo.

## Inventário (validado banco real ↔ baseline gerado)

| Objeto                         | Banco real | Baseline |
|--------------------------------|-----------:|---------:|
| Tabelas (public)               |        139 |      139 |
| Colunas                        |       2031 |     2031 |
| Primary keys                   |        139 |      139 |
| Foreign keys                   |        301 |      302 ¹ |
| Unique constraints             |         47 |       47 |
| Check constraints              |         71 |       71 |
| Índices (não-PK/UQ)            |        229 |      229 |
| Total de índices               |        415 |      415 |
| Funções PL/pgSQL + SQL (public)|         54 |       54 |
| Triggers (não-internos)        |         82 |       82 |
| Views                          |          3 |        3 |
| Materialized views             |          0 |        0 |
| RLS policies                   |        377 |      377 |
| Tabelas com RLS habilitado     |        139 |      139 |
| Enums                          |         11 |       11 |
| Extensions                     |          9 |        9 |

¹ Diferença de 1 FK = a migration baseline conta uma FK auto-referente que aparece como item único no `pg_constraint` mas é detectada duas vezes pelo grep no SQL gerado. Estrutural: idêntico.

## Estrutura dos arquivos baseline

```
supabase/migrations/
├── 00000000000001_extensions_and_types.sql   (84 linhas)   — 9 extensions, 11 enums
├── 00000000000002_tables.sql                 (2.405 linhas)— 139 CREATE TABLE com PK + defaults
├── 00000000000003_constraints_and_indexes.sql(659 linhas)  — 301 FK + 47 UQ + 71 CHECK + 229 INDEX
├── 00000000000004_functions.sql              (1.868 linhas)— 54 funções (has_role, distribute_lead, …)
├── 00000000000005_triggers_and_views.sql     (95 linhas)   — 82 triggers + 3 views
├── 00000000000006_rls_policies.sql           (1.164 linhas)— 139 ENABLE RLS + 377 CREATE POLICY + ALTER PUBLICATION
└── 00000000000007_seeds.sql                  (77 linhas)   — 4 plans + 7 categorias + 56 artigos help + 3 form templates + 1 release
```

## Domínios principais

### Multi-tenant
- `organizations` — empresa cliente (plano, limites, white-label)
- `profiles` — usuário (vinculado a `auth.users`, herda `organization_id`)
- `user_roles` — `app_role` enum (admin/manager/seller/super_admin), separado por segurança
- `user_permissions` — permissões granulares por usuário/módulo
- `sectors` + `sector_members` — setores e membros
- `squads` + `squad_members` — squads de vendas

### CRM
- `leads`, `lead_tags`, `lead_tag_assignments`, `lead_notes`, `lead_queue`,
  `lead_transfer_history`, `lead_semantic_memory` (vector), `lead_journey_events`
- `deals`, `pipeline_stages`, `commissions`, `commission_rules`
- `tasks`, `interactions`, `objections`

### Atendimento
- `webchat_conversations`, `webchat_messages`, `webchat_sessions`
- `evolution_instances`, `evolution_credentials`
- `support_tickets`, `support_messages`

### Captura
- `funnels`, `funnel_blocks`, `funnel_executions`, `funnel_webhook_logs`
- `forms`, `form_responses`, `form_templates`

### IA / Brain
- `product_agents`, `agent_action_logs`, `agent_tool_executions`, `agent_safety_limits`
- `ai_prompt_experiments`, `ai_prompt_variants`
- `knowledge_sources`, `training_materials`, `faqs`
- `org_ai_routing`, `org_ai_credentials`

### Integrações
- `cakto_orders`, `cakto_credentials`, `product_offers` (multi-platform: cakto/doppus/hotmart)
- `integration_settings` (Doppus, Hotmart, Sankhya, Facebook Leads, Firecrawl)
- `webhooks`, `tag_automations`, `post_sale_event_actions`, `post_sale_scenarios`

### Booking
- `booking_event_types`, `booking_requests`, `business_hours`, `business_holidays`
- `google_calendar_connections`, `calendar_events`

### Plataforma
- `platform_plans`, `platform_settings`, `platform_releases`, `platform_templates`
- `help_categories`, `help_articles`
- `email_templates`, `email_campaigns`, `mass_email_campaigns`

## Funções críticas
- `has_role(uuid, app_role)` — security definer, base de TODA RLS
- `is_super_admin(uuid)` — bypass cross-org
- `get_user_organization(uuid)` / `user_belongs_to_organization` — escopo multi-tenant
- `apply_tag_automations` — motor de tags (Cakto/Doppus/Hotmart)
- `calculate_commission` — cálculo de comissão por regra
- `distribute_lead` (via edge function + RPC) — Auto Dispatch
- `enforce_single_attendant` (trigger) — humano XOR IA na conversa
- `is_within_business_hours` — gate da cadência IA
- `search_lead_memory(vector)` — RAG por lead

## Como aplicar em um remix novo

1. Os 7 arquivos rodam em ordem alfabética (prefixo `0000000000000N`).
2. `auth.users` e `storage.objects` são gerenciados pelo Supabase — não tocados.
3. `_archive/` fica para consulta histórica; o Supabase CLI ignora subpastas.
4. Após aplicar, qualquer signup novo vira super admin via `claim_first_super_admin` ou trigger `auto-promote-super-admin`.

## Edge Functions
Ver `docs/EDGE_FUNCTIONS.md` (81 functions).
