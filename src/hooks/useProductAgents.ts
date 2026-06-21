import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { ProductAgent } from '@/types/agents';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

export function useProductAgents(productId: string) {
  const { profile } = useAuth();

  return useQuery({
    queryKey: ['product-agents', productId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('product_agents')
        .select('*')
        .eq('product_id', productId)
        .order('is_default', { ascending: false })
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as ProductAgent[];
    },
    enabled: !!productId && !!profile,
  });
}

export interface AgentWithProduct extends ProductAgent {
  product?: { id: string; name: string } | null;
}

export function useAllAgents() {
  const { profile } = useAuth();

  return useQuery({
    queryKey: ['all-agents', profile?.organization_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('product_agents')
        .select('*, product:products(id, name)')
        .eq('organization_id', profile!.organization_id!)
        .order('is_default', { ascending: false })
        .order('created_at', { ascending: false });

      if (error) throw error;
      return (data || []) as unknown as AgentWithProduct[];
    },
    enabled: !!profile?.organization_id,
  });
}

export function useProductAgent(agentId: string) {
  return useQuery({
    queryKey: ['product-agent', agentId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('product_agents')
        .select('*')
        .eq('id', agentId)
        .single();

      if (error) throw error;
      return data as ProductAgent;
    },
    enabled: !!agentId,
  });
}

// Fields that belong to auto_notification_settings, NOT to product_agents.
// They must be stripped before insert/update on product_agents to avoid
// "column does not exist" errors. They are persisted separately via
// useSaveAutoNotificationSettings inside AdminExecutivePanel.
const NON_AGENT_FIELDS_PREFIXES = ['admin_', 'daily_summary', 'weekly_', 'realtime_alerts', 'alert_'];
const NON_AGENT_FIELDS_EXACT = new Set([
  'monitored_product_ids',
  'summary_kpis',
  // Campos relacionais vindos de selects com join (ex.: all-agents -> product:products)
  // não existem na tabela product_agents e precisam ser ignorados no save.
  'product',
]);

function stripNonAgentFields<T extends Record<string, unknown>>(payload: T): Partial<T> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(payload)) {
    if (NON_AGENT_FIELDS_EXACT.has(k)) continue;
    if (NON_AGENT_FIELDS_PREFIXES.some((p) => k.startsWith(p))) continue;
    out[k] = v;
  }
  return out as Partial<T>;
}

export function useCreateAgent() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();

  return useMutation({
    mutationFn: async (agentRaw: Partial<ProductAgent>) => {
      if (!profile?.organization_id) throw new Error('Organization not found');

      const agent = stripNonAgentFields(agentRaw);
      const insertData = {
        name: agent.name || '',
        product_id: agent.product_id ?? null,
        organization_id: profile.organization_id,
        created_by: profile.id,
        primary_objective: agent.primary_objective || '',
        agent_type: agent.agent_type || 'custom',
        description: agent.description,
        avatar_url: agent.avatar_url,
        can_do: agent.can_do || [],
        cannot_do: agent.cannot_do || [],
        handoff_triggers: agent.handoff_triggers || [],
        end_conversation_triggers: agent.end_conversation_triggers || [],
        tone_style: agent.tone_style || 'friendly',
        message_style: agent.message_style || 'balanced',
        always_end_with_question: agent.always_end_with_question ?? true,
        additional_prompt: agent.additional_prompt,
        required_phrases: agent.required_phrases || [],
        prohibited_phrases: agent.prohibited_phrases || [],
        auto_tag_leads: agent.auto_tag_leads ?? true,
        default_tags: agent.default_tags || [],
        can_update_pipeline: agent.can_update_pipeline ?? true,
        can_create_tasks: agent.can_create_tasks ?? true,
        can_schedule_meetings: agent.can_schedule_meetings ?? true,
        can_apply_tags: agent.can_apply_tags ?? false,
        can_update_lead: agent.can_update_lead ?? false,
        can_send_emails: agent.can_send_emails ?? false,
        can_send_materials: agent.can_send_materials ?? false,
        can_trigger_flows: agent.can_trigger_flows ?? false,
        can_transfer: agent.can_transfer ?? false,
        can_notify: agent.can_notify ?? false,
        can_add_notes: agent.can_add_notes ?? false,
        can_start_cadence: agent.can_start_cadence ?? false,
        can_qualify: agent.can_qualify ?? false,
        tool_configs: (agent.tool_configs ?? {}) as Record<string, unknown>,
        active_in_funnels: agent.active_in_funnels ?? true,
        active_in_chat: agent.active_in_chat ?? true,
        active_in_widget: agent.active_in_widget ?? true,
        active_in_inbox: agent.active_in_inbox ?? true,
        active_in_copilot: agent.active_in_copilot ?? false,
        active_in_whatsapp: agent.active_in_whatsapp ?? true,
        active_in_instagram: agent.active_in_instagram ?? true,
        active_in_facebook: agent.active_in_facebook ?? true,
        is_active: agent.is_active ?? true,
        is_default: agent.is_default ?? false,
        activation_keywords: agent.activation_keywords ?? [],
        activation_phrases: agent.activation_phrases ?? [],
        activation_priority: agent.activation_priority ?? 0,
        activation_scope: agent.activation_scope ?? 'all',
          takeover_on_match: agent.takeover_on_match ?? true,
          evolution_instance_id: agent.evolution_instance_id ?? null,
          humanization: (agent as any).humanization ?? {},
        };

      // Check if this will be the first agent for the product — auto-set as default
      // (skip for global agents since "default" only makes sense per-product)
      if (insertData.product_id) {
        const { count } = await supabase
          .from('product_agents')
          .select('id', { count: 'exact', head: true })
          .eq('product_id', insertData.product_id);
        
        if (count === 0) {
          insertData.is_default = true;
        }
      }

      const { data, error } = await supabase
        .from('product_agents')
        .insert(insertData as any)
        .select()
        .single();

      if (error) throw error;
      return data as ProductAgent;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['product-agents', data.product_id] });
      queryClient.invalidateQueries({ queryKey: ['all-agents'] });
      toast.success('Agente criado com sucesso!');
    },
    onError: (error) => {
      console.error('Error creating agent:', error);
      toast.error('Erro ao criar agente');
    },
  });
}

