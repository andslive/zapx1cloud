import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { startOfMonth, endOfMonth, format } from 'date-fns';

export interface SquadPerformance {
  squadId: string;
  squadName: string;
  squadColor: string | null;
  squadIcon: string | null;
  membersCount: number;
  totalDeals: number;
  totalValue: number;
  targetValue: number;
  progressPercent: number;
  conversionRate: number;
  topSeller?: {
    id: string;
    name: string;
    value: number;
  };
}

export interface MemberPerformance {
  userId: string;
  userName: string;
  userAvatar: string | null;
  role: string;
  dealsCount: number;
  totalValue: number;
  targetValue: number;
  progressPercent: number;
}

export function useSquadPerformance(squadId?: string) {
  const { profile } = useAuth();
  const organizationId = profile?.organization_id;

  return useQuery({
    queryKey: ['squad-performance', squadId],
    queryFn: async () => {
      if (!squadId) return null;

      const now = new Date();
      const monthStart = format(startOfMonth(now), 'yyyy-MM-dd');
      const monthEnd = format(endOfMonth(now), 'yyyy-MM-dd');

      // Get squad members
      const { data: members } = await supabase
        .from('squad_members')
        .select('user_id, role')
        .eq('squad_id', squadId);

      if (!members?.length) {
        return {
          squadId,
          membersCount: 0,
          totalDeals: 0,
          totalValue: 0,
          targetValue: 0,
          progressPercent: 0,
          conversionRate: 0,
          memberPerformances: []
        };
      }

      const memberIds = members.map(m => m.user_id);

      // Get deals for these members this month
      const { data: deals } = await supabase
        .from('deals')
        .select('seller_id, deal_value, status')
        .in('seller_id', memberIds)
        .eq('status', 'won')
        .gte('closed_at', monthStart)
        .lte('closed_at', monthEnd);

      // Get leads for conversion rate
      const { data: leads } = await supabase
        .from('leads')
        .select('id, assigned_to, current_stage_id')
        .in('assigned_to', memberIds);

      // Get goals for these members
      const { data: goals } = await supabase
        .from('sales_goals')
        .select('user_id, target_value')
        .in('user_id', memberIds)
        .gte('period_end', monthStart)
        .lte('period_start', monthEnd)
        .eq('is_active', true);

      // Get profiles
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name, avatar_url')
        .in('id', memberIds);

      const profileMap = new Map(profiles?.map(p => [p.id, p]));
      const roleMap = new Map(members.map(m => [m.user_id, m.role]));

      // Calculate per-member performance
      const memberPerformances: MemberPerformance[] = memberIds.map(userId => {
        const profile = profileMap.get(userId);
        const memberDeals = deals?.filter(d => d.seller_id === userId) || [];
        const memberGoal = goals?.find(g => g.user_id === userId);
        const totalValue = memberDeals.reduce((sum, d) => sum + Number(d.deal_value), 0);
        const targetValue = Number(memberGoal?.target_value || 0);

        return {
          userId,
          userName: profile?.full_name || 'Usuário',
          userAvatar: profile?.avatar_url,
          role: roleMap.get(userId) || 'member',
          dealsCount: memberDeals.length,
          totalValue,
          targetValue,
          progressPercent: targetValue > 0 ? Math.min((totalValue / targetValue) * 100, 100) : 0
        };
      });

      // Aggregate squad totals
      const totalDeals = deals?.length || 0;
      const totalValue = deals?.reduce((sum, d) => sum + Number(d.deal_value), 0) || 0;
      const totalTarget = memberPerformances.reduce((sum, m) => sum + m.targetValue, 0);

      // Get won stages for conversion rate
      const { data: wonStages } = await supabase
        .from('pipeline_stages')
        .select('id')
        .eq('is_won', true);
      
      const wonStageIds = new Set(wonStages?.map(s => s.id) || []);
      const totalLeads = leads?.length || 0;
      const wonLeads = leads?.filter(l => l.current_stage_id && wonStageIds.has(l.current_stage_id)).length || 0;

      // Find top seller
      const sortedMembers = [...memberPerformances].sort((a, b) => b.totalValue - a.totalValue);
      const topSeller = sortedMembers[0];

      return {
        squadId,
        membersCount: members.length,
        totalDeals,
        totalValue,
        targetValue: totalTarget,
        progressPercent: totalTarget > 0 ? Math.min((totalValue / totalTarget) * 100, 100) : 0,
        conversionRate: totalLeads > 0 ? (wonLeads / totalLeads) * 100 : 0,
        topSeller: topSeller ? {
          id: topSeller.userId,
          name: topSeller.userName,
          value: topSeller.totalValue
        } : undefined,
        memberPerformances
      };
    },
    enabled: !!squadId
  });
}

export function useAllSquadsPerformance() {
  const { profile } = useAuth();
  const organizationId = profile?.organization_id;

  return useQuery({
    queryKey: ['all-squads-performance', organizationId],
    queryFn: async () => {
      const now = new Date();
      const monthStart = format(startOfMonth(now), 'yyyy-MM-dd');
      const monthEnd = format(endOfMonth(now), 'yyyy-MM-dd');

      // Get all active squads
      const { data: squads } = await supabase
        .from('sales_squads')
        .select('id, name, color, icon_url')
        .eq('is_active', true);

      if (!squads?.length) return [];

      // Get all squad members
      const { data: allMembers } = await supabase
        .from('squad_members')
        .select('squad_id, user_id')
        .in('squad_id', squads.map(s => s.id));

      const membersBySquad = new Map<string, string[]>();
      allMembers?.forEach(m => {
        const existing = membersBySquad.get(m.squad_id) || [];
        membersBySquad.set(m.squad_id, [...existing, m.user_id]);
      });

      const allMemberIds = [...new Set(allMembers?.map(m => m.user_id) || [])];

      // Get all deals for these members
      const { data: deals } = await supabase
        .from('deals')
        .select('seller_id, deal_value')
        .in('seller_id', allMemberIds)
        .eq('status', 'won')
        .gte('closed_at', monthStart)
        .lte('closed_at', monthEnd);

      // Get goals
      const { data: goals } = await supabase
        .from('sales_goals')
        .select('user_id, target_value')
        .in('user_id', allMemberIds)
        .gte('period_end', monthStart)
        .lte('period_start', monthEnd)
        .eq('is_active', true);

      // Calculate performance for each squad
      const performances: SquadPerformance[] = squads.map(squad => {
        const squadMemberIds = membersBySquad.get(squad.id) || [];
        const squadDeals = deals?.filter(d => squadMemberIds.includes(d.seller_id)) || [];
        const squadGoals = goals?.filter(g => squadMemberIds.includes(g.user_id)) || [];

        const totalValue = squadDeals.reduce((sum, d) => sum + Number(d.deal_value), 0);
        const targetValue = squadGoals.reduce((sum, g) => sum + Number(g.target_value), 0);

        return {
          squadId: squad.id,
          squadName: squad.name,
          squadColor: squad.color,
          squadIcon: squad.icon_url,
          membersCount: squadMemberIds.length,
          totalDeals: squadDeals.length,
          totalValue,
          targetValue,
          progressPercent: targetValue > 0 ? Math.min((totalValue / targetValue) * 100, 100) : 0,
          conversionRate: 0 // Simplified for overview
        };
      });

      return performances.sort((a, b) => b.totalValue - a.totalValue);
    },
    enabled: !!organizationId
  });
}
