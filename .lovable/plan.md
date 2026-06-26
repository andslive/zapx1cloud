# Fase F — Piloto controlado canal46 (Receipt Production Write)

Habilita a VPS2 a executar a escrita operacional de comprovante **apenas** para a instância `canal46`, mantendo todos os demais chips 100% no fluxo atual da Lovable Cloud. Kill-switch por env: basta desligar a flag para voltar ao comportamento atual.

## Princípios

- Allowlist estrita por `instance`. Qualquer instância fora da lista é ignorada silenciosamente (sem erro, sem log de warning ruidoso).
- Idempotência dupla: `message_id` (chave primária) + `pix_id` (chave secundária) — antes de qualquer escrita, consulta `purchase_audit` / `pixel_event_logs` para evitar duplicar com o que a Edge da Lovable já gravou.
- Default OFF. `ENABLE_RECEIPT_PRODUCTION_WRITE=false` mantém o comportamento atual (apenas shadow).
- Nenhum envio de mensagem WhatsApp. Nenhuma alteração em funis, leads, inbox, conversations, agentes IA.
- Reaproveita o pipeline shadow já validado — entra como passo lateral **depois** de `processReceiptShadowFile`, dentro de try/catch, nunca propaga exceção.

## Arquitetura

```text
Receipt Shadow (is_receipt=true)
        │
        ├─► AI Shadow (já existente, inalterado)
        │
        └─► [Fase F] receipt-production-write
                │
                ├─ instance ∈ ALLOWED?  ──não──► IGNORED (silencioso)
                │
                ├─ já existe message_id em purchase_audit? ──sim──► DUPLICATE
                ├─ já existe pix_id em purchase_audit?     ──sim──► DUPLICATE
                │
                └─ INSERT purchase_audit (provider="vps2-pilot")
                        │
                        ├─ INSERT pixel_event_logs (event="Purchase", source="vps2-pilot")
                        │   └─ idempotência por (message_id, event)
                        │
                        └─ contadores file-backed + log estruturado
```

A escrita usa o `SUPABASE_SERVICE_ROLE_KEY` já presente na VPS2 (mesmo client do receipt-shadow-writer). Não há nova credencial.

## Tabelas tocadas (apenas para canal46)

- `purchase_audit` — INSERT com `provider='vps2-pilot'`, `instance`, `message_id`, `pix_id`, `amount`, `payer_name`, `ocr_text`, `confidence`, `received_at`.
- `pixel_event_logs` — INSERT do evento `Purchase` com `source='vps2-pilot'` e `dedupe_key = sha256(message_id|Purchase)`.

Nenhuma escrita em `leads`, `conversations`, `webchat_*`, `deals`, `funnels`, `whatsapp_*`.

## Idempotência

1. Antes do INSERT em `purchase_audit`: `SELECT 1 ... WHERE message_id = ? OR (pix_id IS NOT NULL AND pix_id = ?) LIMIT 1`. Se achar → `DUPLICATE`.
2. INSERT usa `ON CONFLICT (message_id) DO NOTHING` como segunda barreira (assumindo unique constraint existente; se não houver, o select cobre).
3. Pixel: dedupe por `sha256(message_id + '|Purchase')` armazenado em campo `dedupe_key` (já existente em `pixel_event_logs`).

## Env novas (defaults seguros)

```
ENABLE_RECEIPT_PRODUCTION_WRITE=false
RECEIPT_PRODUCTION_ALLOWED_INSTANCES=canal46
```

Parser: split por vírgula, trim, lowercase. Comparação case-insensitive contra `instance`.

## Métricas — `GET /stats/receipt-production-write`

```json
{
  "enabled": true,
  "allowed_instances": ["canal46"],
  "ok": 0,
  "duplicate": 0,
  "ignored": 0,
  "failed": 0,
  "lastOutcome": "OK|DUPLICATE|IGNORED|FAILED",
  "lastAt": "...",
  "lastError": null,
  "lastInstance": "canal46",
  "lastMessageId": "..."
}
```

Contadores file-backed em `storage/receipt-production-counters.json` (mesmo padrão dos outros módulos, funciona com PM2 multi-worker).

## Logs

Prefixo `[receipt-production-write]`:
- `OK` — `{instance, message_id, pix_id, amount}`
- `DUPLICATE` — `{instance, message_id, reason: "message_id"|"pix_id"|"db_conflict"}`
- `IGNORED` — `{instance, reason: "instance_not_allowed"|"disabled"|"not_receipt"}` (em debug-level pra não poluir)
- `FAILED` — `{instance, message_id, err}`

## Arquivos

**Criar:**
- `vps/edge-mini/src/lib/receipt-production-write.ts` — entrypoint `processReceiptProductionWrite(input)`, allowlist check, idempotência dupla, INSERT purchase_audit + pixel_event_logs, contadores file-backed.
- `vps/edge-mini/src/routes/stats-receipt-production-write.ts` — `GET /stats/receipt-production-write`.

**Editar:**
- `vps/edge-mini/src/env.ts` — adicionar `ENABLE_RECEIPT_PRODUCTION_WRITE` e `RECEIPT_PRODUCTION_ALLOWED_INSTANCES` (com helper de parse pra array).
- `vps/edge-mini/src/lib/receipt-ai-shadow.ts` — após persistir o resultado shadow, se `is_receipt=true` e `ENABLE_RECEIPT_PRODUCTION_WRITE`, chamar `processReceiptProductionWrite({...})` em try/catch (nunca lança).
- `vps/edge-mini/src/server.ts` — registrar `statsReceiptProductionWriteRoute`.

**NÃO tocar:** workers, webhook routes, OCR, Receipt Shadow classifier, Receipt Shadow Ingest, AI Shadow, Supabase Edge Functions, código frontend, migrations, `wa-outbound`, `wa-send`.

## Kill-switch

Setar `ENABLE_RECEIPT_PRODUCTION_WRITE=false` no `.env` e `pm2 reload edge-mini` → volta 100% ao comportamento atual (Lovable processa tudo). Os dados shadow continuam sendo gravados normalmente.

## Critério de aceite

- `tsc --noEmit` passa.
- Com flag ligada, comprovante real em `canal46` gera linha em `purchase_audit` (provider=`vps2-pilot`) + evento `Purchase` em `pixel_event_logs`.
- Comprovante em qualquer outra instância: `IGNORED`, zero escrita.
- Segundo envio do mesmo `message_id`: `DUPLICATE`, zero escrita nova.
- Se a Lovable já gravou o mesmo `message_id`/`pix_id`: `DUPLICATE`, zero escrita nova.
- `/stats/receipt-production-write` reflete os contadores reais.
- Receipt Shadow, AI Shadow, Ingest, OCR continuam idênticos.
- Nenhum envio de WhatsApp, nenhuma alteração em funis/leads/inbox.

Aprova para aplicar?
