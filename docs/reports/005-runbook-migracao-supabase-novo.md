# Runbook de Migração — Supabase Novo (`ydunpoqdhijhnrarohiz`)

> Status: **PLANEJAMENTO — nenhum comando deste runbook foi executado.**
> Nenhuma migration, deploy, commit, push, alteração de VPS ou Vercel foi feita.
> Este documento é o roteiro de execução; cada comando exige aprovação explícita antes de rodar.

---

## 1. Pré-requisitos obrigatórios

- [ ] **Supabase CLI instalada** — já confirmado nesta sessão: `supabase --version` → `2.109.0`.
- [ ] **Access Token do Supabase** gerado manualmente em `https://supabase.com/dashboard/account/tokens` (escopo mínimo necessário para link/push/secrets/functions deploy do projeto `ydunpoqdhijhnrarohiz`).
- [ ] **Login/autenticação** feita via `SUPABASE_ACCESS_TOKEN` (ver seção 2) — login automático (`supabase login`) não funciona neste terminal (não é TTY, já confirmado).
- [ ] **Link do projeto novo** feito com `supabase link --project-ref ydunpoqdhijhnrarohiz` (ainda não executado).
- [ ] **Branch git dedicada** para a migração (ex.: `migracao/supabase-novo`) — não trabalhar direto na `main` durante o corte, para poder abortar sem afetar o histórico principal.
- [ ] **Backup do Supabase atual** (o de produção/Lovable) antes de qualquer teste — mesmo que o corte não vá tocar nele, ter um dump recente (`pg_dump` via painel ou CLI) como rede de segurança.
- [ ] **Secrets mínimas decididas** (lista completa na seção 5) — pelo menos as obrigatórias precisam estar definidas antes do primeiro deploy de Edge Function.
- [ ] **Confirmação explícita sua** antes de cada uma das ações "quebra-vidro" (db push, functions deploy, alteração Vercel/VPS).

---

## 2. Autenticação no terminal não-TTY

O login interativo falha aqui com `LegacyLoginMissingTokenError` (já confirmado). Uso correto:

```bash
# 1. Gerar o token manualmente no dashboard (fora deste terminal):
#    https://supabase.com/dashboard/account/tokens

# 2. Exportar como variável de ambiente — NUNCA colar o token direto num comando
#    (comandos ficam no histórico do shell / podem aparecer em logs).
export SUPABASE_ACCESS_TOKEN="<token gerado no dashboard>"

# 3. Confirmar autenticação sem expor o token:
supabase projects list
```

Boas práticas para não expor o token:
- Definir via `export` numa sessão de shell, nunca como argumento de `--token` visível em `ps`/histórico.
- Não usar `echo $SUPABASE_ACCESS_TOKEN` nem logar essa variável em nenhum script.
- Se precisar persistir entre sessões, usar um arquivo `.env` **fora do git** (confirmar que está no `.gitignore`) e carregar com `source` — nunca commitar.
- Ao final da migração, revogar o token no dashboard se não for mais necessário.

---

## 3. Ordem exata para aplicar o schema

### Comando recomendado

**Não usar `supabase/migrations_shared/`** — já demonstrado nesta sessão que é um snapshot incompleto (faltam 28 tabelas e 17 funções, incluindo `purchase_audit`, `ai_receipt_audits`, `pixel_event_logs`) e desatualizado (parou em 2026-06-21, existem migrations até 2026-06-26).

```bash
# 1. Link (uma vez, após autenticado):
supabase link --project-ref ydunpoqdhijhnrarohiz

# 2. Aplicar extensões/enums primeiro (arquivo isolado, confiável por si só):
#    Copiar o CONTEÚDO de supabase/migrations_shared/00000000000001_extensions_and_types.sql
#    para o SQL editor do painel, OU renomear temporariamente para dentro de
#    supabase/migrations/ com timestamp anterior ao primeiro (ex: 20260109000000_extensions.sql)
#    antes do push — decisão a tomar no momento da execução, não agora.

# 3. Aplicar as 271 migrations históricas, em ordem cronológica do nome do arquivo:
supabase db push
```

