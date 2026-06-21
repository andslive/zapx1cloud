import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

export interface OrchestratorConfig {
  id: string;
  organization_id: string;
  is_enabled: boolean;
  orchestrator_agent_id: string | null;
  max_triage_questions: number;
  min_confidence: number;
  fallback_to_human_after: number;
  created_at: string;
  updated_at: string;
}

export function useOrchestratorConfig() {
  const { profile } = useAuth();
  const orgId = profile?.organization_id;

  return useQuery({
    queryKey: ['orchestrator-config', orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('organization_orchestrator_config')
        .select('*')
        .eq('organization_id', orgId!)
        .maybeSingle();
      if (error) throw error;
      return data as OrchestratorConfig | null;
    },
  });
}

export function useUpsertOrchestratorConfig() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();

  return useMutation({
    mutationFn: async (patch: Partial<OrchestratorConfig>) => {
      if (!profile?.organization_id) throw new Error('Sem organização');
      const payload = {
        organization_id: profile.organization_id,
        is_enabled: patch.is_enabled ?? false,
        orchestrator_agent_id: patch.orchestrator_agent_id ?? null,
        max_triage_questions: patch.max_triage_questions ?? 2,
        min_confidence: patch.min_confidence ?? 0.6,
        fallback_to_human_after: patch.fallback_to_human_after ?? 2,
      };
      const { data, error } = await supabase
        .from('organization_orchestrator_config')
        .upsert(payload, { onConflict: 'organization_id' })
        .select()
        .single();
      if (error) throw error;
      return data as OrchestratorConfig;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orchestrator-config'] });
      toast.success('Configuração salva');
    },
    onError: (err: any) => {
      console.error(err);
      toast.error('Erro ao salvar configuração');
    },
  });
}
