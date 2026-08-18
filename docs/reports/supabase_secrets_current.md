# Secrets Atuais no Supabase Novo (`ydunpoqdhijhnrarohiz`)

> Levantado via `supabase secrets list` (CLI autenticada e linkada ao projeto `ydunpoqdhijhnrarohiz`, "zapx1's Project", status `ACTIVE_HEALTHY`).
> Nenhum valor de secret foi exibido — apenas confirmação de existência do nome.
> Nenhum secret foi alterado, criado ou removido nesta auditoria.

## Comando executado

```bash
supabase secrets list
```

## Resultado bruto

```json
{"secrets":[],"message":""}
```

## Tabela — Edge Function Secrets configurados hoje

| Nome | Existe? | Valor |
|---|---|---|
| — | — | — |

**Nenhum secret está configurado no projeto novo.** A lista veio vazia (`"secrets":[]`) — é um projeto recém-criado (`created_at: 2026-06-30T21:39:03Z`), sem nenhuma Edge Function Secret cadastrada ainda.

---

## Comparação com `docs/reports/secrets_inventory.md`

### 1. Secrets já existentes
**Nenhum.**

### 2. Secrets faltantes (relevantes para Edge Functions do Supabase)

Todas as variáveis abaixo, listadas no inventário, precisam ser cadastradas via `supabase secrets set` antes do deploy das respectivas Edge Functions:

| Nome | Categoria (inventário) |
|---|---|
| `SUPABASE_URL` | Supabase (self-referencial — geralmente injetada automaticamente pela plataforma, confirmar) |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase (idem) |
| `SUPABASE_ANON_KEY` | Supabase |
| `SUPABASE_PUBLISHABLE_KEY` | Supabase |
| `OPENAI_API_KEY` | OpenAI |
| `LOVABLE_API_KEY` | Outros (decisão pendente) |
| `LOVABLE_SEND_URL` | Outros/SMTP |
| `RESEND_API_KEY` | SMTP/Resend |
| `EMAIL_SENDER_DOMAIN` | SMTP/Resend |
| `EMAIL_FROM_DOMAIN` | SMTP/Resend |
| `EMAIL_ROOT_DOMAIN` | SMTP/Resend |
| `SITE_NAME` | SMTP/Resend |
| `APP_URL` | Outros |
| `SITE_URL` | Outros |
| `BOOTSTRAP_SECRET` | Outros (setup inicial) |
| `DEFAULT_SUPER_ADMIN_EMAIL` | Outros (setup inicial) |
| `DEFAULT_SUPER_ADMIN_NAME` | Outros (setup inicial) |
| `DEFAULT_SUPER_ADMIN_PASSWORD` | Outros (setup inicial) |
| `SUPER_ADMIN_EMAIL` | Outros |
| `BOTCONVERSA_API_KEY` | Outros (validar se ainda ativa) |
| `ISICHAT_TOKEN` | Outros (validar se ainda ativa) |
| `ELEVENLABS_API_KEY` | Outros |
| `FIRECRAWL_API_KEY` | Outros |
| `RECEIPT_PRODUCTION_WRITE_TOKEN` | Cron/módulo sensível |
| `RECEIPT_SHADOW_INGEST_TOKEN` | Cron/módulo sensível |
| `ENABLE_VPS_RECEIPT_RESULT` | Cron/módulo sensível |
| `VPS_RECEIPT_ALLOWED_INSTANCES` | Cron/módulo sensível |
| `VPS_RECEIPT_ALLOWED_FUNNELS` | Cron/módulo sensível |
| `VPS_RECEIPT_POLL_TIMEOUT_MS` | Cron/módulo sensível |
| `VPS_RECEIPT_POLL_INTERVAL_MS` | Cron/módulo sensível |

**Fora do escopo de `supabase secrets` (pertencem a outro sistema, não faltam "aqui"):**
- `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_PROJECT_ID` → env vars do **Vercel** (build do frontend), não Edge Function Secrets.
- `REDIS_URL`, `X1ZAP_INTERNAL_TOKEN`, `UAZAPI_URL`, `UAZAPI_ADMIN_TOKEN`, `UAZAPI_BASE_URL`, `NODE_ENV`, `PORT`, `HOST`, `TZ`, `LOG_LEVEL`, `DRY_RUN`, `CORS_ALLOWED_ORIGINS`, `EDGE_MINI_ENV_FILE`, `ENABLE_SUPABASE_WRITE`, `OCR_*` → env vars do **`.env` da VPS2/edge-mini**, não gerenciadas pelo Supabase.

### 3. Secrets opcionais (podem ser adiados sem travar o boot do sistema)

| Nome | Motivo |
|---|---|
| `LOVABLE_SEND_URL` | Só usada se `LOVABLE_API_KEY` for mantida e o endpoint precisar ser sobrescrito. |
| `SITE_NAME` | Só afeta label de exibição em e-mails. |
| `BOTCONVERSA_API_KEY` | Integração específica — confirmar se ainda em uso antes de decidir. |
| `ISICHAT_TOKEN` | Idem. |
| `ELEVENLABS_API_KEY` | Só necessária se `transcribe-audio` for usada. |
| `FIRECRAWL_API_KEY` | Só necessária para as 5 funções de crawling/scraping de catálogo. |
| `VPS_RECEIPT_POLL_TIMEOUT_MS` / `VPS_RECEIPT_POLL_INTERVAL_MS` | Têm defaults no código (2000ms/250ms) — funcionam sem serem definidas. |

### 4. Secrets críticos (bloqueantes — sistema ou módulo sensível não funciona sem eles)

| Nome | Por quê é crítico |
|---|---|
| `SUPABASE_URL` | Toda Edge Function depende disso para instanciar o client admin. |
| `SUPABASE_SERVICE_ROLE_KEY` | Idem — sem ela, nenhuma operação privilegiada funciona. |
| `RECEIPT_PRODUCTION_WRITE_TOKEN` | Módulo sensível (CLAUDE.md) — protege o endpoint que a VPS2 usa para gravar resultado oficial de comprovante. |
| `RECEIPT_SHADOW_INGEST_TOKEN` | Módulo sensível — protege o endpoint de ingestão shadow. |
| `EMAIL_SENDER_DOMAIN` / `EMAIL_FROM_DOMAIN` / `EMAIL_ROOT_DOMAIN` | Sem eles, `auth-email-hook` não processa e-mails de signup/recovery — usuários não conseguem se autenticar por e-mail. |
| `BOOTSTRAP_SECRET` + `DEFAULT_SUPER_ADMIN_*` | Sem eles, não existe forma automatizada de criar o primeiro admin no projeto novo. |
| `OPENAI_API_KEY` | Necessária para o caminho de IA já migrado (`optimize-product-field`) e como alternativa ao gateway Lovable em outras funções. |

---

**Pronto para cadastrar os secrets faltantes.**
