import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

export interface QualityEvaluation {
  id: string;
  organization_id: string;
  conversation_id: string | null;
  agent_id: string | null;
  lead_id: string | null;
  evaluated_messages_count: number;
  score_overall: number | null;
  score_clarity: number | null;
  score_tone: number | null;
  score_objectivity: number | null;
  score_accuracy: number | null;
  score_conversion_potential: number | null;
  detected_objections: any;
  detected_intents: any;
  detected_issues: any;
  summary: string | null;
  improvement_suggestions: string | null;
  judge_model: string | null;
  created_at: string;
}

export interface PromptExperiment {
  id: string;
  organization_id: string;
  name: string;
  description: string | null;
  agent_id: string | null;
  status: 'draft' | 'running' | 'paused' | 'finished';
  primary_metric: string;
  starts_at: string | null;
  ends_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface PromptVariant {
  id: string;
  experiment_id: string;
  organization_id: string;
  label: string;
  prompt_override: string | null;
  prompt_mode: 'append' | 'replace';
  weight: number;
  impressions: number;
  conversions: number;
  total_score: number;
  evaluations_count: number;
}

export function useQualityEvaluations(limit = 100) {
  const { profile } = useAuth();
  const orgId = profile?.organization_id;
  return useQuery({
    queryKey: ['quality-evaluations', orgId, limit],
    queryFn: async () => {
      if (!orgId) return [] as QualityEvaluation[];
      const { data, error } = await (supabase as any)
        .from('ai_quality_evaluations')
        .select('*')
        .eq('organization_id', orgId)
        .order('created_at', { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data ?? []) as QualityEvaluation[];
    },
    enabled: !!orgId,
  });
}

export function useTriggerEvaluation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (conversation_id?: string) => {
      const { data, error } = await (supabase as any).functions.invoke(
        'evaluate-conversation',
        { body: conversation_id ? { conversation_id } : { batch_hours: 24, max_conversations: 30 } },
      );
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['quality-evaluations'] });
      toast.success(
        data?.evaluated != null
          ? `${data.evaluated} conversas avaliadas`
          : 'Avaliação disparada',
      );
    },
    onError: (e: any) => toast.error(e.message ?? 'Falha ao avaliar'),
  });
}

export function usePromptExperiments() {
  const { profile } = useAuth();
  const orgId = profile?.organization_id;
  return useQuery({
    queryKey: ['prompt-experiments', orgId],
    queryFn: async () => {
      if (!orgId) return [] as PromptExperiment[];
      const { data, error } = await (supabase as any)
        .from('ai_prompt_experiments')
        .select('*')
        .eq('organization_id', orgId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as PromptExperiment[];
    },
    enabled: !!orgId,
  });
}

export function usePromptVariants(experimentId: string | null) {
  return useQuery({
    queryKey: ['prompt-variants', experimentId],
    queryFn: async () => {
      if (!experimentId) return [] as PromptVariant[];
      const { data, error } = await (supabase as any)
        .from('ai_prompt_variants')
        .select('*')
        .eq('experiment_id', experimentId)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data ?? []) as PromptVariant[];
    },
    enabled: !!experimentId,
  });
}

export function useUpsertExperiment() {
  const { profile } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Partial<PromptExperiment> & { id?: string }) => {
      const orgId = profile?.organization_id;
      if (!orgId) throw new Error('sem organização');
      const payload = { ...input, organization_id: orgId };
      const { data, error } = await (supabase as any)
        .from('ai_prompt_experiments')
        .upsert(payload)
        .select()
        .single();
      if (error) throw error;
      return data as PromptExperiment;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['prompt-experiments'] });
      toast.success('Experimento salvo');
    },
    onError: (e: any) => toast.error(e.message),
  });
}

export function useDeleteExperiment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any)
        .from('ai_prompt_experiments')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['prompt-experiments'] });
      toast.success('Experimento removido');
    },
    onError: (e: any) => toast.error(e.message),
  });
}

export function useUpsertVariant() {
  const { profile } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Partial<PromptVariant> & { id?: string; experiment_id: string }) => {
      const orgId = profile?.organization_id;
      if (!orgId) throw new Error('sem organização');
      const payload = { ...input, organization_id: orgId };
      const { data, error } = await (supabase as any)
        .from('ai_prompt_variants')
        .upsert(payload)
        .select()
        .single();
      if (error) throw error;
      return data as PromptVariant;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['prompt-variants', vars.experiment_id] });
      toast.success('Variante salva');
    },
    onError: (e: any) => toast.error(e.message),
  });
}

export function useDeleteVariant() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any)
        .from('ai_prompt_variants')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['prompt-variants'] });
      toast.success('Variante removida');
    },
    onError: (e: any) => toast.error(e.message),
  });
}
