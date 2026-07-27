// FASE 2 — funções puras usadas exclusivamente pelo caminho de recuperação
// controlada de comprovantes (incidente de crédito OpenAI, 2026-07-26/27).
//
// Nada aqui toca banco, funil ao vivo ou a Meta diretamente. São funções
// determinísticas, testáveis sem rede (exceto `classifyReceiptMediaReadOnly`,
// que chama a OpenAI só para leitura/classificação, sem gravar nada).
//
// NÃO usado pelo tráfego normal de Purchase — o call site em
// uazapi-webhook/index.ts só invoca isto quando `flowVariables.__recovery_context`
// está presente (setado exclusivamente pelo handler `execute_recovery`, que por
// sua vez só existe para processar linhas de `receipt_recovery_requests`).

/** Janela máxima aceita pela Meta CAPI para event_time no passado (7 dias, com margem de segurança de 1h). */
const META_EVENT_TIME_MAX_AGE_SECONDS = 7 * 24 * 60 * 60 - 60 * 60;

export interface RecoveryContext {
  recoveryId: string;
  originalMessageId: string;
  originalMessageCreatedAt: string; // ISO
  organizationId: string;
  conversationId: string;
  pixelBlockId: string;
  incidentTag: string;
}

/**
 * event_id determinístico para Purchases recuperados.
 *
 * Estável para o mesmo caso em: 1ª tentativa, retry, timeout, nova chamada
 * acidental, recuperação após falha de persistência — porque depende apenas
 * de identificadores já fixados ANTES do envio (nunca de Date.now() ou de um
 * UUID sorteado na hora, ao contrário do event_id do tráfego normal, que usa
 * `capi_${crypto.randomUUID()}` em uazapi-webhook/index.ts:2091).
 *
 * Formato de saída: `capi_recovery_<sha256 hex, 32 chars>` — prefixo distinto
 * do tráfego normal (`capi_<uuid>`), para nunca colidir e ficar identificável
 * em auditoria/logs.
 */
export async function deterministicRecoveryEventId(
  ctx: Pick<
    RecoveryContext,
    "organizationId" | "conversationId" | "pixelBlockId" | "originalMessageId"
  >,
): Promise<string> {
  const material =
    `${ctx.organizationId}|${ctx.conversationId}|${ctx.pixelBlockId}|${ctx.originalMessageId}`;
  const bytes = new TextEncoder().encode(material);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const hex = Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 32);
  return `capi_recovery_${hex}`;
}

export type EventTimeValidation =
  | { ok: true; eventTimeUnixSeconds: number }
  | { ok: false; reason: "in_future" | "too_old_for_meta" | "invalid_date" };

/**
 * Deriva o event_time (segundos unix) a partir do horário REAL da mídia
 * original — nunca de Date.now(). Valida contra a janela aceita pela Meta
 * CAPI (rejeita eventos futuros ou com mais de ~7 dias).
 */
export function resolveOriginalEventTime(
  originalMessageCreatedAtIso: string,
  now: Date = new Date(),
): EventTimeValidation {
  const parsed = new Date(originalMessageCreatedAtIso);
  if (isNaN(parsed.getTime())) return { ok: false, reason: "invalid_date" };

  const eventTimeUnixSeconds = Math.floor(parsed.getTime() / 1000);
  const nowUnixSeconds = Math.floor(now.getTime() / 1000);

  if (eventTimeUnixSeconds > nowUnixSeconds + 60) {
    // pequena tolerância de 60s para clock skew
    return { ok: false, reason: "in_future" };
  }
  if (nowUnixSeconds - eventTimeUnixSeconds > META_EVENT_TIME_MAX_AGE_SECONDS) {
    return { ok: false, reason: "too_old_for_meta" };
  }
  return { ok: true, eventTimeUnixSeconds };
}

export interface ReceiptFieldsExtracted {
  valor: number | null;
  data_hora_texto: string | null;
  identificador_e2e_ou_transacao: string | null;
  pagador: string | null;
  recebedor: string | null;
  banco: string | null;
  texto_normalizado: string | null;
  is_provavel_comprovante: boolean;
  confidence: "alta" | "media" | "baixa";
}

