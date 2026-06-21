---
name: Visibilidade de conversas por setor (não por produto)
description: Inbox visibility é governada por setor + permissions granulares. Produto é apenas filtro opcional.
type: feature
---
Inbox visibility (webchat-inbox action `conversations` e `conversation`) ignora produto e usa setor:

- Admin/super_admin: vê tudo da org.
- Não-admin: filtra por (em ordem):
  1. `assigned_user_id = user.id` → sempre visível
  2. `sector_id IS NULL` → requer `view_unassigned_sector_tickets`
  3. `sector_id` fora dos meus setores → requer `view_other_queues_conversations` (modo supervisor)
  4. `sector_id` em meu setor + sem atendente → requer `view_queue_conversations`
  5. `sector_id` em meu setor + outro atendente → requer `view_other_users_conversations`

Frontend (`SellerInbox.tsx`): produto é filtro opcional para qualquer modo. Removido o force `assignedProducts[0].id` para vendedores.

Labels em `PERMISSION_LABELS` deixam claro que tudo é por setor.
