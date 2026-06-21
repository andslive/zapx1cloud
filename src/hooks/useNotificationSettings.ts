import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

export interface NotificationSettings {
  user_id: string;
  organization_id: string | null;
  notify_new_tickets: boolean;
  notify_status_change: boolean;
  notify_new_messages: boolean;
  notify_groups: boolean;
  notify_unassigned_sector_tickets: boolean;
  notify_appointments: boolean;
  push_enabled: boolean;
}

export const NOTIFICATION_LABELS: Record<keyof Omit<NotificationSettings, 'user_id' | 'organization_id' | 'push_enabled'>, string> = {
  notify_new_tickets: 'Notificações de novos tickets',
  notify_status_change: 'Notificações de alteração de status',
  notify_new_messages: 'Notificações de novas mensagens',
  notify_groups: 'Notificações de grupos',
  notify_unassigned_sector_tickets: 'Notificações de tickets sem setor',
  notify_appointments: 'Notificações de agendamentos',
};

export function useNotificationSettings(userId: string | undefined) {
  return useQuery({
    queryKey: ['notification-settings', userId],
    queryFn: async () => {
      if (!userId) return null;
      const { data, error } = await supabase
        .from('user_notification_settings')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();
      if (error) throw error;
      return data as NotificationSettings | null;
    },
    enabled: !!userId,
  });
}

export function useUpsertNotificationSettings() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();
  return useMutation({
    mutationFn: async ({ userId, settings }: { userId: string; settings: Partial<NotificationSettings> }) => {
      const { data, error } = await supabase
        .from('user_notification_settings')
        .upsert({
          user_id: userId,
          organization_id: profile?.organization_id || null,
          ...settings,
        }, { onConflict: 'user_id' })
        .select()
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['notification-settings', vars.userId] });
    },
  });
}
