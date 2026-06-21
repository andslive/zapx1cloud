import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

export interface AgentSpecialist {
  id: string;
  organization_id: string;
  agent_id: string;
  role: string;
  display_name: string;
  description: string | null;
  is_active: boolean;
  priority: number;
  created_at: string;
  updated_at: string;
}

export interface AgentRoutingRule {
  id: string;
  organization_id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  priority: number;
  match_stage_ids: string[] | null;
  match_tag_ids: string[] | null;
  match_product_ids: string[] | null;
  match_channels: string[] | null;
  match_events: string[] | null;
  deal_value_min: number | null;
  deal_value_max: number | null;
  target_specialist_id: string;
  match_count: number;
  last_matched_at: string | null;
  created_at: string;
  updated_at: string;
}

export function useAgentSpecialists() {
  const { profile } = useAuth();
  const orgId = profile?.organization_id;

  return useQuery({
    queryKey: ['agent-specialists', orgId],
    queryFn: async () => {
      if (!orgId) return [] as AgentSpecialist[];
      const { data, error } = await (supabase as any)
        .from('agent_specialists')
        .select('*')
        .eq('organization_id', orgId)
        .order('priority', { ascending: true });
      if (error) throw error;
      return (data ?? []) as AgentSpecialist[];
    },
    enabled: !!orgId,
  });
}

export function useUpsertSpecialist() {
  const { profile } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Partial<AgentSpecialist> & { id?: string }) => {
      const orgId = profile?.organization_id;
      if (!orgId) throw new Error('sem organização');
      const payload = { ...input, organization_id: orgId };
      const { data, error } = await (supabase as any)
        .from('agent_specialists')
        .upsert(payload)
        .select()
        .single();
      if (error) throw error;
      return data as AgentSpecialist;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['agent-specialists'] });
      toast.success('Especialista salvo');
    },
    onError: (e: any) => toast.error(e.message ?? 'Falha ao salvar'),
  });
}

export function useDeleteSpecialist() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any)
        .from('agent_specialists')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['agent-specialists'] });
      qc.invalidateQueries({ queryKey: ['agent-routing-rules'] });
      toast.success('Especialista removido');
    },
    onError: (e: any) => toast.error(e.message),
  });
}

export function useAgentRoutingRules() {
  const { profile } = useAuth();
  const orgId = profile?.organization_id;
  return useQuery({
    queryKey: ['agent-routing-rules', orgId],
    queryFn: async () => {
      if (!orgId) return [] as AgentRoutingRule[];
      const { data, error } = await (supabase as any)
        .from('agent_routing_rules')
        .select('*')
        .eq('organization_id', orgId)
        .order('priority', { ascending: true });
      if (error) throw error;
      return (data ?? []) as AgentRoutingRule[];
    },
    enabled: !!orgId,
  });
}

export function useUpsertRoutingRule() {
  const { profile } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Partial<AgentRoutingRule> & { id?: string }) => {
      const orgId = profile?.organization_id;
      if (!orgId) throw new Error('sem organização');
      const payload = { ...input, organization_id: orgId };
      const { data, error } = await (supabase as any)
        .from('agent_routing_rules')
        .upsert(payload)
        .select()
        .single();
      if (error) throw error;
      return data as AgentRoutingRule;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['agent-routing-rules'] });
      toast.success('Regra salva');
    },
    onError: (e: any) => toast.error(e.message),
  });
}

export function useDeleteRoutingRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any)
        .from('agent_routing_rules')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['agent-routing-rules'] });
      toast.success('Regra removida');
    },
    onError: (e: any) => toast.error(e.message),
  });
}
