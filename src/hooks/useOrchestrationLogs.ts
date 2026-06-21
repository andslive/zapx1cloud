import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export interface OrchestrationLog {
  id: string;
  organization_id: string;
  conversation_id: string | null;
  lead_id: string | null;
  channel: string | null;
  message_in: string | null;
  produto_id: string | null;
  produto_nome: string | null;
  intencao: string | null;
  confianca: number | null;
  contexto_extraido: string | null;
  agent_routed_to: string | null;
  action: string;
  raw_response: any;
  created_at: string;
}

export function useOrchestrationLogs(limit = 20) {
  const { profile } = useAuth();
  const orgId = profile?.organization_id;

  return useQuery({
    queryKey: ['orchestration-logs', orgId, limit],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('orchestration_logs')
        .select('*')
        .eq('organization_id', orgId!)
        .order('created_at', { ascending: false })
        .limit(limit);
      if (error) throw error;
      return data as OrchestrationLog[];
    },
  });
}
