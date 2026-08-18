# Migração de dados operacionais — Lovable → Supabase novo

Nenhum destes scripts foi executado. São gerados para revisão antes de qualquer corte.

## Escopo (Fase 9.1 / 9.2)

Tabelas migradas, na ordem de dependência de FK:

```
1.  organizations
2.  product_suites          (opcional)
3.  products
4.  sectors
5.  sales_squads
6.  capture_funnels
7.  evolution_instances
8.  integration_settings
9.  platform_plans
10. subscriptions
—— a partir daqui depende de usuários recriados no Auth ——
11. [recriar usuários via Auth Admin API]  -> gera user_id_map
12. profiles
13. user_roles
14. user_permissions
15. sector_members
16. squad_members
17. team_invitations
—— fora da cadeia, tratamento à parte ——
18. platform_settings   (UPDATE seletivo, nunca INSERT)
```

Confirmado na Fase 9.1: `platform_plans`/`subscriptions` **não bloqueiam acesso** hoje (sem RLS/rota
dependente). Por isso podem rodar em paralelo com o resto, sem urgência de "antes do corte".

## Mudança de plano (Fase 9.4): origem dos dados passou a ser CSV local

Não conectamos mais no banco Lovable para exportar. Os CSVs de origem (um arquivo por tabela,
mesmo formato/colunas de `public.<tabela>`, com header) já são fornecidos prontos em
`DATA_EXPORT_DIR` (default: `/opt/x1zap/zapx1cloud/data-export/`).

- `01_export_lovable.sh` virou um **noop**: só valida que todos os CSVs esperados existem em
  `DATA_EXPORT_DIR`. Não conecta em nenhum banco.
- `02_recreate_users_and_map.ts` lê `profiles.csv` de `DATA_EXPORT_DIR` e grava
  `user_id_map.csv` no mesmo diretório.
- `03_import_supabase.sh` carrega os CSVs de `DATA_EXPORT_DIR` direto para as tabelas de
  staging via `\copy` — mesma lógica de staging, reescrita de FK, super admin, round-robin,
  `ON CONFLICT` e idempotência de antes, só mudou a origem do CSV.

## Arquivos

| Arquivo | Corresponde ao pedido | O que faz |
|---|---|---|
| `01_export_lovable.sh` | (1) Script de export → agora noop de validação | Confere se todos os CSVs esperados existem em `DATA_EXPORT_DIR`. Não conecta em banco. |
| `02_recreate_users_and_map.ts` | (3) Recriar usuários + (4) gerar mapa old→new | Lê `DATA_EXPORT_DIR/profiles.csv`, para cada e-mail (exceto o super admin) chama `admin.auth.admin.createUser` ou reaproveita usuário já existente, e grava `DATA_EXPORT_DIR/user_id_map.csv` (`old_user_id,new_user_id,email,created,is_super_admin`). O super admin entra no mapa (id existente, sem recriar) para permitir reescrita de FKs que apontam para ele. |
| `03_import_supabase.sh` | (2) Script de import + (5) reescrever FKs + (6) importar tabelas preservando UUIDs | Cria tabelas de staging (`stg.*`) no Supabase novo, carrega os CSVs de `DATA_EXPORT_DIR`, reescreve colunas de FK para usuário usando `user_id_map` (incl. `round_robin_config->'users'`), exclui explicitamente o super admin de `profiles`/`user_roles`/`user_permissions`/`sector_members`/`squad_members`, e faz `INSERT ... ON CONFLICT (id) DO NOTHING` na ordem de dependência. Gera `reports/round_robin_unmapped.csv` com funis que sobraram IDs sem mapear. |
| `04_run_all.sh` | (7) Orquestração idempotente | Chama 01 → 02 → 03 em sequência. Pode rodar mais de uma vez sem duplicar (staging é truncada a cada rodada; inserts usam `ON CONFLICT DO NOTHING`; `platform_settings` usa `UPDATE`). |

### Ajustes de segurança já aplicados (revisão anterior)

1. **Super admin no mapa, mas sem sobrescrita.** `02_recreate_users_and_map.ts` inclui o
   super admin em `user_id_map.csv` (`is_super_admin=true`), apenas com o `new_user_id` já
   existente no projeto novo — **sem** chamar `createUser` para ele. Isso permite que `owner_id`,
   `created_by`, `leader_id`, `invited_by` que apontavam para o super admin sejam reescritos
   corretamente (antes viravam `NULL`). Em compensação, `03_import_supabase.sh` exige
   `SUPER_ADMIN_EMAIL` e filtra explicitamente `WHERE lower(email) <> lower(super_admin_email)`
   nos INSERTs de `profiles`, `user_roles`, `user_permissions`, `sector_members`, `squad_members`
   — o profile/roles/permissions do super admin nunca são tocados, independente de estar no mapa.
2. **`capture_funnels.round_robin_config->'users'`** (lista de IDs usada na distribuição
   round-robin) é reescrita logo após o INSERT de `capture_funnels`, trocando cada ID antigo pelo
   novo via `user_id_map`. IDs sem mapeamento (usuário não migrado) são mantidos como estavam —
   não são apagados da lista — e listados em `scripts/migration/reports/round_robin_unmapped.csv`
   para revisão manual antes de habilitar round-robin nesses funis.

## Variáveis de ambiente necessárias (não commitar valores reais)

```
DATA_EXPORT_DIR=/opt/x1zap/zapx1cloud/data-export   # opcional, é o default
NEW_DATABASE_URL=postgres://...      # Supabase novo (ydunpoqdhijhnrarohiz), direct connection
NEW_SUPABASE_URL=https://ydunpoqdhijhnrarohiz.supabase.co
NEW_SUPABASE_SERVICE_ROLE_KEY=...    # necessária para Auth Admin API
SUPER_ADMIN_EMAIL="<SUPER_ADMIN_EMAIL>"   # excluído da recriação/alteração de usuário
```

## Ordem de execução recomendada

```
export NEW_DATABASE_URL=... NEW_SUPABASE_URL=... NEW_SUPABASE_SERVICE_ROLE_KEY=... SUPER_ADMIN_EMAIL=...
bash scripts/migration/04_run_all.sh
```

Ou passo a passo, revisando a saída de cada etapa antes de seguir:

```
bash scripts/migration/01_export_lovable.sh   # só valida os CSVs em DATA_EXPORT_DIR
deno run --allow-net --allow-env --allow-read --allow-write scripts/migration/02_recreate_users_and_map.ts
bash scripts/migration/03_import_supabase.sh
```

## Validações pós-import (mesmas da Fase 9.1)

- Contagem de linhas por tabela (CSV de origem vs. tabela importada).
- `platform_settings` continua com 1 única linha e `super_admin_bootstrapped` intacto.
- Login de teste com usuário não-super-admin recriado.
- RLS cross-org (usuário de uma org não vê dados de outra).
- `capture_funnels.flow_blocks` renderizando no editor.
- `evolution_instances` aparecendo em Integrações (desconectada até reconectar QR).

## Rollback

- Os CSVs de origem em `DATA_EXPORT_DIR` não são alterados por nenhum destes scripts (só leitura).
- No Supabase novo, cada tabela do escopo pode ser esvaziada com segurança via:
  `DELETE FROM <tabela> WHERE id = ANY(<lista de ids importados, presente nos CSVs de origem>);`
  (evita apagar dados que já existiam antes da migração, ex.: o super admin/org de teste).
- Usuários recriados podem ser removidos via `admin.auth.admin.deleteUser(new_user_id)` usando o
  `user_id_map.csv` como fonte da lista a reverter.
