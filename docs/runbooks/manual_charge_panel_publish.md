# Painel Cobrança — publicação do frontend (somente revisão)

**Estado:** pronto para revisão; **nada foi publicado.** Base: `origin/main` @ `68f4c6865c7a7016e89a30ceea35381f2a4d7cf8`.
Branch de entrega: `agent/manual-charge-panel-publish-20260924` (1 commit de código sobre `origin/main`, mais este documento).

## O que será publicado (6 arquivos de código, +625 −1)
| Arquivo | Mudança |
|---|---|
| `src/components/admin/manual-charge/ManualChargeManager.tsx` | novo: faixa "Carga em revisão" + contadores (registros, dívidas prováveis, contribuições, datas divergentes, liberados) |
| `src/components/admin/manual-charge/ManualChargeTable.tsx` | novo: tabela (Lead, Tipo, Promessa/data, Situação e bloqueio, Conexão, Idioma/fuso, Pagamento, Ação), filtros por tipo e situação |
| `src/components/admin/manual-charge/ManualChargeTriggerButton.tsx` | novo: botão "Disparar manual" (fica **desativado**) |
| `src/hooks/useManualChargeDispatches.ts` | novo: leitura de `manual_charge_dispatches_panel` com o cliente autenticado |
| `src/config/adminMenu.ts` | +2 linhas: item "Cobrança" logo abaixo de "Agenda" |
| `src/pages/Admin.tsx` | +6/−1: carregamento preguiçoso da seção e inclusão em `isCRMSection` (mesmo layout das seções CRM) |

**Não entra:** nenhum dos ~76 commits da branch de trabalho (`agent/manual-charge-phaseA-…`): Meta Cloud, `ConnectionsManager`,
`useWhatsAppInstances`, `useCommercialDashboard`, `package-lock.json`, migrations, Edge Functions, scripts. O trabalho concorrente em
`origin/main` (108 commits à frente da branch de trabalho, incl. `src/lib/whatsapp/*` e `hookcloud`) fica intacto: o diff contra `origin/main` é só o acima.
Sem migration, sem Edge Function, sem variável de ambiente nova, sem mudança em `package.json`.

## Comportamento
- Lê a view com o **JWT do usuário logado** (chave publicável do frontend). RLS: só administradores/gerentes da própria organização
  veem linhas; vendedor, usuário sem organização e anônimo recebem 0. Nenhuma credencial privilegiada no frontend (bundle sem `service_role`).
- Os 183 registros aparecem como **Em revisão** (status interno `eligible` **não** é exibido como liberado), com o motivo do bloqueio
  (classificação provisória por regex), tipo (Dívida provável × Contribuição voluntária), promessa/data (período flexível, anterior a 29/09,
  "mais de uma data — ordem ambígua"). "Liberados para envio" = 0. Sem coluna de recuperação/atribuição financeira.
- **"Disparar manual" desativado** por constante (`MANUAL_TRIGGER_ENABLED = false`) e por `review_reason`. Mesmo se acionado, o backend
  recusa (flags desligadas). A tela não envia nada.
- Datas `YYYY-MM-DD` são exibidas como data de calendário (sem recuo de um dia no fuso do Brasil).

## Evidência (ensaio local, stack Supabase efêmera; nenhum acesso à produção)
- `npm run build`: sucesso. `eslint` dos arquivos do painel: limpo; `Admin.tsx` mantém 1 erro + 1 aviso **idênticos aos de `origin/main`** (react-hooks/rules-of-hooks, react-refresh).
- `tsc -b --force`: 268 erros **com e sem** a mudança (todos pré-existentes em `main`, testes Deno em `src/lib/whatsapp`): 0 introduzidos.
- Página autenticada (Playwright, login real): admin da org A vê 9 linhas, admin da org B vê 3; 100% dos botões desativados; requisições só com papéis `anon`/`authenticated`; sem erro de console.
- API real (`supabase/tests/manual_charge_b/93_panel_isolation.sh`, na branch de trabalho): admin/gerente veem só a própria organização;
  vendedor, sem organização e anônimo veem 0; filtro cruzado retorna 0; RPC de carga negada (403); PATCH em dispatches negado (42501); nenhum dispatch virou `sent`.
- Capturas: desktop, celular e organização B (anexadas à revisão).

## Correção de desempenho (24/09, após o 1º preview)
O preview mostrou `canceling statement due to statement timeout`. Causa demonstrada, correção e medições: `docs/runbooks/manual_charge_panel_performance.md`.
Resumo: a view calculava `payment_confirmed` com um `EXISTS` em `purchase_audit` (sem índice) por dispatch; o painel agora pede colunas explícitas, pagina e filtra no servidor,
mostra totais do conjunto filtrado e um estado "Dados indisponíveis + Tentar novamente". Sem migration, sem RLS alterada, sem timeout maior.

## Pré-condições a confirmar antes de publicar
1. **Deploy atual da Vercel = `origin/main` @ `68f4c68`?** Não consegui verificar (sem acesso à Vercel). Se estiver em outro commit, a base desta entrega muda.
2. As migrations e a etapa C já estão em produção (a view `manual_charge_dispatches_panel` existe, com grants para `authenticated`): confirmado pelo administrador.
3. Observação pré-existente: `npm ci` falha em `origin/main` (lockfile sem `xlsx`). Se a Vercel usar `npm ci`, o build já falharia hoje; se usar `npm install`, não é afetado (esta entrega não toca `package.json` nem o lock).

## Procedimento de publicação (após aprovação)
1. `git push -u origin agent/manual-charge-panel-publish-20260924` e abrir PR para `main` (descrição = este documento).
2. Conferir o **preview** da Vercel do PR: login como administrador; menu "Cobrança" abaixo de "Agenda"; 183 registros; nenhum liberado; botão desativado.
3. Mesclar o PR (merge commit, como no histórico do repositório). A Vercel publica `main`; alternativa manual: `vercel --prod` a partir do commit mesclado.
4. Verificação pós-publicação: repetir o passo 2 em produção; "liberados para envio" = 0; console sem erros.

## Reversão
- Rápida: painel da Vercel → deployment anterior → *Promote* (ou `vercel rollback`, confirmando a sintaxe da CLI instalada).
- Por Git: `git revert -m 1 <merge-commit>` num PR (remove só os arquivos/linhas acima). Não há dado nem migration a desfazer; a view e a carga ficam intactas.

## Pendências da automação (separadas desta entrega visual)
1. Classificador estruturado/IA: nunca chamado em produção; sem ele, tudo segue em revisão por regex.
2. Worker de envio e cron: não publicados nem agendados; flags de envio desligadas.
3. Templates da API oficial, tarifas aprovadas e orçamento aprovado: vazios.
4. Fuso confirmado por lead (hoje só inferência por DDD) e idioma; os 4 registros com datas divergentes exigem decisão humana.
5. Textos das mensagens, limite diário, janela e intervalo: propostos, não aprovados.
6. 548 mensagens posteriores à carga e 3 candidatos novos ainda não carregados (nova rodada idempotente, sob autorização).
7. Áudio sem transcrição e atribuição financeira: não implementados.
8. A view devolve até 1.000 linhas por consulta (limite padrão da API); acima disso será preciso paginar no servidor.
