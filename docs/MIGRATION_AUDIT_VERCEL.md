# Auditoria de Migração — Lovable → GitHub/Vercel + Backend Independente

> **Status:** Somente auditoria. Nenhuma alteração de código, banco, edge function, webhook, UazAPI, funis, Meta/Facebook ou autenticação foi feita.
> **Escopo:** Remix isolado. Produção intocada.

---

## FASE 1 — GitHub + Vercel (Frontend)

### 1.1 Stack confirmada

| Item | Valor |
|---|---|
| Framework | **React 18.3 + TypeScript + Vite 5** |
| Roteador | react-router-dom 6.30 (BrowserRouter, SPA) |
| UI | shadcn/ui + Radix + Tailwind |
| Estado/Data | @tanstack/react-query 5 |
| Backend client | @supabase/supabase-js 2.90 |
| Auth helper | `@lovable.dev/cloud-auth-js` (⚠️ dependência Lovable — ver §1.5) |
| Build | `vite build` (saída `dist/`) — 100% compatível com Vercel (preset "Vite") |
| SPA fallback | Vercel detecta Vite e aplica rewrite `/* → /index.html` automaticamente |

✅ **Build Vite roda como projeto Vercel padrão sem `vercel.json`.**
Caso queira ser explícito, opcional:
```json
{ "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }] }
```

### 1.2 Variáveis de ambiente obrigatórias (frontend)

Definir no Vercel → Project Settings → Environment Variables (Production + Preview):

| Variável | Valor atual | Origem | Obrigatória |
|---|---|---|---|
| `VITE_SUPABASE_URL` | `https://rbzekjfufhqjpjmjgwmb.supabase.co` | `.env` | ✅ |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | `sb_publishable_tSWzJzuhEreifz0MfVZgBQ_CCGcrmwJ` | `.env` | ✅ |
| `VITE_SUPABASE_PROJECT_ID` | `rbzekjfufhqjpjmjgwmb` | `.env` | ✅ (usado em Hotmart panel) |

Não há outras `VITE_*` em uso. Confirmado por `rg "import.meta.env" src`.

> `vite.config.ts` já define fallbacks com `loadEnv` apontando para o projeto atual — no Vercel basta sobrescrever as 3 vars acima.

### 1.3 URLs hardcoded e referências externas

#### 🔴 Referências diretas ao Lovable (precisam atenção em deploy externo)

| Arquivo | Linha | Conteúdo | Impacto |
|---|---|---|---|
| `src/components/superadmin/SuperAdminSetupChecklist.tsx` | 68 | link para `lovable.dev/projects/...` | UI: botão "abrir painel de email". Não quebra build, mas envia o usuário para Lovable. Substituir por painel próprio futuramente. |
| `src/components/superadmin/FirstAccessSuperAdminModal.tsx` | 453 | mesma URL | idem |
| `src/main.tsx` | 44 | `hostname.includes("lovableproject.com")` | lógica de desativar SW em preview Lovable. Inócua em Vercel (cai no branch de produção). ✅ OK |
| `src/integrations/lovable/index.ts` | — | `@lovable.dev/cloud-auth-js` | **OAuth Lovable (Google/Apple/MS/Lovable).** Se você não usa OAuth gerenciado pelo Lovable Cloud, é seguro manter — o helper só dispara quando `lovable.auth.signInWithOAuth` é chamado. Se chamado, vai falhar fora do domínio Lovable. Verificar uso. |

```bash
# Comando rápido de auditoria
rg "lovable\." src
rg "lovable\.auth\.signInWithOAuth" src
```

#### 🟢 Outras URLs externas (todas legítimas, não-Lovable)

- `api.x1zap.cloud` — sua infra (UazAPI/Connections proxy) — `src/config/connectionsApi.ts`
- `wa.me`, `meet.google.com`, `docs.cakto.com.br`, `developers.facebook.com`, `aistudio.google.com`, etc. — links de documentação/redirect, não acoplam build
- `api.qrserver.com` — gerador de QR público

Nenhuma URL hardcoded de **endpoint funcional** aponta para infra Lovable.

### 1.4 Edge Functions chamadas pelo frontend (via `VITE_SUPABASE_URL`)

16 arquivos do frontend chamam edge functions diretamente. Como `VITE_SUPABASE_URL` aponta para o Supabase do projeto, todas continuam funcionando em qualquer host (Vercel, custom domain, localhost).

Trechos: `useWebChat.ts`, `useAudioRecorder.ts`, `useObjectionAI.ts`, `CadenceAIGenerator.tsx`, `AIChat.tsx`, `WebhooksManager.tsx`, `FacebookLeadsConfig.tsx`, `HotmartConfigManager.tsx`, `GoogleCalendarOAuthConfig.tsx`, `CaktoSuperAdminPanel.tsx`, `DoppusConfigManager.tsx`, `CaktoAdminPanel.tsx`, `Unsubscribe.tsx`.

