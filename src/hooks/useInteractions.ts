import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Tables, TablesInsert } from '@/integrations/supabase/types';

type Interaction = Tables<'interactions'>;
type LeadStageHistory = Tables<'lead_stage_history'>;

export function useInteractions(leadId: string) {
  return useQuery({
    queryKey: ['interactions', leadId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('interactions')
        .select('*')
        .eq('lead_id', leadId)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data as Interaction[];
    },
    enabled: !!leadId
  });
}

export function useLeadStageHistory(leadId: string) {
  return useQuery({
    queryKey: ['lead-stage-history', leadId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('lead_stage_history')
        .select(`
          *,
          pipeline_stages (*)
        `)
        .eq('lead_id', leadId)
        .order('entered_at', { ascending: false });
      
      if (error) throw error;
      return data;
    },
    enabled: !!leadId
  });
}

export function useCreateInteraction() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (interaction: TablesInsert<'interactions'>) => {
      const { data, error } = await supabase
        .from('interactions')
        .insert(interaction)
        .select()
        .single();
      
      if (error) throw error;
      
      // Update lead's last_contact_at
      await supabase
        .from('leads')
        .update({ last_contact_at: new Date().toISOString() })
        .eq('id', interaction.lead_id);
      
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['interactions', data.lead_id] });
      queryClient.invalidateQueries({ queryKey: ['leads'] });
    }
  });
}

// Combined timeline data (interactions + stage changes)
export function useLeadTimeline(leadId: string) {
  const { data: interactions, isLoading: interactionsLoading } = useInteractions(leadId);
  const { data: stageHistory, isLoading: historyLoading } = useLeadStageHistory(leadId);

  const timelineItems = [
    ...(interactions?.map(i => ({
      id: i.id,
      type: 'interaction' as const,
      channel: i.channel,
      content: i.content,
      direction: i.direction,
      timestamp: i.created_at,
      cadenceDay: i.cadence_day,
    })) || []),
    ...(stageHistory?.map(h => ({
      id: h.id,
      type: 'stage_change' as const,
      stageName: h.pipeline_stages?.name || 'Stage removido',
      stageColor: h.pipeline_stages?.color || '#6B7280',
      timestamp: h.entered_at,
      daysInStage: h.days_in_stage,
    })) || [])
  ].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  return {
    data: timelineItems,
    isLoading: interactionsLoading || historyLoading
  };
}
