// Shared helper to match an incoming message against agents' activation triggers.
// Used by webchat-bot and whatsapp-webhook (and any future entry point) to
// auto-switch the active agent based on keywords/phrases.

export interface MatcherAgent {
  id: string;
  name?: string;
  is_active?: boolean;
  activation_keywords?: string[] | null;
  activation_phrases?: string[] | null;
  activation_priority?: number | null;
  activation_scope?: string | null; // 'all' | 'whatsapp' | 'chat' | 'inbox' | 'funnel'
  takeover_on_match?: boolean | null;
  updated_at?: string | null;
}

export type MatcherChannel = 'whatsapp' | 'chat' | 'inbox' | 'funnel';

export interface AgentMatchResult {
  agent: MatcherAgent;
  matched_term: string;
  match_type: 'phrase' | 'keyword';
}

/** Lowercase + strip diacritics + collapse whitespace. */
export function normalizeText(input: string): string {
  if (!input) return '';
  return input
    .toString()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function scopeMatchesChannel(scope: string | null | undefined, channel: MatcherChannel): boolean {
  const s = (scope || 'all').toLowerCase();
  if (s === 'all') return true;
  return s === channel;
}

/**
 * Returns the best matching agent for the given message, or null.
 * - phrases: substring match on normalized text
 * - keywords: word-boundary match on normalized text (>= 3 chars)
 * - tie-break: highest activation_priority, then most recently updated
 */
export function matchAgentByMessage(
  message: string,
  agents: MatcherAgent[],
  channel: MatcherChannel
): AgentMatchResult | null {
  if (!message || !agents || agents.length === 0) return null;
  const normMsg = normalizeText(message);
  if (!normMsg) return null;

  const candidates: AgentMatchResult[] = [];

  for (const agent of agents) {
    if (agent.is_active === false) continue;
    if (!scopeMatchesChannel(agent.activation_scope, channel)) continue;

    const phrases = (agent.activation_phrases || []).filter(Boolean);
    const keywords = (agent.activation_keywords || []).filter(Boolean);

    let matched: { term: string; type: 'phrase' | 'keyword' } | null = null;

    // Phrases first (more specific)
    for (const phrase of phrases) {
      const norm = normalizeText(phrase);
      if (norm && normMsg.includes(norm)) {
        matched = { term: phrase, type: 'phrase' };
        break;
      }
    }

    // Then keywords (word boundary, min 3 chars)
    if (!matched) {
      for (const kw of keywords) {
        const norm = normalizeText(kw);
        if (!norm || norm.length < 3) continue;
        const re = new RegExp(`\\b${escapeRegex(norm)}\\b`, 'i');
        if (re.test(normMsg)) {
          matched = { term: kw, type: 'keyword' };
          break;
        }
      }
    }

    if (matched) {
      candidates.push({ agent, matched_term: matched.term, match_type: matched.type });
    }
  }

  if (candidates.length === 0) return null;

  candidates.sort((a, b) => {
    const pa = a.agent.activation_priority ?? 0;
    const pb = b.agent.activation_priority ?? 0;
    if (pb !== pa) return pb - pa;
    const ua = a.agent.updated_at ? Date.parse(a.agent.updated_at) : 0;
    const ub = b.agent.updated_at ? Date.parse(b.agent.updated_at) : 0;
    return ub - ua;
  });

  return candidates[0];
}
