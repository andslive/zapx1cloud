# Invariantes do CRM X1Zap

Estes invariantes de negócio não podem ser quebrados por nenhuma mudança automatizada, mesmo que
o efeito colateral pareça pequeno. Qualquer agente (Claude ou Codex) que identifique uma mudança
capaz de afetar um destes itens deve classificar a tarefa como **alto risco** (ver
`.claude/skills/crm-dual-agent/references/risk-policy.md`) e parar para decisão humana antes de
implementar.

## 1. Testes não podem enviar mensagem real a leads

Nenhum teste automatizado, script de verificação ou execução da skill `crm-dual-agent` pode
disparar uma mensagem real via UazAPI/WhatsApp para um lead real. Se um teste precisar validar
envio de mensagem, use mocks/stubs — nunca a API real.

## 2. Testes não podem chamar Meta/CAPI real

Nenhum teste automatizado pode fazer uma chamada real à Graph API da Meta (Pixel/CAPI). Ver
`supabase/functions/_shared/meta-cloud-client.ts` e `meta-webhook-*` — qualquer teste desses
módulos deve mockar a chamada de rede.

## 3. Comprovante duplicado não pode avançar o funil

A deduplicação de comprovantes (`supabase/functions/_shared/receipt-fingerprint.ts`, migration
`20260806120000_receipt_fingerprint_dedup.sql`) impede que o mesmo comprovante avance o funil
duas vezes. Qualquer mudança nesse fluxo precisa preservar essa garantia e manter/estender os
testes existentes (`receipt-fingerprint.test.ts`).

## 4. Purchase não pode duplicar venda

Idempotência de eventos de compra/purchase (ver `purchase_audit`,
`meta-webhook-idempotency.ts`/`.test.ts`) deve impedir que o mesmo evento gere duas vendas
registradas. Qualquer mudança nesse fluxo precisa de teste cobrindo o caso de reentrega do mesmo
evento.

## 5. Mensagens do lead e da instância devem permanecer separadas

A distinção entre mensagem recebida do lead e mensagem enviada pela instância (`fromMe: false` vs
`fromMe: true` em `meta-webhook-normalize.ts`, e o equivalente para UazAPI) não pode ser
confundida. Misturar os dois quebra o histórico de conversa e pode causar respostas automáticas
para a própria instância.

## 6. Clone de funil deve começar pela raiz topológica correta

`supabase/functions/_shared/clone-funnel-core.ts` calcula a raiz de um funil-modelo como o único
bloco não referenciado por nenhum outro bloco, e lança erro se houver zero ou mais de uma raiz
(linhas ~144-162). Qualquer mudança em clonagem de funil deve preservar essa validação e o teste
associado (`clone-funnel-core.test.ts`).

## 7. Mudanças de funil não podem corromper conversas existentes

Alterar a estrutura de um funil (blocos, transições) não pode invalidar o estado de conversas já
em andamento que referenciam blocos desse funil. Antes de qualquer mudança estrutural em funil,
verificar se há leads com conversa ativa apontando para os blocos afetados.

## 8. Deploy, migration e restart exigem autorização humana

Nenhuma automação — incluindo a skill `crm-dual-agent` — aplica migration, faz deploy ou reinicia
serviço (PM2/Nginx/Redis/Chromium) por conta própria. Esses passos são sempre apresentados como
referência de leitura no relatório final (ver `docs/PRODUCTION-RUNBOOK.md`), nunca executados
automaticamente.

## Status de proteção conhecido (na data desta implementação)

| Invariante | Proteção conhecida |
|---|---|
| Dedup de comprovante | Teste + migration dedicada |
| Idempotência de purchase/webhook | Teste dedicado |
| Raiz topológica do clone de funil | Validação em código + teste dedicado |
| Separação lead vs. instância | Apenas código (sem teste dedicado confirmado) |
| Isolamento por organização (RLS) | Apenas código/schema (sem teste automatizado confirmado) |
| Funil não corromper conversas existentes | Não encontrada validação automatizada dedicada |
| Deploy/migration/restart só com aprovação humana | Processo documentado (CLAUDE.md/AGENTS.md), não código |

Esta tabela reflete o estado observado durante a implementação desta skill, em worktree isolado —
não foi re-verificada linha a linha; confirme antes de assumir cobertura de teste em uma tarefa
específica.
