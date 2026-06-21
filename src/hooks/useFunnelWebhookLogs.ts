import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { FunnelWebhookLog } from '@/types/funnel';

export function useFunnelWebhookLogs(funnelId?: string, blockId?: string, limit = 50) {
  return useQuery({
    queryKey: ['funnel-webhook-logs', funnelId, blockId, limit],
    queryFn: async () => {
      if (!funnelId) return [];
      let q = supabase
        .from('funnel_webhook_logs')
        .select('*')
        .eq('funnel_id', funnelId)
        .order('created_at', { ascending: false })
        .limit(limit);
      if (blockId) q = q.eq('block_id', blockId);
      const { data, error } = await q;
      if (error) throw error;
      return (data || []) as FunnelWebhookLog[];
    },
    enabled: !!funnelId,
    refetchInterval: 60000, // 30s -> 60s
    refetchIntervalInBackground: false,
  });
}
