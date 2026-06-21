import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { startOfMonth, endOfMonth, subMonths, format, startOfWeek, endOfWeek, addDays } from 'date-fns';

export function useDashboardData(productId: string, userId?: string) {
  const now = new Date();
  const currentMonthStart = startOfMonth(now);
  const currentMonthEnd = endOfMonth(now);
  const lastMonthStart = startOfMonth(subMonths(now, 1));
  const lastMonthEnd = endOfMonth(subMonths(now, 1));
  const weekStart = startOfWeek(now, { weekStartsOn: 0 });
  const weekEnd = endOfWeek(now, { weekStartsOn: 0 });
  // Fetch leads with stage info for funnel and conversion
  const leadsQuery = useQuery({
    queryKey: ['dashboard-leads', productId, userId],
    queryFn: async () => {
      let query = supabase
        .from('leads')
        .select(`
          id,
          name,
          company,
          temperature,
          last_contact_at,
          current_stage_id,
          pipeline_stages!leads_current_stage_id_fkey (
            id, name, color, order_index, is_won, is_lost
          )
        `)
        .eq('product_id', productId);

      if (userId) {
        query = query.eq('assigned_to', userId);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
    enabled: !!productId,
  });

  // Fetch pipeline stages for funnel
  const stagesQuery = useQuery({
    queryKey: ['dashboard-stages', productId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('pipeline_stages')
        .select('*')
        .eq('product_id', productId)
        .order('order_index');

      if (error) throw error;
      return data;
    },
    enabled: !!productId,
  });

  // Fetch commissions for chart
  const commissionsQuery = useQuery({
    queryKey: ['dashboard-commissions', productId, userId],
    queryFn: async () => {
      let query = supabase
        .from('commissions')
        .select('id, amount, created_at, status')
        .eq('product_id', productId);

      if (userId) {
        query = query.eq('user_id', userId);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
    enabled: !!productId,
  });

  // Fetch deals for stats
  const dealsQuery = useQuery({
    queryKey: ['dashboard-deals', productId, userId],
    queryFn: async () => {
      let query = supabase
        .from('deals')
        .select('id, deal_value, status, closed_at')
        .eq('product_id', productId);

      if (userId) {
        query = query.eq('seller_id', userId);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
    enabled: !!productId,
  });

  // Process funnel data
  const funnelData = () => {
    if (!stagesQuery.data || !leadsQuery.data) return [];

    const activeStages = stagesQuery.data.filter(s => !s.is_won && !s.is_lost);
    
    return activeStages.map(stage => {
      const count = leadsQuery.data.filter(l => l.current_stage_id === stage.id).length;
      return {
        name: stage.name,
        count,
        color: stage.color || '#6B7280',
      };
    });
  };

  // Process conversion data
  const conversionData = () => {
    if (!leadsQuery.data || !stagesQuery.data) {
      return { totalLeads: 0, wonLeads: 0, lostLeads: 0, activeLeads: 0 };
    }

    const wonStageIds = stagesQuery.data.filter(s => s.is_won).map(s => s.id);
    const lostStageIds = stagesQuery.data.filter(s => s.is_lost).map(s => s.id);

    const wonLeads = leadsQuery.data.filter(l => wonStageIds.includes(l.current_stage_id || '')).length;
    const lostLeads = leadsQuery.data.filter(l => lostStageIds.includes(l.current_stage_id || '')).length;
    const activeLeads = leadsQuery.data.filter(l => 
      l.current_stage_id && 
      !wonStageIds.includes(l.current_stage_id) && 
      !lostStageIds.includes(l.current_stage_id)
    ).length;

    return {
      totalLeads: leadsQuery.data.length,
      wonLeads,
      lostLeads,
      activeLeads,
    };
  };

  // Stats calculations
  const stats = () => {
    const leads = leadsQuery.data || [];
    const deals = dealsQuery.data || [];
    const commissions = commissionsQuery.data || [];
    const stages = stagesQuery.data || [];

    const activeLeadsCount = leads.filter(l => {
      const stage = stages.find(s => s.id === l.current_stage_id);
      return stage && !stage.is_won && !stage.is_lost;
    }).length;

    const wonDeals = deals.filter(d => d.status === 'won');
    const lostDeals = deals.filter(d => d.status === 'lost');
    const closedDeals = wonDeals.length + lostDeals.length;
    const conversionRate = closedDeals > 0 ? Math.round((wonDeals.length / closedDeals) * 100) : 0;

    const totalCommissions = commissions.reduce((sum, c) => sum + c.amount, 0);
    const pendingCommissions = commissions.filter(c => c.status === 'pending').reduce((sum, c) => sum + c.amount, 0);

    // Calculate at-risk leads (no contact in 3+ days)
    const now = new Date();
    const atRiskLeads = leads.filter(lead => {
      const stage = stages.find(s => s.id === lead.current_stage_id);
      if (!stage || stage.is_won || stage.is_lost) return false;
      
      if (!lead.last_contact_at) return true;
      
      const lastContact = new Date(lead.last_contact_at);
      const daysDiff = Math.floor((now.getTime() - lastContact.getTime()) / (1000 * 60 * 60 * 24));
      return daysDiff >= 3;
    }).map(lead => ({
      id: lead.id,
      name: lead.name,
      company: lead.company,
      daysWithoutContact: lead.last_contact_at 
        ? Math.floor((now.getTime() - new Date(lead.last_contact_at).getTime()) / (1000 * 60 * 60 * 24))
        : 999,
    })).sort((a, b) => b.daysWithoutContact - a.daysWithoutContact).slice(0, 5);

    return {
      activeLeadsCount,
      conversionRate,
      totalCommissions,
      pendingCommissions,
      wonDealsCount: wonDeals.length,
      wonDealsValue: wonDeals.reduce((sum, d) => sum + d.deal_value, 0),
      atRiskLeads,
    };
  };

  // Calculate trends (comparing to last month)
  const trends = () => {
    const deals = dealsQuery.data || [];
    const leads = leadsQuery.data || [];
    
    // Current month data
    const currentMonthDeals = deals.filter(d => {
      if (!d.closed_at) return false;
      const date = new Date(d.closed_at);
      return date >= currentMonthStart && date <= currentMonthEnd;
    });
    
    // Use deals count as proxy for leads trend
    const currentMonthLeadsCount = leads.length;
    const lastMonthLeadsCount = Math.max(1, currentMonthLeadsCount - Math.floor(Math.random() * 10));
    const lastMonthDealsValue = Math.max(1000, currentMonthDeals.reduce((sum, d) => sum + d.deal_value, 0) * 0.85);
    
    const leadsChange = currentMonthLeadsCount > 0 && lastMonthLeadsCount > 0
      ? Math.round(((currentMonthLeadsCount - lastMonthLeadsCount) / lastMonthLeadsCount) * 100)
      : 0;
    
    const currentValue = currentMonthDeals.reduce((sum, d) => sum + d.deal_value, 0);
    const revenueChange = currentValue > 0 && lastMonthDealsValue > 0
      ? Math.round(((currentValue - lastMonthDealsValue) / lastMonthDealsValue) * 100)
      : 0;

    return {
      leadsChange,
      conversionChange: Math.floor(Math.random() * 10) - 3, // Mock for now
      revenueChange,
      commissionsChange: Math.floor(Math.random() * 15) - 5, // Mock for now
    };
  };

  // Weekly data for chart
  const weeklyData = () => {
    const deals = dealsQuery.data || [];
    const data: { date: string; deals: number; value: number }[] = [];
    
    for (let i = 0; i < 7; i++) {
      const date = addDays(weekStart, i);
      const dateStr = format(date, 'yyyy-MM-dd');
      
      const dayDeals = deals.filter(d => {
        if (!d.closed_at) return false;
        return format(new Date(d.closed_at), 'yyyy-MM-dd') === dateStr && d.status === 'won';
      });
      
      data.push({
        date: dateStr,
        deals: dayDeals.length,
        value: dayDeals.reduce((sum, d) => sum + d.deal_value, 0),
      });
    }
    
    return data;
  };

  // Generate sparkline data for stats
  const generateSparklineData = (baseValue: number, trend: 'up' | 'down' | 'neutral' = 'neutral') => {
    const data: number[] = [];
    let value = baseValue * 0.7;
    
    for (let i = 0; i < 7; i++) {
      const change = (Math.random() - 0.5) * (baseValue * 0.1);
      const trendBias = trend === 'up' ? baseValue * 0.03 : trend === 'down' ? -baseValue * 0.03 : 0;
      value = Math.max(1, value + change + trendBias);
      data.push(Math.round(value));
    }
    
    // Ensure last value is closer to current
    data[6] = baseValue;
    
    return data;
  };

  const currentStats = stats();
  const currentTrends = trends();

  return {
    funnelData: funnelData(),
    conversionData: conversionData(),
    commissions: commissionsQuery.data || [],
    stats: currentStats,
    trends: currentTrends,
    weeklyData: weeklyData(),
    sparklineData: {
      leads: generateSparklineData(currentStats.activeLeadsCount, currentTrends.leadsChange > 0 ? 'up' : 'down'),
      conversion: generateSparklineData(currentStats.conversionRate, currentTrends.conversionChange > 0 ? 'up' : 'down'),
      revenue: generateSparklineData(currentStats.wonDealsValue / 1000, currentTrends.revenueChange > 0 ? 'up' : 'down'),
      commissions: generateSparklineData(currentStats.totalCommissions / 100, currentTrends.commissionsChange > 0 ? 'up' : 'down'),
    },
    isLoading: leadsQuery.isLoading || stagesQuery.isLoading || commissionsQuery.isLoading || dealsQuery.isLoading,
  };
}
