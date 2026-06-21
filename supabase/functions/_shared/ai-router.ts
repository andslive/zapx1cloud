// Shared AI router: resolves which provider/endpoint/key to use based on org_ai_routing
// + org_ai_credentials. Falls back to Lovable AI Gateway when external key missing
// (only if fallback_to_lovable=true).

const LOVABLE_GATEWAY = 'https://ai.gateway.lovable.dev/v1/chat/completions';
const OPENAI_CHAT_ENDPOINT = 'https://api.openai.com/v1/chat/completions';
const OPENAI_EMBEDDINGS_ENDPOINT = 'https://api.openai.com/v1/embeddings';
const OPENAI_TRANSCRIPTIONS_ENDPOINT = 'https://api.openai.com/v1/audio/transcriptions';
const DEFAULT_MODEL = 'google/gemini-3-flash-preview';

export type AICapability =
  | 'agent_chat'
  | 'sales_copilot'
  | 'audio_transcription'
  | 'image_vision'
  | 'content_generation'
  | 'analysis_insights'
  | 'embeddings';

export interface ResolvedAIConfig {
  endpoint: string;
  headers: Record<string, string>;
  model: string;
  provider: 'lovable' | 'openai' | string;
  source: 'external_key' | 'gateway' | 'fallback_gateway';
  // Whether retry on Lovable is allowed if external call fails (other than 429)
  allowFallback: boolean;
  apiKey: string;
}

/**
 * Maps a Lovable-prefixed model to the equivalent for an external provider.
 * Used when org configured external provider but call site passes a Lovable model.
 */
const MODEL_MAP_TO_OPENAI: Record<string, string> = {
  'google/gemini-3-flash-preview': 'gpt-5-mini',
  'google/gemini-3.1-pro-preview': 'gpt-5',
  'google/gemini-2.5-flash': 'gpt-5-mini',
  'google/gemini-2.5-flash-lite': 'gpt-5-nano',
  'google/gemini-2.5-pro': 'gpt-5',
  'openai/gpt-5': 'gpt-5',
  'openai/gpt-5-mini': 'gpt-5-mini',
  'openai/gpt-5-nano': 'gpt-5-nano',
  'openai/gpt-5.2': 'gpt-5.2',
};

function adaptModelForProvider(model: string, provider: string): string {
  if (!model) return model;
  if (provider === 'openai') {
    if (MODEL_MAP_TO_OPENAI[model]) return MODEL_MAP_TO_OPENAI[model];
    if (model.startsWith('openai/')) return model.slice('openai/'.length);
    // Unknown prefix → strip provider prefix if present
    if (model.includes('/')) return model.split('/').pop()!;
    return model;
  }
  return model;
}

export function prepareAIRequestBody(body: Record<string, any>, cfg: ResolvedAIConfig): Record<string, any> {
  const payload: Record<string, any> = { ...body, model: cfg.model };

  if (cfg.provider === 'openai' && String(cfg.model || '').startsWith('gpt-5')) {
    if (payload.max_tokens !== undefined && payload.max_completion_tokens === undefined) {
      payload.max_completion_tokens = payload.max_tokens;
    }
    delete payload.max_tokens;
    if (payload.temperature !== undefined && payload.temperature !== 1) {
      delete payload.temperature;
    }
  }

  return payload;
}

/**
 * Resolves AI configuration for an organization.
 * - Reads org_ai_routing for the given capability (default 'agent_chat').
 * - If provider is external (openai) AND a credential exists, returns config to call that provider directly.
 * - Otherwise returns Lovable AI Gateway config.
 */
