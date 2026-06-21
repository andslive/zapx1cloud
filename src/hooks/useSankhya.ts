import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

export interface SankhyaConfig {
  client_id: string;
  client_secret: string;
  x_token: string;
  auto_sync_enabled: boolean;
  sync_interval: '1h' | '6h' | '12h' | '24h';
}

export interface SankhyaSyncLog {
  id: string;
  organization_id: string;
  sync_type: string;
  entity_type: string;
  records_processed: number;
  records_success: number;
  records_failed: number;
  error_details: Record<string, unknown> | null;
  started_at: string;
  finished_at: string | null;
  status: string;
}

export function useSankhyaConfig() {
  const { profile } = useAuth();

  return useQuery({
    queryKey: ['sankhya-config', profile?.organization_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('integration_settings')
        .select('*')
        .eq('organization_id', profile!.organization_id!)
        .eq('integration_type', 'sankhya')
        .single();

      if (error && error.code !== 'PGRST116') throw error;

      const settings = data?.settings as unknown as SankhyaConfig | undefined;
      
      return {
        isConfigured: data?.is_configured ?? false,
        lastVerifiedAt: data?.last_verified_at,
        config: settings ?? {
          client_id: '',
          client_secret: '',
          x_token: '',
          auto_sync_enabled: false,
          sync_interval: '24h' as const
        }
      };
    },
    enabled: !!profile?.organization_id
  });
}

export function useUpdateSankhyaConfig() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();

  return useMutation({
    mutationFn: async (config: Partial<SankhyaConfig>) => {
      const { data: existing } = await supabase
        .from('integration_settings')
        .select('id, settings')
        .eq('organization_id', profile!.organization_id!)
        .eq('integration_type', 'sankhya')
        .single();

      const currentSettings = (existing?.settings as unknown as SankhyaConfig) ?? {};
      const newSettings = { ...currentSettings, ...config };

      // Mask API key for display
      const maskedKey = config.client_id 
        ? `${config.client_id.substring(0, 4)}...${config.client_id.slice(-4)}`
        : existing?.id ? undefined : null;

      if (existing) {
        const { error } = await supabase
          .from('integration_settings')
          .update({
            settings: JSON.parse(JSON.stringify(newSettings)),
            api_key_masked: maskedKey,
            is_configured: !!(newSettings.client_id && newSettings.client_secret && newSettings.x_token)
          })
          .eq('id', existing.id);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('integration_settings')
          .insert({
            organization_id: profile!.organization_id!,
            integration_type: 'sankhya',
            settings: JSON.parse(JSON.stringify(newSettings)),
            api_key_masked: maskedKey,
            is_configured: !!(newSettings.client_id && newSettings.client_secret && newSettings.x_token)
          });

        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sankhya-config'] });
      toast.success('Configurações do Sankhya salvas');
    },
    onError: (error) => {
      toast.error('Erro ao salvar configurações: ' + error.message);
    }
  });
}

export function useSankhyaSyncLogs() {
  const { profile } = useAuth();

  return useQuery({
    queryKey: ['sankhya-sync-logs', profile?.organization_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('sankhya_sync_logs')
        .select('*')
        .eq('organization_id', profile!.organization_id!)
        .order('started_at', { ascending: false })
        .limit(20);

      if (error) throw error;
      return data as SankhyaSyncLog[];
    },
    enabled: !!profile?.organization_id
  });
}

export function useTestSankhyaConnection() {
  return useMutation({
    mutationFn: async (config: { client_id: string; client_secret: string; x_token: string }) => {
      const { data, error } = await supabase.functions.invoke('sankhya-auth', {
        body: { 
          action: 'test',
          credentials: config
        }
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      
      return data;
    },
    onSuccess: () => {
      toast.success('Conexão com Sankhya estabelecida com sucesso!');
    },
    onError: (error) => {
      toast.error('Erro ao conectar: ' + error.message);
    }
  });
}

export function useSankhyaSync() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();

  return useMutation({
    mutationFn: async ({ entityType }: { entityType: 'clients' | 'products' }) => {
      const functionName = entityType === 'clients' ? 'sankhya-sync-clients' : 'sankhya-sync-products';
      
      const { data, error } = await supabase.functions.invoke(functionName, {
        body: { organization_id: profile!.organization_id }
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['sankhya-sync-logs'] });
      const entity = variables.entityType === 'clients' ? 'clientes' : 'produtos';
      toast.success(`Sincronização de ${entity} iniciada`);
    },
    onError: (error) => {
      toast.error('Erro na sincronização: ' + error.message);
    }
  });
}

export function useLastSyncByType() {
  const { profile } = useAuth();

  return useQuery({
    queryKey: ['sankhya-last-sync', profile?.organization_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('sankhya_sync_logs')
        .select('*')
        .eq('organization_id', profile!.organization_id!)
        .eq('status', 'completed')
        .order('finished_at', { ascending: false });

      if (error) throw error;

      const lastClients = data?.find(d => d.entity_type === 'clients');
      const lastProducts = data?.find(d => d.entity_type === 'products');

      return {
        clients: lastClients as SankhyaSyncLog | undefined,
        products: lastProducts as SankhyaSyncLog | undefined
      };
    },
    enabled: !!profile?.organization_id
  });
}