✅ **Sem alterações necessárias.** Funcionam idênticas em Vercel.

### 1.5 Riscos do `@lovable.dev/cloud-auth-js`

O pacote `@lovable.dev/cloud-auth-js` chama um endpoint do Lovable Cloud para iniciar fluxo OAuth e devolve tokens que são injetados via `supabase.auth.setSession`. Em deploy Vercel:

- **Se você só usa email/senha:** ignorar — funciona normalmente.
- **Se usa OAuth Google/etc gerenciado pelo Lovable:** precisará migrar para OAuth nativo do Supabase (`supabase.auth.signInWithOAuth({ provider: "google" })`), configurando o provider e URL de callback no painel do Supabase.

Para auditar uso real:
```bash
rg "from \"@/integrations/lovable\"|lovable\.auth" src
```

### 1.6 Configurações Vercel recomendadas

| Setting | Valor |
|---|---|
| Framework Preset | Vite |
| Build Command | `npm run build` (ou `bun run build`) |
| Output Directory | `dist` |
| Install Command | `npm install` (ou `bun install`) |
| Node Version | 20.x |
| Env Vars | as 3 `VITE_*` da §1.2 |

Domínio: apontar `app.seudominio.com` no Vercel → DNS CNAME.

### 1.7 Service Worker e cache

`src/main.tsx` registra `/sw.js` apenas em produção fora de iframe/preview Lovable. Em Vercel:
- Hostname não contém `lovableproject.com` → registra SW normalmente. ✅
- `public/sw.js` já existe. ✅
- `APP_VERSION` em `main.tsx` invalida cache em rebuilds. ✅

---

## FASE 2 — Auditoria de Compatibilidade

| Componente | Status Vercel | Observação |
|---|---|---|
| Build Vite | ✅ OK | Sem custom plugins incompatíveis |
| React Router (SPA) | ✅ OK | Vercel aplica rewrite automaticamente |
| Supabase Client | ✅ OK | Usa SDK oficial, agnóstico de host |
| Supabase Realtime | ✅ OK | WebSocket direto ao Supabase, não passa pelo host |
| Supabase Storage | ✅ OK | Buckets públicos (`avatars`, `cadence-media`, `company-logos`, `funnel-assets`, `platform-assets`, `help-media`) servidos pelo Supabase CDN |
| Auth email/senha | ✅ OK | Direto Supabase Auth |
| Auth OAuth via Lovable | 🟡 Ajuste | Ver §1.5 — migrar para Supabase nativo se em uso |
| Uploads | ✅ OK | `storage.from(...).upload()` em 4 arquivos, todos via SDK |
| Dashboard / Leads / Funis / Inbox / Conexões | ✅ OK | Lógica 100% frontend + Supabase; sem dependência de host |
| Service Worker (PWA) | ✅ OK | Auto-detect produção |
| Edge Functions chamadas | ✅ OK | Endpoint segue `VITE_SUPABASE_URL` |
| Webhooks externos (UazAPI, Meta, Hotmart, Cakto, Doppus, Facebook Leads) | ✅ OK | Apontam para `https://<projeto>.supabase.co/functions/v1/...` — independem do host frontend |
| Meta/Facebook Pixel & CAPI | ✅ OK | Pixel dispara no cliente; CAPI roda em edge function |
| Custom domain | ✅ OK | Configurável no Vercel |

**Ajustes mínimos:** 0 obrigatórios. 1 opcional (OAuth Lovable → OAuth Supabase nativo).

**Incompatibilidades Vercel:** nenhuma detectada.

---

## FASE 3 — Inventário Backend (para futura migração Supabase self-host)

> Apenas mapeamento. Nada será movido agora.

### 3.1 Banco de dados

- **Schemas em uso:** `public`, `auth` (gerenciado), `storage` (gerenciado)
- **Tabelas em `public`:** ~165 (lista completa em `supabase-tables` no contexto da sessão; ver `docs/DATABASE.md` para detalhes)
- **Migrations versionadas:** 268 arquivos em `supabase/migrations/`
- **Extensões necessárias:** `pg_trgm`, `vector` (atualmente em `public` — mover para `extensions` durante self-host)
- **Funções SECURITY DEFINER críticas:** `has_role`, `is_super_admin`, `get_user_organization`, `delete_team_member`, `apply_tag_automations`, e outras documentadas nas migrations
- **Triggers críticos:** `enforce_single_attendant`, `mark_funnel_completed_on_lead`, `on_instance_status_change_notify_admin`, `sync_pixel_to_purchase_audit`, `trigger_funnel_runner_on_job` etc.
- **RLS:** habilitado em todas as tabelas de domínio; políticas dependem de `has_role()` e `get_user_organization()`

