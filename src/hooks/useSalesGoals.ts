import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

interface SalesGoal {
  id: string;
  user_id: string;
  product_id: string | null;
  organization_id: string | null;
  period_start: string;
  period_end: string;
  target_value: number;
  target_deals: number;
  achieved_value: number | null;
  achieved_deals: number | null;
  is_active: boolean | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
}

interface UserBadge {
  id: string;
  user_id: string;
  badge_type: string;
  badge_name: string;
  description: string | null;
  earned_at: string;
  metadata: Record<string, any> | null;
}

export function useSalesGoals(userId?: string, productId?: string) {
  return useQuery({
    queryKey: ['sales-goals', userId, productId],
    queryFn: async () => {
      let query = supabase
        .from('sales_goals')
        .select('*')
        .eq('is_active', true)
        .order('period_start', { ascending: false });
      
      if (userId) {
        query = query.eq('user_id', userId);
      }
      if (productId) {
        query = query.eq('product_id', productId);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      return data as SalesGoal[];
    }
  });
}

export function useCurrentGoal(userId: string, productId?: string) {
  return useQuery({
    queryKey: ['current-goal', userId, productId],
    queryFn: async () => {
      const today = new Date().toISOString().split('T')[0];
      
      let query = supabase
        .from('sales_goals')
        .select('*')
        .eq('user_id', userId)
        .eq('is_active', true)
        .lte('period_start', today)
        .gte('period_end', today);
      
      if (productId) {
        query = query.eq('product_id', productId);
      }
      
      const { data, error } = await query.limit(1).single();
      if (error && error.code !== 'PGRST116') throw error;
      return data as SalesGoal | null;
    },
    enabled: !!userId
  });
}

export function useCreateSalesGoal() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (goal: Omit<SalesGoal, 'id' | 'created_at' | 'updated_at' | 'achieved_value' | 'achieved_deals'>) => {
      const { data, error } = await supabase
        .from('sales_goals')
        .insert(goal)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sales-goals'] });
      queryClient.invalidateQueries({ queryKey: ['current-goal'] });
    }
  });
}

export function useUpdateSalesGoal() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<SalesGoal> & { id: string }) => {
      const { data, error } = await supabase
        .from('sales_goals')
        .update(updates)
        .eq('id', id)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sales-goals'] });
      queryClient.invalidateQueries({ queryKey: ['current-goal'] });
    }
  });
}

export function useUserBadges(userId: string) {
  return useQuery({
    queryKey: ['user-badges', userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_badges')
        .select('*')
        .eq('user_id', userId)
        .order('earned_at', { ascending: false });
      
      if (error) throw error;
      return data as UserBadge[];
    },
    enabled: !!userId
  });
}

// Leaderboard query
export function useLeaderboard(productId?: string, period?: { start: string; end: string }) {
  return useQuery({
    queryKey: ['leaderboard', productId, period],
    queryFn: async () => {
      // Get deals within period
      let dealsQuery = supabase
        .from('deals')
        .select(`
          seller_id,
          deal_value,
          status
        `)
        .eq('status', 'won');
      
      if (productId) {
        dealsQuery = dealsQuery.eq('product_id', productId);
      }
      
      if (period) {
        dealsQuery = dealsQuery
          .gte('closed_at', period.start)
          .lte('closed_at', period.end);
      }
      
      const { data: deals, error: dealsError } = await dealsQuery;
      if (dealsError) throw dealsError;

      // Aggregate by seller
      const sellerStats: Record<string, { totalValue: number; totalDeals: number }> = {};
      
      deals?.forEach(deal => {
        if (!sellerStats[deal.seller_id]) {
          sellerStats[deal.seller_id] = { totalValue: 0, totalDeals: 0 };
        }
        sellerStats[deal.seller_id].totalValue += Number(deal.deal_value) || 0;
        sellerStats[deal.seller_id].totalDeals += 1;
      });

      // Get seller profiles
      const sellerIds = Object.keys(sellerStats);
      if (sellerIds.length === 0) return [];

      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('id, full_name, avatar_url')
        .in('id', sellerIds);
      
      if (profilesError) throw profilesError;

      // Combine and sort
      const leaderboard = profiles?.map(profile => ({
        userId: profile.id,
        name: profile.full_name,
        avatarUrl: profile.avatar_url,
        totalValue: sellerStats[profile.id]?.totalValue || 0,
        totalDeals: sellerStats[profile.id]?.totalDeals || 0
      })).sort((a, b) => b.totalValue - a.totalValue) || [];

      return leaderboard;
    }
  });
}
