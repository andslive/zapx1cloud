# Inventário de Secrets — X1Zap CRM

> Levantamento por varredura completa do repositório (`Deno.env.get(...)`, `process.env.*`, `import.meta.env.*`, `VITE_*`).
> Nenhum valor de secret foi lido ou exibido — apenas nomes e locais de uso.
> Gerado como parte da migração para o Supabase novo (`ydunpoqdhijhnrarohiz`).

---

## Supabase

| Variável | Onde é usada | Obrigatória/Opcional | Impacto se faltar |
|---|---|---|---|
| `SUPABASE_URL` | ~100 Edge Functions (praticamente todas) + `vps/edge-mini/src/env.ts` | **Obrigatória** | Nenhuma função consegue instanciar o client admin — sistema inteiro para. |
| `SUPABASE_SERVICE_ROLE_KEY` | ~100 Edge Functions + `vps/edge-mini/src/env.ts` | **Obrigatória** | Mesma gravidade — sem ela, nenhuma operação privilegiada (bypass de RLS) funciona. |
| `SUPABASE_ANON_KEY` | `delete-organization`, `send-mass-email`, `create-team-member`, `sales-copilot`, `cakto-proxy`, `auto-promote-super-admin`, `create-organization-admin`, `hotmart-test-credentials`, `hotmart-sync-orders`, `attribution-test`, `send-invite-email`, `super-admin-manage-user`, `save-ai-credential`, `set-user-password` | Obrigatória (nessas 14 funções) | Falha ao validar sessão de usuário via client autenticado nessas funções específicas. |
| `SUPABASE_PUBLISHABLE_KEY` | `sales-copilot`, `save-ai-credential` (fallback de `SUPABASE_ANON_KEY`) | Opcional (fallback) | Sem impacto se `SUPABASE_ANON_KEY` estiver presente. |
| `VITE_SUPABASE_URL` | `_shared/ai-credentials.ts` (fallback de `SUPABASE_URL`), `save-ai-credential` | Opcional (fallback) | Só usado se `SUPABASE_URL` não estiver definida — redundância de nome. |
| `VITE_SUPABASE_URL` (frontend) | `src/integrations/supabase/client.ts`, `vite.config.ts` | **Obrigatória (build Vercel)** | Frontend cai no fallback hardcoded do projeto antigo (`rbzekjfufhqjpjmjgwmb`) — risco já documentado no runbook. |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | `src/integrations/supabase/client.ts` | **Obrigatória (build Vercel)** | Frontend não consegue autenticar contra o Supabase novo. |
| `VITE_SUPABASE_PROJECT_ID` | `vite.config.ts` | Opcional (informativo) | Sem impacto funcional direto identificado. |

---

## OpenAI

| Variável | Onde é usada | Obrigatória/Opcional | Impacto se faltar |
|---|---|---|---|
| `OPENAI_API_KEY` | `uazapi-webhook`, `process-media-message`, `_shared/ai-router.ts`, `optimize-product-field` (já migrada para OpenAI direto nesta sessão) | Obrigatória (para o caminho OpenAI) | Funções caem no fallback Lovable (se `LOVABLE_API_KEY` presente) ou falham com erro de credencial. |

---

## Anthropic

**Nenhuma variável encontrada.** Nenhum `Deno.env.get("ANTHROPIC_API_KEY")` ou equivalente localizado em todo o repositório. O tipo `AIProvider` em `_shared/ai-credentials.ts` inclui `"anthropic"` como opção, mas a resolução de chamada direta para Anthropic está marcada como "not implemented yet" em `_shared/ai-router.ts` (cai no gateway Lovable). Credenciais de organização para Anthropic, se existirem, ficam em `org_ai_credentials` (tabela), não em secret de plataforma.

---

## Gemini

**Nenhuma variável encontrada.** Mesma situação do Anthropic — `"gemini"`/`"google"` existem como valores possíveis de provider, mas sem chamada direta implementada; hoje tudo passa pelo Lovable AI Gateway usando nomes de modelo prefixados (`google/gemini-3-flash-preview` etc.), sem uma `GEMINI_API_KEY` de plataforma.

