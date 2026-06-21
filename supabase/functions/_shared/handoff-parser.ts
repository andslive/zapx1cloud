// Detects [HANDOFF:xxx] tags emitted by specialist agents at the end of their reply
// and returns the cleaned text plus the handoff destination.
//
// Three families of tags are supported:
//
//   1) [HANDOFF:role]                — role-based handoff (closer/sdr/cs/support/financial/humano)
//                                      → resolved by `agent_type` + same product
//   2) [HANDOFF_TO_AGENT:Nome]       — direct handoff to another AI agent by NAME
//                                      → resolved by `name ILIKE %Nome%` (admin-only path)
//   3) [HANDOFF_TO_USER:Nome]        — handoff to a HUMAN team member by NAME
//                                      → resolved by `profiles.full_name ILIKE %Nome%`

export type HandoffTarget = 'closer' | 'sdr' | 'cs' | 'support' | 'financial' | 'humano' | null;

export type HandoffKind = 'role' | 'agent_name' | 'user_name';

export interface HandoffParseResult {
  cleanText: string;
  /** Legacy: only filled when kind === 'role'. */
  handoffTo: HandoffTarget;
  /** Discriminator for the new tag families. */
  kind: HandoffKind | null;
  /** When kind === 'agent_name' or 'user_name', this is the freeform name from the tag. */
  targetName: string | null;
  rawTag: string | null;
}

const ROLE_TAG_REGEX = /\[HANDOFF:\s*(closer|sdr|cs|support|financial|humano|human)\s*\]/i;
const AGENT_NAME_TAG_REGEX = /\[HANDOFF_TO_AGENT:\s*([^\]]+?)\s*\]/i;
const USER_NAME_TAG_REGEX = /\[HANDOFF_TO_USER:\s*([^\]]+?)\s*\]/i;

export function parseHandoffTag(text: string): HandoffParseResult {
  const empty: HandoffParseResult = {
    cleanText: text,
    handoffTo: null,
    kind: null,
    targetName: null,
    rawTag: null,
  };
  if (!text) return empty;

  // Priority: USER name > AGENT name > role-based.
  // Reason: a Chief-of-Staff response that explicitly names a human is the most
  // intentional form and must win over generic role tags.
  const userMatch = text.match(USER_NAME_TAG_REGEX);
  if (userMatch) {
    return {
      cleanText: text.replace(USER_NAME_TAG_REGEX, '').trimEnd(),
      handoffTo: null,
      kind: 'user_name',
      targetName: userMatch[1].trim(),
      rawTag: userMatch[0],
    };
  }

  const agentMatch = text.match(AGENT_NAME_TAG_REGEX);
  if (agentMatch) {
    return {
      cleanText: text.replace(AGENT_NAME_TAG_REGEX, '').trimEnd(),
      handoffTo: null,
      kind: 'agent_name',
      targetName: agentMatch[1].trim(),
      rawTag: agentMatch[0],
    };
  }

  const roleMatch = text.match(ROLE_TAG_REGEX);
  if (roleMatch) {
    const targetRaw = roleMatch[1].toLowerCase();
    const target: HandoffTarget =
      targetRaw === 'human' ? 'humano' : (targetRaw as HandoffTarget);
    return {
      cleanText: text.replace(ROLE_TAG_REGEX, '').trimEnd(),
      handoffTo: target,
      kind: 'role',
      targetName: null,
      rawTag: roleMatch[0],
    };
  }

  return empty;
}

// Map a handoff target ("closer", "cs", etc.) to the agent_role/agent_type
// used in the product_agents table.
export function handoffTargetToAgentRole(target: HandoffTarget): string | null {
  if (!target) return null;
  switch (target) {
    case 'closer': return 'closer';
    case 'sdr': return 'sdr';
    case 'cs': return 'cs';
    case 'support': return 'support';
    case 'financial': return 'financial';
    case 'humano': return 'humano';
    default: return null;
  }
}