### 3.2 Storage buckets (todos públicos por design)

`avatars`, `cadence-media`, `company-logos`, `funnel-assets`, `platform-assets`, `help-media`, `catalog-media`, `editor-media`

### 3.3 Edge Functions (106 funções)

Categorias:
- **Auth/Admin:** `bootstrap-super-admin`, `create-super-admin-direct`, `migrate-super-admin-email`, `create-team-member`, `create-organization-admin`, `delete-organization`, `set-user-password`, `super-admin-manage-user`, `auto-promote-super-admin`, `ensure-default-super-admin`, `send-invite-email`
- **WhatsApp / Atendimento:** `evolution-send`, `evolution-webhook`, `uazapi-send`, `uazapi-webhook`, `uazapi-heartbeat`, `whatsapp-send`, `whatsapp-webhook`, `whatsapp-proxy`, `start-whatsapp-conversation`, `instances-api`, `process-media-message`
- **Webchat/Inbox:** `webchat-api`, `webchat-bot`, `webchat-inbox`, `webchat-inbox-v3`, `presence-test`
- **IA / Copilot / Cadência:** `sales-copilot`, `agent-supervisor`, `agent-handoff-greeter`, `admin-agent-*`, `generate-agent-ai`, `generate-insights`, `generate-objections`, `handle-objection`, `analyze-conversation`, `evaluate-conversation`, `daily-report-ai`, `prompt-experiment-pick`, `optimize-product-field`, `memory-embedder`, `memory-search`, `import-agent-from-document`, `process-training-material`, `process-knowledge-source`, `transcribe-audio`, `manual-outreach`, `ai-followup-cron`, `meta-replay-recovery`
- **Funis / Captura / Forms:** `funnel-api`, `funnel-execute-webhook`, `funnel-generate-ai`, `funnel-job-runner`, `funnel-resume-cron`, `funnel-submit`, `form-generate-ai`, `form-submit`, `clone-funnel`
- **Distribuição / Leads:** `distribute-lead`, `auto-notifications`, `purchase-audit`
- **Pagamentos / Pós-venda:** `cakto-proxy`, `cakto-recovery-trigger`, `cakto-webhook`, `hotmart-sync-orders`, `hotmart-test-credentials`, `hotmart-webhook`, `hotmart-product-mapping` (mapping via tabela), `doppus-webhook`, `process-post-sale-scheduled`
- **Booking / Calendário:** `booking-availability`, `booking-dispatcher`, `booking-submit`, `send-booking-confirmation`, `google-calendar-auth`, `google-calendar-callback`, `google-calendar-refresh`, `google-calendar-sync`
- **Email:** `auth-email-hook`, `handle-email-suppression`, `handle-email-unsubscribe`, `preview-transactional-email`, `process-email-queue`, `send-mass-email`, `send-notification-email`, `send-transactional-email`
- **Catálogo / Sankhya:** `catalog-import-csv`, `catalog-search`, `catalog-sync-website`, `sankhya-auth`, `sankhya-create-order`, `sankhya-sync-clients`, `sankhya-sync-products`, `send-catalog-item`
- **Outros:** `firecrawl-crawl`, `firecrawl-map`, `firecrawl-scrape`, `facebook-leads-webhook`, `webhook-receiver`, `test-integration`, `save-ai-credential`, `attribution-test`, `cleanup-pending-receipt-media`, `process-scheduled-messages`

### 3.4 Secrets necessários no self-host

Detectados via `Deno.env.get(...)` nas edge functions:

| Categoria | Secrets |
|---|---|
| Supabase runtime | `SUPABASE_URL`, `SUPABASE_ANON_KEY` (ou `SUPABASE_PUBLISHABLE_KEY`), `SUPABASE_SERVICE_ROLE_KEY` |
| App config | `APP_URL`, `SITE_URL`, `SITE_NAME`, `EMAIL_FROM_DOMAIN`, `EMAIL_ROOT_DOMAIN`, `EMAIL_SENDER_DOMAIN` |
| Bootstrap super admin | `BOOTSTRAP_SECRET`, `DEFAULT_SUPER_ADMIN_EMAIL`, `DEFAULT_SUPER_ADMIN_NAME`, `DEFAULT_SUPER_ADMIN_PASSWORD`, `SUPER_ADMIN_EMAIL` |
| IA | `LOVABLE_API_KEY` (gateway atual), `OPENAI_API_KEY`, `ELEVENLABS_API_KEY` |
| Integrações | `RESEND_API_KEY`, `FIRECRAWL_API_KEY`, `BOTCONVERSA_API_KEY`, `ISICHAT_TOKEN`, `LOVABLE_SEND_URL` |