const CLASSIFY_PROMPT = `Você está analisando uma imagem ou PDF que pode ser um
comprovante de pagamento (Pix, TED, boleto) brasileiro. Esta é uma leitura
SOMENTE PARA CLASSIFICAÇÃO — não é uma aprovação de compra, não decide nada
sozinha. Extraia, se disponível, e responda em JSON estrito:
{
  "valor": number|null,
  "data_hora_texto": string|null,
  "identificador_e2e_ou_transacao": string|null,
  "pagador": string|null,
  "recebedor": string|null,
  "banco": string|null,
  "texto_normalizado": string|null,
  "is_provavel_comprovante": boolean,
  "confidence": "alta"|"media"|"baixa"
}
Se a imagem/PDF claramente NÃO for um comprovante de pagamento (ex.: receita
culinária, foto pessoal, print de conversa), responda
is_provavel_comprovante=false e os demais campos como null.`;

/**
 * Classificação/OCR ISOLADA — sem efeitos colaterais: não grava em nenhuma
 * tabela, não altera conversa, não avança funil, não envia mensagem, não cria
 * venda, não chama a Meta. Único efeito externo é a chamada à API da OpenAI
 * (leitura), que é uma chamada paga e que processa dados financeiros reais do
 * cliente — por isso este código está pronto mas NÃO foi executado nesta
 * rodada sem uma decisão explícita adicional (ver relatório FASE 2, item 2).
 *
 * Requer a chave da OpenAI injetada pelo chamador (nunca hardcoded, nunca
 * logada). Pensada para rodar dentro do runtime da Edge Function, onde o
 * secret já está disponível com segurança — não para ser puxado para fora
 * do Supabase e rodado localmente.
 */
