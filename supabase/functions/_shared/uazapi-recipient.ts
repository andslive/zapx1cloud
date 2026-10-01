// Destino de envio para a UazAPI.
//
// A UazAPI aceita em `number` (POST /send/*): telefone internacional, ou ID de
// usuário com sufixo (`@s.whatsapp.net` ou `@lid`). Contatos que o WhatsApp
// identifica só por LID (ex.: quem usa @username) chegam do provedor como
// `<dígitos>@lid`, com `sender_pn` vazio — NÃO há telefone para extrair.
//
// Regra: um `@lid` é mantido COMO `@lid` até a UazAPI. Nunca é convertido em
// telefone (nem por extração de dígitos, nem por normalizePhoneBR, que
// reescreveria dígitos de um LID por acaso parecido com um número BR).
// Qualquer entrada que NÃO seja `@lid` segue exatamente a lógica anterior.

export interface UazapiRecipient {
  /** valor para o campo `number` da UazAPI */
  number: string;
  /** JID usado em chamadas que exigem JID (ex.: /chat/read) */
  jid: string;
  kind: "lid" | "phone";
}

// `<dígitos>@lid`, opcionalmente com ":device" (removido). Mínimo 5 dígitos.
const LID_RE = /^(\d{5,})(?::\d+)?@lid$/i;

export function isLidJid(value: unknown): value is string {
  return typeof value === "string" && LID_RE.test(value.trim());
}

/**
 * @param to destino recebido pelo uazapi-send (telefone, JID ou `<lid>@lid`)
 * @param normalizePhone normalizador de telefone (normalizePhoneBR no runtime)
 */
export function resolveUazapiRecipient(
  to: string,
  normalizePhone: (digits: string) => string | null,
): UazapiRecipient {
  const m = typeof to === "string" ? LID_RE.exec(to.trim()) : null;
  if (m) {
    const lid = `${m[1]}@lid`;
    return { number: lid, jid: lid, kind: "lid" };
  }
  // ---- caminho anterior, inalterado ----
  const rawPhone = to.replace(/\D/g, "");
  const phone = normalizePhone(rawPhone) || rawPhone;
  const jid = to.includes("@") ? to : `${phone}@s.whatsapp.net`;
  return { number: phone, jid, kind: "phone" };
}

/**
 * Destino a enviar a partir do que o webhook sabe do contato: se o provedor
 * identificou o contato SÓ por LID (remoteJid `<lid>@lid`), o roteamento é o
 * próprio `@lid`; caso contrário, o telefone (comportamento anterior).
 */
export function resolveWebhookSendTarget(remoteJid: unknown, phone: string): string {
  return isLidJid(remoteJid) ? (remoteJid as string).trim() : phone;
}