`supabase db push` aplica todos os arquivos de `supabase/migrations/` em ordem alfabética/cronológica do nome (que já é `YYYYMMDDHHMMSS_uuid.sql`) — não precisa reordenar manualmente, só garantir que **nenhum arquivo de `migrations_shared` esteja dentro de `supabase/migrations/`** no momento do push (eles vivem fora dessa pasta hoje, conforme já confirmado pelo `supabase/_migrations_archive/README.md`).

### Por que NÃO recomendar aplicar `migrations_shared` como baseline único

Porque, se aplicado sozinho, o banco novo ficaria **sem** `purchase_audit`, `ai_receipt_audits`, `pixel_event_logs`, `processed_messages`, `webhook_health`, `connection_health`, `lead_tracking`, tabelas de booking, alertas admin, e 17 funções ligadas a locks de bot/funil/purchase — quebrando exatamente os módulos sensíveis citados no CLAUDE.md. Isso já foi levantado com evidências em análise anterior desta sessão.

### Como validar que as 271 migrations rodaram

```bash
# Contagem de migrations aplicadas registradas pelo Supabase:
supabase migration list --linked

# Deve mostrar 271 entradas com status "Applied" tanto local quanto remoto.
```

Validação complementar via SQL (rodar no SQL editor do projeto novo, não pela CLI):
```sql
-- Contagem de tabelas no schema public — deve bater com as 152 tabelas
-- identificadas nas migrations históricas (levantamento desta sessão).
select count(*) from information_schema.tables where table_schema = 'public';

-- Confirmar presença das tabelas sensíveis:
select table_name from information_schema.tables
where table_schema = 'public'
and table_name in ('purchase_audit','ai_receipt_audits','pixel_event_logs','vps_receipt_results');
```

### Como detectar migration quebrada

- `supabase db push` para no primeiro erro e reporta o arquivo/linha que falhou (SQL inválido, constraint duplicada, dependência ausente).
- Sintomas comuns esperados neste projeto: `ALTER TABLE ... ADD CONSTRAINT` referenciando tabela ainda não criada (ordem errada) ou função usada por um trigger antes de a função existir — ambos improváveis se a ordem cronológica do nome do arquivo for respeitada, mas precisam ser verificados se o push falhar no meio.
- Comando de diagnóstico pontual: `supabase db push --dry-run` (se disponível na versão 2.109.0) para simular sem aplicar, ou aplicar em lotes menores manualmente via SQL editor para isolar o arquivo problemático.

### Como reverter se falhar

- Como é um **projeto novo, ainda sem dados reais**, o rollback mais simples é: **não corrigir migration a migration** — apagar o schema `public` inteiro (`drop schema public cascade; create schema public;`, executado só no projeto novo, nunca no antigo) e recomeçar o `db push` do zero depois de corrigido o arquivo problemático.
- Alternativa mais cirúrgica: `supabase migration repair <version> --status reverted` para marcar uma migration específica como não aplicada e tentar novamente só a partir dali.
- Em nenhum cenário isso afeta o Supabase de produção atual — é um ambiente de preparo isolado.

---

## 4. Ordem das Edge Functions

### Primeiro (base para tudo funcionar)
1. `_shared/*` — não é uma function deployável isolada, mas todo o resto depende desses módulos estarem corretos no momento do deploy das funções que os importam.
2. `bootstrap-super-admin`, `ensure-default-super-admin`, `auto-promote-super-admin`, `create-super-admin-direct`, `set-user-password` — sem isso não existe usuário admin para logar.
3. `auth-email-hook` — necessário para signup/magic-link/recovery funcionarem (depende de secrets de e-mail, ver seção 5).

### Segundo (estrutura de organização/produto/funil)
4. `create-organization-admin`, `create-team-member`, `super-admin-manage-user`.
5. `funnel-api`, `funnel-submit`, `funnel-job-runner`, `funnel-resume-cron`, `clone-funnel`, `catalog-search`, `catalog-import-csv`.

### Terceiro (canário WhatsApp — módulo sensível)
6. `uazapi-webhook`, `uazapi-send`, `uazapi-heartbeat`, `instances-api`, `whatsapp-send`, `whatsapp-proxy`.

