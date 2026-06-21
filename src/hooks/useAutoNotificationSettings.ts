import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

export interface AutoNotificationSettings {
  id: string;
  organization_id: string;
  stalled_lead_enabled: boolean;
  stalled_lead_days: number;
  goal_achieved_enabled: boolean;
  commission_approved_enabled: boolean;
  daily_report_enabled: boolean;
  daily_report_hour: number;
  daily_report_send_email: boolean;
  // Agente Admin Executivo
  admin_agent_enabled?: boolean;
  admin_whatsapp_number?: string | null;
  admin_user_id?: string | null;
  daily_summary_enabled?: boolean;
  daily_summary_hour?: number;
  weekly_report_enabled?: boolean;
  weekly_report_dow?: number;
  weekly_report_hour?: number;
  realtime_alerts_enabled?: boolean;
  alert_high_value_threshold?: number;
  alert_unattended_minutes?: number;
  alert_offline_minutes?: number;
  alert_agent_error_threshold?: number;
  alert_meeting_changes?: boolean;
  alert_goal_achieved?: boolean;
  // Novos campos do Agente Admin Executivo (centralizados no agente)
  monitored_product_ids?: string[] | null;
  summary_kpis?: string[] | null;
  weekly_include_comparison?: boolean | null;
  alert_product_volume_spike?: boolean | null;
  alert_product_volume_spike_pct?: number | null;
  alert_critical_product_idle_hours?: number | null;
  created_at: string;
  updated_at: string;
}

export function useAutoNotificationSettings() {
  const { profile } = useAuth();
  
  return useQuery({
    queryKey: ['auto-notification-settings', profile?.organization_id],
    queryFn: async () => {
      if (!profile?.organization_id) return null;
      
      const { data, error } = await supabase
        .from('auto_notification_settings')
        .select('*')
        .eq('organization_id', profile.organization_id)
        .maybeSingle();
      
      if (error) throw error;
      return data as AutoNotificationSettings | null;
    },
    enabled: !!profile?.organization_id,
  });
}

export function useCreateAutoNotificationSettings() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();
  
  return useMutation({
    mutationFn: async (settings: Partial<AutoNotificationSettings>) => {
      if (!profile?.organization_id) throw new Error('No organization');
      
      const { data, error } = await supabase
        .from('auto_notification_settings')
        .insert({
          organization_id: profile.organization_id,
          ...settings,
        })
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['auto-notification-settings'] });
      toast.success('Configurações salvas com sucesso!');
    },
    onError: (error) => {
      console.error('Error creating settings:', error);
      toast.error('Erro ao salvar configurações');
    },
  });
}

export function useUpdateAutoNotificationSettings() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();
  
  return useMutation({
    mutationFn: async (settings: Partial<AutoNotificationSettings>) => {
      if (!profile?.organization_id) throw new Error('No organization');
      
      const { data, error } = await supabase
        .from('auto_notification_settings')
        .update(settings)
        .eq('organization_id', profile.organization_id)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['auto-notification-settings'] });
      toast.success('Configurações atualizadas com sucesso!');
    },
    onError: (error) => {
      console.error('Error updating settings:', error);
      toast.error('Erro ao atualizar configurações');
    },
  });
}

export function useSaveAutoNotificationSettings() {
  const { data: existingSettings } = useAutoNotificationSettings();
  const createSettings = useCreateAutoNotificationSettings();
  const updateSettings = useUpdateAutoNotificationSettings();
  
  return useMutation({
    mutationFn: async (settings: Partial<AutoNotificationSettings>) => {
      if (existingSettings?.id) {
        return updateSettings.mutateAsync(settings);
      } else {
        return createSettings.mutateAsync(settings);
      }
    },
  });
}
