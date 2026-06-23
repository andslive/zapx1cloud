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

echo "[2b] POST /webhooks/uazapi-shadow (payload sintético com origin marcador)"
SHADOW_ID="smoke-shadow-$(date +%s)"
R="$(curl -fsS -X POST "$BASE/webhooks/uazapi-shadow" \
  -H 'content-type: application/json' \
  -d '{"event":"smoke_shadow","origin":"lovable-uazapi-webhook-shadow","message":{"id":"'"$SHADOW_ID"'"},"text":"hello-shadow"}')"
echo "    $R"
echo "$R" | grep -q '"queued":true' || fail "shadow não enfileirou"
echo "$R" | grep -q '"shadow":true' || fail "shadow flag ausente"
pass "shadow webhook enfileirou"

echo "[2c] GET /stats/raw-storage (após shadow)"
sleep 2
S="$(curl -fsS "$BASE/stats/raw-storage")"
echo "    $S"
echo "$S" | grep -q '"todayFiles"' || fail "stats sem todayFiles"
echo "$S" | grep -q '"totalFiles"' || fail "stats sem totalFiles"
echo "$S" | grep -q '"diskUsageMb"' || fail "stats sem diskUsageMb"
TODAY_DIR="/opt/x1zap/edge-mini/storage/raw-payloads/$(date -u +%F)"
if ls "$TODAY_DIR"/*"$SHADOW_ID"*.json >/dev/null 2>&1; then
  pass "arquivo raw criado em $TODAY_DIR"
else
  echo "    (aviso) arquivo não localizado em $TODAY_DIR — verifique permissões/worker"
fi

echo "[2d] GET /stats/events"
E="$(curl -fsS "$BASE/stats/events")"
echo "    $E"
echo "$E" | grep -q '"totalFiles"' || fail "stats/events sem totalFiles"
echo "$E" | grep -q '"byEvent"' || fail "stats/events sem byEvent"
echo "$E" | grep -q '"bySource"' || fail "stats/events sem bySource"
echo "$E" | grep -q '"byHour"' || fail "stats/events sem byHour"
pass "/stats/events OK"

echo "[2e] GET /stats/supabase-write (default disabled)"
SW="$(curl -fsS "$BASE/stats/supabase-write")"
echo "    $SW"
echo "$SW" | grep -q '"enabled"' || fail "stats/supabase-write sem enabled"
echo "$SW" | grep -q '"counters"' || fail "stats/supabase-write sem counters"
if echo "$SW" | grep -q '"enabled":false'; then
  pass "/stats/supabase-write OK (ENABLE_SUPABASE_WRITE=false por padrão)"
else
  echo "    (aviso) ENABLE_SUPABASE_WRITE != false — confirme intencional"
fi

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