### Quarto (comprovante/OCR/Pixel — módulos sensíveis do CLAUDE.md)
7. `receipt-production-write`, `receipt-shadow-ingest`, `purchase-audit`.

### Por último (menor criticidade, ou já em processo de migração da Fase 1 de IA)
8. `sales-copilot`, `generate-insights`, `handle-objection`, `optimize-product-field` (já parcialmente migrada para OpenAI direto nesta sessão).
9. Resto (booking, email em massa, integrações de terceiros, webchat, Google Calendar, Sankhya, Hotmart/Doppus/Cakto).

### Quais dependem de secrets críticas

- Praticamente todas as funções de IA (item 8 e a maioria do "resto") dependem de `OPENAI_API_KEY` e/ou `LOVABLE_API_KEY`.
- `auth-email-hook`, `process-email-queue`, `handle-email-suppression`, `handle-email-unsubscribe` dependem dos pacotes `@lovable.dev/email-js`/`@lovable.dev/webhooks-js` (ver abaixo).
- `receipt-production-write`/`receipt-shadow-ingest` dependem de `RECEIPT_PRODUCTION_WRITE_TOKEN`/`RECEIPT_SHADOW_INGEST_TOKEN`.

### Quais ainda dependem da Lovable (não eliminadas nesta fase)

Confirmado em análise anterior desta sessão — **22 Edge Functions** ainda chamam `https://ai.gateway.lovable.dev` diretamente com `LOVABLE_API_KEY`:
`admin-agent-handle-inbound`, `agent-handoff-greeter`, `agent-supervisor`, `ai-followup-cron`, `analyze-conversation`, `cakto-recovery-trigger`, `catalog-sync-website`, `evaluate-conversation`, `form-generate-ai`, `funnel-generate-ai`, `generate-agent-ai`, `import-agent-from-document`, `manual-outreach`, `memory-embedder`, `memory-search`, `process-knowledge-source`, `process-media-message`, `process-training-material`, `sales-copilot`, `uazapi-webhook`, `webhook-receiver`, `clone-funnel`.

Mais 3 funções dependem de pacotes npm da Lovable para e-mail: `process-email-queue`, `auth-email-hook`, `handle-email-suppression`.

**Implicação prática para o corte**: se `LOVABLE_API_KEY` não for mantida como secret no projeto novo, essas 22+3 funções falham em runtime até serem migradas para OpenAI direto (trabalho já iniciado nesta sessão só para `optimize-product-field`) ou até e-mail ser trocado para outro provedor (`RESEND_API_KEY` já existe como alternativa no código).

---

## 5. Lista completa de secrets necessárias

