---
name: Aba Aguardando inclui IA atendendo
description: Inbox tab "Aguardando" agrega waiting_human + bot_active (IA respondendo); "Atendendo" só conta human_active
type: feature
---
`ConversationList.tsx` (counts):
- **Atendendo** = `status === 'human_active'` (humano de fato).
- **Aguardando** = `waiting_human` OU `bot_active` (ainda sem humano; IA pode estar respondendo).
- **Resolvido** = `closed`.

Status `bot_active` permanece como controle (webchat-bot/evolution-webhook só rodam IA quando bot_active), mas para o operador a conversa fica visível na fila com `ChannelBadge` (Globe/whatsapp/instagram/etc.) sobre o avatar.
