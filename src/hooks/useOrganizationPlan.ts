import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface EffectivePlan {
  plan_id: string | null;
  plan_name: string;
  plan_slug: string;
  limits: {
    max_users: number;
    max_connections: number;
    max_sectors: number;
    max_products: number;
    max_contacts: number;
    max_messages_month: number;
    max_ai_tokens_month: number;
  };
  features: Record<string, boolean>;
}

export function useOrganizationEffectivePlan(orgId?: string | null) {
  return useQuery({
    queryKey: ['org-effective-plan', orgId],
    queryFn: async () => {
      if (!orgId) return null;
      const { data, error } = await supabase.rpc('get_organization_effective_limits', {
        p_org_id: orgId,
      });
      if (error) throw error;
      return data as unknown as EffectivePlan | null;
    },
    enabled: !!orgId,
  });
}

export function useChangeOrganizationPlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ orgId, planId }: { orgId: string; planId: string | null }) => {
      const { error } = await supabase
        .from('organizations')
        .update({ plan_id: planId })
        .eq('id', orgId);
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['org-effective-plan', vars.orgId] });
      qc.invalidateQueries({ queryKey: ['organizations'] });
    },
  });
}
