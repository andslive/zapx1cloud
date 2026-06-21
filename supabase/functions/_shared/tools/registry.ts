// Registry central de todas as ferramentas que os agentes podem executar.
// Para adicionar uma ferramenta nova: criar arquivo em ./impl/, importar e registrar aqui.

import type { ToolDefinition, ToolContext, ToolResult, ToolCallSchema } from './types.ts';
import { criarDealTool } from './impl/criar_deal.ts';
import { gerarLinkPagamentoTool } from './impl/gerar_link_pagamento.ts';
import { aplicarEtiquetaTool } from './impl/aplicar_etiqueta.ts';
import { agendarFollowupTool } from './impl/agendar_followup.ts';
import { consultarHistoricoClienteTool } from './impl/consultar_historico_cliente.ts';

const ALL_TOOLS: ToolDefinition[] = [
  criarDealTool,
  gerarLinkPagamentoTool,
  aplicarEtiquetaTool,
  agendarFollowupTool,
  consultarHistoricoClienteTool,
];

const TOOLS_BY_NAME = new Map(ALL_TOOLS.map((t) => [t.name, t]));

export function getTool(name: string): ToolDefinition | undefined {
  return TOOLS_BY_NAME.get(name);
}

export function listTools(filter?: {
  categories?: ToolDefinition['categories'];
  names?: string[];
}): ToolDefinition[] {
  return ALL_TOOLS.filter((t) => {
    if (filter?.names && !filter.names.includes(t.name)) return false;
    if (filter?.categories && !t.categories.some((c) => filter.categories!.includes(c))) return false;
    return true;
  });
}

// Converte uma lista de ferramentas para o formato esperado pelo Lovable AI Gateway / OpenAI.
export function toolsToOpenAISchema(tools: ToolDefinition[]): ToolCallSchema[] {
  return tools.map((t) => ({
    type: 'function' as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    },
  }));
}

// Executa uma ferramenta com auditoria automática + tratamento de erro.
export async function executeTool(
  name: string,
  input: Record<string, any>,
  ctx: ToolContext,
): Promise<ToolResult> {
  const tool = getTool(name);
  const startedAt = Date.now();

  if (!tool) {
    await logExecution(ctx, name, input, null, false, `Tool não encontrada: ${name}`, 0, 0);
    return { success: false, error: `Ferramenta desconhecida: ${name}` };
  }

  try {
    const result = await tool.handler(input, ctx);
    const duration = Date.now() - startedAt;
    await logExecution(
      ctx,
      name,
      input,
      result.data ?? null,
      result.success,
      result.error ?? null,
      duration,
      tool.estimated_cost_cents ?? 0,
    );
    return result;
  } catch (err: any) {
    const duration = Date.now() - startedAt;
    const errMsg = err?.message ?? String(err);
    console.error(`[tools] ${name} falhou:`, errMsg);
    await logExecution(ctx, name, input, null, false, errMsg, duration, 0);
    return { success: false, error: errMsg };
  }
}

async function logExecution(
  ctx: ToolContext,
  toolName: string,
  input: Record<string, any>,
  output: any,
  success: boolean,
  errorMessage: string | null,
  durationMs: number,
  costCents: number,
) {
  try {
    await ctx.supabase.from('agent_tool_executions').insert({
      organization_id: ctx.organizationId,
      agent_id: ctx.agentId ?? null,
      agent_name: ctx.agentName ?? null,
      lead_id: ctx.leadId ?? null,
      conversation_id: ctx.conversationId ?? null,
      channel: ctx.channel ?? null,
      tool_name: toolName,
      input,
      output,
      success,
      error_message: errorMessage,
      duration_ms: durationMs,
      estimated_cost_cents: costCents,
    });
  } catch (logErr) {
    console.error('[tools] falha ao registrar execução:', logErr);
  }
}

// Verifica se a organização ultrapassou limites de segurança (ex: muitas execuções/dia).
// Retorna { allowed, reason } — chamar antes de executeTool em loops do agente.
export async function checkSafetyLimits(
  ctx: ToolContext,
): Promise<{ allowed: boolean; reason?: string }> {
  const { data: limits } = await ctx.supabase
    .from('agent_safety_limits')
    .select('*')
    .eq('organization_id', ctx.organizationId)
    .maybeSingle();

  const maxPerDay = limits?.max_tool_executions_per_day ?? 5000;
  const maxCostCents = limits?.max_cost_cents_per_day ?? 50000;

  const since = new Date();
  since.setHours(0, 0, 0, 0);

  const { data: stats } = await ctx.supabase
    .from('agent_tool_executions')
    .select('estimated_cost_cents')
    .eq('organization_id', ctx.organizationId)
    .gte('created_at', since.toISOString());

  const count = stats?.length ?? 0;
  const totalCost = (stats ?? []).reduce(
    (sum: number, r: any) => sum + (r.estimated_cost_cents ?? 0),
    0,
  );

  if (count >= maxPerDay) {
    return { allowed: false, reason: 'Limite diário de execuções atingido' };
  }
  if (totalCost >= maxCostCents) {
    return { allowed: false, reason: 'Orçamento diário de IA atingido' };
  }
  return { allowed: true };
}
