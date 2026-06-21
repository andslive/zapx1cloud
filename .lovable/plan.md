# Plano de Migração — Sair da Lovable Cloud em Produção

Objetivo: reduzir consumo da Lovable Cloud movendo produção para **Vercel (frontend)** + **Supabase próprio (Auth/DB/Storage/Realtime)** + **VPS (webhooks pesados, Chromium, Redis/BullMQ, workers, crons)**. Lovable continua apenas como ambiente de **desenvolvimento**.

---

## 1. O que gera Cloud Usage hoje

A maior parte do consumo NÃO é IA, é infraestrutura serverless rodando 24/7:

- **Edge Functions de alta frequência**:
  - `uazapi-webhook` / `evolution-webhook` (cada mensagem WhatsApp = 1 invocação)
  - `webchat-bot`, `webchat-inbox`
  - `ai-followup-cron`, `post_sale_scheduled_runs`, watchdogs
  - `meta-capi`, `meta-replay-recovery`, `apply_tag_automations`
  - `funnel-execution`, `start-whatsapp-conversation`
- **Egress / bandwidth**: PDFs de comprovante, mídia WhatsApp, vídeos, payloads grandes Evolution/UazAPI.
- **pg_cron + pg_net**: cron disparando HTTP a cada minuto.
- **Realtime**: canais abertos por inbox/atendentes.
- **Storage**: PDFs comprovantes e mídia.
- **DB compute**: queries de webhook acumulam CPU.

> Custo dominante = invocações + egress dos webhooks WhatsApp + Chromium/UazAPI (se hospedado aqui) + crons.

---

## 2. O que sai imediatamente da Lovable Cloud

**Mover para VPS (prioridade máxima — maior queima de créditos):**
- Receptor de webhooks WhatsApp (UazAPI/Evolution/BotConversa)
- Pipeline OCR comprovante (`ai_receipt`, `deterministic_green_route`)
- Crons (`ai-followup-cron`, post-sale scheduler, watchdogs)
- Fila Redis/BullMQ + workers (envio, debounce 4s, chunking)
- Chromium (se aplicável — sessões WhatsApp Web)
- Meta CAPI sender (alto volume)
- Auto Dispatch engine

**Permanece em Supabase (low-cost, alto valor):**
- Auth (login)
- Postgres (todos os dados)
- Storage (mídia)
- Realtime (inbox ao vivo)
- RPCs (`has_role`, `delete_team_member`, etc.)
- Edge Functions raras/leves (ex: invites Resend, OAuth callback) — opcional

**Frontend:** sai da Lovable, vai para **Vercel**.

---

## 3. Sincronizar projeto com GitHub

1. No editor Lovable: menu (+) → GitHub → Connect project → autorizar Lovable GitHub App.
2. Selecionar org/usuário → Create Repository (ex: `x1zap/app`).
3. Sync é bidirecional: alterações no Lovable vão pro GitHub automaticamente.
4. Branch padrão `main` = produção Vercel. Criar branch `dev` para Lovable trabalhar.

---

## 4. Deploy frontend na Vercel

1. vercel.com → New Project → importar repo do GitHub.
2. Framework preset: **Vite**.
3. Build command: `npm run build` · Output: `dist`.
4. Adicionar variáveis de ambiente (passo 5).
5. Adicionar `vercel.json` com rewrite SPA:
   ```json
   { "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }] }
   ```
6. Conectar domínio (ex: `app.x1zap.cloud`) em Vercel → Domains.
7. Deploy automático a cada push na `main`.

---

## 5. Variáveis de ambiente na Vercel

Apenas chaves **publicáveis** (Vite expõe `VITE_*` no bundle):

```
VITE_SUPABASE_URL=https://<seu-supabase>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=<anon key>
VITE_SUPABASE_PROJECT_ID=<ref>
VITE_API_BASE_URL=https://api.x1zap.cloud
VITE_VPS_WEBHOOK_BASE=https://api.x1zap.cloud
VITE_META_PIXEL_ID=<id público>
```

