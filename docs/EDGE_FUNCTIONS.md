# Edge Functions (81)

Todas vivem em `supabase/functions/` e são deployadas automaticamente em qualquer remix.
Configurações específicas (verify_jwt, import_map) ficam em `supabase/config.toml`.

## Atendimento / WhatsApp / Webchat
- **webchat-api** — Endpoint público do widget de chat (mensagens entrada/saída)
- **webchat-bot** — Roteador de IA omnichannel (resolve provider via org_ai_routing)
- **webchat-inbox** — Lista conversas filtradas por setor/permissões granulares
- **whatsapp-webhook** — Recebe eventos WhatsApp Cloud API (Meta)
- **evolution-webhook** — Recebe eventos Evolution API (multi-instância)
- **evolution-send** — Envia mensagens via Evolution API
- **evolution-proxy** — Proxy de operações Evolution (QR, status)
- **start-whatsapp-conversation** — Inicia WhatsApp a partir do CRM
- **process-media-message** — Download/upload de áudio/imagem/documento
- **process-scheduled-messages** — Cron de mensagens agendadas
- **transcribe-audio** — Transcrição via ElevenLabs Scribe v2
- **agent-handoff-greeter** — Saudação ao trocar de agente IA
- **agent-supervisor** — Supervisão de agentes IA (ações de tools)
- **analyze-conversation** — Análise de qualidade de conversa (IA)
- **evaluate-conversation** — Avaliação automática pós-conversa

## Agentes IA / Copilot
- **sales-copilot** — Copiloto de vendas multimodal (Gemini + voz)
- **generate-agent-ai** — Gera persona + prompt de agente via IA
- **prompt-experiment-pick** — Seleciona variante A/B de prompt
- **memory-embedder** — Gera embeddings para memória semântica
- **memory-search** — Busca semântica em lead_semantic_memory
- **save-ai-credential** — Salva credenciais externas (OpenAI, etc.)
- **handle-objection** — Tratamento de objeções por IA
- **generate-objections** — Geração automática de catálogo de objeções
- **generate-insights** — Insights de carteira/leads
- **daily-report-ai** — Relatório diário enviado por IA
- **ai-followup-cron** — Cron de cadências IA dentro de business hours
- **manual-outreach** — Disparo manual de mensagem por IA

## Captura / Funis / Formulários
- **funnel-api** — API pública dos funis (execução visual)
- **funnel-submit** — Submissão de bloco de funil
- **funnel-execute-webhook** — Webhook ↔ funil
- **funnel-generate-ai** — Gera funil completo via IA
- **form-submit** — Submissão de formulário público
- **form-generate-ai** — Gera formulário via IA

## Pagamentos
- **cakto-webhook** — Webhook Cakto (pedidos + tag automations)
- **cakto-proxy** — Proxy autenticado da API Cakto
- **cakto-recovery-trigger** — Dispara recuperação de checkout abandonado
- **doppus-webhook** — Webhook Doppus (pós-venda + persistência)
- **hotmart-webhook** — Postback Hotmart (validação hottok por org)
- **hotmart-sync-orders** — Sync de vendas Hotmart via API OAuth
- **hotmart-test-credentials** — Testa credenciais Hotmart

## Calendário / Booking
- **booking-availability** — Slots disponíveis públicos
- **booking-submit** — Cria reserva pública
- **send-booking-confirmation** — Email de confirmação
- **google-calendar-auth** — Inicia OAuth Google Calendar
- **google-calendar-callback** — Callback OAuth
- **google-calendar-refresh** — Refresh token
- **google-calendar-sync** — Sincronização bidirecional

## Equipe / Auth / Onboarding
- **create-team-member** — Cria usuário (admin)
- **send-invite-email** — Envia convite via Resend
- **bootstrap-super-admin** — Cria primeiro super admin
- **auto-promote-super-admin** — Promove primeiro signup
- **auth-email-hook** — Customiza emails Supabase Auth

## Integrações externas
- **firecrawl-crawl / firecrawl-map / firecrawl-scrape** — Crawler de sites
- **catalog-sync-website** — Importa catálogo de site
- **catalog-import-csv** — Importa catálogo CSV
- **catalog-search** — Busca semântica no catálogo
- **send-catalog-item** — Envia item do catálogo na conversa
- **sankhya-auth / sankhya-sync-clients / sankhya-sync-products / sankhya-create-order** — ERP Sankhya (2-way)
- **facebook-leads-webhook** — Lead Ads (Graph API)
- **webhook-receiver** — Receiver genérico configurável
- **test-integration** — Testa integrações

## Comunicação / Email
- **send-mass-email** — Disparo em massa
- **send-transactional-email** — Email transacional
- **send-notification-email** — Email de notificação admin
- **process-email-queue** — Worker da fila pgmq
- **handle-email-suppression** — Bounces/spam (Resend)
- **handle-email-unsubscribe** — Unsubscribe público
- **preview-transactional-email** — Preview com variáveis

## Distribuição / Leads
- **distribute-lead** — Auto Dispatch (squad, status, capacidade)
- **process-knowledge-source** — Processa fonte (URL/arquivo) p/ Brain
- **process-training-material** — Processa material treino
- **optimize-product-field** — Otimiza campo do produto (IA)

## Notificações administrativas
- **auto-notifications** — Dispara notificações automáticas configuráveis
- **admin-agent-alerts / admin-agent-summary / admin-agent-handle-inbound** — Agente IA do admin (resumos, alertas)