| Secret | Obrigatória/Opcional | Onde é usada (provável) |
|---|---|---|
| `SUPABASE_URL` | Obrigatória | Todas as funções (cliente admin) |
| `SUPABASE_SERVICE_ROLE_KEY` | Obrigatória | Todas as funções que usam `adminClient()` |
| `SUPABASE_ANON_KEY` / `SUPABASE_PUBLISHABLE_KEY` | Obrigatória | Funções que validam sessão de usuário (ex. `optimize-product-field` antes da Fase 1, outras que ainda fazem isso) |
| `OPENAI_API_KEY` | Obrigatória | `ai-router.ts`, `ai-credentials.ts`, `optimize-product-field` (já migrada), fallback em várias funções |
| `LOVABLE_API_KEY` | **Decisão pendente** | 22 funções com chamada direta ao gateway Lovable + fallback em `ai-call.ts`/`ai-router.ts`/`ai-credentials.ts` |
| `LOVABLE_SEND_URL` | Opcional (só se `LOVABLE_API_KEY` mantida) | `process-email-queue` |
| `RESEND_API_KEY` | Recomendada (substituto de e-mail sem Lovable) | Presente no código como alternativa, não confirmado uso ativo — validar antes do corte |
| `RECEIPT_PRODUCTION_WRITE_TOKEN` | Obrigatória (módulo sensível) | `receipt-production-write` |
| `RECEIPT_SHADOW_INGEST_TOKEN` | Obrigatória (módulo sensível) | `receipt-shadow-ingest` |
| `ENABLE_VPS_RECEIPT_RESULT` | Obrigatória (kill-switch) | `uazapi-webhook`, `_shared/vps-receipt-bridge.ts` |
| `VPS_RECEIPT_ALLOWED_INSTANCES` | Obrigatória (allowlist canário) | idem |
| `VPS_RECEIPT_ALLOWED_FUNNELS` | Obrigatória (allowlist canário) | idem |
| `VPS_RECEIPT_POLL_TIMEOUT_MS` | Opcional (tem default 2000) | idem |
| `VPS_RECEIPT_POLL_INTERVAL_MS` | Opcional (tem default 250) | idem |
| `EMAIL_SENDER_DOMAIN` | Obrigatória (se usar e-mail transacional) | `auth-email-hook` |
| `EMAIL_FROM_DOMAIN` | Obrigatória (idem) | `auth-email-hook` |
| `EMAIL_ROOT_DOMAIN` | Obrigatória (idem) | `auth-email-hook` |
| `SITE_NAME` | Opcional | `auth-email-hook` (label de exibição) |
| `APP_URL` / `SITE_URL` | Obrigatória | Links em e-mails, redirects |
| `BOOTSTRAP_SECRET` | Obrigatória (uma vez, para criar o primeiro super admin) | `bootstrap-super-admin` |
| `DEFAULT_SUPER_ADMIN_EMAIL` / `_NAME` / `_PASSWORD` | Obrigatória (uma vez) | `ensure-default-super-admin` |
| `SUPER_ADMIN_EMAIL` | Obrigatória | `auto-promote-super-admin` |
| `FIRECRAWL_API_KEY` | Opcional (só se usar `firecrawl-*`/`catalog-sync-website`) | 3 funções firecrawl |
| `ELEVENLABS_API_KEY` | Opcional (só se usar voz/TTS) | validar uso real antes do corte |
| `BOTCONVERSA_API_KEY` | Opcional (integração específica) | validar se ainda em uso |
| `ISICHAT_TOKEN` | Opcional (integração específica) | validar se ainda em uso |

⚠️ Valores das secrets **não devem ser exibidos** neste runbook nem em nenhum log — só os **nomes** e se estão presentes/ausentes (`supabase secrets list` mostra só nomes, nunca valores).

⚠️ Não identificado por grep de `Deno.env.get`: credenciais de Cakto, Hotmart, Doppus, Sankhya, Google Calendar, Facebook Leads — provavelmente ficam em tabela de credenciais por organização, não em secrets de plataforma. **Validar manualmente com o time antes do corte.**

---

## 6. Dados mínimos para migrar agora

**Migrar:**
- Usuários/admin (`profiles`, vínculo com `auth.users`).
- Organizações (`organizations`).
- Produtos (`products` + tabelas de apoio como `ai_knowledge_base` se necessário para o produto funcionar).
- Funis (`funnels`) e blocos de funil (tabela de blocos — confirmar nome exato no schema antes de migrar).
- Integrações necessárias: credenciais/configuração da UazAPI por instância (não o histórico de mensagens).
- Configs de Pixel/CAPI (configuração, não `pixel_event_logs` histórico).
- Configs UazAPI (instâncias, não sessões antigas).

**Não migrar agora** (conforme `CLAUDE.md`/`docs/migration.md`, reafirmado):
- Leads antigos, conversas antigas, mensagens antigas, logs antigos, auditorias antigas (`purchase_audit`/`pixel_event_logs` histórico), storage antigo, filas antigas, estados antigos de funil em andamento.

Método recomendado: `INSERT` seletivo por tabela (script SQL revisado manualmente, não `pg_dump` completo), organização por organização, começando pela organização de teste/canário.

---

## 7. Como validar o banco novo

