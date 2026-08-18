#!/usr/bin/env bash
# ============================================================================
# TEMPLATE — cadastro de Edge Function Secrets no Supabase novo (ydunpoqdhijhnrarohiz)
#
# Gerado a partir de:
#   docs/reports/secrets_inventory.md
#   docs/reports/supabase_secrets_current.md
#
# NÃO CONTÉM VALORES REAIS. Todo campo "PREENCHER" precisa ser substituído
# manualmente antes de rodar qualquer linha.
#
# NÃO COMMITAR este arquivo depois de preenchido com valores reais.
# Recomendado: preencher uma cópia local (ex.: secrets_to_set.local.sh,
# já coberto por .gitignore) e nunca versionar essa cópia.
#
# Escopo: somente Edge Function Secrets do Supabase (supabase secrets set).
# NÃO inclui:
#   - variáveis VITE_* (essas vão no Vercel, não aqui)
#   - variáveis da VPS/edge-mini (essas vão no .env da VPS2, não aqui)
#   - tokens/credenciais que ficam em tabela por organização
#     (Cakto, Hotmart, Doppus, Sankhya, Google Calendar, Facebook Leads,
#      UazAPI/Evolution por instância) — essas são dado de negócio, migram
#      junto com os dados de organização, não como secret de plataforma.
# ============================================================================

set -euo pipefail

# Rode isto antes, numa sessão autenticada:
#   source /root/supabase_access_token.env

# ----------------------------------------------------------------------------
# BLOCO 1 — Críticas obrigatórias (sistema não sobe sem elas)
# ----------------------------------------------------------------------------

# Usada por praticamente todas as Edge Functions (client admin do Supabase).
supabase secrets set SUPABASE_URL="PREENCHER"

# Usada por praticamente todas as Edge Functions (bypass de RLS).
supabase secrets set SUPABASE_SERVICE_ROLE_KEY="PREENCHER"

# Usada por 14 funções que validam sessão de usuário via client autenticado
# (delete-organization, create-team-member, sales-copilot, cakto-proxy, etc.)
supabase secrets set SUPABASE_ANON_KEY="PREENCHER"

# Fallback de SUPABASE_ANON_KEY em sales-copilot/save-ai-credential.
supabase secrets set SUPABASE_PUBLISHABLE_KEY="PREENCHER"

# Protege o endpoint que a VPS2 usa para gravar o resultado oficial do
# comprovante (módulo sensível — ver CLAUDE.md).
supabase secrets set RECEIPT_PRODUCTION_WRITE_TOKEN="PREENCHER"

# Protege o endpoint de ingestão shadow do comprovante (módulo sensível).
supabase secrets set RECEIPT_SHADOW_INGEST_TOKEN="PREENCHER"


# ----------------------------------------------------------------------------
# BLOCO 2 — IA/OCR
# ----------------------------------------------------------------------------

# Caminho OpenAI direto (já em uso em optimize-product-field; usada como
# fallback/roteamento em várias outras funções).
supabase secrets set OPENAI_API_KEY="PREENCHER"

# DECISÃO PENDENTE: manter temporariamente enquanto 24 Edge Functions ainda
# dependem do Lovable AI Gateway, ou já cortar (quebra essas 24 funções até
# serem migradas). Ver análise de dependência Lovable já feita nesta sessão.
supabase secrets set LOVABLE_API_KEY="PREENCHER"

# Opcional — só necessária se LOVABLE_API_KEY for mantida e o endpoint de
# envio de e-mail precisar ser sobrescrito (default: https://api.lovable.dev).
supabase secrets set LOVABLE_SEND_URL="PREENCHER"

# Opcional — só necessária se a função transcribe-audio for usada.
supabase secrets set ELEVENLABS_API_KEY="PREENCHER"

# Kill-switch do curto-circuito VPS2 -> uazapi-webhook (módulo sensível,
# bloco ai_receipt). Default seguro: "false".
supabase secrets set ENABLE_VPS_RECEIPT_RESULT="PREENCHER"

# Allowlist de instâncias autorizadas a usar o caminho VPS2 (CSV). Vazio =
# nenhuma instância usa, mesmo com a flag acima ligada.
supabase secrets set VPS_RECEIPT_ALLOWED_INSTANCES="PREENCHER"

# Allowlist de funis autorizados (CSV, nome exato).
supabase secrets set VPS_RECEIPT_ALLOWED_FUNNELS="PREENCHER"

# Opcional — tem default de 2000ms no código.
supabase secrets set VPS_RECEIPT_POLL_TIMEOUT_MS="PREENCHER"

# Opcional — tem default de 250ms no código.
supabase secrets set VPS_RECEIPT_POLL_INTERVAL_MS="PREENCHER"


# ----------------------------------------------------------------------------
# BLOCO 3 — E-mail
# ----------------------------------------------------------------------------

# Usada por webchat-bot, daily-report-ai, webhook-receiver.
supabase secrets set RESEND_API_KEY="PREENCHER"

# Domínio remetente para e-mails transacionais (send-transactional-email,
# auth-email-hook). Sem isso, signup/recovery por e-mail não funcionam.
supabase secrets set EMAIL_SENDER_DOMAIN="PREENCHER"

supabase secrets set EMAIL_FROM_DOMAIN="PREENCHER"

# Usada especificamente por auth-email-hook.
supabase secrets set EMAIL_ROOT_DOMAIN="PREENCHER"

# Opcional — só afeta label de exibição nos e-mails.
supabase secrets set SITE_NAME="PREENCHER"

# Usada para montar links (booking-dispatcher, auth-email-hook).
supabase secrets set APP_URL="PREENCHER"

# Usada para montar links (booking-dispatcher, auth-email-hook, booking-submit).
supabase secrets set SITE_URL="PREENCHER"


# ----------------------------------------------------------------------------
# BLOCO 4 — Setup/admin (uso único, para inicializar o projeto novo)
# ----------------------------------------------------------------------------

# Necessária para bootstrap-super-admin criar o primeiro super admin.
supabase secrets set BOOTSTRAP_SECRET="PREENCHER"

# Usadas por ensure-default-super-admin para criar o admin padrão automático.
supabase secrets set DEFAULT_SUPER_ADMIN_EMAIL="PREENCHER"
supabase secrets set DEFAULT_SUPER_ADMIN_NAME="PREENCHER"
supabase secrets set DEFAULT_SUPER_ADMIN_PASSWORD="PREENCHER"

# Usada por auto-promote-super-admin / ensure-default-super-admin / bootstrap-super-admin.
supabase secrets set SUPER_ADMIN_EMAIL="PREENCHER"


# ----------------------------------------------------------------------------
# BLOCO 5 — Opcionais (integrações específicas — confirmar se ainda ativas)
# ----------------------------------------------------------------------------

# Usada só em webhook-receiver — confirmar com o time se BotConversa
# ainda está em uso antes de preencher.
supabase secrets set BOTCONVERSA_API_KEY="PREENCHER"

# Usada só em webhook-receiver — confirmar se IsiChat ainda está em uso.
supabase secrets set ISICHAT_TOKEN="PREENCHER"

# Usada por firecrawl-crawl, firecrawl-map, firecrawl-scrape,
# catalog-sync-website, test-integration.
supabase secrets set FIRECRAWL_API_KEY="PREENCHER"

# ============================================================================
# FIM DO TEMPLATE
# ============================================================================
