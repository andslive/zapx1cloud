# Fase G.1 — Migração controlada do bloco "Reconhecer Comprovante" para resultado oficial da VPS2

Escopo cirúrgico: **somente** `instance=canal46` + funil `Funil Gordura (10reais) (novo2)`. Todo o resto do sistema continua idêntico. Kill-switch por env desliga em <1s sem deploy.

---

## 1. Arquitetura proposta

A VPS2 já produz o resultado canônico do comprovante (OCR + AI Shadow + Receipt Production Write). Hoje esse resultado é gravado apenas em `purchase_audit` (auditoria). Para a Fase G.1 vamos:

1. Criar uma **tabela dedicada** `vps_receipt_results` (fonte de verdade do resultado oficial da VPS2, separada de `purchase_audit`).
2. Na VPS2, o `receipt-production-write` continua chamando a Edge Function **igual à Fase F** (sem mudar contrato). A própria Edge Function `receipt-production-write` passa a também gravar uma linha em `vps_receipt_results` (além do que já faz em `purchase_audit`). `purchase_audit` permanece exatamente como hoje — auditoria pura.
3. Na Edge Function `uazapi-webhook`, dentro de `case "ai_receipt"`, adicionar **um curto-circuito no topo do bloco**: se a flag estiver ligada E `instance ∈ allowlist` E `funnel_name ∈ allowlist`, faz um **poll curto** em `vps_receipt_results` por `message_id` (ou últimas N mensagens do chat). Se encontrar resultado dentro do timeout → usa o resultado, grava as mesmas variáveis (`nomecomprovante`, `valorcomprovante`, `is_receipt`, etc.) e segue o fluxo normal. Se **não** encontrar → cai no caminho legado (OCR/IA da Lovable) — fail-open. Nenhuma mudança no resto do bloco.
4. Tudo dentro de `try/catch`. Qualquer erro → fallback automático para o caminho legado.

```text
ANTES (fluxo legado, permanece para todas as outras instâncias/funis):
WhatsApp → uazapi-webhook → case "ai_receipt"
   → download mídia → OCR/IA Lovable → extrai campos
   → grava variáveis → avança bloco

DEPOIS (somente canal46 + Funil Gordura 10reais novo2, flag ON):
WhatsApp → uazapi-webhook → case "ai_receipt"
   ├─ flag+instance+funnel batem?
   │     ├─ NÃO → caminho legado (idêntico ao de hoje)
   │     └─ SIM → poll vps_receipt_results por message_id (até N s)
   │            ├─ achou  → usa resultado VPS2, grava variáveis, avança
   │            └─ timeout/erro → fallback legado (OCR/IA Lovable)
   └─ resto do bloco (variáveis, mensagens, próximo bloco) inalterado
```

Paralelamente, a VPS2 (já em produção desde a Fase F) processa o mesmo comprovante e publica o resultado em `vps_receipt_results` via `receipt-production-write`. A leitura pela Lovable é desacoplada da escrita — não há mudança no contrato HTTP existente.

---

## 2. Arquivos criados/alterados

**Criar:**
- Migration: tabela `vps_receipt_results` (+ índice por `message_id`, `instance`, `pix_id`; RLS bloqueada para `anon`/`authenticated`; `GRANT ALL ... TO service_role`).
- `supabase/functions/_shared/vps-receipt-bridge.ts` — helpers: `isVpsReceiptEnabled(instance, funnelName)`, `pollVpsReceiptResult({ message_id, chat_id, timeout_ms })`, normalização do payload para o formato que o bloco `ai_receipt` espera.

**Editar (cirúrgico, com guards estritos):**
- `supabase/functions/receipt-production-write/index.ts` — após o `INSERT` em `purchase_audit` que já existe, adicionar um `INSERT ... ON CONFLICT (message_id) DO UPDATE` em `vps_receipt_results`. Nenhuma outra lógica muda. Mesma idempotência (`message_id` + `pix_id`).
- `supabase/functions/uazapi-webhook/index.ts` — **no topo** de `case "ai_receipt":` (linha 6712), antes do código de download de mídia, adicionar bloco `if (vpsReceiptShortCircuit) { ...try poll, on hit set vars and break to next block; on miss fall through... }`. Tudo gated por flag+allowlist. Zero alteração no caminho legado.

**Não editar:** Edge Functions de Pixel, CAPI, Purchase, Leads, Inbox, Conversations, WhatsApp send, webhooks globais, cleanup, qualquer outro bloco de funil, qualquer outro funil.

---

## 3. Fluxo antigo × fluxo novo (resumo)

| Etapa | Antigo (continua para todos os outros) | Novo (somente canal46 + Funil Gordura 10reais novo2, flag ON) |
|---|---|---|
| Entrada no bloco | OCR/IA Lovable | Poll `vps_receipt_results` por `message_id` |
| Origem do resultado | Lovable (Gemini/OpenAI/Lovable AI) | VPS2 (OCR local + AI Shadow) |
| Variáveis gravadas | `nomecomprovante`, `valorcomprovante`, etc. | **Iguais** (mesmos nomes, mesma semântica) |
| Avanço do funil | Lovable | Lovable (inalterado) |
| Pixel/CAPI/Purchase | Lovable (inalterado) | Lovable (inalterado) |
| Fallback se VPS2 não respondeu | n/a | Caminho legado automático (fail-open) |

---

## 4. Como a Lovable consulta o resultado da VPS2

`pollVpsReceiptResult` em `_shared/vps-receipt-bridge.ts`:

- `SELECT ... FROM vps_receipt_results WHERE message_id = $1 LIMIT 1`.
- Se ausente, faz polling com backoff curto (ex.: 250ms × 8 tentativas = ~2s, configurável via `VPS_RECEIPT_POLL_TIMEOUT_MS`, default 2000).
- Se ainda assim ausente, retorna `null` → caller cai no caminho legado.
- Payload normalizado para `{ is_receipt, amount, customer_name, pix_id, confidence, ocr_text, ai_reason, message_id, instance, phone }` — exatamente os campos listados no item 7 do briefing.

Nenhum endpoint público novo. Tudo via Supabase client interno da Edge Function (service role já presente).

---

## 5. Como evitar duplicidade com o processamento atual

- A VPS2 não envia mensagens WhatsApp, não toca Pixel/CAPI/Purchase, não escreve em `leads`/`conversations`. Continua só populando `purchase_audit` (auditoria) e agora `vps_receipt_results` (resultado oficial).
- O bloco `ai_receipt` continua sendo o **único** ponto que grava variáveis no funil e dispara o avanço. A diferença é apenas a *origem* dos dados.
- Idempotência:
  - `vps_receipt_results.message_id` é UNIQUE → segundo POST do `receipt-production-write` faz `ON CONFLICT DO UPDATE` (atualiza com a versão mais nova) sem duplicar.
  - Índice por `pix_id` permite dedupe secundário se necessário.
  - O curto-circuito da Lovable lê pelo `message_id` da mensagem recebida → mesma mensagem nunca processa duas vezes (a guarda existente `ai_receipt_already_answered` continua valendo).
- Se a flag estiver OFF, `vps_receipt_results` continua sendo populada (já que a VPS2 não sabe nem se importa), mas a Lovable **nunca lê** essa tabela → comportamento 100% legado.

---

## 6. Rollback

Imediato, sem deploy:

1. Setar `ENABLE_VPS_RECEIPT_RESULT=false` nos secrets da Edge Function.
2. Próxima invocação do `uazapi-webhook` já volta ao caminho legado (a flag é lida por request).
3. Opcional segundo nível: esvaziar `VPS_RECEIPT_ALLOWED_INSTANCES` ou `VPS_RECEIPT_ALLOWED_FUNNELS` → mesmo efeito.
4. A tabela `vps_receipt_results` permanece (não-destrutivo). Sem necessidade de revert de migration.

---

## 7. Variáveis de ambiente / feature flags

Edge Function `uazapi-webhook` (e `_shared/vps-receipt-bridge.ts`):

- `ENABLE_VPS_RECEIPT_RESULT` (default `false`) — kill-switch global.
- `VPS_RECEIPT_ALLOWED_INSTANCES` (default vazio) — CSV, comparação case-insensitive. Valor inicial: `canal46`.
- `VPS_RECEIPT_ALLOWED_FUNNELS` (default vazio) — CSV de nomes de funil (match exato, trim). Valor inicial: `Funil Gordura (10reais) (novo2)`.
- `VPS_RECEIPT_POLL_TIMEOUT_MS` (default `2000`).
- `VPS_RECEIPT_POLL_INTERVAL_MS` (default `250`).

Edge Function `receipt-production-write`: nenhuma env nova. Apenas passa a também escrever em `vps_receipt_results` usando o service role que já tem.

VPS2: **nenhuma mudança**. Continua chamando a mesma URL com o mesmo contrato da Fase F.

---

## 8. Garantia explícita de escopo

Triplo guard, todos precisam passar para o curto-circuito ativar:

```ts
const enabled = env.ENABLE_VPS_RECEIPT_RESULT === "true";
const instanceOk = ALLOWED_INSTANCES.includes(instance.toLowerCase()); // ["canal46"]
const funnelOk   = ALLOWED_FUNNELS.includes(funnel.name.trim());        // ["Funil Gordura (10reais) (novo2)"]
if (!(enabled && instanceOk && funnelOk)) {
  // CAMINHO LEGADO — idêntico, byte-a-byte, ao de hoje
}
```

- Qualquer outra instância (canal01, canal22, …): guard `instanceOk` falha → legado.
- Qualquer outro funil no canal46: guard `funnelOk` falha → legado.
- Flag desligada: guard `enabled` falha → legado.
- Erro de poll/parsing/timeout: `try/catch` → legado.
- Nenhuma alteração em Pixel, CAPI, Purchase, Leads, Inbox, Conversations, WhatsApp send, webhooks globais, outros blocos, outros funis, outras instâncias.

---

## Critério de aceite

- `tsc --noEmit` passa nas Edge Functions alteradas.
- Com flag ON em `canal46` + Funil Gordura (10reais) (novo2): comprovante real produz variáveis populadas com valores **idênticos** aos que a VPS2 publicou em `vps_receipt_results` (validável por log).
- Mesmo comprovante em qualquer outra instância: log mostra `[VPS_RECEIPT_BYPASS] reason=instance_not_allowed`, fluxo legado executa.
- Mesmo comprovante em outro funil de canal46: log mostra `reason=funnel_not_allowed`, legado executa.
- Flag OFF: log mostra `reason=disabled`, legado executa.
- VPS2 não respondeu a tempo: log `reason=vps_timeout_fallback`, legado executa (sem erro para o usuário).
- `purchase_audit` continua recebendo as mesmas linhas que hoje. Pixel/CAPI/Purchase/Leads/Inbox inalterados.

Aprova para aplicar?