⚠️ **`LOVABLE_API_KEY` e `LOVABLE_SEND_URL`:** dependências do Lovable AI Gateway. No self-host, substituir por:
- Chave OpenAI/Anthropic/Gemini direta (já suportado via `org_ai_routing` + `org_ai_credentials` + `_shared/ai-router.ts`)
- Provedor de email próprio (Resend funciona em qualquer host)

### 3.5 Crons / Schedulers configurados no Supabase

Verificar via `supabase` painel → Database → Cron Jobs antes da migração. Funções com sufixo `-cron`, `heartbeat`, `process-scheduled-*`, `ai-followup-cron`, `funnel-resume-cron`, `cleanup-pending-receipt-media`.

### 3.6 Webhooks externos (URLs a re-configurar no self-host)

Cada provider abaixo aponta hoje para `https://rbzekjfufhqjpjmjgwmb.supabase.co/functions/v1/<fn>`. Após self-host, atualizar no painel do provedor:

- Meta/Facebook Leads → `facebook-leads-webhook`
- WhatsApp Evolution/UazAPI → `evolution-webhook`, `uazapi-webhook`, `whatsapp-webhook`
- Hotmart → `hotmart-webhook`
- Cakto → `cakto-webhook`
- Doppus → `doppus-webhook`
- Google Calendar OAuth callback → `google-calendar-callback`
- Webhooks genéricos → `webhook-receiver`
- Auth email hook → `auth-email-hook`

---

## RISCOS DA MIGRAÇÃO

| # | Risco | Mitigação |
|---|---|---|
| 1 | OAuth do Lovable Cloud para de funcionar fora do domínio Lovable | Migrar para `supabase.auth.signInWithOAuth` nativo + configurar redirect URIs |
| 2 | `LOVABLE_API_KEY` indisponível no self-host → IA quebra | Configurar `org_ai_credentials` com chave OpenAI por organização (já suportado) ou setar `OPENAI_API_KEY` global |
| 3 | Webhooks externos apontam para domínio Supabase atual | Reapontar cada provider quando trocar de instância |
| 4 | Extensions `pg_trgm` / `vector` em schema `public` | Mover para `extensions` em maintenance window |
| 5 | Storage buckets públicos | Replicar política pública no self-host |
| 6 | 268 migrations cumulativas | Rodar em ordem em nova instância; testar antes em staging |
| 7 | Cron jobs do Supabase | Recriar manualmente; não vêm em migrations |
| 8 | Service Role Key precisa ser regenerado e re-injetado em todas as fns | Atualizar secrets antes do switch |
| 9 | Realtime depende de replication slots | Habilitar `realtime` no self-host com mesmas publications |
| 10 | `auth.users` IDs precisam ser preservados | Exportar com `pg_dump --schema=auth` (em self-host atual já é possível; em Lovable Cloud não há dump completo — risco real) |

---

## PLANO DE DESLIGAMENTO DO LOVABLE (futuro)

### Etapa A — Frontend independente (baixo risco, sem downtime)
1. Conectar este remix ao GitHub (Plus → GitHub → Create Repository).
2. Importar repo no Vercel; configurar as 3 env vars; deploy.
3. Apontar `app.seudominio.com` para o Vercel.
4. Validar login, leads, inbox, funis, webhooks em paralelo ao Lovable.
5. Desativar publicação Lovable quando confirmado.

### Etapa B — OAuth Supabase nativo (se aplicável)
1. Habilitar Google/Apple provider no painel Supabase.
2. Substituir chamadas `lovable.auth.signInWithOAuth` por `supabase.auth.signInWithOAuth`.
3. Remover dependência `@lovable.dev/cloud-auth-js`.

### Etapa C — Migração de IA fora do Lovable Gateway
1. Para cada organização ativa, cadastrar chave OpenAI em `org_ai_credentials`.
2. Validar `_shared/ai-router.ts` roteando direto a OpenAI.
3. Desativar fallback Lovable nas tabelas `org_ai_routing` (`fallback_to_lovable = false`).

### Etapa D — Self-host Supabase (alto risco, exige janela)
1. Provisionar Supabase self-host (Docker compose oficial) na VPS.
2. Restaurar schema via 268 migrations + restaurar `auth.users` via dump.
3. Recriar buckets de storage e re-uploadar conteúdo (script `storage_dump`).
4. Re-deployar 106 edge functions (`supabase functions deploy`).
5. Configurar secrets (§3.4).
6. Recriar cron jobs.
7. Reapontar webhooks externos.
8. Trocar `VITE_SUPABASE_URL` no Vercel para nova URL.
9. Validar em janela de baixa carga.

---

## RESULTADO

✅ O remix está **pronto para deploy Vercel hoje** sem nenhuma alteração de código.
🟡 Apenas migrar OAuth se estiver em uso (auditar com `rg "lovable\.auth" src`).
🔴 Migração de backend exige planejamento separado (Etapa D).
