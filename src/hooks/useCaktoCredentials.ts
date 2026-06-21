import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export type CaktoScope = 'platform' | 'organization';

export interface CaktoCredentials {
  id: string;
  scope: CaktoScope;
  organization_id: string | null;
  client_id: string;
  client_secret_masked: string | null;
  scopes: string[];
  connection_status: 'connected' | 'disconnected' | 'error';
  last_sync_at: string | null;
  last_error: string | null;
  has_secret: boolean;
  webhook_secret_set: boolean;
  updated_at: string;
}

async function invoke<T = any>(action: string, payload: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase.functions.invoke('cakto-proxy', {
    body: { action, ...payload },
  });
  if (error) throw new Error(error.message);
  if (data?.error) throw new Error(data.error);
  return data as T;
}

export function useCaktoCredentials(scope: CaktoScope) {
  return useQuery({
    queryKey: ['cakto-credentials', scope],
    queryFn: async () => {
      const data = await invoke<{ credentials: CaktoCredentials | null }>('get_credentials', { scope });
      return data.credentials;
    },
  });
}

export function useSaveCaktoCredentials(scope: CaktoScope) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { client_id: string; client_secret?: string; scopes: string[]; webhook_secret?: string }) => {
      return invoke('save_credentials', { scope, ...input });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['cakto-credentials', scope] }),
  });
}

export function useTestCaktoConnection(scope: CaktoScope) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => invoke('test_connection', { scope }),
    onSettled: () => qc.invalidateQueries({ queryKey: ['cakto-credentials', scope] }),
  });
}

export function useDisconnectCakto(scope: CaktoScope) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => invoke('disconnect', { scope }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['cakto-credentials', scope] }),
  });
}
