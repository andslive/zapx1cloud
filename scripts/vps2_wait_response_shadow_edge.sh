#!/usr/bin/env bash
# =============================================================================
# Fase K.2 — VPS2: wait-response-shadow (Node/BullMQ) + Nginx HTTPS
# =============================================================================
# Diretórios (padrão das fases anteriores):
#   - edge-mini existente (NÃO TOCAR): /opt/x1zap/edge-mini
#   - NOVO serviço isolado:            /opt/x1zap/wait-response-shadow
#
# Este script:
#   1. Cria /opt/x1zap/wait-response-shadow com package.json + server.js
#   2. Instala deps (npm)
#   3. Gera/atualiza SHARED_TOKEN em /opt/x1zap/wait-response-shadow/.env
#   4. Sobe via PM2 como processo "wait-response-shadow" (porta 8090, bind 127.0.0.1)
#   5. Faz backup do site Nginx atual da VPS2 e injeta um único location
#      /jobs/wait-response/ apontando para 127.0.0.1:8090
#   6. nginx -t e reload (somente se passar)
#   7. Valida local (health) e externo (401 sem token, 200 com token)
#
# NÃO toca: edge-mini, J.2/J.3/J.4 (uazapi-send/media), nada de outro location.
# NÃO grava secret no Supabase. Apenas imprime URL+TOKEN no final.
#
# Uso:
#   sudo bash vps2_wait_response_shadow_edge.sh
#
# Ajuste antes de rodar (somente se o site Nginx não for o padrão):
NGINX_SITE="${NGINX_SITE:-/etc/nginx/sites-enabled/default}"
REDIS_URL="${REDIS_URL:-redis://127.0.0.1:6379}"
CALLBACK_URL="${CALLBACK_URL:-https://qagoydprfofyohrwntjv.supabase.co/functions/v1/wait-response-shadow-validate}"
SERVICE_DIR="${SERVICE_DIR:-/opt/x1zap/wait-response-shadow}"
SERVICE_PORT="${SERVICE_PORT:-8090}"
PM2_NAME="${PM2_NAME:-wait-response-shadow}"
LOCATION_PATH="${LOCATION_PATH:-/jobs/wait-response/}"
# =============================================================================
set -euo pipefail

log() { printf '\n[K.2] %s\n' "$*"; }
die() { printf '\n[K.2][ERRO] %s\n' "$*" >&2; exit 1; }

[[ $EUID -eq 0 ]] || die "Rode como root (sudo)."
command -v node >/dev/null   || die "Node.js não encontrado."
command -v npm  >/dev/null   || die "npm não encontrado."
command -v pm2  >/dev/null   || die "pm2 não encontrado (npm i -g pm2)."
command -v nginx >/dev/null  || die "nginx não encontrado."
command -v openssl >/dev/null || die "openssl não encontrado."
[[ -f "$NGINX_SITE" ]] || die "Site Nginx não encontrado em $NGINX_SITE (exporte NGINX_SITE=...)."

log "Diretório do serviço: $SERVICE_DIR"
mkdir -p "$SERVICE_DIR"

# ----------------------------------------------------------------------------
# 1) package.json
# ----------------------------------------------------------------------------
cat > "$SERVICE_DIR/package.json" <<'PKGJSON_K2_EOF'
{
  "name": "wait-response-shadow",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": { "start": "node server.js" },
  "dependencies": {
    "bullmq": "^5.12.0",
    "express": "^4.19.2",
    "ioredis": "^5.4.1",
    "undici": "^6.19.8"
  }
}
PKGJSON_K2_EOF

# ----------------------------------------------------------------------------
# 2) server.js
# ----------------------------------------------------------------------------
cat > "$SERVICE_DIR/server.js" <<'SERVERJS_K2_EOF'
// Fase K.2 — wait-response-shadow (VPS2). Sem efeito em produção.
import express from "express";
import { Queue, Worker, QueueEvents } from "bullmq";
import IORedis from "ioredis";
import { fetch } from "undici";

const PORT = Number(process.env.PORT ?? 8090);
const REDIS_URL = process.env.REDIS_URL ?? "redis://127.0.0.1:6379";
const SHARED_TOKEN = process.env.SHARED_TOKEN ?? "";
const QUEUE_NAME = process.env.QUEUE_NAME ?? "wait_response_shadow";
const BIND = process.env.BIND ?? "127.0.0.1";

if (!SHARED_TOKEN) {
  console.error("[K.2] SHARED_TOKEN ausente");
  process.exit(1);
}

const connection = new IORedis(REDIS_URL, { maxRetriesPerRequest: null });
const queue = new Queue(QUEUE_NAME, { connection });
const events = new QueueEvents(QUEUE_NAME, { connection });
events.on("failed", ({ jobId, failedReason }) =>
  console.warn(`[K.2] job ${jobId} failed: ${failedReason}`)
);

