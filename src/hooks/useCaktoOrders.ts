import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { CaktoScope } from './useCaktoCredentials';

export type PaymentProvider = 'cakto' | 'doppus' | 'hotmart' | 'kiwify' | 'manual';

export interface CaktoOrder {
  id: string;
  scope: CaktoScope;
  organization_id: string | null;
  provider: PaymentProvider;
  cakto_id: string;
  cakto_ref_id: string | null;
  status: string;
  type: string | null;
  payment_method: string | null;
  amount: number | null;
  base_amount: number | null;
  discount: number | null;
  customer_name: string | null;
  customer_email: string | null;
  product_name: string | null;
  product_image: string | null;
  paid_at: string | null;
  created_at_cakto: string | null;
  synced_at: string;
  assigned_to: string | null;
  lead_id: string | null;
}

export interface CaktoSummary {
  totalRevenue: number;
  paidCount: number;
  refundedCount: number;
  pendingCount: number;
  ticketAvg: number;
}

export interface CaktoOrdersFilters {
  status?: string;
  search?: string;
  from?: string;
  to?: string;
  provider?: PaymentProvider | 'all';
}

export function useCaktoOrders(scope: CaktoScope, filters: CaktoOrdersFilters = {}) {
  return useQuery({
    queryKey: ['cakto-orders', scope, filters],
    queryFn: async () => {
      let q = supabase.from('cakto_orders').select('*').eq('scope', scope).order('paid_at', { ascending: false, nullsFirst: false }).limit(200);
      if (filters.status && filters.status !== 'all') q = q.eq('status', filters.status);
      if (filters.provider && filters.provider !== 'all') q = q.eq('provider', filters.provider);
      if (filters.search) q = q.or(`customer_name.ilike.%${filters.search}%,customer_email.ilike.%${filters.search}%,cakto_ref_id.ilike.%${filters.search}%,product_name.ilike.%${filters.search}%`);
      if (filters.from) q = q.gte('paid_at', filters.from);
      if (filters.to) q = q.lte('paid_at', filters.to);
      const { data, error } = await q;
      if (error) throw error;
      return (data as unknown as CaktoOrder[]) ?? [];
    },
  });
}

export function useCaktoSummary(scope: CaktoScope) {
  return useQuery({
    queryKey: ['cakto-summary', scope],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('cakto-proxy', {
        body: { action: 'get_summary', scope },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data as CaktoSummary;
    },
  });
}

/** Summary calculado direto do banco (pedidos persistidos), agregando todos os providers ou um específico. */
export function usePaymentsSummary(scope: CaktoScope, provider: PaymentProvider | 'all' = 'all') {
  return useQuery({
    queryKey: ['payments-summary', scope, provider],
    queryFn: async (): Promise<CaktoSummary> => {
      let q = supabase.from('cakto_orders').select('status, amount, provider').eq('scope', scope).limit(5000);
      if (provider !== 'all') q = q.eq('provider', provider);
      const { data, error } = await q;
      if (error) throw error;
      const rows = (data ?? []) as Array<{ status: string; amount: number | null }>;
      let totalRevenue = 0, paidCount = 0, refundedCount = 0, pendingCount = 0;
      for (const r of rows) {
        const amt = Number(r.amount ?? 0);
        if (r.status === 'paid') { totalRevenue += amt; paidCount++; }
        else if (r.status === 'refunded') refundedCount++;
        else if (r.status === 'pending' || r.status === 'waiting_payment') pendingCount++;
      }
      const ticketAvg = paidCount > 0 ? totalRevenue / paidCount : 0;
      return { totalRevenue, paidCount, refundedCount, pendingCount, ticketAvg };
    },
  });
}

export function useSyncCaktoOrders(scope: CaktoScope) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('cakto-proxy', {
        body: { action: 'sync_orders', scope },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data as { synced: number };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cakto-orders', scope] });
      qc.invalidateQueries({ queryKey: ['cakto-summary', scope] });
      qc.invalidateQueries({ queryKey: ['cakto-credentials', scope] });
    },
  });
}