---

## Meta/Facebook

**Nenhuma variável de ambiente encontrada** para `facebook-leads-webhook` nem para Pixel/CAPI. Credenciais (token de acesso, pixel ID) provavelmente residem em tabela de configuração por organização/produto (não confirmado o nome exato da tabela nesta varredura — recomendo validação manual antes do corte).

---

## UazAPI

**Nenhuma variável de ambiente (`Deno.env.get`) encontrada** para UazAPI nas Edge Functions — as credenciais por instância (token, URL) são lidas de tabela (`instances`/`whatsapp_instances`-like), não de secret de plataforma.

No lado da VPS (`vps/edge-mini/src/env.ts`), porém, existem 2 variáveis dedicadas:

| Variável | Onde é usada | Obrigatória/Opcional | Impacto se faltar |
|---|---|---|---|
| `UAZAPI_URL` | `vps/edge-mini/src/env.ts` | Opcional (default `""`) | Se vazio, funcionalidades que dependem de chamar a UazAPI a partir da VPS não funcionam. |
| `UAZAPI_ADMIN_TOKEN` | `vps/edge-mini/src/env.ts` | Opcional (default `""`) | Idem — chamadas administrativas à UazAPI a partir da VPS falham. |
| `UAZAPI_BASE_URL` | `vps/edge-mini/src/env.ts` | Opcional (default `""`) | Variável separada de `UAZAPI_URL` — checar com o time se são redundantes ou usadas em contextos diferentes. |

---

## Evolution

**Nenhuma variável de ambiente encontrada** para `evolution-send`/`evolution-webhook`. Mesma situação da UazAPI — credenciais provavelmente por instância em tabela, não em secret.

---

## Redis

| Variável | Onde é usada | Obrigatória/Opcional | Impacto se faltar |
|---|---|---|---|
| `REDIS_URL` | `vps/edge-mini/src/env.ts` → `vps/edge-mini/src/redis.ts` | Opcional (default `redis://127.0.0.1:6379/0`) | Se o Redis real não estiver nesse endereço, BullMQ/filas da VPS não conectam — falha silenciosa até uso. |

---

## BullMQ

Nenhuma variável de ambiente própria de BullMQ além da conexão Redis acima — a configuração de filas está no código (`vps/edge-mini/src/queues.ts`), não em env vars.

---

## SMTP/Resend

| Variável | Onde é usada | Obrigatória/Opcional | Impacto se faltar |
|---|---|---|---|
| `RESEND_API_KEY` | `webchat-bot`, `daily-report-ai`, `webhook-receiver` | Obrigatória (nessas 3 funções, se usarem Resend como canal) | Envio de e-mail/relatório falha nessas funções específicas. |
| `EMAIL_SENDER_DOMAIN` | `send-transactional-email`, `auth-email-hook` | Obrigatória (e-mail transacional) | Emails transacionais (signup, recovery) não conseguem determinar domínio remetente. |
| `EMAIL_FROM_DOMAIN` | `send-transactional-email`, `auth-email-hook` | Obrigatória (idem) | Idem. |
| `EMAIL_ROOT_DOMAIN` | `auth-email-hook` | Obrigatória (idem) | Idem, para o hook de auth do Supabase. |
| `SITE_NAME` | `send-transactional-email`, `auth-email-hook` | Opcional | Só afeta o label de exibição nos e-mails. |
| `LOVABLE_SEND_URL` | `process-email-queue` | Opcional (fallback automático para `https://api.lovable.dev` se ausente) | Sem impacto se `LOVABLE_API_KEY` for mantida; se removida, essa variável fica órfã. |

⚠️ Além dessas, `process-email-queue`, `auth-email-hook` e `handle-email-suppression` **dependem dos pacotes npm `@lovable.dev/email-js` e `@lovable.dev/webhooks-js`** (não são env vars, são dependências de código) — já documentado em análise anterior desta sessão como bloqueio real para sair da Lovable.

---

## Stripe

