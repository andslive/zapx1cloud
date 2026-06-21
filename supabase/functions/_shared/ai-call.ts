// High-level AI call helper that automatically uses the org's routing config
// (OpenAI direct or Lovable Gateway) and applies fallback when allowed.
// Drop-in replacement for raw fetch() to ai.gateway.lovable.dev/v1/chat/completions.

import { resolveAIConfig, logAIConfig, prepareAIRequestBody, ResolvedAIConfig, AICapability } from './ai-router.ts';

const LOVABLE_GATEWAY = 'https://ai.gateway.lovable.dev/v1/chat/completions';

export interface AICallOptions {
  organizationId?: string | null;
  capability?: AICapability | string;
  /** Original Lovable-style model the caller wants. Will be adapted if provider is OpenAI. */
  model?: string;
  /** Body fields beyond model+messages (tools, response_format, temperature, stream, etc.) */
  body: Record<string, any>;
  /** Optional label for logs */
  label?: string;
  /** If true, returns the Response without throwing on !ok (caller handles streaming etc) */
  returnRaw?: boolean;
  /** Supabase client to read routing/credentials. If omitted, uses Lovable directly. */
  supabase?: any;
}

async function lovableFallbackResponse(model: string, body: Record<string, any>) {
  const lovableKey = Deno.env.get('LOVABLE_API_KEY') ?? '';
  return await fetch(LOVABLE_GATEWAY, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${lovableKey}`,
    },
    body: JSON.stringify({ ...body, model }),
  });
}

/**
 * Performs an AI chat completion respecting the org routing config.
 * Returns the Response. Caller is responsible for parsing JSON / handling stream.
 *
 * Behavior:
 *  - If routing → openai with valid key: calls OpenAI directly with adapted model.
 *  - If openai call fails (not 429/401) and fallback_to_lovable=true: retries on Lovable.
 *  - If routing → lovable: calls Lovable Gateway.
 */
export async function aiChat(opts: AICallOptions): Promise<{
  response: Response;
  config: ResolvedAIConfig;
  usedFallback: boolean;
}> {
  const { organizationId, capability = 'agent_chat', model, body, label, supabase } = opts;

  let cfg: ResolvedAIConfig;
  if (supabase && organizationId) {
    cfg = await resolveAIConfig(supabase, organizationId, capability, model);
  } else {
    const lovableKey = Deno.env.get('LOVABLE_API_KEY') ?? '';
    cfg = {
      endpoint: LOVABLE_GATEWAY,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${lovableKey}` },
      model: model || 'google/gemini-3-flash-preview',
      provider: 'lovable',
      source: 'gateway',
      allowFallback: false,
      apiKey: lovableKey,
    };
  }

  if (label) logAIConfig(label, cfg);

  let response = await fetch(cfg.endpoint, {
    method: 'POST',
    headers: cfg.headers,
    body: JSON.stringify(prepareAIRequestBody(body, cfg)),
  });

  let usedFallback = false;
  if (!response.ok && cfg.provider !== 'lovable' && cfg.allowFallback && response.status !== 429) {
    console.warn(`[${label ?? 'ai-call'}] ${cfg.provider} returned ${response.status}, falling back to Lovable AI`);
    response = await lovableFallbackResponse(model || 'google/gemini-3-flash-preview', body);
    usedFallback = true;
  }

  return { response, config: cfg, usedFallback };
}

/** Friendly error message helper for non-ok responses. */
export async function describeAIError(response: Response, providerLabel: string): Promise<string> {
  const text = await response.text().catch(() => '');
  if (response.status === 429) return 'Limite de requisições excedido. Tente novamente em alguns segundos.';
  if (response.status === 402) {
    return providerLabel === 'openai'
      ? 'Sua conta OpenAI está sem créditos ou bloqueada. Verifique em platform.openai.com/billing.'
      : 'Créditos de IA esgotados. Adicione créditos na sua conta Lovable.';
  }
  if (response.status === 401 || response.status === 403) {
    return `Chave do provedor "${providerLabel}" inválida ou sem permissão. Verifique em Integrações → IA.`;
  }
  return `Erro do provedor ${providerLabel} (${response.status}): ${text.slice(0, 200) || response.statusText}`;
}
