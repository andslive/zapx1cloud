// FASE 2 — identidade canônica de comprovante, usada pelo tráfego NORMAL de
// Purchase (bloco `ai_receipt` → bloco `pixel` em uazapi-webhook/index.ts).
//
// Objetivo: impedir que o MESMO comprovante bancário gere uma segunda venda
// quando é reenviado (com outro message_id, com legenda diferente, ou
// simplesmente citado numa mensagem de texto posterior que reaproveita o
// buffer __pending_receipt_media) — sem depender de message_id, de janela de
// tempo fixa ou do texto bruto concatenado da mensagem.
//
// Funções puras, sem rede/banco — testáveis via `deno test --allow-import
// receipt-fingerprint.test.ts`.

/** Remove acentos, baixa para minúsculas, mantém apenas letras/dígitos/espaço
 * e colapsa espaços múltiplos em UM único espaço — nunca remove o espaço por
 * completo, para não fundir palavras/tokens diferentes numa mesma string
 * (ex.: "Ana Maria" não pode virar indistinguível de "Anamaria"). */
export function normalizePayerName(raw: string | null | undefined): string {
  const str = String(raw ?? "");
  return str
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Normaliza valor monetário para string fixa de 2 casas (ex.: "30.00"). */
export function normalizeAmount(value: number | string | null | undefined): string | null {
  const n = typeof value === "number" ? value : parseFloat(String(value ?? "").replace(",", "."));
  if (!Number.isFinite(n) || n <= 0) return null;
  return n.toFixed(2);
}

/** Normaliza um identificador bancário (E2E/NSU/autenticação): maiúsculas,
 * sem espaços internos. */
export function normalizeBankTransactionId(raw: string | null | undefined): string | null {
  const str = String(raw ?? "").trim();
  if (str.length < 6) return null;
  const cleaned = str.toUpperCase().replace(/\s+/g, "");
  return cleaned.length >= 6 ? cleaned : null;
}

/**
 * Extrai identificador bancário inequívoco do texto OCR (E2E, ID Pix, NSU,
 * autenticação, código de transação) — rótulos comuns em comprovantes
 * brasileiros. Best-effort: muitos comprovantes reais não trazem esse campo
 * de forma legível para o OCR (foi o caso do incidente real auditado), então
 * esta função pode legitimamente retornar null com frequência.
 */
export function extractBankTransactionId(ocrText: string | null | undefined): string | null {
  const text = String(ocrText ?? "");
  const re =
    /(?:end[\s-]*to[\s-]*end\s*id|e2e\s*id|id\s*e2e|id\s*pix|nsu|c[oó]digo\s+de\s+autentica[cç][aã]o|autentica[cç][aã]o|identifica[cç][aã]o\s+da\s+transa[cç][aã]o|id(?:entificador)?\s+da\s+transa[cç][aã]o|comprovante\s*n[ºo°]?)\s*[:\-]?\s*\*{0,2}\s*([A-Za-z0-9][A-Za-z0-9.\-]{5,39})/i;
  const m = text.match(re);
  if (!m) return null;
  return normalizeBankTransactionId(m[1]);
}

/**
 * Extrai e normaliza a data/hora impressa no comprovante (rótulo
 * "Data e Hora", já sinalizado pelo extrator determinístico existente via
 * `has_date`, mas sem captura de valor até agora). Formatos aceitos:
 * "06/08/2026 às 06:08:27", "06/08/2026 06:08:27", "06/08/2026 06:08".
 *
 * Retorna a string LITERAL do que está impresso, normalizada para
 * `YYYY-MM-DDTHH:MM:SS` — sem qualquer conversão de fuso horário. Não é um
 * timestamp real utilizável para aritmética de tempo; é só uma chave estável
 * para comparar dois OCRs do MESMO comprovante entre si.
 */
export function extractTransactionDateTime(ocrText: string | null | undefined): string | null {
  const text = String(ocrText ?? "");
  const labelRe =
    /Data\s+e\s+Hora\s*\*{0,2}\s*[:\-]\s*\*{0,2}\s*([^\n\r]+)/i;
  const labelMatch = text.match(labelRe);
  const scope = labelMatch ? labelMatch[1] : text;

  const dtRe = /(\d{2})\/(\d{2})\/(\d{4}).{0,10}?(\d{2}):(\d{2})(?::(\d{2}))?/;
  const m = scope.match(dtRe);
  if (!m) return null;
  const [, dd, mm, yyyy, hh, min, ss] = m;
  if (!ss) return null; // sem segundos não é considerado completo (ver força "strong")
  const dayNum = Number(dd), monthNum = Number(mm);
  if (dayNum < 1 || dayNum > 31 || monthNum < 1 || monthNum > 12) return null;
  return `${yyyy}-${mm}-${dd}T${hh}:${min}:${ss}`;
}

export type FingerprintStrength = "strong" | "weak";

export interface TransactionFingerprintFields {
  bankTransactionId?: string | null;
  amount?: number | string | null;
  payerName?: string | null;
  transactionAt?: string | null; // já normalizado por extractTransactionDateTime, ou null
}

export interface TransactionFingerprintResult {
  fingerprint: string;
  strength: FingerprintStrength;
  version: number;
}

const FINGERPRINT_VERSION = 1;

/**
 * Constrói a assinatura canônica da transação, por ordem de confiabilidade:
 *   1) identificador bancário (E2E/NSU/autenticação) sozinho já é forte;
 *   2) na ausência dele, valor + pagador (>=3 chars) + data/hora completa
 *      (com segundos) → forte;
 *   3) qualquer campo essencial faltando → fraca (nunca usada para bloqueio
 *      automático; só para auditoria/candidatos).
 *
 * Formato com separadores inequívocos e campos nomeados/versionados — nunca
 * concatenação simples sem separador (duas combinações diferentes de
 * valor/nome não podem colidir na mesma string).
 */
export function buildTransactionFingerprint(
  fields: TransactionFingerprintFields,
): TransactionFingerprintResult {
  const bankId = normalizeBankTransactionId(fields.bankTransactionId);
  if (bankId) {
    return {
      fingerprint: `v${FINGERPRINT_VERSION}|bank_id=${bankId}`,
      strength: "strong",
      version: FINGERPRINT_VERSION,
    };
  }

  const amount = normalizeAmount(fields.amount);
  const payer = normalizePayerName(fields.payerName);
  const transactionAt = fields.transactionAt || null;

  if (amount && payer.length >= 3 && transactionAt) {
    return {
      fingerprint:
        `v${FINGERPRINT_VERSION}|amount=${amount}|payer=${payer}|transaction_at=${transactionAt}`,
      strength: "strong",
      version: FINGERPRINT_VERSION,
    };
  }

  // Fraca: monta com o que houver disponível, sempre nomeando os campos
  // presentes — nunca inventa valor vazio que possa colidir com outro caso
  // igualmente incompleto.
  const parts: string[] = [`v${FINGERPRINT_VERSION}`];
  if (amount) parts.push(`amount=${amount}`);
  if (payer.length >= 3) parts.push(`payer=${payer}`);
  if (transactionAt) parts.push(`transaction_at=${transactionAt}`);
  return {
    fingerprint: parts.join("|"),
    strength: "weak",
    version: FINGERPRINT_VERSION,
  };
}

/** SHA-256 hex da fingerprint canônica — chave compacta para índice/constraint. */
export async function hashFingerprint(fingerprint: string): Promise<string> {
  const bytes = new TextEncoder().encode(fingerprint);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// ───────────────────────────────────────────────────────────────────────
// [FASE 2B] Decisão do gate de duplicidade — função pura, sem I/O. Os dois
// pontos de chamada em uazapi-webhook/index.ts (bloco `ai_receipt`, gate
// principal — e bloco `pixel`, defesa em profundidade) delegam a decisão
// para AQUI, para nunca divergir. Nenhum dos dois faz a chamada de rede/RPC
// aqui dentro — só decidem o que fazer a partir do resultado (ou ausência
// de resultado) da RPC `claim_receipt_fingerprint`, já executada pelo
// chamador.
// ───────────────────────────────────────────────────────────────────────

export interface FingerprintClaimResult {
  claimed: boolean;
  claim_id: string | null;
  existing_purchase_audit_id: string | null;
}

export type DuplicateGateDecision =
  | { action: "proceed"; claimId: string | null }
  | { action: "block"; existingPurchaseAuditId: string | null; reason: string }
  | { action: "skip_no_org" }
  | { action: "skip_weak_or_absent" };

export interface DuplicateGateInput {
  /** "strong" | "weak" | ausente — direto de flowVariables.__receipt_fingerprint_strength. */
  fingerprintStrength: FingerprintStrength | null | undefined;
  fingerprintHash: string | null | undefined;
  organizationId: string | null | undefined;
  /**
   * Idempotência entre os dois pontos de chamada: se um claim já foi obtido
   * NESTA MESMA execução (ex.: ai_receipt já reivindicou, pixel é
   * alcançado na sequência), o segundo ponto não tenta reivindicar de novo
   * — nem chama a RPC, nem decide duplicidade sozinho.
   */
  alreadyClaimedId?: string | null;
  /** true quando a chamada à RPC falhou (erro de rede/banco). */
  claimRpcError?: boolean;
  /** Resultado da RPC, quando ela foi de fato chamada (null se não chamada). */
  claimResult?: FingerprintClaimResult | null;
}

/**
 * Decide a ação do gate a partir do estado atual — nunca chama a RPC, só
 * interpreta o resultado que o chamador já obteve (ou não obteve).
 *
 * Regras (nesta ordem):
 *  1) Já reivindicado nesta execução → segue (idempotência, sem novo claim).
 *  2) Fingerprint ausente ou fraca → nunca bloqueia sozinha (só auditoria,
 *     decidida pelo chamador).
 *  3) organization_id ausente → não há como isolar por organização, então
 *     não tenta reivindicar (skip, não bloqueia — evita colisão entre orgs
 *     por acidente de dado ausente).
 *  4) Falha técnica na RPC (erro ou resultado ausente) → fail-open, NUNCA
 *     interpretada como duplicidade.
 *  5) `claimed === false` (constraint conflitou) → bloqueia, é o
 *     comprovante repetido esperado.
 *  6) `claimed === true` → segue, com o claim_id para uso posterior
 *     (linkagem com a venda canônica).
 */
export function decideReceiptDuplicateGate(input: DuplicateGateInput): DuplicateGateDecision {
  if (input.alreadyClaimedId) {
    return { action: "proceed", claimId: input.alreadyClaimedId };
  }
  if (input.fingerprintStrength !== "strong" || !input.fingerprintHash) {
    return { action: "skip_weak_or_absent" };
  }
  if (!input.organizationId) {
    return { action: "skip_no_org" };
  }
  if (input.claimRpcError || !input.claimResult) {
    return { action: "proceed", claimId: null };
  }
  if (input.claimResult.claimed === false) {
    return {
      action: "block",
      existingPurchaseAuditId: input.claimResult.existing_purchase_audit_id,
      reason: "receipt_fingerprint_already_claimed",
    };
  }
  return { action: "proceed", claimId: input.claimResult.claim_id };
}
