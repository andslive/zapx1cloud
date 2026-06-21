import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import type { Tables, TablesInsert, TablesUpdate } from '@/integrations/supabase/types';

export type PostSaleEventAction = Tables<'post_sale_event_actions'>;
export type PostSaleEventLog = Tables<'post_sale_event_logs'>;

export const POST_SALE_EVENT_TYPES = [
  { value: 'compra_aprovada', label: 'Compra Aprovada', description: 'Pagamento confirmado, entregar acesso' },
  { value: 'pix_gerado', label: 'PIX Gerado', description: 'Lembrar e converter PIX pendente' },
  { value: 'boleto_gerado', label: 'Boleto Gerado', description: 'Lembrar do boleto antes do vencimento' },
  { value: 'carrinho_abandonado', label: 'Carrinho Abandonado', description: 'Recuperar checkout não finalizado' },
  { value: 'reembolso', label: 'Reembolso / Estorno', description: 'Lidar com cancelamento e tentativa de retenção' },
  { value: 'chargeback', label: 'Chargeback', description: 'Disputa de pagamento iniciada' },
  { value: 'assinatura_cancelada', label: 'Assinatura Cancelada', description: 'Recuperar assinante perdido' },
] as const;

export function usePostSaleEventActions(productId: string) {
  const { profile } = useAuth();

  return useQuery({
    queryKey: ['post-sale-event-actions', productId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('post_sale_event_actions')
        .select('*')
        .eq('product_id', productId)
        .order('event_type', { ascending: true });
      if (error) throw error;
      return (data || []) as PostSaleEventAction[];
    },
    enabled: !!productId && !!profile?.organization_id,
  });
}

export function useUpsertPostSaleEventAction() {
  const qc = useQueryClient();
  const { profile } = useAuth();

  return useMutation({
    mutationFn: async (input: Omit<TablesInsert<'post_sale_event_actions'>, 'organization_id'> & { id?: string }) => {
      if (input.id) {
        const { id, ...rest } = input;
        const { error } = await supabase
          .from('post_sale_event_actions')
          .update(rest as TablesUpdate<'post_sale_event_actions'>)
          .eq('id', id);
        if (error) throw error;
        return id;
      }
      const { data, error } = await supabase
        .from('post_sale_event_actions')
        .insert({
          ...input,
          organization_id: profile!.organization_id!,
          created_by: profile!.id,
        })
        .select('id')
        .single();
      if (error) throw error;
      return data.id;
    },
    onSuccess: (_id, vars) => {
      qc.invalidateQueries({ queryKey: ['post-sale-event-actions', vars.product_id] });
      toast.success('Ação salva');
    },
    onError: (e: any) => toast.error('Erro ao salvar: ' + e.message),
  });
}

export function useDeletePostSaleEventAction(productId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('post_sale_event_actions').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['post-sale-event-actions', productId] });
      toast.success('Ação removida');
    },
    onError: (e: any) => toast.error('Erro ao remover: ' + e.message),
  });
}

export function usePostSaleEventLogs(productId: string, limit = 20) {
  return useQuery({
    queryKey: ['post-sale-event-logs', productId, limit],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('post_sale_event_logs')
        .select('*')
        .eq('product_id', productId)
        .order('created_at', { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data || []) as PostSaleEventLog[];
    },
    enabled: !!productId,
  });
}