export async function classifyReceiptMediaReadOnly(
  mediaUrl: string,
  mediaType: "image" | "document",
  openaiApiKey: string,
): Promise<ReceiptFieldsExtracted | { error: string }> {
  try {
    const mediaResp = await fetch(mediaUrl);
    if (!mediaResp.ok) {
      return { error: `media_fetch_failed_${mediaResp.status}` };
    }
    const bytes = new Uint8Array(await mediaResp.arrayBuffer());
    // Mesmo bug de call-stack encontrado e corrigido em
    // receipt-classify-admin/index.ts — conversão em chunks.
    let binary = "";
    const CHUNK = 8192;
    for (let i = 0; i < bytes.length; i += CHUNK) {
      binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
    }
    const base64 = btoa(binary);
    const mime = mediaType === "document" ? "application/pdf" : "image/jpeg";

    const body = {
      model: "gpt-4o-mini",
      input: [
        {
          role: "user",
          content: [
            { type: "input_text", text: CLASSIFY_PROMPT },
            mediaType === "document"
              ? {
                type: "input_file",
                filename: "comprovante.pdf",
                file_data: `data:${mime};base64,${base64}`,
              }
              : {
                type: "input_image",
                image_url: `data:${mime};base64,${base64}`,
              },
          ],
        },
      ],
    };

    const resp = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${openaiApiKey}`,
      },
      body: JSON.stringify(body),
    });
    if (!resp.ok) {
      return { error: `openai_http_${resp.status}` };
    }
    const data = await resp.json();
    const text = extractOutputText(data);
    // Achado real ao testar receipt-classify-admin contra a API de verdade:
    // o modelo às vezes envolve o JSON em cercas markdown.
    const cleanedText = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
    const parsed = JSON.parse(cleanedText);
    return parsed as ReceiptFieldsExtracted;
  } catch (e) {
    return { error: `exception_${String((e as Error)?.message || e).slice(0, 200)}` };
  }
}

function extractOutputText(data: any): string {
  const out = data?.output;
  if (Array.isArray(out)) {
    for (const item of out) {
      const content = item?.content;
      if (Array.isArray(content)) {
        for (const c of content) {
          if (typeof c?.text === "string") return c.text;
        }
      }
    }
  }
  return data?.output_text || "{}";
}

export type TransactionComparisonVerdict = "duplicate" | "distinct" | "inconclusive";

export interface TransactionComparisonResult {
  verdict: TransactionComparisonVerdict;
  reason: string;
}

/**
 * FASE 2.1 — compara dois candidatos a comprovante. Resultado de TRÊS
 * estados (não booleano): "duplicate"/"distinct" só quando há evidência
 * POSITIVA suficiente; caso contrário "inconclusive" — nunca infere
 * "distinct" por ausência de prova de duplicidade (ausência de evidência
 * de duplicidade não é evidência de distinção).
 *
 * Regras:
 *  - mesmo SHA-256 → duplicate, sempre.
 *  - mesmo identificador E2E/transação (não vazio) → duplicate, mesmo com
 *    hash diferente (ex.: mesma transação fotografada duas vezes).
 *  - hash diferente sozinho NÃO prova nem duplicidade nem distinção →
 *    inconclusive, a menos que haja E2Es válidos e comprovadamente
 *    diferentes preenchidos nos dois lados (evidência positiva de
 *    transações distintas) → aí sim "distinct".
 *  - mesmo valor OU mesmo lead, isoladamente, NÃO bastam para nada — não
 *    entram nesta função (a chamadora não deve passar isso como se fosse
 *    evidência).
 *  - `visualSimilarity` (0-1, opcional — prevista para comparação
 *    perceptual de imagens recortadas/recomprimidas) só pode EMPURRAR o
 *    resultado para "inconclusive" (nunca para "duplicate" sozinha —
 *    similaridade visual alta sem E2E/hash não é prova suficiente de
 *    duplicidade; ela só evita que o caso seja tratado como "distinct"
 *    com falsa confiança).
 */
export function isSameTransaction(
  a: { sha256: string; e2e: string | null },
  b: { sha256: string; e2e: string | null },
  options?: { visualSimilarity?: number },
): TransactionComparisonResult {
  if (a.sha256 === b.sha256) {
    return { verdict: "duplicate", reason: "same_sha256" };
  }
  const e2eA = a.e2e?.trim().toLowerCase() || null;
  const e2eB = b.e2e?.trim().toLowerCase() || null;
  if (e2eA && e2eB) {
    if (e2eA === e2eB) {
      return { verdict: "duplicate", reason: "same_e2e_transaction_id" };
    }
    // Dois E2E válidos, preenchidos, e comprovadamente diferentes: única
    // situação com evidência POSITIVA suficiente para "distinct" sem hash
    // igual.
    if ((options?.visualSimilarity ?? 0) >= 0.92) {
      // Alta similaridade visual com E2Es diferentes é contraditório o
      // bastante para não confiar cegamente no E2E lido (pode ser erro de
      // OCR) — reclassifica como inconclusivo em vez de "distinct".
      return { verdict: "inconclusive", reason: "conflicting_e2e_vs_high_visual_similarity" };
    }
    return { verdict: "distinct", reason: "different_e2e_transaction_ids" };
  }
  // Hash diferente, sem E2E suficiente dos dois lados para decidir — a
  // ausência de prova de duplicidade não é prova de distinção.
  return { verdict: "inconclusive", reason: "insufficient_evidence_no_e2e" };
}

export type MetaStatus = "success" | "failed";

/**
 * Espelha (para fins de revisão/teste de lógica) a regra de merge usada
 * por `record_purchase_result` no Postgres (migration 20260727141449):
 * sucesso nunca regride para falha; falha pode virar sucesso num retry.
 * A garantia REAL de atomicidade é do `ON CONFLICT ... DO UPDATE` do
 * Postgres, não desta função — esta função não é chamada em produção, só
 * documenta/testa a mesma regra em isolamento.
 */
export function mergePurchaseStatus(
  existing: MetaStatus | null,
  incoming: MetaStatus,
): MetaStatus {
  if (existing === "success") return "success";
  return incoming;
}
