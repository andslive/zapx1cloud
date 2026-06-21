import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export interface CommissionRule {
  id: string;
  product_id: string;
  user_id: string | null;
  organization_id: string;
  rule_type: 'percentage' | 'fixed';
  base_value: number;
  min_value: number | null;
  max_value: number | null;
  applies_to: 'deal' | 'stage';
  stage_id: string | null;
  is_default: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  profiles?: {
    full_name: string;
    email: string;
  } | null;
  products?: {
    name: string;
  } | null;
}

export interface Commission {
  id: string;
  deal_id: string;
  user_id: string;
  product_id: string;
  organization_id: string;
  amount: number;
  percentage_applied: number | null;
  rule_id: string | null;
  status: 'pending' | 'approved' | 'paid' | 'cancelled';
  earned_at: string;
  approved_at: string | null;
  approved_by: string | null;
  paid_at: string | null;
  paid_by: string | null;
  notes: string | null;
  created_at: string;
  deals?: {
    deal_value: number;
    closed_at: string;
    leads?: {
      name: string;
      company: string | null;
    } | null;
  } | null;
  profiles?: {
    full_name: string;
    email: string;
  } | null;
  products?: {
    name: string;
  } | null;
}

export function useCommissionRules(productId?: string) {
  return useQuery({
    queryKey: ['commission-rules', productId],
    queryFn: async () => {
      let query = supabase
        .from('commission_rules')
        .select(`*, products:product_id (name)`)
        .eq('is_active', true)
        .order('is_default', { ascending: false });

      if (productId) {
        query = query.eq('product_id', productId);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as unknown as CommissionRule[];
    }
  });
}

export function useCreateCommissionRule() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (rule: Omit<CommissionRule, 'id' | 'created_at' | 'updated_at' | 'profiles' | 'products'>) => {
      const { data, error } = await supabase
        .from('commission_rules')
        .insert(rule)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['commission-rules'] });
    }
  });
}

export function useUpdateCommissionRule() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<CommissionRule> & { id: string }) => {
      const { data, error } = await supabase
        .from('commission_rules')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['commission-rules'] });
    }
  });
}

export function useDeleteCommissionRule() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('commission_rules')
        .update({ is_active: false })
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['commission-rules'] });
    }
  });
}

export function useCommissions(filters?: { userId?: string; productId?: string; status?: string }) {
  return useQuery({
    queryKey: ['commissions', filters],
    queryFn: async () => {
      let query = supabase
        .from('commissions')
        .select(`
          *,
          deals (deal_value, closed_at, leads (name, company)),
          products:product_id (name)
        `)
        .order('earned_at', { ascending: false });

      if (filters?.userId) {
        query = query.eq('user_id', filters.userId);
      }
      if (filters?.productId) {
        query = query.eq('product_id', filters.productId);
      }
      if (filters?.status) {
        query = query.eq('status', filters.status);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as unknown as Commission[];
    }
  });
}

export function useCommissionsSummary(userId?: string, productId?: string) {
  return useQuery({
    queryKey: ['commissions-summary', userId, productId],
    queryFn: async () => {
      let query = supabase
        .from('commissions')
        .select('amount, status');

      if (userId) {
        query = query.eq('user_id', userId);
      }
      if (productId) {
        query = query.eq('product_id', productId);
      }

      const { data, error } = await query;
      if (error) throw error;

      const summary = {
        pending: 0,
        approved: 0,
        paid: 0,
        total: 0
      };

      data?.forEach(c => {
        summary[c.status as keyof typeof summary] += Number(c.amount);
        summary.total += Number(c.amount);
      });

      return summary;
    }
  });
}

export function useApproveCommission() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (commissionId: string) => {
      const { data, error } = await supabase
        .from('commissions')
        .update({
          status: 'approved',
          approved_at: new Date().toISOString(),
          approved_by: user?.id
        })
        .eq('id', commissionId)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['commissions'] });
      queryClient.invalidateQueries({ queryKey: ['commissions-summary'] });
    }
  });
}

export function useMarkCommissionPaid() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (commissionId: string) => {
      const { data, error } = await supabase
        .from('commissions')
        .update({
          status: 'paid',
          paid_at: new Date().toISOString(),
          paid_by: user?.id
        })
        .eq('id', commissionId)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['commissions'] });
      queryClient.invalidateQueries({ queryKey: ['commissions-summary'] });
    }
  });
}

export function useBulkUpdateCommissions() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ ids, status }: { ids: string[]; status: 'approved' | 'paid' }) => {
      const updates: Record<string, unknown> = { status };
      
      if (status === 'approved') {
        updates.approved_at = new Date().toISOString();
        updates.approved_by = user?.id;
      } else if (status === 'paid') {
        updates.paid_at = new Date().toISOString();
        updates.paid_by = user?.id;
      }

      const { error } = await supabase
        .from('commissions')
        .update(updates)
        .in('id', ids);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['commissions'] });
      queryClient.invalidateQueries({ queryKey: ['commissions-summary'] });
    }
  });
}