Segredos (Meta CAPI access token, Resend, Firecrawl, OpenAI, Evolution token, etc.) **nunca** vão pra Vercel — ficam só na VPS (`.env` do backend) e/ou Supabase Secrets enquanto Edge Functions existirem.

---

## 6. Roteamento de endpoints no frontend

Criar `src/lib/api.ts` com bases por domínio:

| Função no app | Aponta para |
|---|---|
| Auth (login, signup, session) | `supabase.auth` → Supabase próprio |
| CRUD (leads, deals, funis, agentes, etc.) | `supabase.from(...)` → Supabase próprio |
| Storage (upload comprovante, mídia) | `supabase.storage` → Supabase próprio |
| Realtime (inbox) | `supabase.channel` → Supabase próprio |
| Webhook WhatsApp inbound | `api.x1zap.cloud/webhooks/uazapi`, `/evolution`, `/botconversa` (VPS) |
| Envio WhatsApp outbound | `api.x1zap.cloud/wa/send` (VPS) |
| OCR comprovante | `api.x1zap.cloud/receipt/ocr` (VPS) |
| Meta CAPI / Purchase | `api.x1zap.cloud/meta/capi` (VPS) |
| Crons / followups | internos VPS (sem chamada do front) |
| Funções leves restantes (invites, etc.) | `supabase.functions.invoke()` |

Substituir todas as chamadas `supabase.functions.invoke('uazapi-webhook'|'webchat-bot'|...)` por `fetch(VITE_API_BASE_URL + '/...')` quando a função tiver migrado.

---

## 7. Edge Functions — destino de cada uma

**Migrar para VPS (Node/Bun + Express/Fastify + BullMQ):**
- `uazapi-webhook`, `evolution-webhook`, `botconversa-webhook`
- `webchat-bot`, `webchat-inbox`
- `start-whatsapp-conversation`, envio WA
- `ai-receipt` (OCR), `deterministic_green_route`
- `meta-capi`, `meta-replay-recovery`
- `ai-followup-cron`, `post-sale-scheduler`, watchdogs
- `apply_tag_automations` (acionado por webhook)
- `funnel-execution` (motor principal)
- `auto-dispatch`
- Hotmart postback
- Facebook Lead Ads webhook

**Manter no Supabase (baixo volume, OK em Edge):**
- `send-invite` (Resend)
- `oauth-google-callback` (booking)
- `signup-confirm` / triggers de auth se houver
- Qualquer função chamada <10x/dia

> Regra: se invoca mais que ~100x/dia ou usa egress grande → VPS.

---

## 8. Webhooks WhatsApp sem interrupção

Estratégia **dual-write** durante corte:

