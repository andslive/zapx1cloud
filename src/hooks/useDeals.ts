import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface Deal {
  id: string;
  lead_id: string;
  product_id: string;
  seller_id: string;
  organization_id: string;
  deal_value: number;
  status: 'won' | 'lost' | 'cancelled';
  notes: string | null;
  plan_name: string | null;
  closed_at: string;
  created_at: string;
  updated_at: string;
  leads?: {
    name: string;
    company: string | null;
    email: string | null;
  } | null;
  profiles?: {
    full_name: string;
    email: string;
  } | null;
  products?: {
    name: string;
  } | null;
}

export function useDeals(filters?: { productId?: string; sellerId?: string; status?: string }) {
  return useQuery({
    queryKey: ['deals', filters],
    queryFn: async () => {
      let query = supabase
        .from('deals')
        .select(`*, leads (name, company, email), products:product_id (name)`)
        .order('closed_at', { ascending: false });

      if (filters?.productId) {
        query = query.eq('product_id', filters.productId);
      }
      if (filters?.sellerId) {
        query = query.eq('seller_id', filters.sellerId);
      }
      if (filters?.status) {
        query = query.eq('status', filters.status);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as unknown as Deal[];
    }
  });
}

export function useDealsSummary(productId?: string, sellerId?: string) {
  return useQuery({
    queryKey: ['deals-summary', productId, sellerId],
    queryFn: async () => {
      let query = supabase
        .from('deals')
        .select('deal_value, status, closed_at');

      if (productId) {
        query = query.eq('product_id', productId);
      }
      if (sellerId) {
        query = query.eq('seller_id', sellerId);
      }

      const { data, error } = await query;
      if (error) throw error;

      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

      const summary = {
        totalWon: 0,
        totalLost: 0,
        monthlyWon: 0,
        dealsCount: 0,
        monthlyDealsCount: 0
      };

      data?.forEach(deal => {
        if (deal.status === 'won') {
          summary.totalWon += Number(deal.deal_value);
          summary.dealsCount++;

          const closedAt = new Date(deal.closed_at);
          if (closedAt >= startOfMonth) {
            summary.monthlyWon += Number(deal.deal_value);
            summary.monthlyDealsCount++;
          }
        } else if (deal.status === 'lost') {
          summary.totalLost += Number(deal.deal_value);
        }
      });

      return summary;
    }
  });
}

export function useCreateDeal() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (deal: Omit<Deal, 'id' | 'created_at' | 'updated_at' | 'leads' | 'profiles' | 'products'>) => {
      // Criar o deal
      const { plan_name, ...dealData } = deal;
      const { data: newDeal, error: dealError } = await supabase
        .from('deals')
        .insert({ ...dealData, plan_name } as any)
        .select()
        .single();

      if (dealError) throw dealError;

      // Calcular comissão usando a função do banco
      const { error: commissionError } = await supabase.rpc('calculate_commission', {
        p_deal_id: newDeal.id,
        p_deal_value: deal.deal_value,
        p_product_id: deal.product_id,
        p_seller_id: deal.seller_id,
        p_organization_id: deal.organization_id
      });

      if (commissionError) {
        console.error('Error calculating commission:', commissionError);
      }

      return newDeal;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['deals'] });
      queryClient.invalidateQueries({ queryKey: ['deals-summary'] });
      queryClient.invalidateQueries({ queryKey: ['commissions'] });
      queryClient.invalidateQueries({ queryKey: ['commissions-summary'] });
    }
  });
}

export function useUpdateDeal() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Deal> & { id: string }) => {
      const { data, error } = await supabase
        .from('deals')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['deals'] });
      queryClient.invalidateQueries({ queryKey: ['deals-summary'] });
    }
  });
}
