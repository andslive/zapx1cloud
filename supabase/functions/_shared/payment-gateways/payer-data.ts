// Dados do pagador: nome e e-mail automáticos, sem inventar dado.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Nome utilizável: rejeita telefone, JID/LID, IDs internos, @usuário solto e lixo. */
export function usableName(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const s = raw.replace(/\s+/g, " ").trim();
  if (s.length < 2 || s.length > 80) return null;
  if (UUID_RE.test(s)) return null;
  if (/@(s\.whatsapp\.net|lid|g\.us|c\.us)\b/i.test(s)) return null; // JID / LID
  if (/^[+\d\s().-]+$/.test(s)) return null; // só dígitos/pontuação = telefone ou ID
  if ((s.match(/\d/g) ?? []).length >= 7) return null; // número embutido
  if (!/\p{L}/u.test(s)) return null;
  return s;
}

export type NameSource = "lead" | "whatsapp_display_name" | "whatsapp_username";

/**
 * Ordem: nome do lead → nome de exibição do WhatsApp → @usuário (se o gateway aceitar).
 * `null` ⇒ pedir apenas o nome e retomar a mesma execução.
 */
export function resolvePayerName(input: {
  leadName?: unknown;
  whatsappDisplayName?: unknown;
  whatsappUsername?: unknown;
  gatewayAcceptsUsername?: boolean;
}): { name: string; source: NameSource } | null {
  const lead = usableName(input.leadName);
  if (lead) return { name: lead, source: "lead" };
  const disp = usableName(input.whatsappDisplayName);
  if (disp) return { name: disp, source: "whatsapp_display_name" };
  if (input.gatewayAcceptsUsername && typeof input.whatsappUsername === "string") {
    const u = input.whatsappUsername.trim();
    if (/^@[A-Za-z0-9._]{3,32}$/.test(u)) return { name: u, source: "whatsapp_username" };
  }
  return null;
}

export function validEmail(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const s = raw.trim();
  return s.length <= 254 && EMAIL_RE.test(s) ? s : null;
}

export interface AliasConfig {
  /** Domínio controlado pela operação, com recebimento configurado. */
  domain?: string | null;
  /** Confirmação por escrito de que a LeonaPay aceita alias operacional em payer.email. */
  providerAcceptsAlias?: boolean;
  enabled?: boolean;
}

/** Normaliza o nome para a parte local do alias: sem acento, minúsculas, só [a-z0-9]. */
export function normalizeForAlias(name: string): string {
  return name.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 40);
}

export function aliasAvailable(cfg?: AliasConfig): boolean {
  return !!(cfg?.enabled && cfg.providerAcceptsAlias && cfg.domain && /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(cfg.domain));
}

/** Parte local: primeiro.último nome normalizados ("João da Silva" → "joao.silva"); um só nome → "joao". */
export function aliasLocalPart(name: string): string {
  const words = name.split(/\s+/).map(normalizeForAlias).filter(Boolean);
  if (!words.length) return "";
  return (words.length > 1 ? `${words[0]}.${words[words.length - 1]}` : words[0]).slice(0, 40);
}

/** alias = primeiro.último + 3 dígitos (ex.: anderson.silva001@dominio). Só com alias habilitado. */
export function buildAliasEmail(name: string, seq: number, cfg?: AliasConfig): string | null {
  if (!aliasAvailable(cfg)) return null;
  const local = aliasLocalPart(name);
  if (!local) return null;
  return `${local}${String(seq % 1000).padStart(3, "0")}@${cfg!.domain!.toLowerCase()}`;
}

export type EmailResolution =
  | { email: string; source: "lead" | "alias" }
  | null; // null ⇒ pedir só o e-mail pelo WhatsApp

/** E-mail do lead primeiro; alias só se configurado E confirmado; senão pergunta. */
export function resolvePayerEmail(input: { leadEmail?: unknown; name: string; seq: number; alias?: AliasConfig }): EmailResolution {
  const lead = validEmail(input.leadEmail);
  if (lead) return { email: lead, source: "lead" };
  const alias = buildAliasEmail(input.name, input.seq, input.alias);
  return alias ? { email: alias, source: "alias" } : null;
}
