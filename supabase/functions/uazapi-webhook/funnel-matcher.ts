// ============================================================
// FUNNEL MATCHING HELPERS
// ============================================================

/** Normalizes a string for comparison. */
function normalizeForMatch(text: string): string {
  return (text || "")
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\s+/g, "")
    .trim();
}

/** Tenta casar uma mensagem inbound com as regras de gatilho de um funil. */
export function matchesTrigger(message: string, funnel: any): boolean {
  const normMsg = normalizeForMatch(message);
  if (!normMsg) return false;

  const wa = funnel.channels?.whatsapp;
  if (!wa?.enabled) return false;

  const keywords = wa.trigger_keywords || wa.keywords || "";
  const keywordList = typeof keywords === "string"
    ? keywords.split(",").map(k => normalizeForMatch(k)).filter(k => k.length > 0)
    : (Array.isArray(keywords) ? keywords.map(k => normalizeForMatch(String(k))) : []);

  // Se tem lista de keywords, a mensagem PRECISA casar com uma delas.
  if (keywordList.length > 0) {
    return keywordList.some(k => normMsg === k || normMsg.includes(k));
  }

  // Sem keywords configuradas: o funil é um "catch-all" que dispara em qualquer mensagem
  // (geralmente usado apenas para novos leads).
  return false;
}