- **Tabelas críticas**: rodar a query de contagem da seção 3 + conferir presença individual de `organizations`, `profiles`, `products`, `funnels`, `purchase_audit`, `ai_receipt_audits`, `pixel_event_logs`, `vps_receipt_results`, `org_ai_routing`, `org_ai_credentials`.
- **RLS**: `select count(*) from pg_policies where schemaname = 'public';` — comparar com a contagem de 139 `ENABLE ROW LEVEL SECURITY` identificada no schema atual. Testar manualmente com 2 usuários de organizações diferentes (teste de "cross-org leak") antes de importar qualquer dado real.
- **Triggers**: `select count(*) from information_schema.triggers where trigger_schema = 'public';` — validar que triggers de `updated_at`, propagação de lead, purchase/pixel sync existem.
- **Funções SQL**: `select count(*) from information_schema.routines where routine_schema = 'public' and routine_type = 'FUNCTION';` — validar presença de `sync_pixel_to_purchase_audit`, `sync_purchase_attribution`, `try_lock_bot`, `try_acquire_conversation_lock` (as 17 funções que faltavam no baseline incompleto).
- **Dados seed/admin**: confirmar 1 super admin criado e funcional (login real), `platform_plans`/`help_categories`/`form_templates` presentes (podem vir de `migrations_shared/00000000000007_seeds.sql`, que são dados estáticos seguros de reaproveitar).

---

## 8. Como validar frontend/Vercel

- **Env vars necessárias no Vercel**: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_PROJECT_ID` apontando para `ydunpoqdhijhnrarohiz` — **crítico**: `vite.config.ts` tem fallback hardcoded para o projeto antigo (`rbzekjfufhqjpjmjgwmb`); se essas env vars não estiverem 100% configuradas no ambiente de build do Vercel, o build cai silenciosamente no Supabase antigo. Corrigir isso no código (fora deste runbook, é uma alteração de arquivo) antes do corte real.
- **Build**: rodar primeiro em **Preview Deployment** do Vercel (branch dedicada), nunca direto em produção.
- **Deploy**: só promover Preview → Production depois de validação manual completa do item abaixo.
- **Login**: testar login real (email/senha e/ou OAuth) contra o Supabase novo no ambiente de preview.
- **Painel**: conferir no Vercel Dashboard que a env var ativa no deployment de produção é a nova, não a antiga (Vercel mantém histórico — fácil de confundir se houver múltiplos ambientes).

---

## 9. Como validar VPS2/edge-mini

- **Env vars**: `vps/edge-mini/src/env.ts` — confirmar que aponta para `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` do projeto novo antes de qualquer teste real (trocar só depois do Supabase novo validado, conforme ordem do plano anterior).
- **Healthcheck**: `curl -s http://127.0.0.1:3002/health` (comando já autorizado no CLAUDE.md) — validar resposta OK antes e depois da troca de env.
- **PM2**: `pm2 status` — confirmar processo `edge-api` rodando sem restart loop após a troca de env.
- **Redis**: confirmar conexão ativa (sem erro de auth/host) nos logs do PM2 após restart.
- **Webhook UazAPI**: confirmar que o endpoint de webhook configurado na UazAPI para o chip canário aponta para a VPS2/edge-mini correta, e que ela consegue escrever no Supabase novo (`receipt-production-write` → `vps_receipt_results`).
- **Teste canário**: enviar um comprovante de teste real pelo chip canário e confirmar que `vps_receipt_results` no Supabase novo recebe o registro, e que o `uazapi-webhook` novo consegue fazer o poll e avançar o funil.

---

## 10. Plano de corte

1. **Quando trocar o frontend**: só depois de banco novo 100% validado (seções 3, 7) e Edge Functions essenciais (seção 4, itens 1–7) deployadas e testadas isoladamente. Trocar primeiro em Preview do Vercel, produção só depois de validação manual completa.
2. **Quando trocar o webhook UazAPI**: só depois do frontend novo já estar servindo em produção E da VPS2 já apontando para o Supabase novo (seção 9) — trocar o webhook antes disso quebraria o recebimento de mensagens em produção.
3. **Como testar 1 chip canário**: usar uma instância/número de teste isolado, com allowlist explícita (`VPS_RECEIPT_ALLOWED_INSTANCES`), rodar o fluxo completo lead→conversa→funil→comprovante→purchase→pixel com valores reais baixos, comparando resultado com o comportamento esperado.
4. **Quando escalar**: só depois de N dias (definir com o time) de operação estável do canário sem incidentes, migrando os demais chips gradualmente, um lote por vez, monitorando cada lote antes do próximo.

---

## 11. Rollback

