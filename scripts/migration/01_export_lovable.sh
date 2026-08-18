#!/usr/bin/env bash
# NOOP — mantido apenas por compatibilidade com 04_run_all.sh.
#
# Mudança de plano: não conectamos mais no banco Lovable para exportar.
# Os CSVs de origem já são fornecidos prontos em DATA_EXPORT_DIR
# (default: /opt/x1zap/zapx1cloud/data-export/), com um arquivo por tabela
# (ex.: organizations.csv, products.csv, ...), no mesmo formato que este
# script gerava antes (CSV HEADER, mesmas colunas de public.<tabela>).
#
# Este script só valida que os CSVs esperados existem — não conecta em
# nenhum banco e não gera nada.
set -euo pipefail

DATA_EXPORT_DIR="${DATA_EXPORT_DIR:-/opt/x1zap/zapx1cloud/data-export}"

TABLES=(
  organizations
  product_suites
  products
  sectors
  sales_squads
  capture_funnels
  evolution_instances
  integration_settings
  platform_plans
  subscriptions
  profiles
  user_roles
  user_permissions
  sector_members
  squad_members
  team_invitations
)

echo "Fonte dos dados: $DATA_EXPORT_DIR (CSVs fornecidos, sem conexão com banco Lovable)"

missing=0
for t in "${TABLES[@]}"; do
  f="$DATA_EXPORT_DIR/${t}.csv"
  if [ -f "$f" ]; then
    echo "  - OK: ${t}.csv"
  else
    echo "  - FALTA: ${t}.csv" >&2
    missing=1
  fi
done

if [ "$missing" -ne 0 ]; then
  echo "Faltam CSVs em $DATA_EXPORT_DIR. Nada foi importado." >&2
  exit 1
fi

echo "Todos os CSVs esperados estão presentes em $DATA_EXPORT_DIR."
