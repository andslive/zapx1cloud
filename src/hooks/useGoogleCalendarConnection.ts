import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import type { Tables } from '@/integrations/supabase/types';

type GoogleCalendarConnectionRow = Tables<'google_calendar_connections'>;

export function useGoogleCalendarConnection() {
  const { user, profile } = useAuth();
  const queryClient = useQueryClient();

  // Query user's Google Calendar connection
  const connectionQuery = useQuery({
    queryKey: ['google-calendar-connection', user?.id],
    queryFn: async () => {
      if (!user?.id) return null;

      const { data, error } = await supabase
        .from('google_calendar_connections')
        .select('*')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .maybeSingle();

      if (error) throw error;
      return data;
    },
    enabled: !!user?.id,
  });

  // Check if organization has OAuth configured
  const oauthConfigQuery = useQuery({
    queryKey: ['google-calendar-oauth-config', profile?.organization_id],
    queryFn: async () => {
      if (!profile?.organization_id) return null;

      const { data, error } = await supabase
        .from('integration_settings')
        .select('is_configured, settings')
        .eq('organization_id', profile.organization_id)
        .eq('integration_type', 'google_calendar_oauth')
        .maybeSingle();

      if (error && error.code !== 'PGRST116') throw error;
      
      const settings = data?.settings as { clientId?: string } | null;
      return {
        isConfigured: data?.is_configured && !!settings?.clientId,
      };
    },
    enabled: !!profile?.organization_id,
  });

  // Start OAuth connection
  const connectMutation = useMutation({
    mutationFn: async () => {
      if (!user?.id || !profile?.organization_id) {
        throw new Error('Usuário não autenticado');
      }

      const redirectUrl = `${window.location.origin}${window.location.pathname}`;

      const { data, error } = await supabase.functions.invoke('google-calendar-auth', {
        body: {
          userId: user.id,
          organizationId: profile.organization_id,
          redirectUrl,
        },
      });

      if (error) throw error;
      if (!data?.authUrl) throw new Error('Falha ao gerar URL de autorização');

      // Redirect to Google OAuth
      window.location.href = data.authUrl;
    },
    onError: (error) => {
      toast.error('Erro ao conectar: ' + error.message);
    },
  });

  // Disconnect Google Calendar
  const disconnectMutation = useMutation({
    mutationFn: async () => {
      if (!user?.id) throw new Error('Usuário não autenticado');

      const { error } = await supabase
        .from('google_calendar_connections')
        .update({ is_active: false })
        .eq('user_id', user.id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['google-calendar-connection'] });
      toast.success('Google Calendar desconectado');
    },
    onError: (error) => {
      toast.error('Erro ao desconectar: ' + error.message);
    },
  });

  // Sync events
  const syncMutation = useMutation({
    mutationFn: async (direction?: 'import' | 'export' | 'both') => {
      if (!user?.id) throw new Error('Usuário não autenticado');

      const { data, error } = await supabase.functions.invoke('google-calendar-sync', {
        body: {
          userId: user.id,
          direction: direction || connectionQuery.data?.sync_direction || 'both',
        },
      });

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['calendar-events'] });
      queryClient.invalidateQueries({ queryKey: ['google-calendar-connection'] });
      
      const messages = [];
      if (data.imported > 0) messages.push(`${data.imported} eventos importados`);
      if (data.exported > 0) messages.push(`${data.exported} eventos exportados`);
      
      if (messages.length > 0) {
        toast.success(`Sincronização concluída: ${messages.join(', ')}`);
      } else {
        toast.info('Nenhum evento novo para sincronizar');
      }

      if (data.errors?.length > 0) {
        console.warn('Sync errors:', data.errors);
      }
    },
    onError: (error) => {
      toast.error('Erro na sincronização: ' + error.message);
    },
  });

  // Update sync settings
  const updateSettingsMutation = useMutation({
    mutationFn: async (settings: {
      sync_enabled?: boolean;
      sync_direction?: string;
      selected_calendar_id?: string;
    }) => {
      if (!user?.id) throw new Error('Usuário não autenticado');

      const { error } = await supabase
        .from('google_calendar_connections')
        .update(settings)
        .eq('user_id', user.id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['google-calendar-connection'] });
      toast.success('Configurações atualizadas');
    },
    onError: (error) => {
      toast.error('Erro ao atualizar: ' + error.message);
    },
  });

  return {
    connection: connectionQuery.data,
    isConnected: !!connectionQuery.data?.is_active,
    isLoading: connectionQuery.isLoading,
    isOAuthConfigured: oauthConfigQuery.data?.isConfigured ?? false,
    isCheckingConfig: oauthConfigQuery.isLoading,
    
    connect: connectMutation.mutate,
    isConnecting: connectMutation.isPending,
    
    disconnect: disconnectMutation.mutate,
    isDisconnecting: disconnectMutation.isPending,
    
    sync: syncMutation.mutate,
    isSyncing: syncMutation.isPending,
    
    updateSettings: updateSettingsMutation.mutate,
    isUpdating: updateSettingsMutation.isPending,
  };
}
