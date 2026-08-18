# Fase 2 — Deduplicação de comprovante bancário — Relatório final (DEPLOY CONCLUÍDO)

## Status: implementado, testado, publicado em produção e backfill aplicado.

## Causa-raiz

Em `supabase/functions/uazapi-webhook/index.ts`, bloco `ai_receipt`:

1. A dedup de curto prazo (`sent_responses`, 10 min) usava hash do texto
   bruto concatenado da mensagem — qualquer variação de legenda/texto ao
   redor da imagem mudava o hash e destruía a proteção.
2. O buffer `__pending_receipt_media` não era limpo quando um reenvio era
   corretamente bloqueado (`deterministic_dedup_blocked`), permitindo que
   o OCR antigo fosse reaproveitado por uma mensagem de texto **sem mídia**
   chegando depois — foi exatamente o que aconteceu no caso real (lead
   enviou "Eu já tinha te mandado" e isso reabriu o comprovante antigo).

## Caso real e evidências

Lead `cb525181-…`, chip19, 06/08/2026:
- Compra canônica: `purchase_audit.id = 70596872-c05b-4464-928a-cca7157390ab`, 09:09:14 UTC, `event_id capi_1a6f1905-…`.
- Compra duplicada: `purchase_audit.id = 8ae64e0c-220d-4583-9caf-1e0a76c3dd7e`, 09:18:50 UTC, `event_id capi_c7614703-…` (bloco de upsell).
- Ambos os `Purchase` haviam sido enviados à Meta com sucesso (2 eventos reais para o mesmo comprovante) — histórico preservado, não alterado.

7 casos históricos idênticos confirmados (2026-07-12 a 2026-08-06), total
**R$ 134,80** indevidamente somados ao dashboard — todos corrigidos no
backfill (ver abaixo).

Achado secundário ("duas linhas com mesmo `event_id`"): confirmado
**histórico, não ativo** — nenhuma ocorrência após `2026-07-27 17:29:39 UTC`
(exatamente quando a migration `20260727141449_receipt_recovery_infra.sql`
centralizou a escrita em `record_purchase_result`). 5.523 pares históricos,
já deduplicados corretamente pelo dashboard via `fbtrace_id`/`event_id`.
Nenhuma ação de código necessária.

## Implementação

### 1. `supabase/functions/_shared/receipt-fingerprint.ts` (novo)

Funções puras (sem rede/banco):
- `extractBankTransactionId` / `extractTransactionDateTime` / `normalizePayerName` / `normalizeAmount` / `buildTransactionFingerprint` / `hashFingerprint` — constroem a identidade canônica da transação (E2E/NSU quando disponível; senão valor+pagador+data-hora completos), versionada e com separadores nomeados.
- `decideReceiptDuplicateGate` — função pura de decisão, compartilhada pelos dois pontos de bloqueio (ver abaixo), garantindo que a mesma regra vale nos dois lugares.

**Testes**: `receipt-fingerprint.test.ts`, **30/30 passando**, cobrindo os 13 cenários do pedido original mais os cenários adicionais da Fase 2B (bloqueio no upsell, concorrência com vencedor/perdedor, idempotência entre os dois gates, fail-open em erro técnico, fraca/ausente nunca bloqueia).

### 2. Fix do vazamento do buffer

`__pending_receipt_media` agora é explicitamente apagado em todos os
caminhos de bloqueio (`deterministic_dedup_blocked` por hash,
`ignored_short_ack_over_ocr`, e o novo bloqueio por fingerprint no
`ai_receipt`) — não só no caminho de sucesso.

### 3. Gate ANTECIPADO no bloco `ai_receipt` (Fase 2B — bloqueia ANTES de aprovar/avançar)

Após revisão adicional do usuário, o gate principal foi movido para dentro
do próprio bloco `ai_receipt`, **antes** de:
- avançar `nextBlockId` (aprovar o comprovante como pagamento novo);
- persistir o avanço no banco;
- qualquer bloco de upsell/entrega de conteúdo ser alcançado;
- registrar venda ou chamar a Meta (que só acontecem, se acontecerem, no bloco `pixel`, bem mais adiante).

Quando o claim atômico falha (comprovante repetido):
- **não avança** — permanece no bloco (`nextBlockId = b.id`);
- desfaz em memória os campos de "aprovação" (`nomecomprovante`,
  `valorcomprovante`, `comprovante_identified`) antes de persistir;
- limpa `__pending_receipt_media`;
- registra `ai_receipt_audits` com `decision = "deterministic_dedup_blocked"` e a referência à compra canônica (`existing_purchase_audit_id`);
- envia uma resposta neutra e nova (não existia mensagem própria para este caso): *"Esse comprovante já foi utilizado aqui. Se você já fez um novo pagamento, me manda o comprovante dele, por favor 🙏"* — no máximo 1x por janela de 10 min, sem promessa comercial;
- o lead permanece livre para enviar um comprovante genuinamente novo a qualquer momento.

### 4. Gate do bloco `pixel` — agora defesa em profundidade

