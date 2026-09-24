# Painel Cobrança — timeout na carga da página (causa, correção e medições)

**Sintoma (preview autenticado):** "Não foi possível carregar a cobrança: canceling statement due to statement timeout" (SQLSTATE 57014).

## Consulta que o painel fazia
`GET /rest/v1/manual_charge_dispatches_panel?select=*` — sem paginação, todas as colunas, como `authenticated` (limite de 8 s do PostgREST/Supabase).
A view `manual_charge_dispatches_panel` (security_invoker) junta `manual_charge_dispatches` × `leads` × `evolution_instances` e executa **por dispatch**:
`manual_charge_conversation_current_facts`, `manual_charge_conversation_state`, `manual_charge_pre_send_review_reason`, um `count` em `reopen_events` e
`EXISTS (SELECT 1 FROM purchase_audit pa WHERE pa.lead_id = d.lead_id AND pa.purchase_status IN ('success','recognized')) AS payment_confirmed`.

## Causa demonstrada (banco efêmero, volume representativo, RLS ligada, usuário authenticated via API real)
Volume: 15.036 leads, 836 mil mensagens (70.686 desde 01/09; 183 leads com ~2.000 cada), `purchase_audit` de 250 mil a 2 milhões de linhas, 183 dispatches
(de leads **não pagos**, como na carga real), política RLS de `purchase_audit` idêntica à de produção (migration 20260708014500), **sem índice em `purchase_audit(lead_id)`**
(o repositório só tem índice único em `event_id`).
- Por ser lead não pago, o `EXISTS` **não encontra nada** e varre a tabela inteira. Quando o planner não consegue transformá-lo em um subplano hasheado
  (a lista de `lead_id` que satisfazem `success/recognized` não cabe em `work_mem`), ele executa **uma varredura completa por dispatch** (`loops=183`).
- Medido: 500 mil linhas → **20,5 s** (110 ms × 183 varreduras, `Rows Removed by Filter: 503945`); pela API, **HTTP 500 `57014` "canceling statement due to statement timeout" aos 8,04 s** — a mesma mensagem do preview.
- Há um degrau: com ~240 mil linhas e poucas linhas `success/recognized` o planner usa o plano hasheado e a mesma consulta leva 0,36 s. O custo não cresce de forma suave: passa do limite de 8 s assim que o plano vira.
- As demais funções por linha são baratas: `review_reason` 0,58 s para os 183 leads mesmo com ~2.000 mensagens cada; `conversation_state` ~0,13 s; `current_facts` ~0,02 s.
- **Não foi possível medir a produção** (sem acesso). O que está provado é o mecanismo que reproduz exatamente o erro; a confirmação do plano real de produção está no diagnóstico somente leitura abaixo.

## Correção (frontend; sem migration, sem RLS alterada, sem timeout maior)
1. **Colunas explícitas**: o painel não pede `payment_confirmed` (coluna não pedida não é calculada), nem `claim_token`/`attribution_status`. O status `paid` continua exibido pelo status do dispatch.
2. **Paginação no servidor** (20 por página, `Range`), ordenada por `created_at desc, dispatch_id`: a resposta e a renderização ficam limitadas à página. **Ressalva medida:** `current_facts` e `conversation_state` ainda executam para todos os dispatches da organização (183 → 0,17 s no plano da consulta nova), porque a ordenação exige a junção antes do `LIMIT`; o custo dominante (varredura de `purchase_audit`) é que foi eliminado.
3. **Filtros no servidor** (tipo, situação, busca) e **total exato do conjunto filtrado** (`Prefer: count=exact` → cabeçalho `Content-Range`), não o tamanho da página.
4. **Totais da organização** por contagens (`HEAD`) na tabela base, exceto "liberados" (usa o motivo de revisão).
5. **Estado de erro**: "Dados indisponíveis" + mensagem + **Tentar novamente**; nunca mostra "0 registros" nem "Nenhuma cobrança encontrada" quando a consulta falha; totais mostram "—".
Isolamento por organização, RLS e os bloqueios de revisão não foram tocados; nenhum `service_role` no navegador.

## Medições (mesma réplica, usuário authenticated, API real; `purchase_audit` = 1,04 M linhas, 692 mil success/recognized)
| Requisição | Antes | Depois |
|---|---|---|
| `select=*` sem paginação (o que o painel fazia) | **HTTP 500 / 57014 aos 8,04 s** | — |
| Página 1 (20 linhas) + total exato (183) | — | **0,36 s** (HTTP 206, `0-19/183`) |
| Filtro "Em revisão" + total do filtro (135) | — | 0,93 s |
| Filtro contribuição + busca, total do filtro (40) | — | 0,13 s |
| 5 contagens dos totais (em paralelo) | — | 0,8 s |
| Consulta antiga **com** o índice opcional | — | 0,56 s (era timeout) |
Navegador (Playwright, login real): 20 linhas, "Página 1 de 10"; filtro por tipo mostra "73 registros no filtro" e "Página 1 de 4"; página 2 traz outras linhas (`20-39/183`);
com a consulta forçada a falhar (500/57014) aparece "Dados indisponíveis" com o botão, sem "0 registros"; após "Tentar novamente" a tabela carrega. Botões "Disparar manual" continuam desativados; nenhuma requisição usa `select=*` nem `payment_confirmed`.

## Diagnóstico em produção (somente leitura) e opção de índice
- `docs/runbooks/manual_charge_panel_diagnose_readonly.sql`: tamanhos, índices e políticas de `purchase_audit`, contagem `success/recognized`, `work_mem` e os **planos** das consultas antiga e nova como `authenticated`. Sem dado pessoal.
- `docs/runbooks/manual_charge_panel_optional_purchase_audit_index.sql`: índice `(lead_id, purchase_status)` **opcional, separado, não aplicado** (não necessário para a correção). Reversão: `DROP INDEX CONCURRENTLY`.

## Limite conhecido
O custo restante cresce linearmente com o número de dispatches da organização (~0,5–1 ms por dispatch nas funções por linha). Com algumas dezenas de milhares de dispatches
seria preciso materializar esses campos (tabela/visão materializada atualizada pela carga) ou mover a ordenação/filtros para uma função paginada. Hoje são 183.