export async function resolveAIConfig(
  supabase: any,
  organizationId: string | null | undefined,
  capability: AICapability | string = 'agent_chat',
  /** Optional model hint from caller. Will be adapted if provider differs. */
  preferredModel?: string,
): Promise<ResolvedAIConfig> {
  const lovableKey = Deno.env.get('LOVABLE_API_KEY') || '';
  const lovableConfig: ResolvedAIConfig = {
    endpoint: LOVABLE_GATEWAY,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${lovableKey}`,
    },
    model: preferredModel || DEFAULT_MODEL,
    provider: 'lovable',
    source: 'gateway',
    allowFallback: false,
    apiKey: lovableKey,
  };

  if (!organizationId) return lovableConfig;

  try {
    const { data: routing } = await supabase
      .from('org_ai_routing')
      .select('provider, model, fallback_to_lovable')
      .eq('organization_id', organizationId)
      .eq('capability', capability)
      .maybeSingle();

    if (!routing) return lovableConfig;

    const provider = (routing.provider || 'lovable').toLowerCase();
    const routedModel = (routing.model || preferredModel || DEFAULT_MODEL) as string;
    const allowFallback = routing.fallback_to_lovable !== false;

    // Lovable: just use the configured model
    if (provider === 'lovable') {
      return { ...lovableConfig, model: routedModel };
    }

    // External provider: try to load credential
    const { data: cred } = await supabase
      .from('org_ai_credentials')
      .select('api_key_encrypted')
      .eq('organization_id', organizationId)
      .eq('provider', provider)
      .maybeSingle();

    const apiKey = cred?.api_key_encrypted as string | undefined;

    if (!apiKey) {
      if (allowFallback) {
        console.warn(
          `[ai-router] No ${provider} key for org ${organizationId} (cap=${capability}), falling back to Lovable`,
        );
        return { ...lovableConfig, model: preferredModel || DEFAULT_MODEL, source: 'fallback_gateway' };
      }
      throw new Error(
        `Sem chave de API para o provedor "${provider}". Cadastre em Integrações → ${provider.toUpperCase()} ou ative o fallback.`,
      );
    }

    if (provider === 'openai') {
      return {
        endpoint: OPENAI_CHAT_ENDPOINT,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        model: adaptModelForProvider(routedModel, 'openai'),
        provider: 'openai',
        source: 'external_key',
        allowFallback,
        apiKey,
      };
    }

    // Anthropic / Gemini direct calls require payload adapters not implemented yet.
    if (provider === 'anthropic' || provider === 'gemini' || provider === 'google') {
      console.warn(
        `[ai-router] Direct ${provider} calls not implemented yet — routing via Lovable AI Gateway`,
      );
      return { ...lovableConfig, model: routedModel };
    }

    if (allowFallback) {
      console.warn(`[ai-router] Unknown provider "${provider}", falling back to Lovable`);
      return { ...lovableConfig, model: routedModel, source: 'fallback_gateway' };
    }
    throw new Error(`Provedor de IA desconhecido "${provider}".`);
  } catch (err: any) {
    if (
      err?.message?.startsWith('Sem chave') ||
      err?.message?.startsWith('Provedor de IA')
    ) {
      throw err;
    }
    console.warn('[ai-router] Lookup failed, using Lovable default:', err);
    return lovableConfig;
  }
}

/**
 * Returns the embeddings endpoint config (OpenAI direct or Lovable fallback).
 * Lovable AI Gateway does not currently expose embeddings; if Lovable is selected
 * we still call OpenAI but require a key.
 */
export async function resolveEmbeddingsConfig(
  supabase: any,
  organizationId: string | null | undefined,
): Promise<ResolvedAIConfig> {
  const cfg = await resolveAIConfig(supabase, organizationId, 'embeddings', 'text-embedding-3-small');
  // Always call OpenAI embeddings endpoint regardless of provider routing,
  // unless we have an explicit OpenAI key.
  if (cfg.provider === 'openai') {
    return { ...cfg, endpoint: OPENAI_EMBEDDINGS_ENDPOINT, model: cfg.model || 'text-embedding-3-small' };
  }
  // Lovable doesn't support embeddings — try platform-level OPENAI_API_KEY as last resort.
  const fallbackKey = Deno.env.get('OPENAI_API_KEY');
  if (fallbackKey) {
    return {
      endpoint: OPENAI_EMBEDDINGS_ENDPOINT,
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${fallbackKey}` },
      model: 'text-embedding-3-small',
      provider: 'openai',
      source: 'gateway',
      allowFallback: false,
      apiKey: fallbackKey,
    };
  }
  throw new Error('Embeddings requerem uma chave OpenAI configurada na organização ou na plataforma.');
}

/**
 * Returns transcription endpoint config (OpenAI Whisper / gpt-4o-transcribe).
 */
export async function resolveTranscriptionConfig(
  supabase: any,
  organizationId: string | null | undefined,
): Promise<ResolvedAIConfig> {
  const cfg = await resolveAIConfig(supabase, organizationId, 'audio_transcription', 'gpt-4o-transcribe');
  if (cfg.provider === 'openai') {
    return { ...cfg, endpoint: OPENAI_TRANSCRIPTIONS_ENDPOINT, model: cfg.model || 'gpt-4o-transcribe' };
  }
  const fallbackKey = Deno.env.get('OPENAI_API_KEY');
  if (fallbackKey) {
    return {
      endpoint: OPENAI_TRANSCRIPTIONS_ENDPOINT,
      headers: { Authorization: `Bearer ${fallbackKey}` },
      model: 'gpt-4o-transcribe',
      provider: 'openai',
      source: 'gateway',
      allowFallback: false,
      apiKey: fallbackKey,
    };
  }
  throw new Error('Transcrição requer uma chave OpenAI configurada.');
}

/**
 * Convenience logger so logs across all call sites look identical.
 */
export function logAIConfig(label: string, cfg: ResolvedAIConfig) {
  console.log(
    `[${label}] AI Provider: ${cfg.provider} | Model: ${cfg.model} | Source: ${cfg.source}`,
  );
}
