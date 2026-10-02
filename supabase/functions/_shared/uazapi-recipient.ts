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

// ---------------------------------------------------------------------------
// Evidência do LID para caminhos que NÃO têm o evento do provedor à mão
// (retomada por cron/timeout/manual): o destino é reconstruído do que foi
// GUARDADO. O identificador guardado de um contato só-LID são os dígitos do LID
// — indistinguíveis de um telefone. A única prova de que são um LID é o
// `chatid` `<lid>@lid` que o provedor entregou no inbound, que registramos em
// `webchat_conversations.metadata.wa_lid` (convenção já usada pelo webhook).
//
// Regra: só se reconstrói `<lid>@lid` quando metadata.wa_lid EXISTE e é IGUAL ao
// identificador guardado. Nunca por comprimento, formato ou semelhança.
// ---------------------------------------------------------------------------

/** Destino para reconstruir a partir do que está guardado (retomada). */
export function resolveStoredRemoteJid(storedIdentifier: unknown, metadata: unknown): string {
  const stored = typeof storedIdentifier === "string" ? storedIdentifier : String(storedIdentifier ?? "");
  const wa = metadata && typeof metadata === "object" ? (metadata as Record<string, unknown>).wa_lid : undefined;
  if (typeof wa === "string" && /^\d{5,}$/.test(wa) && wa === stored) return `${wa}@lid`;
  return stored;
}

// Cliente mínimo (compatível com supabase-js) para permitir fake nos testes.
interface MetadataClient {
  from(table: string): {
    select(cols: string): { eq(col: string, val: string): { maybeSingle(): PromiseLike<{ data: { metadata?: unknown } | null; error: unknown }> } };
    update(values: Record<string, unknown>): { eq(col: string, val: string): PromiseLike<{ error: unknown }> };
  };
}

export type LidEvidenceResult = "persisted" | "already" | "skipped" | "error";

/**
 * Registra em metadata.wa_lid o LID que o provedor entregou, SOMENTE se:
 *  - o remoteJid do evento é `<lid>@lid` (o provedor identificou o contato só por LID), e
 *  - os dígitos desse LID são exatamente o identificador guardado na conversa.
 * Melhor esforço: nunca lança e nunca altera o fluxo do webhook.
 */
export async function persistLidEvidence(
  // deno-lint-ignore no-explicit-any
  supabase: MetadataClient | any, // `any`: o cliente real do supabase-js estoura a inferência de tipos (TS2589)
  conversationId: string | null | undefined,
  remoteJid: unknown,
  storedIdentifier: unknown,
  log: (...a: unknown[]) => void = console.warn,
): Promise<LidEvidenceResult> {
  try {
    if (!conversationId || !isLidJid(remoteJid)) return "skipped";
    const lid = (remoteJid as string).trim().split("@")[0].split(":")[0];
    if (lid !== String(storedIdentifier ?? "")) return "skipped"; // evidência não corresponde ao identificador guardado
    const { data, error } = await supabase.from("webchat_conversations").select("metadata").eq("id", conversationId).maybeSingle();
    if (error) return "error";
    const meta = (data?.metadata && typeof data.metadata === "object" ? data.metadata : {}) as Record<string, unknown>;
    if (meta.wa_lid === lid) return "already";
    const { error: upErr } = await supabase.from("webchat_conversations").update({ metadata: { ...meta, wa_lid: lid } }).eq("id", conversationId);
    if (upErr) return "error";
    return "persisted";
  } catch (_e) {
    try { log("[uazapi-webhook] persistLidEvidence failed (non-fatal)"); } catch (_e2) { /* ok */ }
    return "error";
  }
}

/**
 * O provedor pode devolver, no objeto `chat` do evento, `wa_chatid` = número do PRÓPRIO chip (observado em
 * 02/10/2026 em contatos só-LID depois de receberem envio ao `<lid>@lid`). Nesse caso o remetente derivado do chat é o
 * dono da conexão e a mensagem seria tratada como "eco do aparelho" e descartada. O objeto `message` do mesmo evento
 * continua trazendo o par verdadeiro (`chatid`, `sender_lid`, `sender_pn`, `sender`).
 *
 * Só é chamada quando o remetente derivado == número do chip. Devolve o primeiro JID de pessoa (`@lid` ou
 * `@s.whatsapp.net`) que NÃO seja o do chip e NÃO seja de grupo; null se não houver evidência (nada muda).
 */
export function recoverPeerJidWhenChatIsOwn(payload: unknown, ownDigits: string): string | null {
  if (!ownDigits) return null;
  const root = (payload ?? {}) as Record<string, any>;
  const d = (root.data && typeof root.data === "object" ? root.data : root) as Record<string, any>;
  const msg = (d.message && typeof d.message === "object" ? d.message : {}) as Record<string, any>;
  const chat = (d.chat && typeof d.chat === "object" ? d.chat : {}) as Record<string, any>;
  const candidates: unknown[] = [msg.chatid, msg.sender_lid, msg.sender_pn, chat.wa_chatlid, msg.sender];
  for (const c of candidates) {
    if (typeof c !== "string") continue;
    const jid = c.trim();
    if (!/^\d{5,}(?::\d+)?@(lid|s\.whatsapp\.net)$/i.test(jid)) continue;
    if (jid.split("@")[0].split(":")[0] === ownDigits) continue;
    return jid;
  }
  return null;
}

