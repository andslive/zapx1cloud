import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { startOfMonth, endOfMonth, subMonths, format } from 'date-fns';

export interface AdminKPIs {
  totalSalesThisMonth: number;
  totalSalesLastMonth: number;
  salesGrowth: number;
  totalDeals: number;
  avgTicket: number;
  conversionRate: number;
  totalGoalValue: number;
  goalProgress: number;
  pendingCommissions: number;
  pendingCommissionsCount: number;
}

export interface TopSeller {
  id: string;
  name: string;
  avatar: string | null;
  totalValue: number;
  dealsCount: number;
}

export interface ProductSales {
  productId: string;
  productName: string;
  totalValue: number;
  dealsCount: number;
  percentage: number;
}

export interface MonthlySalesData {
  month: string;
  sales: number;
  deals: number;
}

export function useAdminKPIs() {
  const { profile } = useAuth();
  const organizationId = profile?.organization_id;

  return useQuery({
    queryKey: ['admin-kpis', organizationId],
    queryFn: async () => {
      const now = new Date();
      const thisMonthStart = format(startOfMonth(now), 'yyyy-MM-dd');
      const thisMonthEnd = format(endOfMonth(now), 'yyyy-MM-dd');
      const lastMonthStart = format(startOfMonth(subMonths(now, 1)), 'yyyy-MM-dd');
      const lastMonthEnd = format(endOfMonth(subMonths(now, 1)), 'yyyy-MM-dd');

      // Get this month's deals
      const { data: thisMonthDeals } = await supabase
        .from('deals')
        .select('deal_value')
        .eq('status', 'won')
        .gte('closed_at', thisMonthStart)
        .lte('closed_at', thisMonthEnd);

      // Get last month's deals
      const { data: lastMonthDeals } = await supabase
        .from('deals')
        .select('deal_value')
        .eq('status', 'won')
        .gte('closed_at', lastMonthStart)
        .lte('closed_at', lastMonthEnd);

      // Get all leads for conversion rate
      const { data: leads } = await supabase
        .from('leads')
        .select('id, current_stage_id');

      // Get won stages
      const { data: wonStages } = await supabase
        .from('pipeline_stages')
        .select('id')
        .eq('is_won', true);

      // Get active goals
      const { data: goals } = await supabase
        .from('sales_goals')
        .select('target_value, achieved_value')
        .gte('period_end', thisMonthStart)
        .lte('period_start', thisMonthEnd)
        .eq('is_active', true);

      // Get pending commissions
      const { data: pendingCommissions } = await supabase
        .from('commissions')
        .select('amount')
        .eq('status', 'pending');

      const totalSalesThisMonth = thisMonthDeals?.reduce((sum, d) => sum + Number(d.deal_value), 0) || 0;
      const totalSalesLastMonth = lastMonthDeals?.reduce((sum, d) => sum + Number(d.deal_value), 0) || 0;
      const salesGrowth = totalSalesLastMonth > 0 
        ? ((totalSalesThisMonth - totalSalesLastMonth) / totalSalesLastMonth) * 100 
        : 0;

      const totalDeals = thisMonthDeals?.length || 0;
      const avgTicket = totalDeals > 0 ? totalSalesThisMonth / totalDeals : 0;

      const wonStageIds = new Set(wonStages?.map(s => s.id) || []);
      const totalLeads = leads?.length || 0;
      const wonLeads = leads?.filter(l => l.current_stage_id && wonStageIds.has(l.current_stage_id)).length || 0;
      const conversionRate = totalLeads > 0 ? (wonLeads / totalLeads) * 100 : 0;

      const totalGoalValue = goals?.reduce((sum, g) => sum + Number(g.target_value), 0) || 0;
      const achievedValue = goals?.reduce((sum, g) => sum + Number(g.achieved_value || 0), 0) || 0;
      const goalProgress = totalGoalValue > 0 ? (totalSalesThisMonth / totalGoalValue) * 100 : 0;

      const pendingCommissionsTotal = pendingCommissions?.reduce((sum, c) => sum + Number(c.amount), 0) || 0;

      return {
        totalSalesThisMonth,
        totalSalesLastMonth,
        salesGrowth,
        totalDeals,
        avgTicket,
        conversionRate,
        totalGoalValue,
        goalProgress,
        pendingCommissions: pendingCommissionsTotal,
        pendingCommissionsCount: pendingCommissions?.length || 0
      } as AdminKPIs;
    },
    enabled: !!organizationId
  });
}