- **Frontend**: reverter a env var do Vercel (`VITE_SUPABASE_URL` etc.) de volta para o projeto antigo e promover o deployment anterior via Vercel Dashboard (rollback de alias, não precisa rebuild).
- **Webhook UazAPI**: reapontar o webhook da instância/chip canário de volta para o endpoint antigo (reversível em segundos, sem deploy).
- **VPS2**: reverter env vars do `edge-mini` para o Supabase antigo e `pm2 reload` (comando que exige aprovação conforme CLAUDE.md) — ou, mais simples, manter dois processos PM2 em paralelo durante a transição (um apontando para cada Supabase) até ter confiança total, evitando a necessidade de reload em caso de problema.
- **Manter Lovable antigo funcionando até validação**: por definição deste plano, o Supabase/stack antiga **nunca é desligada** durante todo o processo — ela continua recebendo tráfego normalmente até o corte final ser aprovado, conforme regra explícita do CLAUDE.md ("produção antiga continua funcionando até o novo ambiente estar validado com 1 chip canário").

---

## 12. Checklist final

### Preparação
- [ ] Supabase CLI instalada (`2.109.0` confirmado).
- [ ] `SUPABASE_ACCESS_TOKEN` gerado e exportado (não commitado, não logado).
- [ ] `supabase link --project-ref ydunpoqdhijhnrarohiz` executado.
- [ ] Branch git dedicada criada.
- [ ] Backup do Supabase atual feito.

### Schema
- [ ] Extensões/enums aplicados.
- [ ] 271 migrations aplicadas via `supabase db push`, sem erro.
- [ ] `supabase migration list --linked` confirma 271 "Applied".
- [ ] Contagem de tabelas bate com 152 esperadas.
- [ ] Tabelas sensíveis confirmadas presentes (`purchase_audit`, `ai_receipt_audits`, `pixel_event_logs`, `vps_receipt_results`).
- [ ] 139 políticas de RLS confirmadas ativas.
- [ ] Teste de cross-org leak realizado com sucesso (nenhum vazamento).
- [ ] Triggers e funções SQL sensíveis confirmados (17 funções que faltavam no baseline incompleto).

### Secrets
- [ ] Todas as secrets obrigatórias da seção 5 configuradas.
- [ ] Decisão tomada sobre `LOVABLE_API_KEY` (manter temporariamente ou já cortar).
- [ ] Credenciais de integrações por tabela (Cakto/Hotmart/Doppus/Sankhya/Google Calendar/Facebook) validadas manualmente.

### Edge Functions
- [ ] Funções de auth/bootstrap deployadas e testadas.
- [ ] Funções de organização/produto/funil deployadas e testadas.
- [ ] Funções de UazAPI/WhatsApp deployadas e testadas.
- [ ] Funções de comprovante/OCR/Pixel deployadas e testadas.
- [ ] Demais funções deployadas.

### Dados mínimos
- [ ] Usuários/admin migrados.
- [ ] Organizações migradas.
- [ ] Produtos migrados.
- [ ] Funis e blocos migrados.
- [ ] Integrações e configs de Pixel/CAPI/UazAPI migradas.
- [ ] Confirmado que nenhum dado histórico (leads/conversas/mensagens/logs/auditorias antigas) foi migrado nesta fase.

### Frontend/Vercel
- [ ] `vite.config.ts` corrigido para não cair silenciosamente no Supabase antigo.
- [ ] Env vars corretas no Preview do Vercel.
- [ ] Login testado no Preview.
- [ ] Promovido para Production só após validação.

### VPS2/edge-mini
- [ ] Env vars trocadas para o Supabase novo.
- [ ] Healthcheck OK.
- [ ] PM2 estável (sem restart loop).
- [ ] Redis conectado.
- [ ] Webhook UazAPI apontando corretamente.

### Canário e corte
- [ ] 1 chip canário testado ponta a ponta com sucesso.
- [ ] Rollback testado e documentado antes do tráfego real.
- [ ] Aprovação explícita para escalar aos demais chips.
- [ ] Stack antiga mantida ativa até validação completa do canário.

---

*Nenhum comando deste runbook foi executado. Documento gerado para planejamento e aprovação prévia, conforme regras do `CLAUDE.md`.*