export function useUpdateAgent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...updatesRaw }: Partial<ProductAgent> & { id: string }) => {
      const updates = stripNonAgentFields(updatesRaw);
      const { data, error } = await supabase
        .from('product_agents')
        .update(updates as any)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data as ProductAgent;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['product-agents', data.product_id] });
      queryClient.invalidateQueries({ queryKey: ['product-agent', data.id] });
      queryClient.invalidateQueries({ queryKey: ['all-agents'] });
      toast.success('Agente atualizado com sucesso!');
    },
    onError: (error) => {
      console.error('Error updating agent:', error);
      toast.error('Erro ao atualizar agente');
    },
  });
}

export function useDeleteAgent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, productId }: { id: string; productId: string | null }) => {
      const { error } = await supabase
        .from('product_agents')
        .delete()
        .eq('id', id);

      if (error) throw error;
      return { id, productId };
    },
    onSuccess: ({ productId }) => {
      queryClient.invalidateQueries({ queryKey: ['product-agents', productId] });
      queryClient.invalidateQueries({ queryKey: ['all-agents'] });
      toast.success('Agente excluído com sucesso!');
    },
    onError: (error) => {
      console.error('Error deleting agent:', error);
      toast.error('Erro ao excluir agente');
    },
  });
}

export function useSetDefaultAgent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, productId }: { id: string; productId: string }) => {
      // First, unset all defaults for this product
      await supabase
        .from('product_agents')
        .update({ is_default: false })
        .eq('product_id', productId);

      // Then set the new default
      const { data, error } = await supabase
        .from('product_agents')
        .update({ is_default: true })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data as ProductAgent;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['product-agents', data.product_id] });
      toast.success('Agente definido como padrão!');
    },
    onError: (error) => {
      console.error('Error setting default agent:', error);
      toast.error('Erro ao definir agente padrão');
    },
  });
}

export function useToggleAgentStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      const { data, error } = await supabase
        .from('product_agents')
        .update({ is_active: isActive })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data as ProductAgent;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({
        predicate: (query) =>
          query.queryKey[0] === 'all-agents' ||
          query.queryKey[0] === 'product-agents' ||
          query.queryKey[0] === 'product-agent',
      });
      toast.success(data.is_active ? 'Agente ativado!' : 'Agente desativado!');
    },
    onError: (error) => {
      console.error('Error toggling agent status:', error);
      toast.error('Erro ao alterar status do agente');
    },
  });
}
