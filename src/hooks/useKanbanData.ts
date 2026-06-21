import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { KanbanFilters } from './useKanbanFilters';

export interface KanbanLead {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  company: string | null;
  position: string | null;
  temperature: 'hot' | 'warm' | 'cold' | null;
  current_stage_id: string | null;
  assigned_to: string | null;
  created_at: string;
  updated_at: string;
  last_contact_at: string | null;
  deal_value: number;
  expected_close_date: string | null;
  product_id: string | null;
  squad_id: string | null;
  pipeline_stages: {
    id: string;
    name: string;
    color: string | null;
    order_index: number;
    is_won: boolean | null;
    is_lost: boolean | null;
  } | null;
  profiles?: {
    id: string;
    full_name: string;
    avatar_url: string | null;
  } | null;
}

export interface KanbanStage {
  id: string;
  name: string;
  color: string | null;
  order_index: number;
  is_won: boolean | null;
  is_lost: boolean | null;
  leads: KanbanLead[];
  totalValue: number;
  leadCount: number;
}

export function useKanbanData(productId: string, filters: KanbanFilters) {
  const queryClient = useQueryClient();

  useEffect(() => {
    // Escuta mudanças na tabela de leads para atualizar o Kanban instantaneamente
    const channel = supabase
      .channel('kanban-realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'leads',
          ...(productId ? { filter: `product_id=eq.${productId}` } : {})
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['kanban-leads', productId] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [productId, queryClient]);

  // Fetch pipeline stages
  const stagesQuery = useQuery({
    queryKey: ['kanban-stages', productId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('pipeline_stages')
        .select('*')
        .eq('product_id', productId)
        .order('order_index', { ascending: true });
      
      if (error) throw error;
      return data;
    },
    enabled: !!productId,
  });

  // Fetch leads with filters
  const leadsQuery = useQuery({
    queryKey: ['kanban-leads', productId, filters],
    queryFn: async () => {
      let query = supabase
        .from('leads')
        .select(`
          *,
          pipeline_stages (*)
        `)
        .eq('product_id', productId);

      // Apply filters
      if (filters.search) {
        query = query.or(`name.ilike.%${filters.search}%,email.ilike.%${filters.search}%,company.ilike.%${filters.search}%`);
      }

      if (filters.sellerId) {
        query = query.eq('assigned_to', filters.sellerId);
      }

      if (filters.minValue !== null) {
        query = query.gte('deal_value', filters.minValue);
      }

      if (filters.dateFrom) {
        query = query.gte('created_at', filters.dateFrom.toISOString());
      }

      if (filters.dateTo) {
        query = query.lte('created_at', filters.dateTo.toISOString());
      }

      // Apply sorting
      query = query.order(filters.sortBy, { ascending: filters.sortDirection === 'asc' });

      const { data, error } = await query;
      if (error) throw error;

      // Fetch profiles for assigned leads
      const assignedIds = [...new Set(data?.filter(l => l.assigned_to).map(l => l.assigned_to) || [])];
      let profilesMap: Record<string, { id: string; full_name: string; avatar_url: string | null }> = {};
      
      if (assignedIds.length > 0) {
        const { data: profilesData } = await supabase
          .from('profiles')
          .select('id, full_name, avatar_url')
          .in('id', assignedIds);
        
        profilesMap = (profilesData || []).reduce((acc, p) => ({ ...acc, [p.id]: p }), {});
      }

      // Map leads with profiles
      return (data || []).map(lead => ({
        ...lead,
        profiles: lead.assigned_to ? profilesMap[lead.assigned_to] || null : null,
      })) as KanbanLead[];
    },
    enabled: !!productId,
  });

  // Fetch team members for filter
  const teamQuery = useQuery({
    queryKey: ['kanban-team'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data: profile } = await supabase
        .from('profiles')
        .select('organization_id')
        .eq('id', user.id)
        .single();

      if (!profile?.organization_id) return [];

      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, avatar_url')
        .eq('organization_id', profile.organization_id)
        .eq('is_active', true);

      if (error) throw error;
      return data;
    },
  });

  // Process data into stages with leads
  const kanbanStages: KanbanStage[] = (stagesQuery.data || []).map(stage => {
    const stageLeads = (leadsQuery.data || []).filter(
      lead => lead.current_stage_id === stage.id
    );
    
    return {
      ...stage,
      leads: stageLeads,
      totalValue: stageLeads.reduce((sum, lead) => sum + (lead.deal_value || 0), 0),
      leadCount: stageLeads.length,
    };
  });

  // Add unassigned stage for leads without stage
  const unassignedLeads = (leadsQuery.data || []).filter(
    lead => !lead.current_stage_id
  );

  if (unassignedLeads.length > 0) {
    kanbanStages.unshift({
      id: 'unassigned',
      name: 'Sem Etapa',
      color: '#6b7280',
      order_index: -1,
      is_won: null,
      is_lost: null,
      leads: unassignedLeads,
      totalValue: unassignedLeads.reduce((sum, lead) => sum + (lead.deal_value || 0), 0),
      leadCount: unassignedLeads.length,
    });
  }

  // Calculate totals
  const totalPipelineValue = kanbanStages.reduce((sum, stage) => sum + stage.totalValue, 0);
  const totalLeads = kanbanStages.reduce((sum, stage) => sum + stage.leadCount, 0);

  return {
    stages: kanbanStages,
    team: teamQuery.data || [],
    totalPipelineValue,
    totalLeads,
    isLoading: stagesQuery.isLoading || leadsQuery.isLoading,
    isError: stagesQuery.isError || leadsQuery.isError,
    refetch: () => {
      stagesQuery.refetch();
      leadsQuery.refetch();
    },
  };
}