1. Subir VPS com endpoints novos (`/webhooks/uazapi`, `/evolution`) idênticos em payload/lógica à Edge atual.
2. Apontar **DNS** `api.x1zap.cloud` → VPS (Cloudflare/Nginx + TLS Let's Encrypt).
3. Em UazAPI/Evolution/BotConversa, configurar **2 webhooks simultâneos** por algumas horas (se o provedor suportar) OU manter Edge ativa em paralelo.
4. Trocar URL no painel do provedor para `https://api.x1zap.cloud/webhooks/...`.
5. Monitorar logs VPS por 24h (mensagens recebidas == antes).
6. Desativar Edge Function antiga só após confirmação.
7. Idempotência: usar `provider_message_id` como chave única para não duplicar se vier nos dois caminhos.

---

## 9. Preservação de funcionalidades

| Funcionalidade | Como preservar |
|---|---|
| Login | Supabase Auth intocado, mesmo projeto, mesmas chaves |
| Atendimentos / Inbox | Tabelas + Realtime no Supabase; nova VPS escreve nas mesmas tabelas |
| Leads | DB Postgres mantido, RLS idêntica |
| Funis | `capture_funnels` + execução migra para serviço VPS `funnel-runner` |
| Envio WhatsApp | Worker BullMQ na VPS (debounce 4s, chunking ≤2 se >500 chars, 800ms) |
| Reconhecer Comprovante | Serviço OCR na VPS (mesma lógica `deterministic_green_route` v2 já corrigida); grava `purchase_audit` no Postgres |
| Pixel/CAPI | Sender VPS chama Graph API; mantém `pixel_event_logs` + `purchase_audit` |
| Purchase Audit | Permanece no Postgres; só muda o produtor (VPS em vez de Edge) |
| Conexões / Chromium | Container Docker dedicado na VPS (Chromium + Puppeteer/whatsapp-web.js ou container Evolution self-hosted) |

Stack VPS sugerida: **Ubuntu 22.04 + Docker Compose** com containers:
`api` (Node/Bun), `redis`, `worker-wa`, `worker-ocr`, `worker-capi`, `evolution` (opcional), `nginx` (proxy + TLS), `watchtower` (auto-update).

---

## 10. Riscos e rollback

**Riscos:**
- Perder mensagem WhatsApp durante troca de webhook → mitigar com dual-write + idempotência.
- DNS propagation → usar TTL baixo (60s) 24h antes.
- Diferença de timezone/cron na VPS → fixar `TZ=America/Sao_Paulo`.
- Secrets vazados se commitados → usar `.env` fora do git + GitHub Secrets.
- CORS quebrar no front → liberar `app.x1zap.cloud` no Nginx da VPS.
- RLS quebrar se VPS usar service_role sem cuidado → criar role dedicada com escopo mínimo.
- Lovable continuar invocando Edge Functions antigas em dev → manter Edge funcionando no Supabase de DEV separado.

**Rollback (até 7 dias):**
- DNS: reverter `api.x1zap.cloud` para Supabase Functions URL.
- Reativar Edge Functions (não deletar até estabilidade comprovada).
- Vercel: manter deploy Lovable acessível na URL `*.lovable.app` como fallback de UI.
- Snapshot diário do Postgres antes do corte (pg_dump → S3/Backblaze).

---

## Ordem segura de execução (sem parar operação)

1. **Semana 0** — Conectar GitHub, criar repo, congelar mudanças grandes no Lovable.
2. **Dia 1** — Provisionar VPS, Docker, Nginx, TLS, domínio `api.x1zap.cloud`.
3. **Dia 2** — Backup Postgres + portar tipos/schema (não muda nada no DB).
4. **Dia 3-4** — Reescrever endpoints críticos na VPS (webhook UazAPI, envio WA, OCR, CAPI) reusando código das Edge Functions.
5. **Dia 5** — Deploy frontend Vercel apontando para Supabase + VPS, sob domínio de staging.
6. **Dia 6** — Dual-write webhooks WhatsApp por 24h.
7. **Dia 7** — Cutover DNS do app para Vercel; manter Lovable como dev.
8. **Dia 8-10** — Migrar crons (`pg_cron` → cron VPS), watchdogs, post-sale scheduler.
9. **Dia 11** — Após 48h estáveis, **desativar Edge Functions migradas** (maior economia Cloud).
10. **Dia 14** — Reduzir instância Lovable Cloud ou manter só para dev.

---

## Economia esperada

- Eliminação de >90% das invocações Edge (webhooks WA dominam).
- Egress sai da Cloud → vai pro tráfego VPS (custo fixo, não por GB).
- pg_cron substituído por cron VPS (zero invocações).
- Supabase passa a custar essencialmente DB + Auth + Storage + Realtime, sem o multiplicador das Edge.

---

**Próximo passo após aprovação:** começar pelo item 3 (conectar GitHub) e pelo item 1 da ordem segura. Nada será aplicado até sua confirmação explícita de cada fase.