**Nenhuma variável encontrada.** Não há integração Stripe identificada neste repositório.

---

## Mercado Pago

**Nenhuma variável encontrada.** Não há integração Mercado Pago identificada — os pagamentos identificados são via Cakto, Hotmart, Doppus e Sankhya (ver "Outros"), cujas credenciais também não aparecem como secrets de plataforma (provavelmente em tabela por organização).

---

## Cron

| Variável | Onde é usada | Obrigatória/Opcional | Impacto se faltar |
|---|---|---|---|
| `ENABLE_VPS_RECEIPT_RESULT` | `_shared/vps-receipt-bridge.ts` (usado por `uazapi-webhook`) | Opcional (kill-switch, default `false`) | Se ausente/false, o curto-circuito VPS2→Lovable no bloco `ai_receipt` fica desligado (comportamento legado). |
| `VPS_RECEIPT_ALLOWED_INSTANCES` | `_shared/vps-receipt-bridge.ts` | Opcional (default vazio) | Sem allowlist, nenhuma instância usa o caminho VPS2 mesmo com a flag ligada. |
| `VPS_RECEIPT_ALLOWED_FUNNELS` | `_shared/vps-receipt-bridge.ts` | Opcional (default vazio) | Idem, por funil. |
| `VPS_RECEIPT_POLL_TIMEOUT_MS` | `_shared/vps-receipt-bridge.ts` | Opcional (default `2000`) | Sem impacto crítico — só ajusta timeout de polling. |
| `VPS_RECEIPT_POLL_INTERVAL_MS` | `_shared/vps-receipt-bridge.ts` | Opcional (default `250`) | Idem. |

Não há `Deno.env.get` relacionado a `pg_cron` diretamente — os jobs de cron do Postgres (`cron.schedule(...)`) precisam ser recriados manualmente no banco novo (já registrado no `schema_full.sql`, que exclui o schema `cron` do dump).

---

## VPS (edge-mini)

Variáveis completas do schema Zod em `vps/edge-mini/src/env.ts` (não capturadas pelo grep simples de `process.env.X`, pois o arquivo usa um schema centralizado):

