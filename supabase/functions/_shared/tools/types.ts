// Tipos compartilhados do registry de ferramentas dos agentes.
// Cada ferramenta declara seu schema (formato OpenAI tool calling),
// recebe um contexto de execução e retorna um resultado padronizado.

export interface ToolContext {
  organizationId: string;
  agentId?: string | null;
  agentName?: string | null;
  leadId?: string | null;
  conversationId?: string | null;
  channel?: string | null;
  // Cliente Supabase com SERVICE ROLE (já autenticado pelo caller).
  supabase: any;
}

export interface ToolResult {
  success: boolean;
  data?: any;
  error?: string;
  // Mensagem curta que o agente pode usar para confirmar a ação ao lead.
  user_message?: string;
}

export interface ToolDefinition {
  name: string;
  description: string;
  // JSON Schema (estilo OpenAI function-calling).
  parameters: Record<string, any>;
  // Custo estimado por execução em centavos (para limites de orçamento).
  estimated_cost_cents?: number;
  // Categorias para filtrar quais tools um agente específico pode usar.
  categories: Array<'crm' | 'finance' | 'marketing' | 'operations' | 'communication'>;
  handler: (input: Record<string, any>, ctx: ToolContext) => Promise<ToolResult>;
}

export interface ToolCallSchema {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, any>;
  };
}
