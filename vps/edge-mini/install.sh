#!/usr/bin/env bash
# ============================================================================
# Edge-Mini — Instalador Fase A (DRY_RUN) — Ubuntu 24.04
# Idempotente. Rodar como root: sudo bash install.sh
# Não toca em produção. Não cria tráfego real. Não troca webhooks.
# ============================================================================
set -euo pipefail

APP_DIR="/opt/x1zap/edge-mini"
APP_USER="x1zap"
LOG_DIR="/var/log/x1zap"
NODE_MAJOR=22
DOMAIN="edge.x1zap.cloud"

log() { printf "\n\033[1;36m[install]\033[0m %s\n" "$*"; }

[ "$(id -u)" -eq 0 ] || { echo "Rode como root (sudo)."; exit 1; }

log "1/10 Atualizando apt"
apt-get update -y
apt-get install -y curl ca-certificates gnupg ufw nginx redis-server build-essential git

log "2/10 Hardening básico de firewall"
ufw allow OpenSSH || true
ufw allow 80/tcp || true
ufw allow 443/tcp || true
yes | ufw enable || true

log "3/10 Usuário de serviço: $APP_USER"
id -u "$APP_USER" >/dev/null 2>&1 || useradd --system --create-home --shell /bin/bash "$APP_USER"
mkdir -p "$APP_DIR" "$LOG_DIR"
chown -R "$APP_USER":"$APP_USER" "$LOG_DIR"

log "4/10 Node.js $NODE_MAJOR LTS"
if ! command -v node >/dev/null || [ "$(node -v | sed 's/v\([0-9]*\).*/\1/')" != "$NODE_MAJOR" ]; then
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash -
  apt-get install -y nodejs
fi
node -v
npm -v

log "5/10 pnpm + PM2 (global)"
npm i -g pnpm@9 pm2@latest

log "6/10 Redis (apt) — bind local + AOF"
REDIS_CONF="/etc/redis/redis.conf"
sed -i 's/^bind .*/bind 127.0.0.1 ::1/' "$REDIS_CONF"
sed -i 's/^# *appendonly .*/appendonly yes/' "$REDIS_CONF" || true
grep -q '^appendonly yes' "$REDIS_CONF" || echo 'appendonly yes' >> "$REDIS_CONF"
grep -q '^maxmemory ' "$REDIS_CONF" || echo 'maxmemory 1gb' >> "$REDIS_CONF"
grep -q '^maxmemory-policy ' "$REDIS_CONF" || echo 'maxmemory-policy noeviction' >> "$REDIS_CONF"
systemctl enable --now redis-server
systemctl restart redis-server
redis-cli ping

log "7/10 Garantindo código em $APP_DIR (copie o conteúdo de vps/edge-mini/ aqui antes de rodar)"
if [ ! -f "$APP_DIR/package.json" ]; then
  echo "AVISO: $APP_DIR/package.json não encontrado."
  echo "Copie o diretório vps/edge-mini do repositório para $APP_DIR e re-execute."
  exit 2
fi
chown -R "$APP_USER":"$APP_USER" "$APP_DIR"

log "8/10 .env (DRY_RUN=true)"
if [ ! -f "$APP_DIR/.env" ]; then
  cp "$APP_DIR/.env.example" "$APP_DIR/.env"
  TOKEN="$(openssl rand -hex 32)"
  sed -i "s|^X1ZAP_INTERNAL_TOKEN=.*|X1ZAP_INTERNAL_TOKEN=${TOKEN}|" "$APP_DIR/.env"
  chown root:"$APP_USER" "$APP_DIR/.env"
  chmod 640 "$APP_DIR/.env"
  echo "  .env criado. Token interno gerado: ${TOKEN}"
fi
grep -q '^DRY_RUN=true' "$APP_DIR/.env" || { echo "ABORTANDO: DRY_RUN não está true"; exit 3; }

log "9/10 Build (pnpm install + tsc)"
sudo -u "$APP_USER" bash -lc "cd '$APP_DIR' && pnpm install --frozen-lockfile=false && pnpm build"

log "10/10 PM2 + Nginx"
sudo -u "$APP_USER" bash -lc "cd '$APP_DIR' && pm2 start ecosystem.config.cjs && pm2 save"
env PATH=$PATH:/usr/bin pm2 startup systemd -u "$APP_USER" --hp "/home/$APP_USER" | tail -n 1 | bash || true

cp -f "$APP_DIR/nginx/edge.x1zap.cloud.conf" "/etc/nginx/sites-available/${DOMAIN}"
ln -sf "/etc/nginx/sites-available/${DOMAIN}" "/etc/nginx/sites-enabled/${DOMAIN}"
nginx -t
systemctl reload nginx

echo
echo "OK. Próximos passos manuais:"
echo "  1) Apontar DNS ${DOMAIN} -> IP desta VPS."
echo "  2) Rodar: certbot --nginx -d ${DOMAIN} --redirect --non-interactive --agree-tos -m ops@x1zap.cloud"
echo "  3) Validar: curl -fsS https://${DOMAIN}/health"
echo "  4) Smoke test: bash $APP_DIR/smoke-test.sh"
