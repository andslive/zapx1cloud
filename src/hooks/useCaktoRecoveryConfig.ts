import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

export interface CaktoRecoveryConfig {
  id?: string;
  organization_id: string;
  is_enabled: boolean;
  recovery_agent_id: string | null;
  trigger_on_abandoned: boolean;
  trigger_on_paid: boolean;
  trigger_on_refunded: boolean;
  delay_seconds: number;
  cooldown_minutes: number;
}

const DEFAULT_CONFIG = (orgId: string): CaktoRecoveryConfig => ({
  organization_id: orgId,
  is_enabled: false,
  recovery_agent_id: null,
  trigger_on_abandoned: true,
  trigger_on_paid: true,
  trigger_on_refunded: false,
  delay_seconds: 0,
  cooldown_minutes: 60,
});

export function useCaktoRecoveryConfig() {
  const { profile } = useAuth();
  const orgId = profile?.organization_id;

  return useQuery({
    queryKey: ['cakto-recovery-config', orgId],
    queryFn: async () => {
      if (!orgId) return null;
      const { data, error } = await supabase
        .from('cakto_recovery_config')
        .select('*')
        .eq('organization_id', orgId)
        .maybeSingle();
      if (error) throw error;
      return (data ?? DEFAULT_CONFIG(orgId)) as CaktoRecoveryConfig;
    },
    enabled: !!orgId,
  });
}

export function useSaveCaktoRecoveryConfig() {
  const qc = useQueryClient();
  const { profile } = useAuth();
  const orgId = profile?.organization_id;

  return useMutation({
    mutationFn: async (cfg: Partial<CaktoRecoveryConfig>) => {
      if (!orgId) throw new Error('sem organização');
      const payload = { ...DEFAULT_CONFIG(orgId), ...cfg, organization_id: orgId };
      const { data, error } = await supabase
        .from('cakto_recovery_config')
        .upsert(payload, { onConflict: 'organization_id' })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cakto-recovery-config', orgId] });
      toast.success('Configuração salva');
    },
    onError: (e: any) => toast.error(e?.message ?? 'Erro ao salvar'),
  });
}

export function useCaktoRecoveryDispatches(limit = 30) {
  const { profile } = useAuth();
  const orgId = profile?.organization_id;

  return useQuery({
    queryKey: ['cakto-recovery-dispatches', orgId, limit],
    queryFn: async () => {
      if (!orgId) return [];
      const { data, error } = await supabase
        .from('cakto_recovery_dispatches')
        .select('*')
        .eq('organization_id', orgId)
        .order('created_at', { ascending: false })
        .limit(limit);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!orgId,
    refetchInterval: 300_000, // 30s -> 5min (config raramente alterada)
    refetchIntervalInBackground: false,
  });
}
