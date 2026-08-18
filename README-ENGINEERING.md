# X1Zap CRM — Engineering Notes

## Objetivo imediato

Tirar o CRM da Lovable Cloud rapidamente, mantendo vendas reais funcionando e usando a VPS2 atual.

## Infra atual esperada

- VPS1: Chromiums/WhatsApp antigos. Não mexer agora.
- VPS2: servidor principal novo para edge-mini, Redis, BullMQ, PM2, webhooks, workers e OCR/IA.
- Vercel: frontend.
- Supabase: banco/auth/storage/functions.
- UazAPI: integração WhatsApp.

## Estratégia

Produção limpa.

Não migrar histórico antigo agora. Migrar somente estrutura e funis necessários para vender daqui para frente.

## Regra principal

Produção antiga continua funcionando até o novo ambiente estar validado com 1 chip canário.

