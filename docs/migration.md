# Migração X1Zap — Plano Enxuto

## Prioridade

Sair da Lovable Cloud o mais rápido possível.

## Escopo da migração agora

Migrar:

- frontend para Vercel
- Supabase novo/proprio
- edge functions essenciais
- VPS2/edge-mini
- Redis/BullMQ/workers
- UazAPI/webhooks
- funis e blocos
- produtos
- admin/organização
- Pixel/CAPI
- OCR/IA/comprovante

Não migrar:

- conversas antigas
- leads antigos
- mensagens antigas
- logs antigos
- storage antigo
- sessões antigas de WhatsApp

## Fases

### Fase 0 — Inventário

Somente leitura. Descobrir estado real de:

- VPS2
- repositório
- edge-mini
- PM2
- Nginx
- Redis
- Supabase
- Vercel
- webhooks

### Fase 1 — Plano

Gerar plano por fases pequenas, com risco, validação e rollback.

### Fase 2 — Supabase limpo

Preparar schema, RLS, funções e dados mínimos.

### Fase 3 — Frontend

Garantir Vercel apontando para Supabase correto.

### Fase 4 — VPS2 / edge-mini

Garantir webhooks e workers funcionando.

### Fase 5 — Chip canário

Conectar 1 chip e testar ponta a ponta.

### Fase 6 — Escala

Migrar demais chips gradualmente.

## Critério de sucesso

Fluxo real funcionando:

lead -> conversa -> funil -> mensagem -> resposta -> comprovante -> OCR/IA -> purchase -> pixel

## Épico futuro — Pipeline inbound Meta Cloud API

Fora do escopo da migração atual. Não bloqueia nenhuma fase acima — UazAPI continua sendo o único caminho produtivo. Registrado aqui como épico técnico único, sem prioridade nem data, para quando o negócio decidir avançar Meta Cloud API para produção real.

Estado atual (2026-08-12):

- Segurança bloqueadora: concluída.
- Migrations Meta/Vault: aplicadas.
- Saída multi-provider (`uazapi-send` → `meta_cloud` quando aplicável): implementada e implantada, modo `off`.
- Entrada Meta → CRM/funil/IA: não implementada.
- Meta Cloud bidirecional: não liberada para produção.

Sub-etapas, em ordem:

1. Criação do arnês de caracterização do `uazapi-webhook` (hoje inexistente).
2. Fatoração gradual da pipeline inbound (começando pelos primitivos já agnósticos de provider: idempotência, locks, CAS de funil).
3. Regressão UazAPI usando esse arnês.
4. Adapter inbound Meta sobre a pipeline compartilhada e validada.
5. Canário posterior, com credenciais reais e conexão explicitamente segura.

Detalhes completos: `/tmp/claude-meta-cloud-inbound-final.md`, `/tmp/claude-meta-cloud-inbound-characterization.md`, `/tmp/claude-fase2b0-project-final-status.md`.

