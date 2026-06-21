---
name: Executor de blocos de ação no webchat-bot
description: webchat-bot agora executa blocos create_lead/update_lead/score/tag/condition/create_task e sincroniza inputs no lead via syncFlowVarsToLead
type: feature
---
`supabase/functions/webchat-bot/index.ts` agora executa, em ambos `executeFlowBlock` e `executeNextBlock`:
- `create_lead` / `update_lead`: chama `syncFlowVarsToLead` que mapeia variáveis do fluxo (name/nome, email, phone/telefone, company, cpf, cnpj) para colunas do lead; demais vão para `custom_fields`. Lead já é auto-criado em `webchat-api` ao iniciar conversa, então ambos viram update.
- `input`: agora também sincroniza imediatamente a variável capturada no lead (não só em `flow_variables`).
- `score`: incrementa `leads.score` por `score_value`.
- `tag`: faz merge de `apply_tags`/`tag_name` em `leads.tags`.
- `condition`: avalia `data.condition` contra `flow_variables` (equals/not_equals/contains/greater_than/less_than) e roteia para `true_next_block_id` ou `false_next_block_id`.
- `create_task`: insere em `tasks` com template substituindo `{{var}}`.

Helper `syncFlowVarsToLead(supabase, conversationId, flowVariables, { onlyKeys? })` ignora chaves `__internal` e valores vazios.
