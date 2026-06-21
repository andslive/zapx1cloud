import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

export interface HotmartCredentials {
  id: string;
  organization_id: string;
  client_id: string | null;
  client_secret: string | null;
  basic_token: string | null;
  hottok: string | null;
  is_active: boolean;
  last_verified_at: string | null;
}

export interface HotmartOrder {
  id: string;
  organization_id: string;
  transaction_id: string;
  product_id: string | null;
  hotmart_product_id: string | null;
  hotmart_product_name: string | null;
  buyer_email: string | null;
  buyer_name: string | null;
  buyer_phone: string | null;
  amount: number | null;
  currency: string;
  status: string;
  event_type: string | null;
  payment_method: string | null;
  created_at_hotmart: string | null;
  synced_at: string;
}

export interface HotmartProductMapping {
  id: string;
  organization_id: string;
  hotmart_product_id: string;
  hotmart_product_name: string | null;
  product_id: string | null;
}

export function useHotmartCredentials() {
  const { profile } = useAuth();
  return useQuery({
    queryKey: ['hotmart-credentials', profile?.organization_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('hotmart_credentials')
        .select('*')
        .eq('organization_id', profile!.organization_id!)
        .maybeSingle();
      if (error && error.code !== 'PGRST116') throw error;
      return (data as HotmartCredentials | null) ?? null;
    },
    enabled: !!profile?.organization_id,
  });
}

export function useUpsertHotmartCredentials() {
  const qc = useQueryClient();
  const { profile } = useAuth();
  return useMutation({
    mutationFn: async (input: Partial<HotmartCredentials>) => {
      const orgId = profile!.organization_id!;
      const { data: existing } = await supabase
        .from('hotmart_credentials')
        .select('id')
        .eq('organization_id', orgId)
        .maybeSingle();

      const payload = { ...input, organization_id: orgId };
      if (existing) {
        const { error } = await supabase
          .from('hotmart_credentials')
          .update(payload)
          .eq('id', existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('hotmart_credentials').insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['hotmart-credentials'] });
      toast.success('Credenciais Hotmart salvas');
    },
    onError: (e: Error) => toast.error('Erro ao salvar: ' + e.message),
  });
}

export function useTestHotmartConnection() {
  return useMutation({
    mutationFn: async (creds?: { client_id?: string; client_secret?: string; basic_token?: string }) => {
      const { data, error } = await supabase.functions.invoke('hotmart-test-credentials', {
        body: creds ?? {},
      });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error ?? 'Falha no teste');
      return data;
    },
    onSuccess: () => toast.success('Conexão Hotmart OK'),
    onError: (e: Error) => toast.error('Falha: ' + e.message),
  });
}

export function useHotmartOrders(limit = 50) {
  const { profile } = useAuth();
  return useQuery({
    queryKey: ['hotmart-orders', profile?.organization_id, limit],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('hotmart_orders')
        .select('*')
        .eq('organization_id', profile!.organization_id!)
        .order('created_at_hotmart', { ascending: false, nullsFirst: false })
        .limit(limit);
      if (error) throw error;
      return (data ?? []) as HotmartOrder[];
    },
    enabled: !!profile?.organization_id,
  });
}

export function useSyncHotmartOrders() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (days: number = 30) => {
      const { data, error } = await supabase.functions.invoke('hotmart-sync-orders', {
        body: { days },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['hotmart-orders'] });
      qc.invalidateQueries({ queryKey: ['hotmart-product-mappings'] });
      toast.success(`Sincronizado: ${data?.inserted ?? 0} pedidos`);
    },
    onError: (e: Error) => toast.error('Erro na sync: ' + e.message),
  });
}

export function useHotmartProductMappings() {
  const { profile } = useAuth();
  return useQuery({
    queryKey: ['hotmart-product-mappings', profile?.organization_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('hotmart_product_mapping')
        .select('*')
        .eq('organization_id', profile!.organization_id!)
        .order('hotmart_product_name');
      if (error) throw error;
      return (data ?? []) as HotmartProductMapping[];
    },
    enabled: !!profile?.organization_id,
  });
}

export function useUpdateHotmartProductMapping() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, productId }: { id: string; productId: string | null }) => {
      const { error } = await supabase
        .from('hotmart_product_mapping')
        .update({ product_id: productId })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['hotmart-product-mappings'] });
      toast.success('Mapeamento atualizado');
    },
    onError: (e: Error) => toast.error('Erro: ' + e.message),
  });
}
