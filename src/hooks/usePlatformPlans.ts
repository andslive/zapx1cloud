import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface PlatformPlan {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  is_public: boolean;
  is_active: boolean;
  is_default: boolean;
  display_order: number;

  price_monthly: number;
  price_yearly: number;
  trial_days: number;
  grace_period_days: number;

  max_users: number;
  max_connections: number;
  max_sectors: number;
  max_products: number;
  max_contacts: number;
  max_messages_month: number;
  max_ai_tokens_month: number;

  feature_whatsapp: boolean;
  feature_facebook: boolean;
  feature_instagram: boolean;
  feature_campaigns: boolean;
  feature_scheduling: boolean;
  feature_internal_chat: boolean;
  feature_external_api: boolean;
  feature_kanban: boolean;
  feature_pipeline: boolean;
  feature_integrations: boolean;
  feature_audio_transcription_ai: boolean;
  feature_text_correction_ai: boolean;
  feature_ai_agents: boolean;
  feature_voice_agents: boolean;
  feature_outreach: boolean;
  feature_capture_funnels: boolean;
  feature_forms: boolean;
  feature_webhooks: boolean;

  checkout_url: string | null;
  highlight_label: string | null;

  extra_features: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export type PlatformPlanInput = Partial<Omit<PlatformPlan, 'id' | 'created_at' | 'updated_at'>> & {
  name: string;
  slug: string;
};

export function useAllPlans() {
  return useQuery({
    queryKey: ['platform-plans'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('platform_plans')
        .select('*')
        .order('display_order', { ascending: true });
      if (error) throw error;
      return (data || []) as PlatformPlan[];
    },
  });
}

export function useActivePlans() {
  return useQuery({
    queryKey: ['platform-plans', 'active'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('platform_plans')
        .select('*')
        .eq('is_active', true)
        .order('display_order', { ascending: true });
      if (error) throw error;
      return (data || []) as PlatformPlan[];
    },
  });
}

export function usePlan(id?: string | null) {
  return useQuery({
    queryKey: ['platform-plan', id],
    queryFn: async () => {
      if (!id) return null;
      const { data, error } = await supabase
        .from('platform_plans')
        .select('*')
        .eq('id', id)
        .maybeSingle();
      if (error) throw error;
      return data as PlatformPlan | null;
    },
    enabled: !!id,
  });
}

export function usePlanUsageCounts() {
  return useQuery({
    queryKey: ['platform-plans', 'usage'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('organizations')
        .select('plan_id');
      if (error) throw error;
      const counts: Record<string, number> = {};
      (data || []).forEach((row: any) => {
        if (row.plan_id) counts[row.plan_id] = (counts[row.plan_id] || 0) + 1;
      });
      return counts;
    },
  });
}

export function useCreatePlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (plan: PlatformPlanInput) => {
      const { data, error } = await supabase
        .from('platform_plans')
        .insert(plan as any)
        .select()
        .single();
      if (error) throw error;
      return data as PlatformPlan;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['platform-plans'] });
    },
  });
}

export function useUpdatePlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: PlatformPlanInput & { id: string }) => {
      const { data, error } = await supabase
        .from('platform_plans')
        .update(updates as any)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data as PlatformPlan;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['platform-plans'] });
    },
  });
}

export function useDeletePlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('platform_plans')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['platform-plans'] });
    },
  });
}
