// FASE 2A.2 — Correção 2 do ADENDO GATE 2A.1: chave de idempotência
// determinística por evento normalizado, com escopo (phone_number_id, com
// fallback para waba_id) e SUBTIPO real incluídos.
//
// Corrige o defeito confirmado no gate: a constraint antiga
// `UNIQUE(wamid, event_type)` usava `event_type = "status"` para TODAS as
// transições de status (sent/delivered/read/failed), fazendo com que
// `delivered`/`read` colidissem com `sent` do mesmo `wamid` e fossem
// descartados como "duplicata". Aqui, `status` entra na chave.
//
// Nunca usa hash de identidade de objeto JS (`{}` !== `{}`) — usa
// serialização canônica determinística (chaves ordenadas recursivamente)
// + SHA-256 via Web Crypto, testável e sem dependência de ordem de campos
// no JSON original.
//
// FASE 2A.3 — Correção 3 do Gate 2A.2: `phone_number_id` como escopo
// agora tem garantia RELACIONAL, não é mais uma suposição. A migration
// (20260810120000_meta_cloud_api_foundation.sql) ganhou
// `UNIQUE(phone_number_id)` em `evolution_instances_meta_cloud` — provado
// em Postgres real (ver relatório Fase 2A.3) que duas configurações Meta
// (logo, potencialmente duas organizações) NUNCA podem compartilhar o
// mesmo `phone_number_id`. Isso é o que torna seguro usar só
// `phone_number_id` (sem `organization_id`, que o payload da Meta nem
// carrega) como escopo da chave.

import type { NormalizedInboundEvent } from "./whatsapp-provider/types.ts";

/**
 * Serialização canônica: ordena chaves de objetos recursivamente, preserva
 * ordem de arrays (arrays representam sequência, não conjunto). `undefined`
 * em propriedades de objeto é omitido (mesmo comportamento de
 * `JSON.stringify`), preservado em arrays como `null` (idem).
 */
export function canonicalStableStringify(value: unknown): string {
  if (value === undefined) return "null";
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((v) => canonicalStableStringify(v)).join(",")}]`;
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).filter((k) => obj[k] !== undefined).sort();
  const parts = keys.map((k) => `${JSON.stringify(k)}:${canonicalStableStringify(obj[k])}`);
  return `{${parts.join(",")}}`;
}

export async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function extractScope(raw: unknown): string {
  const r = raw as any;
  const phoneNumberId = String(r?.phoneNumberId ?? "");
  if (phoneNumberId) return phoneNumberId;
  // Fallback: nem todo `field` da Meta traz `metadata.phone_number_id`
  // (ex.: alguns payloads de account_update/history observados na
  // documentação da Fase 1 trazem só o waba_id) — usar waba_id como
  // escopo ainda impede colisão entre CONTAS distintas, mesmo que não
  // distinga números dentro da mesma conta para esses campos específicos.
  return String(r?.wabaId ?? "");
}

/**
 * Calcula a chave de idempotência determinística de um evento normalizado.
 * Mesma chave ⇒ mesmo evento real (retransmissão exata da Meta). Chaves
 * diferentes ⇒ sempre tratados como eventos distintos, mesmo que
 * compartilhem `wamid`.
 */
export async function computeMetaEventIdempotencyKey(event: NormalizedInboundEvent): Promise<string> {
  const scope = extractScope(event.raw);

  switch (event.kind) {
    case "message":
      return event.providerMessageId
        ? `message:${scope}:${event.providerMessageId}`
        : `message:${scope}:${await sha256Hex(canonicalStableStringify(event.raw))}`;

    case "status": {
      // Subtipo real (sent/delivered/read/failed) SEMPRE na chave — é isto
      // que corrige o defeito do Gate 2A.1. `event.status` pode ser
      // `undefined` se a Meta mandar um valor fora do enum documentado;
      // nesse caso cai em "unmapped_status" (nunca colide com um status
      // mapeado real, e ainda assim é determinístico para reenvios
      // idênticos do mesmo valor não mapeado).
      const subtype = event.status ?? "unmapped_status";
      const id = event.providerMessageId ?? await sha256Hex(canonicalStableStringify(event.raw));
      // FASE 2A.3 — decisão documentada (Correção 3 do Gate 2A.2) sobre
      // dois eventos "failed" do mesmo wamid com detalhes diferentes:
      // quando a Meta reenvia o MESMO `failed` (retry de entrega do
      // próprio webhook, mesmo `errors[0].code`), tratamos como
      // retransmissão — mesma chave, dedup esperado. Quando o `errorCode`
      // muda, tratamos como um evento LEGITIMAMENTE DISTINTO (ex.: uma
      // primeira falha por número inválido, seguida depois por uma falha
      // por template rejeitado, no raríssimo caso da Meta reenviar dois
      // `failed` com causas diferentes para o mesmo `wamid`) — o código do
      // erro entra na chave só para o subtipo "failed", que é o único
      // subtipo de status que carrega um `errorCode` na normalização
      // (`meta-webhook-normalize.ts`, `normalizeStatus`). Timestamp
      // NÃO entra na chave deliberadamente: o timestamp de entrega de um
      // reenvio idêntico do mesmo evento pela Meta pode diferir sem que o
      // evento em si seja diferente, e usá-lo geraria falsos "eventos
      // novos" a cada retry de rede da própria Meta.
      const failedDetail = subtype === "failed" && event.errorCode ? `:${event.errorCode}` : "";
      return `status:${scope}:${id}:${subtype}${failedDetail}`;
    }

    case "message_echo":
      return event.providerMessageId
        ? `echo:${scope}:${event.providerMessageId}`
        : `echo:${scope}:${await sha256Hex(canonicalStableStringify(event.raw))}`;

    case "message_delete":
      return event.providerMessageId
        ? `message_delete:${scope}:${event.providerMessageId}`
        : `message_delete:${scope}:${await sha256Hex(canonicalStableStringify(event.raw))}`;

    case "history":
      // Sem id nativo por mensagem — retransmissão idêntica do MESMO bloco
      // de histórico deduplica (hash do conteúdo inteiro); um bloco novo
      // (mesmo que reenviado no mesmo `wamid` de contexto, que nem existe
      // aqui) sempre gera uma chave nova.
      return `history:${scope}:${await sha256Hex(canonicalStableStringify(event.raw))}`;

    case "contact_sync":
      return `contact_sync:${scope}:${await sha256Hex(canonicalStableStringify(event.raw))}`;

    case "account_update": {
      const r = event.raw as any;
      const wabaId = String(r?.wabaId ?? "");
      return `account_update:${wabaId}:${await sha256Hex(canonicalStableStringify(event.raw))}`;
    }

    case "error":
      return event.providerMessageId
        ? `error:${scope}:${event.providerMessageId}`
        : `error:${scope}:${await sha256Hex(canonicalStableStringify(event.raw))}`;

    // "connection"/"qrcode" existem no union por compatibilidade com o
    // contrato UazAPI (whatsapp-provider/types.ts) — a Meta Cloud API não
    // produz esses kinds (não há QR code na Cloud API). Chave defensiva,
    // nunca deve ser exercitada de fato para provider="meta_cloud".
    case "connection":
    case "qrcode":
    case "unknown":
    default:
      return `${event.kind}:${scope}:${await sha256Hex(canonicalStableStringify(event.raw))}`;
  }
}
