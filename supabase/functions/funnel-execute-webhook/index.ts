import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

interface ExecuteRequest {
  funnel_id: string;
  block_id: string;
  collected_data?: Record<string, unknown>;
  responses?: Record<string, unknown>;
  lead_id?: string | null;
  tracking?: Record<string, unknown>;
  trigger_source?: string; // 'on_block' | 'on_complete'
}

interface WebhookConfig {
  url?: string;
  method?: string;
  headers?: Record<string, string>;
  body_template?: string;
  save_response_to?: string;
  trigger?: 'on_block' | 'on_complete';
  wait_for_response?: boolean;
  timeout_ms?: number;
}

// Substitui {{var}} em strings, aceitando objetos aninhados via JSON.stringify
function substituteVariables(template: string, vars: Record<string, unknown>): string {
  if (!template) return template;
  return template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (match, key: string) => {
    const value = vars[key];
    if (value === undefined || value === null) return '';
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
  });
}

function buildVariablePool(input: ExecuteRequest, funnel: any): Record<string, unknown> {
  const pool: Record<string, unknown> = {
    ...(input.collected_data || {}),
    ...(input.responses || {}),
    ...(input.tracking || {}),
    lead_id: input.lead_id || '',
    funnel_id: input.funnel_id,
    funnel_name: funnel?.name || '',
    funnel_slug: funnel?.slug || '',
    block_id: input.block_id,
    timestamp: new Date().toISOString(),
  };
  return pool;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const startedAt = Date.now();
  let logRow: Record<string, unknown> = {};

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const input: ExecuteRequest = await req.json();
    if (!input.funnel_id || !input.block_id) {
      return new Response(JSON.stringify({ error: 'funnel_id and block_id are required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Carrega funil
    const { data: funnel, error: funnelError } = await supabase
      .from('capture_funnels')
      .select('id, name, slug, organization_id, flow_blocks')
      .eq('id', input.funnel_id)
      .maybeSingle();

    if (funnelError || !funnel) {
      return new Response(JSON.stringify({ error: 'Funnel not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Encontra o bloco
    const blocks = (funnel.flow_blocks as any[]) || [];
    const block = blocks.find((b) => b.id === input.block_id);
    if (!block || block.type !== 'webhook') {
      return new Response(JSON.stringify({ error: 'Webhook block not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const cfg: WebhookConfig = block.data?.webhook_config || {};
    if (!cfg.url) {
      return new Response(JSON.stringify({ error: 'Webhook URL not configured' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const vars = buildVariablePool(input, funnel);
    const url = substituteVariables(cfg.url, vars);
    const method = (cfg.method || 'POST').toUpperCase();
    const headersTemplate = cfg.headers || {};
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    for (const [k, v] of Object.entries(headersTemplate)) {
      headers[k] = substituteVariables(String(v), vars);
    }

    let body: string | undefined = undefined;
    let parsedBody: unknown = null;
    if (method !== 'GET' && method !== 'HEAD') {
      if (cfg.body_template && cfg.body_template.trim()) {
        body = substituteVariables(cfg.body_template, vars);
      } else {
        // Default: envia tudo coletado
        body = JSON.stringify({
          funnel_id: input.funnel_id,
          funnel_name: funnel.name,
          block_id: input.block_id,
          lead_id: input.lead_id || null,
          collected_data: input.collected_data || {},
          responses: input.responses || {},
          tracking: input.tracking || {},
        });
      }
      try {
        parsedBody = body ? JSON.parse(body) : null;
      } catch {
        parsedBody = body;
      }
    }

    const timeoutMs = cfg.timeout_ms || 10000;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    logRow = {
      funnel_id: input.funnel_id,
      block_id: input.block_id,
      lead_id: input.lead_id || null,
      organization_id: funnel.organization_id,
      request_url: url,
      request_method: method,
      request_headers: headers,
      request_body: parsedBody,
      trigger_source: input.trigger_source || 'on_block',
    };

    let responseStatus = 0;
    let responseBody = '';
    let success = false;
    let errorMessage: string | null = null;
    let responseData: unknown = null;

    try {
      const res = await fetch(url, {
        method,
        headers,
        body: method === 'GET' || method === 'HEAD' ? undefined : body,
        signal: controller.signal,
      });
      responseStatus = res.status;
      responseBody = await res.text();
      success = res.ok;
      try { responseData = JSON.parse(responseBody); } catch { responseData = responseBody; }
      if (!res.ok) errorMessage = `HTTP ${res.status}`;
    } catch (err) {
      const e = err as Error;
      errorMessage = e.name === 'AbortError' ? `Timeout após ${timeoutMs}ms` : e.message;
      success = false;
    } finally {
      clearTimeout(timer);
    }

    const duration = Date.now() - startedAt;

    // Grava log (não bloqueia resposta)
    await supabase.from('funnel_webhook_logs').insert({
      ...logRow,
      response_status: responseStatus || null,
      response_body: responseBody.slice(0, 50000),
      success,
      error_message: errorMessage,
      duration_ms: duration,
    });

    return new Response(
      JSON.stringify({
        success,
        status: responseStatus,
        response_data: responseData,
        error: errorMessage,
        duration_ms: duration,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[funnel-execute-webhook] Error:', error);
    // Tenta registrar o erro mesmo assim
    try {
      const supabase = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      );
      if ((logRow as any).funnel_id) {
        await supabase.from('funnel_webhook_logs').insert({
          ...logRow,
          response_status: null,
          response_body: null,
          success: false,
          error_message: errorMessage,
          duration_ms: Date.now() - startedAt,
        });
      }
    } catch (_) { /* ignore */ }

    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
