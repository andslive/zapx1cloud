import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export function useWebhookHealthStats() {
  return useQuery({
    queryKey: ['webhook-health-stats'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('webhook_stats')
        .select('*')
        .single();

      if (error) throw error;
      return data;
    },
    refetchInterval: 30000, // Refetch every 30 seconds
  });
}

export function useWebhookHealthLogs(limit = 50) {
  return useQuery({
    queryKey: ['webhook-health-logs', limit],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('webhook_health')
        .select('id, connection_id, phone, message_id, message_type, webhook_received, processed, flow_started, pixel_sent, error, created_at')
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) throw error;
      return data;
    },
    refetchInterval: 60000, // 10s -> 60s (audit Cloud Usage)
    refetchIntervalInBackground: false,
  });
}

export function useConnectionStatus() {
  return useQuery({
    queryKey: ['connection-webhook-status'],
    queryFn: async () => {
      // Limita janela: últimas 1h e 500 linhas (era SELECT * sem limite)
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const { data, error } = await supabase
        .from('webhook_health')
        .select('connection_id, created_at')
        .gte('created_at', oneHourAgo)
        .order('created_at', { ascending: false })
        .limit(500);

      if (error) throw error;

      // Group by connection_id and find last activity
      const status: Record<string, { last_activity: string; is_down: boolean }> = {};
      const now = new Date();

      data?.forEach(log => {
        if (!log.connection_id) return;
        if (!status[log.connection_id]) {
          const lastActivity = new Date(log.created_at);
          const diffMins = (now.getTime() - lastActivity.getTime()) / 60000;
          status[log.connection_id] = {
            last_activity: log.created_at,
            is_down: diffMins > 10
          };
        }
      });

      return status;
    },
    refetchInterval: 120000, // 60s -> 2min
    refetchIntervalInBackground: false,
  });
}
