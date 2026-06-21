import { useState, useMemo, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Tables, TablesInsert } from '@/integrations/supabase/types';
import { toast } from 'sonner';

type Lead = Tables<'leads'> & {
  pipeline_stages?: Tables<'pipeline_stages'> | null;
};

export type LeadFilters = {
  search: string;
  temperature: string[];
  origin: string[];
  channel: string[];
  stageId: string | null;
  squadId: string | null;
  productId: string | null;
  assignedTo: string | null;
  unassigned: boolean;
  dateFrom: Date | null;
  dateTo: Date | null;
  utmCampaign: string | null;
  tagIds: string[];
};

export type LeadSort = {
  column: string;
  direction: 'asc' | 'desc';
};

const defaultFilters: LeadFilters = {
  search: '',
  temperature: [],
  origin: [],
  channel: [],
  stageId: null,
  squadId: null,
  productId: null,
  assignedTo: null,
  unassigned: false,
  dateFrom: null,
  dateTo: null,
  utmCampaign: null,
  tagIds: [],
};

export function useLeadsManager() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  
  const [filters, setFilters] = useState<LeadFilters>(defaultFilters);
  const [sort, setSort] = useState<LeadSort>({ column: 'created_at', direction: 'desc' });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [selectedLeads, setSelectedLeads] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState('all');

  // Realtime subscription for leads
  useEffect(() => {
    if (!profile?.organization_id) return;

    const channel = supabase
      .channel('admin-leads-realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'leads',
          filter: `organization_id=eq.${profile.organization_id}`
        },
        () => {
          // Refetch both main leads and stats
          queryClient.invalidateQueries({ queryKey: ['admin-leads'] });
          queryClient.invalidateQueries({ queryKey: ['leads-stats'] });
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'lead_tag_assignments'
        },
        () => {
          // Tags also affect the listing
          queryClient.invalidateQueries({ queryKey: ['admin-leads'] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [profile?.organization_id, queryClient]);

  // Main leads query
  const { data: leadsData, isLoading, refetch } = useQuery({
    queryKey: ['admin-leads', filters, sort, page, pageSize, activeTab],
    queryFn: async () => {
      // Pré-filtro por etiquetas: buscar lead_ids que possuem TODAS as etiquetas selecionadas (intersecção)
      let restrictToIds: string[] | null = null;
      if (filters.tagIds.length > 0) {
        const { data: assigns } = await supabase
          .from('lead_tag_assignments')
          .select('lead_id, tag_id')
          .in('tag_id', filters.tagIds);
        const counts = new Map<string, number>();
        (assigns || []).forEach((a: any) => {
          counts.set(a.lead_id, (counts.get(a.lead_id) || 0) + 1);
        });
        // Match ANY (qualquer uma das etiquetas) — filtro mais permissivo/útil
        restrictToIds = Array.from(counts.keys());
        if (restrictToIds.length === 0) {
          return { leads: [], total: 0, totalPages: 0 };
        }
      }

      let query = supabase
        .from('leads')
        .select(`
          *,
          pipeline_stages (*)
        `, { count: 'exact' });

      if (restrictToIds) {
        query = query.in('id', restrictToIds);
      }

      // Apply organization filter
      if (profile?.organization_id) {
        query = query.eq('organization_id', profile.organization_id);
      }

      // Apply tab filters
      if (activeTab === 'unassigned') {
        query = query.is('assigned_to', null);
      } else if (activeTab === 'my-leads' && profile?.id) {
        query = query.eq('assigned_to', profile.id);
      }

      // Apply search filter
      if (filters.search) {
        query = query.or(`name.ilike.%${filters.search}%,email.ilike.%${filters.search}%,phone.ilike.%${filters.search}%,company.ilike.%${filters.search}%`);
      }

      // Apply temperature filter
      if (filters.temperature.length > 0) {
        query = query.in('temperature', filters.temperature as ('hot' | 'warm' | 'cold')[]);
      }

      // Apply origin filter
      if (filters.origin.length > 0) {
        query = query.in('lead_origin', filters.origin);
      }

      // Apply channel filter
      if (filters.channel.length > 0) {
        query = query.in('lead_channel', filters.channel);
      }

      // Apply stage filter
      if (filters.stageId) {
        query = query.eq('current_stage_id', filters.stageId);
      }

      // Apply squad filter
      if (filters.squadId) {
        query = query.eq('squad_id', filters.squadId);
      }

      // Apply product filter
      if (filters.productId) {
        query = query.eq('product_id', filters.productId);
      }

      // Apply assigned_to filter
      if (filters.assignedTo) {
        query = query.eq('assigned_to', filters.assignedTo);
      }

      // Apply unassigned filter
      if (filters.unassigned) {
        query = query.is('assigned_to', null);
      }

      // Apply date filters
      if (filters.dateFrom) {
        query = query.gte('created_at', filters.dateFrom.toISOString());
      }
      if (filters.dateTo) {
        query = query.lte('created_at', filters.dateTo.toISOString());
      }

      // Apply UTM campaign filter
      if (filters.utmCampaign) {
        query = query.eq('utm_campaign', filters.utmCampaign);
      }

      // Apply sorting
      query = query.order(sort.column, { ascending: sort.direction === 'asc' });

      // Apply pagination
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;
      query = query.range(from, to);

      const { data, error, count } = await query;
      if (error) throw error;

      return {
        leads: (data || []) as unknown as Lead[],
        total: count || 0,
        totalPages: Math.ceil((count || 0) / pageSize),
      };
    },
    enabled: !!profile?.organization_id,
    refetchInterval: 90000, // 30s -> 90s (Realtime de leads já invalida)
    refetchIntervalInBackground: false,
  });

  // Stats query
  const { data: stats } = useQuery({
    queryKey: ['leads-stats', profile?.organization_id],
    queryFn: async () => {
      if (!profile?.organization_id) return null;

      const { data, error } = await supabase
        .from('leads')
        .select('id, temperature, assigned_to')
        .eq('organization_id', profile.organization_id)
        .limit(5000);

      if (error) throw error;

      const total = data.length;
      const hot = data.filter(l => l.temperature === 'hot').length;
      const warm = data.filter(l => l.temperature === 'warm').length;
      const cold = data.filter(l => l.temperature === 'cold').length;
      const unassigned = data.filter(l => !l.assigned_to).length;

      return { total, hot, warm, cold, unassigned };
    },
    enabled: !!profile?.organization_id,
    refetchInterval: 180000, // 60s -> 3min (stats agregado; Realtime cobre)
    refetchIntervalInBackground: false,
  });

  // Create lead mutation
  const createLead = useMutation({
    mutationFn: async (lead: TablesInsert<'leads'>) => {
      const { data, error } = await supabase
        .from('leads')
        .insert({
          ...lead,
          organization_id: profile?.organization_id!,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-leads'] });
      queryClient.invalidateQueries({ queryKey: ['leads-stats'] });
      toast.success('Lead criado com sucesso');
    },
    onError: (error: any) => {
      // 23505 = violação de unique constraint (telefone duplicado na organização)
      if (error?.code === '23505' && String(error?.message || '').includes('leads_org_phone_unique')) {
        toast.error('Já existe um contato com este telefone nesta organização.');
      } else {
        toast.error('Erro ao criar lead: ' + (error?.message || 'desconhecido'));
      }
    },
  });

  // Bulk transfer mutation
  const bulkTransfer = useMutation({
    mutationFn: async ({ 
      leadIds, 
      assignedTo, 
      squadId, 
      reason 
    }: { 
      leadIds: string[]; 
      assignedTo: string | null; 
      squadId: string | null;
      reason?: string;
    }) => {
      const updates = leadIds.map(id => 
        supabase
          .from('leads')
          .update({ 
            assigned_to: assignedTo, 
            squad_id: squadId,
            transfer_reason: reason,
            transferred_at: new Date().toISOString(),
            transferred_by: profile?.id,
          })
          .eq('id', id)
      );

      await Promise.all(updates);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-leads'] });
      queryClient.invalidateQueries({ queryKey: ['leads-stats'] });
      setSelectedLeads([]);
      toast.success('Leads transferidos com sucesso');
    },
    onError: (error) => {
      toast.error('Erro ao transferir leads: ' + error.message);
    },
  });

  // Bulk delete mutation
  const bulkDelete = useMutation({
    mutationFn: async (leadIds: string[]) => {
      const { error } = await supabase.rpc('delete_lead_cascade', {
        _lead_ids: leadIds,
      });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-leads'] });
      queryClient.invalidateQueries({ queryKey: ['leads-stats'] });
      setSelectedLeads([]);
      toast.success('Leads excluídos com sucesso');
    },
    onError: (error) => {
      toast.error('Erro ao excluir leads: ' + error.message);
    },
  });

  // Selection handlers
  const toggleSelectLead = (leadId: string) => {
    setSelectedLeads(prev => 
      prev.includes(leadId) 
        ? prev.filter(id => id !== leadId)
        : [...prev, leadId]
    );
  };

  const toggleSelectAll = () => {
    if (!leadsData?.leads) return;
    
    if (selectedLeads.length === leadsData.leads.length) {
      setSelectedLeads([]);
    } else {
      setSelectedLeads(leadsData.leads.map(l => l.id));
    }
  };

  const clearSelection = () => setSelectedLeads([]);

  // Filter handlers
  const updateFilter = <K extends keyof LeadFilters>(key: K, value: LeadFilters[K]) => {
    setFilters(prev => ({ ...prev, [key]: value }));
    setPage(1);
  };

  const clearFilters = () => {
    setFilters(defaultFilters);
    setPage(1);
  };

  // Sort handler
  const updateSort = (column: string) => {
    setSort(prev => ({
      column,
      direction: prev.column === column && prev.direction === 'asc' ? 'desc' : 'asc',
    }));
  };

  return {
    // Data
    leads: leadsData?.leads || [],
    total: leadsData?.total || 0,
    totalPages: leadsData?.totalPages || 1,
    stats,
    isLoading,
    
    // Pagination
    page,
    pageSize,
    setPage,
    setPageSize,
    
    // Filters
    filters,
    updateFilter,
    clearFilters,
    
    // Sorting
    sort,
    updateSort,
    
    // Selection
    selectedLeads,
    toggleSelectLead,
    toggleSelectAll,
    clearSelection,
    
    // Tabs
    activeTab,
    setActiveTab,
    
    // Mutations
    createLead,
    bulkTransfer,
    bulkDelete,
    
    // Refetch
    refetch,
  };
}