export function useTopSellers(limit = 5) {
  const { profile } = useAuth();
  const organizationId = profile?.organization_id;

  return useQuery({
    queryKey: ['top-sellers', organizationId, limit],
    queryFn: async () => {
      const now = new Date();
      const monthStart = format(startOfMonth(now), 'yyyy-MM-dd');
      const monthEnd = format(endOfMonth(now), 'yyyy-MM-dd');

      // Get all deals this month
      const { data: deals } = await supabase
        .from('deals')
        .select('seller_id, deal_value')
        .eq('status', 'won')
        .gte('closed_at', monthStart)
        .lte('closed_at', monthEnd);

      if (!deals?.length) return [];

      // Aggregate by seller
      const sellerMap = new Map<string, { totalValue: number; dealsCount: number }>();
      deals.forEach(d => {
        const existing = sellerMap.get(d.seller_id) || { totalValue: 0, dealsCount: 0 };
        sellerMap.set(d.seller_id, {
          totalValue: existing.totalValue + Number(d.deal_value),
          dealsCount: existing.dealsCount + 1
        });
      });

      const sellerIds = [...sellerMap.keys()];

      // Get profiles
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name, avatar_url')
        .in('id', sellerIds);

      const profileMap = new Map(profiles?.map(p => [p.id, p]));

      const sellers: TopSeller[] = sellerIds.map(id => {
        const profile = profileMap.get(id);
        const stats = sellerMap.get(id)!;
        return {
          id,
          name: profile?.full_name || 'Usuário',
          avatar: profile?.avatar_url,
          totalValue: stats.totalValue,
          dealsCount: stats.dealsCount
        };
      });

      return sellers.sort((a, b) => b.totalValue - a.totalValue).slice(0, limit);
    },
    enabled: !!organizationId
  });
}

export function useProductSalesDistribution() {
  const { profile } = useAuth();
  const organizationId = profile?.organization_id;

  return useQuery({
    queryKey: ['product-sales-distribution', organizationId],
    queryFn: async () => {
      const now = new Date();
      const monthStart = format(startOfMonth(now), 'yyyy-MM-dd');
      const monthEnd = format(endOfMonth(now), 'yyyy-MM-dd');

      // Get all deals this month with products
      const { data: deals } = await supabase
        .from('deals')
        .select('product_id, deal_value')
        .eq('status', 'won')
        .gte('closed_at', monthStart)
        .lte('closed_at', monthEnd);

      if (!deals?.length) return [];

      // Aggregate by product
      const productMap = new Map<string, { totalValue: number; dealsCount: number }>();
      deals.forEach(d => {
        const existing = productMap.get(d.product_id) || { totalValue: 0, dealsCount: 0 };
        productMap.set(d.product_id, {
          totalValue: existing.totalValue + Number(d.deal_value),
          dealsCount: existing.dealsCount + 1
        });
      });

      const productIds = [...productMap.keys()];

      // Get product names
      const { data: products } = await supabase
        .from('products')
        .select('id, name')
        .in('id', productIds);

      const productNameMap = new Map(products?.map(p => [p.id, p.name]));
      const totalSales = [...productMap.values()].reduce((sum, p) => sum + p.totalValue, 0);

      const distribution: ProductSales[] = productIds.map(id => {
        const stats = productMap.get(id)!;
        return {
          productId: id,
          productName: productNameMap.get(id) || 'Produto',
          totalValue: stats.totalValue,
          dealsCount: stats.dealsCount,
          percentage: totalSales > 0 ? (stats.totalValue / totalSales) * 100 : 0
        };
      });

      return distribution.sort((a, b) => b.totalValue - a.totalValue);
    },
    enabled: !!organizationId
  });
}

export function useMonthlySalesEvolution(months = 6) {
  const { profile } = useAuth();
  const organizationId = profile?.organization_id;

  return useQuery({
    queryKey: ['monthly-sales-evolution', organizationId, months],
    queryFn: async () => {
      const now = new Date();
      const startDate = format(startOfMonth(subMonths(now, months - 1)), 'yyyy-MM-dd');
      const endDate = format(endOfMonth(now), 'yyyy-MM-dd');

      // Single query instead of N queries in a loop - major performance boost
      const { data: deals } = await supabase
        .from('deals')
        .select('deal_value, closed_at')
        .eq('status', 'won')
        .gte('closed_at', startDate)
        .lte('closed_at', endDate);

      // Initialize months map
      const monthlyMap = new Map<string, { sales: number; deals: number }>();
      for (let i = months - 1; i >= 0; i--) {
        const targetMonth = subMonths(now, i);
        const monthKey = format(targetMonth, 'yyyy-MM');
        monthlyMap.set(monthKey, { sales: 0, deals: 0 });
      }

      // Aggregate data in frontend
      deals?.forEach(d => {
        if (d.closed_at) {
          const monthKey = format(new Date(d.closed_at), 'yyyy-MM');
          const existing = monthlyMap.get(monthKey);
          if (existing) {
            existing.sales += Number(d.deal_value) || 0;
            existing.deals += 1;
          }
        }
      });

      // Convert to array with display format
      return Array.from(monthlyMap.entries()).map(([key, value]) => ({
        month: format(new Date(key + '-01'), 'MMM'),
        sales: value.sales,
        deals: value.deals
      }));
    },
    enabled: !!organizationId
  });
}
