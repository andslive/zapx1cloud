// Replaces {{variable}} placeholders in agent prompts with real org/product/conversation data.

export interface PromptVariableContext {
  organization?: {
    name?: string | null;
    refund_policy?: string | null;
    payment_policy?: string | null;
  } | null;
  product?: {
    name?: string | null;
    description?: string | null;
    benefits?: string | null;
    objections?: string | null;
    plans?: string | null;
    pricing?: any;
    payment_conditions?: string | null;
    guarantee?: string | null;
    bonuses?: string | null;
    discount_policy?: string | null;
    knowledge_base?: string | null;
  } | null;
  agent?: {
    name?: string | null;
  } | null;
  conversation?: {
    channel?: string | null;
    channel_identifier?: string | null;
    orchestrator_context?: string | null;
    question_count?: number | null;
  } | null;
  message?: string;
  products_list?: string;
  support_knowledge_base?: string;
}

function valueOrEmpty(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'string') return v;
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

function pricingToText(pricing: any): string {
  if (!pricing) return '';
  if (typeof pricing === 'string') return pricing;
  if (Array.isArray(pricing)) {
    return pricing
      .map((p: any) => {
        const label = p.label || p.name || p.plan || '';
        const price = p.price ?? p.value ?? p.amount ?? '';
        return label || price ? `${label} ${price}`.trim() : '';
      })
      .filter(Boolean)
      .join(' · ');
  }
  if (typeof pricing === 'object') {
    return Object.entries(pricing)
      .map(([k, v]) => `${k}: ${valueOrEmpty(v)}`)
      .join(' · ');
  }
  return String(pricing);
}

export function injectPromptVariables(
  template: string,
  ctx: PromptVariableContext
): string {
  if (!template) return template;

  const map: Record<string, string> = {
    organization_name: valueOrEmpty(ctx.organization?.name),
    refund_deadline: valueOrEmpty(ctx.organization?.refund_policy),
    payment_policy: valueOrEmpty(ctx.organization?.payment_policy),
    product_name: valueOrEmpty(ctx.product?.name),
    product_description: valueOrEmpty(ctx.product?.description),
    product_benefits: valueOrEmpty(ctx.product?.benefits),
    product_objections: valueOrEmpty(ctx.product?.objections),
    product_plans: valueOrEmpty(ctx.product?.plans),
    product_prices: pricingToText(ctx.product?.pricing),
    payment_conditions: valueOrEmpty(ctx.product?.payment_conditions),
    product_guarantee: valueOrEmpty(ctx.product?.guarantee),
    product_bonuses: valueOrEmpty(ctx.product?.bonuses),
    discount_policy: valueOrEmpty(ctx.product?.discount_policy),
    support_knowledge_base: valueOrEmpty(ctx.support_knowledge_base ?? ctx.product?.knowledge_base),
    agent_name: valueOrEmpty(ctx.agent?.name),
    channel: valueOrEmpty(ctx.conversation?.channel),
    channel_identifier: valueOrEmpty(ctx.conversation?.channel_identifier),
    orchestrator_context: valueOrEmpty(ctx.conversation?.orchestrator_context),
    question_count: valueOrEmpty(ctx.conversation?.question_count ?? 0),
    message: valueOrEmpty(ctx.message),
    products_list: valueOrEmpty(ctx.products_list),
  };

  return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (full, key) => {
    if (key in map) return map[key];
    return full; // leave unknown placeholders as-is for visibility
  });
}
