import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export type PostSaleEvent = 'paid' | 'abandoned' | 'refunded';

export interface PostSaleLink {
  label: string;
  url: string;
  when_to_offer?: string;
}

export interface PostSaleScenarioFilters {
  product_cakto_id?: string;
  min_amount?: number;
  max_amount?: number;
  required_orderbumps?: string[];
}

export interface PostSaleScenario {
  id: string;
  organization_id: string;
  name: string;
  description: string | null;
  trigger_event: PostSaleEvent;
  priority: number;
  is_active: boolean;
  instruction: string;
  links: PostSaleLink[];
  tags_to_apply: string[];
  filters: PostSaleScenarioFilters;
  created_at: string;
  updated_at: string;
}

export type PostSaleScenarioInput = Omit<
  PostSaleScenario,
  'id' | 'organization_id' | 'created_at' | 'updated_at'
>;

export function usePostSaleScenarios() {
  const { profile } = useAuth();
  const orgId = profile?.organization_id;

  return useQuery({
    queryKey: ['post-sale-scenarios', orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('agent_post_sale_scenarios')
        .select('*')
        .eq('organization_id', orgId!)
        .order('trigger_event')
        .order('priority', { ascending: false });
      if (error) throw error;
      return ((data ?? []) as any[]).map((d) => ({
        ...d,
        links: Array.isArray(d.links) ? d.links : [],
        tags_to_apply: Array.isArray(d.tags_to_apply) ? d.tags_to_apply : [],
        filters: d.filters && typeof d.filters === 'object' ? d.filters : {},
      })) as PostSaleScenario[];
    },
  });
}

export function useSavePostSaleScenario() {
  const qc = useQueryClient();
  const { profile } = useAuth();
  const orgId = profile?.organization_id;

  return useMutation({
    mutationFn: async (input: PostSaleScenarioInput & { id?: string }) => {
      if (!orgId) throw new Error('Sem organização');
      const payload: any = {
        organization_id: orgId,
        name: input.name,
        description: input.description,
        trigger_event: input.trigger_event,
        priority: input.priority,
        is_active: input.is_active,
        instruction: input.instruction,
        links: input.links as any,
        tags_to_apply: input.tags_to_apply,
        filters: input.filters as any,
      };
      if (input.id) {
        const { error } = await supabase
          .from('agent_post_sale_scenarios')
          .update(payload)
          .eq('id', input.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('agent_post_sale_scenarios')
          .insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['post-sale-scenarios'] }),
  });
}

export function useDeletePostSaleScenario() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('agent_post_sale_scenarios')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['post-sale-scenarios'] }),
  });
}
