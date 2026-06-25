
# Fase E — IA Shadow (VPS2)

Executa a IA completa em paralelo ao OCR/Receipt Shadow já validados. Apenas observação. Sem escrita em Leads, Inbox, Conversations, Funis, Pixel, Purchase Audit, CAPI ou WhatsApp. `DRY_RUN=true` mantido.

## Arquitetura

Pipeline atual:
```
Webhook Shadow → Worker wa-inbound → raw-storage → OCR Shadow → Receipt Shadow → Receipt Shadow Ingest
```

Fase E adiciona um passo lateral, disparado **somente** quando o Receipt Shadow produz um resultado:

```
Receipt Shadow (OK) ──► AI Shadow ──► storage/ai-shadow/<dia>/<ts>-<msgid>.json
                                  └─► counters file
                                  └─► (opcional, futuro) ingest HTTP
```

A IA Shadow NÃO chama `sendReceiptShadowIngest`, NÃO escreve em Supabase, NÃO envia mensagens. Apenas classifica o texto OCR + resultado Receipt e persiste localmente.

## Idempotência

Chave: `sha256(instance + "|" + message_id)`. Se já existe arquivo `index/<hash>.json` em `storage/ai-shadow/index/`, marca `duplicate` e não reprocessa.

Sem `message_id`: usa `sha256(instance + ocr_text)`.

## Provider de IA

Default `none` (heurística local — sem custo, sem rede): reaproveita `classifyReceiptShadow` e adiciona um score consolidado + label (`receipt_confirmed | receipt_suspect | not_receipt | unknown`). Mantém a porta aberta para `lovable` / `openai` em fase posterior via env (`AI_SHADOW_PROVIDER`), mas Fase E entrega `none` por padrão.

## Estrutura do resultado

```json
{
  "received_at": "...",
  "processed_at": "...",
  "instance": "canal46",
  "message_id": "...",
  "phone": "55...",            // se disponível no payload bruto
  "conversation_ref": "...",   // se disponível
  "ocr_text": "...",
  "receipt": { "is_receipt": true, "amount": 123.45, "payer_name": "...", "pix_id": "...", "confidence": 0.95, "reason": "signals+amount+payer" },
  "ai": { "provider": "none", "label": "receipt_confirmed", "confidence": 0.95, "reason": "heuristic:receipt+amount+payer", "raw": null },
  "hash": "sha256:..."
}
```

## Métricas (`GET /stats/ai-shadow`)

```json
{
  "enabled": true,
  "provider": "none",
  "received": 0,
  "ignored": 0,
  "processed": 0,
  "duplicate": 0,
  "failed": 0,
  "lastOutcome": "OK|DUPLICATE|FAILED|IGNORED",
  "lastAt": "...",
  "lastError": null,
  "todayFiles": 0
}
```

Contadores file-backed (`storage/ai-shadow-counters.json`) — mesmo padrão de `receipt-shadow-counters.json` para funcionar em PM2 multi-worker.

## Logs

Prefixo `[ai-shadow]`:
- `received` — chamada entrou
- `ignored` — Receipt não-comprovante ou desativado
- `processed` — OK com hash + label
- `duplicate` — hash já visto
- `error` — exceção com `err.message`

## Env (novas, defaults seguros)

```
ENABLE_AI_SHADOW=false        # liga/desliga a etapa
AI_SHADOW_PROVIDER=none       # none|lovable|openai (Fase E entrega "none")
AI_SHADOW_DIR=/opt/x1zap/edge-mini/storage/ai-shadow
AI_SHADOW_ONLY_RECEIPTS=true  # se true, só processa quando receipt.is_receipt=true
```

Sem credenciais. Sem service_role. Sem URL externa obrigatória.

## Arquivos

**Criar:**
- `vps/edge-mini/src/lib/ai-shadow.ts` — entrypoint `processAiShadow(input)`, classificação heurística, idempotência por hash, persistência em `storage/ai-shadow/<YYYY-MM-DD>/`, contadores file-backed, índice em `storage/ai-shadow/index/<hash>.json` (stub vazio só pra dedupe).
- `vps/edge-mini/src/routes/stats-ai-shadow.ts` — `GET /stats/ai-shadow`.

**Editar:**
- `vps/edge-mini/src/env.ts` — adiciona `ENABLE_AI_SHADOW`, `AI_SHADOW_PROVIDER`, `AI_SHADOW_DIR`, `AI_SHADOW_ONLY_RECEIPTS`.
- `vps/edge-mini/src/lib/receipt-ai-shadow.ts` — após `saveResult`, se `ENABLE_AI_SHADOW`, chamar `processAiShadow({...input, receipt: classification})` dentro de `try/catch` (nunca lança).
- `vps/edge-mini/src/server.ts` — registrar `statsAiShadowRoute`.

**NÃO tocar:** workers, webhook routes, OCR, Receipt Shadow writer, ingest, Supabase client, qualquer Edge Function, migrations, código da produção (`src/`, `supabase/functions/`).

## Critério de aceite

- `tsc --noEmit` passa.
- Com `ENABLE_AI_SHADOW=true`, comprovante real espelhado gera `.json` em `storage/ai-shadow/<dia>/`.
- `/stats/ai-shadow` retorna contadores reais.
- Segunda entrega do mesmo `message_id` retorna `duplicate`.
- Receipt Shadow / Ingest / OCR continuam idênticos.
- Nenhuma chamada de rede saindo da Fase E (provider `none`).

Aprova para eu aplicar?