| Variável | Obrigatória/Opcional | Impacto se faltar |
|---|---|---|
| `EDGE_MINI_ENV_FILE` | Opcional | Só define caminho alternativo do `.env`; sem ela, usa `.env` no cwd ou `/opt/x1zap/edge-mini/.env`. |
| `NODE_ENV` | Opcional (default `production`) | — |
| `PORT` | Opcional (default `8787`) | — |
| `HOST` | Opcional (default `127.0.0.1`) | — |
| `TZ` | Opcional (default `America/Sao_Paulo`) | Timestamps podem sair em fuso errado. |
| `LOG_LEVEL` | Opcional (default `info`) | — |
| `DRY_RUN` | Opcional (default `true`) | Se `true`, a VPS não grava efeitos reais — **verificar que está `false` antes do canário real**. |
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` | Opcional no schema (default `""`), mas **obrigatória na prática** | Sem elas, `ENABLE_SUPABASE_WRITE` não tem efeito — nenhuma escrita chega ao banco. |
| `UAZAPI_URL` / `UAZAPI_ADMIN_TOKEN` / `UAZAPI_BASE_URL` | Opcional no schema | Ver seção UazAPI acima. |
| `REDIS_URL` | Opcional (default local) | Ver seção Redis acima. |
| `X1ZAP_INTERNAL_TOKEN` | **Obrigatória** (`.min(8)`, sem default) | **A VPS não inicia** sem essa variável — validação Zod falha no boot. |
| `CORS_ALLOWED_ORIGINS` | Opcional (default vazio) | Sem ela, CORS pode bloquear chamadas do frontend/admin. |
| `RAW_STORAGE_DIR` / `RAW_STORAGE_MAX_PER_DAY` / `RAW_STORAGE_RETENTION_DAYS` | Opcional (defaults definidos) | Ajustam armazenamento local de payloads brutos. |
| `ENABLE_SUPABASE_WRITE` | Opcional (default `false`) | Kill-switch — se `false`, a VPS não escreve nada no Supabase (modo seguro/observação). |
| `ENABLE_SHADOW_INGEST` / `SHADOW_INGEST_URL` / `SHADOW_INGEST_TOKEN` | Opcional | Controla ingestão paralela de "shadow" para comparação. |
| `ENABLE_OCR_SHADOW` / `OCR_SHADOW_DIR` / `OCR_PROVIDER` / `OCR_SHADOW_URL` / `OCR_SHADOW_TOKEN` | Opcional | Pipeline de OCR em modo shadow (módulo sensível). |
| `OCR_LOCAL_TESSERACT_BIN` / `OCR_LOCAL_PDFTOPPM_BIN` / `OCR_LOCAL_LANGS` / `OCR_LOCAL_TIMEOUT_MS` / `OCR_LOCAL_MAX_PDF_PAGES` / `OCR_LOCAL_MAX_FILE_MB` | Opcional (defaults definidos) | Configuração do OCR local (Tesseract) — módulo sensível. |
| `OCR_MEDIA_DOWNLOAD_PROVIDER` | Opcional (default `none`) | — |
| `OCR_LOCAL_DEBUG` | Opcional | Flag de debug local (achada via `process.env` direto, fora do schema Zod). |
| `ENABLE_RECEIPT_SHADOW_WRITE` / `ENABLE_RECEIPT_SHADOW_INGEST` / `RECEIPT_SHADOW_INGEST_URL` / `RECEIPT_SHADOW_INGEST_TOKEN` | Opcional | Módulo sensível de comprovante (shadow). |
| `ENABLE_AI_SHADOW` / `AI_SHADOW_PROVIDER` / `AI_SHADOW_DIR` / `AI_SHADOW_ONLY_RECEIPTS` | Opcional | Módulo sensível de IA em modo shadow. |
| `ENABLE_RECEIPT_PRODUCTION_WRITE` / `RECEIPT_PRODUCTION_ALLOWED_INSTANCES` / `RECEIPT_PRODUCTION_WRITE_URL` / `RECEIPT_PRODUCTION_WRITE_TOKEN` | Opcional | **Kill-switch do módulo de produção do comprovante — crítico para o canário.** |

Correspondência do lado Supabase (Edge Functions que recebem essas chamadas da VPS):

| Variável | Onde é usada (Supabase) | Obrigatória/Opcional | Impacto se faltar |
|---|---|---|---|
| `RECEIPT_PRODUCTION_WRITE_TOKEN` | `receipt-production-write` | **Obrigatória** (módulo sensível) | Sem ela, a Edge Function não valida o token vindo da VPS — risco de segurança se ausente/mal configurada, ou bloqueio total se exigida e não fornecida. |
| `RECEIPT_SHADOW_INGEST_TOKEN` | `receipt-shadow-ingest` | **Obrigatória** (módulo sensível) | Idem, para o caminho shadow. |

---

## Outros

| Variável | Onde é usada | Obrigatória/Opcional | Impacto se faltar |
|---|---|---|---|
| `LOVABLE_API_KEY` | 24 Edge Functions (lista completa: `process-knowledge-source`, `evaluate-conversation`, `generate-agent-ai`, `agent-supervisor`, `import-agent-from-document`, `sales-copilot`, `admin-agent-handle-inbound`, `process-email-queue`, `memory-search`, `uazapi-webhook`, `manual-outreach`, `ai-followup-cron`, `process-media-message`, `_shared/ai-call.ts`, `_shared/ai-router.ts`, `_shared/ai-credentials.ts`, `form-generate-ai`, `process-training-material`, `handle-email-suppression`, `funnel-generate-ai`, `catalog-sync-website`, `agent-handoff-greeter`, `preview-transactional-email`, `cakto-recovery-trigger`, `memory-embedder`, `auth-email-hook`, `webhook-receiver`, `analyze-conversation`) | **Decisão pendente** (dependência Lovable já mapeada em detalhe nesta sessão) | Se removida sem migrar todas essas funções antes, elas falham ou perdem o fallback de IA/e-mail. |
| `BOOTSTRAP_SECRET` | `bootstrap-super-admin` | Obrigatória (uso único no setup inicial) | Sem ela, não é possível criar o primeiro super admin do projeto novo. |
| `DEFAULT_SUPER_ADMIN_EMAIL` / `_NAME` / `_PASSWORD` | `ensure-default-super-admin` | Obrigatória (uso único) | Idem — sem elas, não há admin padrão criado automaticamente. |
| `SUPER_ADMIN_EMAIL` | `auto-promote-super-admin`, `ensure-default-super-admin`, `bootstrap-super-admin` | Obrigatória | Promoção automática a super admin falha. |
| `BOTCONVERSA_API_KEY` | `webhook-receiver` | Opcional (integração específica — validar se ainda ativa) | Falha só no trecho que integra com BotConversa. |
| `ISICHAT_TOKEN` | `webhook-receiver` | Opcional (integração específica — validar se ainda ativa) | Idem para IsiChat. |
| `ELEVENLABS_API_KEY` | `transcribe-audio` | Opcional (só se essa função for usada) | Transcrição via ElevenLabs falha; não afeta outras transcrições (ex. Whisper via OpenAI). |
| `FIRECRAWL_API_KEY` | `firecrawl-crawl`, `firecrawl-map`, `firecrawl-scrape`, `catalog-sync-website`, `test-integration` | Obrigatória (para essas 5 funções) | Funções de crawling/scraping de catálogo falham. |
| `APP_URL` | `booking-dispatcher`, `auth-email-hook` | Obrigatória | Links gerados (booking, e-mails) ficam incorretos/quebrados. |
| `SITE_URL` | `booking-dispatcher`, `auth-email-hook`, `booking-submit` | Obrigatória | Idem. |

**Credenciais de Cakto, Hotmart, Doppus, Sankhya, Google Calendar**: **nenhuma env var de plataforma encontrada** para essas integrações (`cakto-webhook`, `cakto-proxy`, `cakto-recovery-trigger`, `hotmart-webhook`, `hotmart-sync-orders`, `hotmart-test-credentials`, `doppus-webhook`, `sankhya-auth`, `sankhya-sync-clients`, `sankhya-sync-products`, `sankhya-create-order`, `google-calendar-auth`, `google-calendar-callback`, `google-calendar-refresh`, `google-calendar-sync`). Todas usam apenas `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` — as credenciais específicas de cada integração (tokens OAuth, client secrets, API keys de cada plataforma de pagamento/ERP) devem estar armazenadas em tabelas do banco (por organização/produto), não em secrets globais. **Recomendo validação manual com o time antes do corte**, pois isso não é uma "ausência" no sentido de faltar migrar — é uma arquitetura diferente (dado de negócio, não secret de infraestrutura) que precisa ser migrada junto com os dados de organização/produto.

---

## Resumo de criticidade para o corte

**Bloqueantes se ausentes (sistema não sobe/autentica)**:
`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `X1ZAP_INTERNAL_TOKEN` (VPS).

**Bloqueantes para módulos sensíveis (CLAUDE.md)**:
`RECEIPT_PRODUCTION_WRITE_TOKEN`, `RECEIPT_SHADOW_INGEST_TOKEN`, `ENABLE_VPS_RECEIPT_RESULT` + allowlists, `ENABLE_RECEIPT_PRODUCTION_WRITE` (VPS).

**Bloqueantes para e-mail/auth**:
`EMAIL_SENDER_DOMAIN`, `EMAIL_FROM_DOMAIN`, `EMAIL_ROOT_DOMAIN`.

**Decisão estratégica pendente**:
`LOVABLE_API_KEY` (afeta 24 Edge Functions + 3 dependências de pacote npm).

**Validação manual necessária antes do corte** (não descoberto por grep, provavelmente em tabela):
credenciais de Cakto, Hotmart, Doppus, Sankhya, Google Calendar, Facebook Leads, UazAPI/Evolution por instância.