Mantido como segunda camada: cobre qualquer caminho que alcance `pixel`
sem ter passado pelo gate do `ai_receipt` na mesma execução. Usa a
**mesma** função `decideReceiptDuplicateGate` — nenhuma lógica divergente.
Idempotência: se o `ai_receipt` já reivindicou o claim nesta execução, o
`claim_id` chega pronto via `flowVariables` e o `pixel` não tenta
reivindicar de novo (evita dupla marcação/erro).

**Prova da ordem** (linhas no arquivo publicado):
| Efeito | Linha |
|---|---|
| Gate antecipado (`claim_receipt_fingerprint`) no `ai_receipt` | ~9070 |
| Bloqueio: reverte aprovação, não avança, envia resposta neutra | ~9110-9230 |
| Gate de defesa em profundidade no `pixel` | ~7326 |
| `sendFacebookConversion` (Meta) | ~7521 |
| `record_purchase_result` (grava venda canônica) | ~7586 |

Quando o claim falha no `ai_receipt`, a execução nunca chega ao bloco
`pixel` nesta mesma requisição — logo nunca chega nas linhas 7521/7586.

### 5. Migration `20260806120000_receipt_fingerprint_dedup.sql` (aplicada)

- Colunas novas em `purchase_audit` (nullable): `organization_id`,
  `bank_transaction_id`, `transaction_fingerprint`, `receipt_fingerprint`,
  `fingerprint_version`, `fingerprint_strength`, `receipt_transaction_at`,
  `duplicate_of_purchase_audit_id`, `duplicate_reason`.
- Tabela `purchase_receipt_fingerprint_claims` com
  `UNIQUE (organization_id, receipt_fingerprint)` — a trava atômica real.
  Só recebe `INSERT` para fingerprints **fortes** (fracas/ausentes nunca
  tocam essa tabela, logo nunca podem ser bloqueadas automaticamente).
- RPCs `claim_receipt_fingerprint` / `link_receipt_fingerprint_claim` (só
  `service_role`).
- `record_purchase_result` estendida (29 → 36 parâmetros, todos os novos
  com `DEFAULT NULL`) — o caminho de recuperação administrativa
  (`execute_silent_recovery`) continua funcionando sem alteração.

## Testes executados (final)

| Suite | Resultado |
|---|---|
| `receipt-fingerprint.test.ts` (30 testes) | ✅ 30/30 |
| `receipt-recovery.test.ts` (existente) | ✅ 22/22 |
| `pdf-analysis.test.ts` (existente) | ✅ 9/9 |
| `deno check` no `uazapi-webhook/index.ts` | 572 erros — idêntico ao baseline antes de QUALQUER alteração (Fase 2A e 2B), confirmado via `git stash`; zero erros novos |
| Migration completa em transação `ROLLBACK` (antes de aplicar de verdade) | ✅ isolamento entre orgs, conflito atômico, link pós-claim, assinatura antiga/nova de `record_purchase_result` |
| Concorrência real (2 chamadas da mesma RPC usada pelos dois gates) | ✅ só a primeira reivindica; a segunda recebe `claimed=false` com o mesmo `claim_id` |
| Backfill completo em transação `ROLLBACK` (antes de aplicar de verdade) | ✅ 14 linhas de backup, 7 duplicatas marcadas, R$ 134,80 conferido |

**Total: 61/61 testes automatizados passando.**

## Pré-flight antes do deploy

- HEAD local: `99eb42f` (não toca `uazapi-webhook/index.ts`).
- Commits publicados junto com a Fase 2, autorizados explicitamente:
  `ca3d530` (fix áudio PTT) e `8bf6beb` (funil padrão por conexão, já
  ancestral de HEAD).
- Alterações locais fora de escopo (`.gitignore`, `supabase/config.toml`,
  `clone-funnel/index.ts`, `optimize-product-field/index.ts`): já existiam
  antes desta sessão, não fazem parte de nenhum commit publicado, e não
  entraram no deploy (escopado por função via `--project-ref` explícito,
  sem depender do `config.toml` não commitado).

## Execução em produção (ordem autorizada)

1. **Backup lógico** — `backup_purchase_audit_dedup_20260806` criado com as
   14 linhas envolvidas (7 canônicas + 7 duplicatas), confirmado.
2. **Migration aplicada** — sem erros. Constraint única, colunas, RPCs e
   compatibilidade com `record_purchase_result` (29→36 parâmetros)
   confirmadas via `\d`/`\df` reais pós-aplicação.
3. **Deploy da function** — `uazapi-webhook`:
   - Status: `ACTIVE`
   - Versão: `15` (era `14`)
   - `updated_at`: `2026-08-06 14:07:09 UTC`
   - `sha256`: `7a1648f903be9fefb621bc5d2ebf395f1f31d4374eab8dbcd398ea904cededd9`