new Worker(
  QUEUE_NAME,
  async (job) => {
    const { conversation_id, block_id, scheduled_for, callback_url, callback_token, log_id } = job.data ?? {};
    if (!callback_url) throw new Error("callback_url missing");
    const fired_at = new Date().toISOString();
    const res = await fetch(callback_url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${callback_token ?? SHARED_TOKEN}`,
      },
      body: JSON.stringify({ log_id, conversation_id, block_id, scheduled_for, fired_at, vps_job_id: job.id }),
    });
    const txt = await res.text().catch(() => "");
    console.log(`[K.2][fired] job=${job.id} conv=${conversation_id} block=${block_id} status=${res.status}`);
    if (!res.ok) throw new Error(`callback HTTP ${res.status}: ${txt.slice(0, 200)}`);
    return { status: res.status };
  },
  { connection, concurrency: Number(process.env.WORKER_CONCURRENCY ?? 16) }
);

const app = express();
app.use(express.json({ limit: "256kb" }));

// Health pública (para o operador validar via curl) — sem token.
app.get("/health", (_req, res) => res.json({ ok: true, queue: QUEUE_NAME }));

// Auth para tudo abaixo
app.use((req, res, next) => {
  const tok = (req.headers.authorization ?? "").replace(/^Bearer\s+/i, "").trim();
  if (tok !== SHARED_TOKEN) return res.status(401).json({ error: "unauthorized" });
  next();
});

app.get("/health-auth", (_req, res) => res.json({ ok: true, queue: QUEUE_NAME, auth: true }));

app.post("/jobs/wait-response/enqueue", async (req, res) => {
  try {
    const { log_id, conversation_id, block_id, funnel_id, scheduled_for, delay_ms, callback_url, callback_token } = req.body ?? {};
    if (!conversation_id || !block_id || !scheduled_for || typeof delay_ms !== "number" || !callback_url) {
      return res.status(400).json({ error: "missing fields" });
    }
    const safeDelay = Math.max(0, Math.min(delay_ms, 7 * 24 * 3600_000));
    const jobId = `${conversation_id}:${block_id}:${new Date(scheduled_for).getTime()}`;
    const job = await queue.add(
      "validate",
      { log_id, conversation_id, block_id, funnel_id, scheduled_for, callback_url, callback_token },
      {
        jobId,
        delay: safeDelay,
        removeOnComplete: { age: 24 * 3600, count: 5000 },
        removeOnFail: { age: 7 * 24 * 3600, count: 5000 },
        attempts: 3,
        backoff: { type: "exponential", delay: 5000 },
      }
    );
    console.log(`[K.2][enqueue] job=${jobId} delay=${safeDelay}ms conv=${conversation_id} block=${block_id}`);
    return res.json({ ok: true, job_id: jobId, queued_id: job.id, delay_ms: safeDelay });
  } catch (err) {
    console.error("[K.2] enqueue error:", err);
    return res.status(500).json({ error: String(err?.message ?? err) });
  }
});

app.listen(PORT, BIND, () => console.log(`[K.2] wait-response-shadow listening on ${BIND}:${PORT}`));
SERVERJS_K2_EOF

# ----------------------------------------------------------------------------
# 3) .env (gera token se ainda não existir)
# ----------------------------------------------------------------------------
ENV_FILE="$SERVICE_DIR/.env"
if [[ -f "$ENV_FILE" ]] && grep -q '^SHARED_TOKEN=' "$ENV_FILE"; then
  log ".env já existe, mantendo SHARED_TOKEN atual."
  SHARED_TOKEN="$(grep '^SHARED_TOKEN=' "$ENV_FILE" | head -n1 | cut -d= -f2-)"
else
  SHARED_TOKEN="$(openssl rand -hex 32)"
  cat > "$ENV_FILE" <<ENVEOF
PORT=$SERVICE_PORT
BIND=127.0.0.1
REDIS_URL=$REDIS_URL
SHARED_TOKEN=$SHARED_TOKEN
QUEUE_NAME=wait_response_shadow
WORKER_CONCURRENCY=16
ENVEOF
  chmod 600 "$ENV_FILE"
  log "Gerado novo SHARED_TOKEN em $ENV_FILE"
fi

# ----------------------------------------------------------------------------
# 4) npm install + PM2
# ----------------------------------------------------------------------------
log "Instalando dependências..."
( cd "$SERVICE_DIR" && npm install --omit=dev --no-audit --no-fund )

log "Subindo via PM2 ($PM2_NAME)..."
pm2 delete "$PM2_NAME" >/dev/null 2>&1 || true
( cd "$SERVICE_DIR" && env $(grep -v '^#' .env | xargs) pm2 start server.js --name "$PM2_NAME" --update-env )
pm2 save >/dev/null

# ----------------------------------------------------------------------------
# 5) Validação local
# ----------------------------------------------------------------------------
log "Aguardando boot (3s)..."
sleep 3
log "Validando health local em 127.0.0.1:$SERVICE_PORT/health ..."
if ! curl -fsS "http://127.0.0.1:$SERVICE_PORT/health" >/dev/null; then
  pm2 logs "$PM2_NAME" --lines 50 --nostream || true
  die "Health local falhou. Veja pm2 logs $PM2_NAME."
fi
log "Health local OK."

# ----------------------------------------------------------------------------
# 6) Patch Nginx (idempotente)
# ----------------------------------------------------------------------------
MARK_BEGIN="# >>> K2_WAIT_RESPONSE_SHADOW BEGIN"
MARK_END="# <<< K2_WAIT_RESPONSE_SHADOW END"

if grep -q "$MARK_BEGIN" "$NGINX_SITE"; then
  log "Bloco Nginx já presente em $NGINX_SITE (idempotente, mantendo)."
else
  BACKUP="${NGINX_SITE}.bak.k2.$(date +%s)"
  cp "$NGINX_SITE" "$BACKUP"
  log "Backup do Nginx: $BACKUP"

  # injeta antes do último '}' (fechamento do bloco server { })
  LAST_BRACE=$(grep -n '^}' "$NGINX_SITE" | tail -n1 | cut -d: -f1)
  [[ -n "${LAST_BRACE:-}" ]] || die "Não consegui localizar fechamento do server{} em $NGINX_SITE."

  TMP="$(mktemp)"
  head -n $((LAST_BRACE - 1)) "$NGINX_SITE" > "$TMP"
  cat >> "$TMP" <<NGINXEOF

    $MARK_BEGIN
    location $LOCATION_PATH {
        proxy_pass http://127.0.0.1:$SERVICE_PORT/;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 30s;
        proxy_send_timeout 30s;
    }
    $MARK_END
NGINXEOF
  tail -n +"$LAST_BRACE" "$NGINX_SITE" >> "$TMP"
  mv "$TMP" "$NGINX_SITE"
  log "Bloco location $LOCATION_PATH injetado."
fi

log "Testando Nginx..."
if ! nginx -t; then
  die "nginx -t falhou. Reverta com o backup gerado acima."
fi
nginx -s reload
log "Nginx recarregado."

# ----------------------------------------------------------------------------
# 7) Validação externa
# ----------------------------------------------------------------------------
SERVER_NAME=$(grep -E '^\s*server_name' "$NGINX_SITE" | head -n1 | awk '{print $2}' | tr -d ';' || true)
[[ -n "$SERVER_NAME" ]] || SERVER_NAME="<host-vps2>"

EXTERNAL_HEALTH="https://${SERVER_NAME}${LOCATION_PATH}health"
EXTERNAL_ENQUEUE="https://${SERVER_NAME}${LOCATION_PATH}jobs/wait-response/enqueue"

log "Validação externa SEM token (esperado 200 em /health pública):"
curl -s -o /dev/null -w "  GET %{http_code} %{url_effective}\n" "$EXTERNAL_HEALTH" || true

log "Validação externa SEM token no enqueue (esperado 401):"
curl -s -o /dev/null -w "  POST %{http_code} %{url_effective}\n" -X POST "$EXTERNAL_ENQUEUE" -H "Content-Type: application/json" -d '{}' || true

log "Validação externa COM token no health-auth (esperado 200):"
curl -s -o /dev/null -w "  GET %{http_code} %{url_effective}\n" -H "Authorization: Bearer $SHARED_TOKEN" "https://${SERVER_NAME}${LOCATION_PATH}health-auth" || true

cat <<DONE

============================================================
[K.2] SERVIÇO LOCAL OK. NÃO GRAVE SECRETS AINDA.

Caminhos confirmados:
  - edge-mini (intacto):    /opt/x1zap/edge-mini
  - novo serviço K.2:       $SERVICE_DIR
  - PM2 process:            $PM2_NAME (porta 127.0.0.1:$SERVICE_PORT)
  - Nginx site editado:     $NGINX_SITE
  - Location pública:       $LOCATION_PATH

URL final para usar nos secrets depois:
  VPS2_WAIT_RESPONSE_SHADOW_URL=https://${SERVER_NAME}${LOCATION_PATH}jobs/wait-response/enqueue
  VPS2_WAIT_RESPONSE_SHADOW_TOKEN=$SHARED_TOKEN

Próximos checks manuais antes de pedir os secrets no Lovable:
  1) curl -i http://127.0.0.1:$SERVICE_PORT/health                  # 200
  2) curl -i https://${SERVER_NAME}${LOCATION_PATH}health           # 200 (pública)
  3) curl -i -X POST https://${SERVER_NAME}${LOCATION_PATH}jobs/wait-response/enqueue   # 401
  4) curl -i -H "Authorization: Bearer \$TOKEN" https://${SERVER_NAME}${LOCATION_PATH}health-auth   # 200
  5) redis-cli ping                                                  # PONG

pm2 logs $PM2_NAME --lines 50
============================================================
DONE
