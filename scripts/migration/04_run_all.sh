#!/usr/bin/env bash
# Orquestra a migração completa dos dados operacionais: valida CSVs -> recriar usuários -> import.
# Idempotente: pode ser rodado mais de uma vez sem duplicar dados (ver README.md).
#
# Fonte dos dados: CSVs já fornecidos em DATA_EXPORT_DIR (default:
# /opt/x1zap/zapx1cloud/data-export) — não conecta mais no banco Lovable.
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

: "${NEW_DATABASE_URL:?defina NEW_DATABASE_URL}"
: "${NEW_SUPABASE_URL:?defina NEW_SUPABASE_URL}"
: "${NEW_SUPABASE_SERVICE_ROLE_KEY:?defina NEW_SUPABASE_SERVICE_ROLE_KEY}"
: "${SUPER_ADMIN_EMAIL:?defina SUPER_ADMIN_EMAIL}"

echo "== 1/3 Validar CSVs de origem (data-export, sem conexão com banco) =="
bash "$DIR/01_export_lovable.sh"

echo "== 2/3 Recriar usuários + gerar mapa (Supabase novo, Auth Admin API) =="
deno run --allow-net --allow-env --allow-read --allow-write "$DIR/02_recreate_users_and_map.ts"

echo "== 3/3 Import (Supabase novo, staging + ON CONFLICT DO NOTHING) =="
bash "$DIR/03_import_supabase.sh"

echo
echo "Migração de dados operacionais concluída. Rode as validações do README antes do corte."