4. **Validação de fumaça** (sem venda artificial nem evento falso à Meta):
   3 mensagens reais processadas normalmente logo após o deploy (1 inbound,
   2 outbound), 5 conexões WhatsApp com `webhook_status=ok` e timestamps de
   segundos após o deploy, zero alertas novos em `admin_status_alert_logs`.
5. **Backfill executado** — 7 `UPDATE`s de 1 linha cada, checagem
   automática interna confirmou 7 linhas / R$ 134,80 exatos.
6. **Confirmações finais**:
   - Nenhuma linha apagada: contagem total de `purchase_audit` inalterada
     (12.199 antes e depois).
   - As 7 canônicas permanecem `purchase_status = 'success'`.
   - As 7 duplicatas estão `purchase_status = 'duplicate'`, cada uma com
     `duplicate_of_purchase_audit_id` apontando para sua canônica.
   - Caso Erminio (`lead cb525181-…`): dashboard passa a contar
     **1 venda válida de R$ 30,00** (antes eram 2).
   - Nenhum reenvio nem tentativa de cancelamento foi feito à Meta —
     backfill é SQL puro, sem chamada de rede.

## IDs canônicos × duplicados (7 casos)

| Lead | Canônica (`success`) | Duplicata (`duplicate`) | Valor |
|---|---|---|---|
| fadd9d0f… | `be5c9d32-3403-407e-add3-d2d0df381566` | `0484a084-92e4-4d22-a178-da687d4b53f6` | R$ 14,90 |
| acdb4cc5… | `87565b53-3e45-4448-abd8-68866cceacfa` | `3d2204b3-f506-4949-912c-463948f749af` | R$ 10,00 |
| 002a50db… | `25c1f7a2-0a9e-4d71-ac72-60ce080bca01` | `be1c5261-b707-478d-a281-9313c24ed877` | R$ 10,00 |
| 16c13c67… | `25f64176-ab47-49fc-8b59-83037efbb6a7` | `c6afb91a-2283-429b-be33-b2617bba8aca` | R$ 20,00 |
| f971b880… | `c8ae02c8-e9c1-4868-8880-3bfc0322accd` | `52240358-221b-4bcd-b9e3-35d595eaf16c` | R$ 24,90 |
| cf38deb9… | `a346b7b1-da64-4d73-8322-6100e6e7599f` | `af126479-02a8-4eb5-bca5-c2fc228ea63b` | R$ 25,00 |
| cb525181… (caso real) | `70596872-c05b-4464-928a-cca7157390ab` | `8ae64e0c-220d-4583-9caf-1e0a76c3dd7e` | R$ 30,00 |

**Total corrigido: R$ 134,80.**

## Comandos executados (resumo)

```
psql "$NEW_DB_URL" -f 20260806_backfill... (backup lógico, real)
psql "$NEW_DB_URL" -f supabase/migrations/20260806120000_receipt_fingerprint_dedup.sql (real)
supabase functions deploy uazapi-webhook --project-ref ydunpoqdhijhnrarohiz
supabase functions list --project-ref ydunpoqdhijhnrarohiz  (confirmação ACTIVE/versão)
psql "$NEW_DB_URL" -f scripts/migration/20260806_backfill_duplicate_receipts.sql (real)
```

## Riscos residuais e rollback

- **Rollback da migration**: documentado em comentário no próprio arquivo
  (`DROP FUNCTION`/`DROP TABLE`/`ALTER TABLE ... DROP COLUMN`), 100%
  aditivo, seguro com tráfego ativo.
- **Rollback do backfill**: `scripts/migration/20260806_rollback_duplicate_receipts.sql`
  — reverte só as 7 linhas marcadas por este backfill (filtra por
  `duplicate_reason`, nunca por lista solta de IDs).
- **Rollback do deploy**: `supabase functions deploy uazapi-webhook` com o
  código anterior (`git show ca3d530^:supabase/functions/uazapi-webhook/index.ts` ou o commit desejado), caso necessário.
- **Limitação conhecida e aceita**: a continuidade conversacional (bot não
  fica travado, responde a mensagem neutra) não é bloqueada mesmo em
  duplicata — é intencional (runbook original exige não travar o funil).
  Verificado no caso real: nenhum conteúdo pago era entregue depois do
  bloco `pixel` do upsell, só uma mensagem de agradecimento genérica.
- **Achado secundário** (linhas com `event_id` duplicado, histórico):
  nenhuma ação tomada, documentado, disponível para saneamento futuro se
  desejado.

## Monitoramento pós-deploy

Validação de fumaça imediata (acima) mostrou tráfego normal saudável.
Como não é seguro/permitido fabricar um comprovante de teste, a validação
específica de "comprovante repetido tratado corretamente em produção" deve
ser confirmada via observação da próxima ocorrência orgânica (ou de um
teste deliberado e autorizado à parte, se preferir). Sinais a acompanhar
nos próximos dias: `ai_receipt_audits.decision = 'deterministic_dedup_blocked'`
com `metadata.reason = 'receipt_fingerprint_already_claimed'`, e ausência
de novos pares `purchase_status='success'` com mesmo `lead_id`+valor em
janela curta.
