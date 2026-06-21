// Shared helpers for the Orchestrator's quick-reply menu.
// Used by webchat-bot to render menus and match user replies to options.

export type QuickMenuAction = 'transfer_to_agent' | 'transfer_to_human' | 'start_flow';

export interface QuickMenuOption {
  label: string;                       // text shown to the lead
  action: QuickMenuAction;
  target_agent_id?: string | null;     // when action = transfer_to_agent
  target_flow_id?: string | null;      // when action = start_flow
  human_queue?: string | null;         // optional label/queue for human handoff
}

const DEFAULT_INTRO = 'Como posso te ajudar?';
const DEFAULT_INVALID = 'Não entendi sua escolha. Responda com o número da opção (ex: 1, 2, 3).';

export function isValidMenuOption(opt: unknown): opt is QuickMenuOption {
  if (!opt || typeof opt !== 'object') return false;
  const o = opt as Record<string, unknown>;
  if (typeof o.label !== 'string' || !o.label.trim()) return false;
  if (
    o.action !== 'transfer_to_agent' &&
    o.action !== 'transfer_to_human' &&
    o.action !== 'start_flow'
  ) return false;
  return true;
}

export function sanitizeMenuOptions(raw: unknown): QuickMenuOption[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(isValidMenuOption).slice(0, 9); // cap at 9 to keep numeric input simple
}

export function formatMenuMessage(intro: string | null | undefined, options: QuickMenuOption[]): string {
  const header = (intro && intro.trim()) ? intro.trim() : DEFAULT_INTRO;
  const lines = options.map((opt, i) => `${i + 1}- ${opt.label.trim()}`);
  return `${header}\n\n${lines.join('\n')}`;
}

export function getInvalidMessage(custom: string | null | undefined): string {
  return (custom && custom.trim()) ? custom.trim() : DEFAULT_INVALID;
}

/**
 * Try to match a user message to a menu option.
 * Strategy:
 *   1. Exact numeric match ("1", "2", "3.")
 *   2. Leading-number match ("1 - quero saber", "1) quero")
 *   3. Exact label match (case/diacritic insensitive)
 *   4. Substring match on label (only if user text is >= 3 chars and unique)
 */
export function matchMenuOption(
  userMessage: string,
  options: QuickMenuOption[]
): { option: QuickMenuOption; index: number } | null {
  if (!userMessage || !options.length) return null;

  const text = userMessage.trim();
  if (!text) return null;

  // 1 + 2: extract leading number
  const numMatch = text.match(/^\s*([1-9])\b/);
  if (numMatch) {
    const idx = parseInt(numMatch[1], 10) - 1;
    if (idx >= 0 && idx < options.length) {
      return { option: options[idx], index: idx };
    }
  }

  const norm = (s: string) =>
    s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

  const userNorm = norm(text);

  // 3: exact label match
  for (let i = 0; i < options.length; i++) {
    if (norm(options[i].label) === userNorm) {
      return { option: options[i], index: i };
    }
  }

  // 4: substring match (only if user typed >= 3 chars and exactly one option contains it)
  if (userNorm.length >= 3) {
    const hits: number[] = [];
    for (let i = 0; i < options.length; i++) {
      if (norm(options[i].label).includes(userNorm)) hits.push(i);
    }
    if (hits.length === 1) {
      return { option: options[hits[0]], index: hits[0] };
    }
  }

  return null;
}
