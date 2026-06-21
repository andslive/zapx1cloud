import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface AgentToolExecution {
  id: string;
  organization_id: string;
  agent_id: string | null;
  agent_name: string | null;
  lead_id: string | null;
  conversation_id: string | null;
  channel: string | null;
  tool_name: string;
  input: Record<string, any>;
  output: any;
  success: boolean;
  error_message: string | null;
  duration_ms: number | null;
  estimated_cost_cents: number | null;
  created_at: string;
}

export interface ToolExecutionFilters {
  organizationId?: string;
  toolName?: string;
  successOnly?: boolean;
  errorsOnly?: boolean;
  limit?: number;
}

export function useAgentToolExecutions(filters: ToolExecutionFilters = {}) {
  return useQuery({
    queryKey: ['agent-tool-executions', filters],
    queryFn: async () => {
      let query = supabase
        .from('agent_tool_executions')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(filters.limit ?? 100);

      if (filters.organizationId) query = query.eq('organization_id', filters.organizationId);
      if (filters.toolName) query = query.eq('tool_name', filters.toolName);
      if (filters.successOnly) query = query.eq('success', true);
      if (filters.errorsOnly) query = query.eq('success', false);

      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as AgentToolExecution[];
    },
  });
}

export function useToolExecutionStats() {
  return useQuery({
    queryKey: ['agent-tool-execution-stats'],
    queryFn: async () => {
      const since = new Date();
      since.setDate(since.getDate() - 7);
      const { data, error } = await supabase
        .from('agent_tool_executions')
        .select('tool_name, success, duration_ms, estimated_cost_cents')
        .gte('created_at', since.toISOString());
      if (error) throw error;

      const rows = data ?? [];
      const total = rows.length;
      const successes = rows.filter((r: any) => r.success).length;
      const errors = total - successes;
      const avgDuration =
        rows.reduce((s: number, r: any) => s + (r.duration_ms ?? 0), 0) / Math.max(total, 1);
      const totalCostCents = rows.reduce(
        (s: number, r: any) => s + (r.estimated_cost_cents ?? 0),
        0,
      );

      const byTool: Record<string, { count: number; errors: number }> = {};
      rows.forEach((r: any) => {
        if (!byTool[r.tool_name]) byTool[r.tool_name] = { count: 0, errors: 0 };
        byTool[r.tool_name].count += 1;
        if (!r.success) byTool[r.tool_name].errors += 1;
      });

      return { total, successes, errors, avgDuration, totalCostCents, byTool };
    },
  });
}
