import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface DoppusWebhookLog {
  id: string;
  organization_id: string;
  product_id: string | null;
  event_type: string;
  lead_id: string | null;
  source: string;
  executed_actions: Array<{ action: string; success: boolean; error?: string; detail?: unknown }>;
  event_data: Record<string, any>;
  created_at: string;
  lead?: { id: string; name: string | null; email: string | null; phone: string | null } | null;
}

export function useDoppusWebhookLogs(
  organizationId: string | null | undefined,
  filterInternalProductId?: string | null,
) {
  return useQuery({
    queryKey: ['doppus-webhook-logs', organizationId, filterInternalProductId ?? 'all'],
    enabled: !!organizationId,
    refetchInterval: 60_000, // 15s -> 60s
    refetchIntervalInBackground: false,
    queryFn: async () => {
      let q = supabase
        .from('post_sale_event_logs')
        .select('id, organization_id, product_id, event_type, lead_id, source, executed_actions, event_data, created_at, lead:leads(id, name, email, phone)')
        .eq('organization_id', organizationId!)
        .eq('source', 'doppus')
        .order('created_at', { ascending: false })
        .limit(50);
      if (filterInternalProductId) q = q.eq('product_id', filterInternalProductId);
      const { data, error } = await q;
      if (error) throw error;
      return (data || []) as unknown as DoppusWebhookLog[];
    },
  });
}
