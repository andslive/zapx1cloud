# Edge-Mini — Fase A (DRY_RUN)

Objetivo: subir na **VPS 2** apenas o esqueleto que vai, no futuro, substituir
as Edge Functions `uazapi-webhook` e `uazapi-send`. Esta fase **não troca
webhook real, não chama UazAPI, não escreve em Supabase**.

- Subdomínio: `edge.x1zap.cloud`
- Redis: `apt install redis-server` (sem Docker)
- Runtime: Node 22 + Fastify + BullMQ + PM2 + Nginx + Certbot
- `DRY_RUN=true` fixo — workers só logam o payload.

---

## 0. Pré-requisitos na VPS 2

- Ubuntu 24.04, root via SSH.
- Porta 80/443 abertas no provedor.
- DNS A `edge.x1zap.cloud` → IP da VPS 2 (TTL 60s).

---

## 1. Copiar o pacote para a VPS

Na sua máquina (ou via `git clone` na VPS):

```bash
# Opção 1: rsync local -> VPS
rsync -av --exclude node_modules --exclude dist \
  vps/edge-mini/ root@<IP_VPS2>:/opt/x1zap/edge-mini/

# Opção 2: git clone do repo na VPS e copiar só a pasta
ssh root@<IP_VPS2>
mkdir -p /opt/x1zap
git clone <repo> /tmp/x1zap-src
cp -r /tmp/x1zap-src/vps/edge-mini /opt/x1zap/edge-mini
```

---

## 2. Comandos exatos a rodar na VPS 2 (em ordem)

```bash
# 2.1 — Entrar
ssh root@<IP_VPS2>

# 2.2 — Instalador (Node 22, Redis apt, pnpm, PM2, build, PM2 start, Nginx)
cd /opt/x1zap/edge-mini
chmod +x install.sh smoke-test.sh
bash install.sh

# 2.3 — DNS: garanta que edge.x1zap.cloud aponta para esta VPS
dig +short edge.x1zap.cloud   # deve devolver o IP da VPS 2

# 2.4 — TLS
certbot --nginx -d edge.x1zap.cloud --redirect \
  --non-interactive --agree-tos -m ops@x1zap.cloud

# 2.5 — Validar
curl -fsS https://edge.x1zap.cloud/health
# Esperado: {"ok":true,"service":"edge-mini","dry_run":true,...}

# 2.6 — Smoke test (localhost, sem tráfego externo)
bash /opt/x1zap/edge-mini/smoke-test.sh

# 2.7 — Status
pm2 status
redis-cli ping
systemctl status nginx --no-pager | head
```

---

## 3. O que deve ser reportado de volta

1. Saída de `curl https://edge.x1zap.cloud/health`
2. `pm2 status` (3 apps: `edge-api`, `wa-inbound`, `wa-outbound` — todos `online`)
3. `redis-cli ping` → `PONG`
4. Saída completa de `bash smoke-test.sh`
5. Conteúdo final de `/opt/x1zap/edge-mini/.env` **mascarado** (apenas confirmando `DRY_RUN=true`)
6. Confirmar que **nenhum webhook do UazAPI foi alterado** e **nenhum chip
   real foi tocado**.

---

## 4. Rollback instantâneo

Nada em produção foi tocado. Para desligar:

```bash
pm2 stop all && pm2 delete all
systemctl stop nginx
# (opcional) desativar site
rm -f /etc/nginx/sites-enabled/edge.x1zap.cloud
systemctl start nginx
systemctl stop redis-server
```

Para remover por completo:

```bash
pm2 unstartup systemd -u x1zap
rm -rf /opt/x1zap/edge-mini /var/log/x1zap
apt-get remove -y redis-server nginx
```

DNS `edge.x1zap.cloud` pode permanecer apontando — sem servidor, simplesmente
não responde. Nenhuma URL de produção depende dele nesta fase.

---

## 5. O que NÃO foi feito (por desenho)

- Não houve alteração em `supabase/functions/uazapi-webhook` nem em
  `supabase/functions/uazapi-send`.
- Não houve alteração em nenhum chip/instância WhatsApp.
- Não houve troca de webhook em UazAPI/Evolution/BotConversa.
- Não houve nenhuma escrita em tabelas de produção.
- Não houve mudança em Vercel, remix, build, ou variáveis do app.

Próxima fase (somente após sua aprovação explícita): habilitar a lógica real
nos workers e apontar **apenas o chip sandbox** para
`https://edge.x1zap.cloud/webhooks/uazapi`.
