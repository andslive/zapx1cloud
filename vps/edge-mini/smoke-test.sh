#!/usr/bin/env bash
# ============================================================================
# Smoke test — Fase A (DRY_RUN). Não escreve em produção. Não chama UazAPI.
# Uso: bash smoke-test.sh [BASE_URL]
#   default BASE_URL: http://127.0.0.1:3002
# ============================================================================
set -euo pipefail

BASE="${1:-http://127.0.0.1:3002}"
ENV_FILE="${ENV_FILE:-/opt/x1zap/edge-mini/.env}"
TOKEN=""
if [ -f "$ENV_FILE" ]; then
  TOKEN="$(grep -E '^X1ZAP_INTERNAL_TOKEN=' "$ENV_FILE" | cut -d= -f2-)"
fi

pass() { printf "\033[1;32mPASS\033[0m %s\n" "$*"; }
fail() { printf "\033[1;31mFAIL\033[0m %s\n" "$*"; exit 1; }

echo "BASE=$BASE"

echo "[1] GET /health"
H="$(curl -fsS "$BASE/health")" || fail "health não respondeu"
echo "    $H"
echo "$H" | grep -q '"dry_run":true' || fail "DRY_RUN não está true no /health"
pass "health OK e DRY_RUN=true"

echo "[2] POST /webhooks/uazapi (payload sintético)"
R="$(curl -fsS -X POST "$BASE/webhooks/uazapi" \
  -H 'content-type: application/json' \
  -d '{"event":"smoke","message":{"id":"smoke-'"$(date +%s)"'"},"text":"hello"}')"
echo "    $R"
echo "$R" | grep -q '"queued":true' || fail "webhook não enfileirou"
pass "webhook enfileirou"

echo "[2b] POST /webhooks/uazapi-shadow (payload sintético)"
R="$(curl -fsS -X POST "$BASE/webhooks/uazapi-shadow" \
  -H 'content-type: application/json' \
  -d '{"event":"smoke_shadow","message":{"id":"smoke-shadow-'"$(date +%s)"'"},"text":"hello-shadow"}')"
echo "    $R"
echo "$R" | grep -q '"queued":true' || fail "shadow não enfileirou"
echo "$R" | grep -q '"shadow":true' || fail "shadow flag ausente"
pass "shadow webhook enfileirou"

echo "[3] POST /wa/send (auth interno, payload sintético)"
[ -n "$TOKEN" ] || fail "X1ZAP_INTERNAL_TOKEN não encontrado em $ENV_FILE"
R="$(curl -fsS -X POST "$BASE/wa/send" \
  -H 'content-type: application/json' \
  -H "x-internal-token: $TOKEN" \
  -d '{"organization_id":"ce20da09-82dd-457d-8325-88ac4deb348c","type":"text","to":"5500000000000","payload":{"text":"smoke"}}')"
echo "    $R"
echo "$R" | grep -q '"queued":true' || fail "/wa/send não enfileirou"
pass "/wa/send enfileirou"

echo "[4] PM2 status"
pm2 status || true

echo "[5] Logs recentes (últimas 20 linhas por app)"
pm2 logs --lines 20 --nostream || true

echo
pass "Smoke test concluído — DRY_RUN ativo, nenhuma escrita real."
