// Bloco "Botões / Menu" — botões de resposta reais do WhatsApp via POST /send/menu da UazAPI.
// ≤ 3 opções: type "button" (botões de resposta). 4–10: type "list" (lista selecionável), o único formato
// do WhatsApp para mais de 3 opções. Formato do choice: "<texto>|<id>". Função pura (sem rede/DB).

export interface QuickOption { id: string; label: string }

export const QUICK_MAX_BUTTONS = 3;
export const QUICK_MAX_OPTIONS = 10;

const clean = (s: unknown, max: number) =>
  String(s ?? "").replace(/[|\r\n]+/g, " ").replace(/\s+/g, " ").trim().slice(0, max);

export function buildQuickButtonsMenuPayload(input: {
  number: string; text: string; options: QuickOption[]; footer?: string | null;
}): Record<string, unknown> | null {
  const opts = (input.options ?? [])
    .map((o) => ({ id: clean(o.id, 80), label: o.label }))
    .filter((o) => o.id && String(o.label ?? "").trim())
    .slice(0, QUICK_MAX_OPTIONS);
  if (!opts.length) return null;
  const text = String(input.text ?? "").trim() || "​";
  const asButtons = opts.length <= QUICK_MAX_BUTTONS;
  const payload: Record<string, unknown> = {
    number: input.number,
    type: asButtons ? "button" : "list",
    text,
    choices: opts.map((o) => `${clean(o.label, asButtons ? 20 : 24)}|${o.id}`),
  };
  if (!asButtons) payload.listButton = "Ver opções";
  const footer = clean(input.footer, 60);
  if (footer) payload.footerText = footer;
  return payload;
}

/** Texto numerado: usado como reserva se a UazAPI recusar o menu interativo. */
export function numberedMenuText(text: string, options: QuickOption[]): string {
  return `${String(text ?? "").trim() || "Escolha uma opção:"}\n\n` +
    options.map((o, i) => `${i + 1}) ${String(o.label ?? "").trim()}`).join("\n");
}
