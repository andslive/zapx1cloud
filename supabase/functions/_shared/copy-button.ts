// Bloco "Botão Copiar" — payload do POST /send/menu da UazAPI.
//
// Uma única mensagem: imagem opcional no topo → texto/legenda (opcional) → botão "copiar".
// A UazAPI rejeita text:"" (400 "missing required fields in payload"), então sem legenda
// usamos U+200B (zero-width space), validado no celular: sem espaço perceptível.
// Formato do choice: "<rótulo>|copy:<valor>".
//
// Função pura (sem rede/DB) para ser validada localmente com e sem imagem.

/** Texto "vazio" aceito pela UazAPI: zero-width space. */
export const COPY_BUTTON_TEXT = "\u200B";

export interface CopyButtonInput {
  number: string;
  label: string;
  value: string;
  imageUrl?: string | null;
  /** Texto/legenda já com variáveis resolvidas; vazio/ausente => U+200B. */
  caption?: string | null;
}

export interface CopyButtonMenuPayload {
  number: string;
  type: "button";
  text: string;
  choices: string[];
  file?: string;
}

/** Remove "|" e quebras de linha do rótulo: "|" é o separador do choice. */
export function sanitizeCopyLabel(label: string): string {
  return String(label ?? "").replace(/[|\r\n]+/g, " ").replace(/\s+/g, " ").trim();
}

/** O valor vai após "copy:"; só quebras de linha são removidas (um "|" é válido no valor). */
export function sanitizeCopyValue(value: string): string {
  return String(value ?? "").replace(/[\r\n]+/g, " ").trim();
}

/** Legenda: mantém quebras de linha; sem conteúdo => U+200B (a UazAPI recusa ""). */
export function sanitizeCopyCaption(caption: string | null | undefined): string {
  const t = String(caption ?? "").replace(/\r\n?/g, "\n").replace(/\u200B/g, "").trim();
  return t || COPY_BUTTON_TEXT;
}

/** Retorna null se rótulo ou valor estiverem vazios (bloco não deve ser enviado). */
export function buildCopyButtonMenuPayload(
  input: CopyButtonInput,
): CopyButtonMenuPayload | null {
  const label = sanitizeCopyLabel(input.label);
  const value = sanitizeCopyValue(input.value);
  if (!label || !value) return null;

  const payload: CopyButtonMenuPayload = {
    number: input.number,
    type: "button",
    text: sanitizeCopyCaption(input.caption),
    choices: [`${label}|copy:${value}`],
  };
  const file = (input.imageUrl ?? "").trim();
  if (file) payload.file = file;
  return payload;
}
