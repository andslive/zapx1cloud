import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

interface TransferLeadParams {
  leadId: string;
  toUserId?: string | null;
  toSquadId?: string | null;
  reason?: string;
}

export function useLeadTransferHistory(leadId: string) {
  return useQuery({
    queryKey: ['lead-transfer-history', leadId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('lead_transfer_history')
        .select(`
          *,
          from_user:profiles!lead_transfer_history_from_user_id_fkey(id, full_name, avatar_url),
          to_user:profiles!lead_transfer_history_to_user_id_fkey(id, full_name, avatar_url),
          from_squad:sales_squads!lead_transfer_history_from_squad_id_fkey(id, name, color),
          to_squad:sales_squads!lead_transfer_history_to_squad_id_fkey(id, name, color),
          transferred_by_user:profiles!lead_transfer_history_transferred_by_fkey(id, full_name)
        `)
        .eq('lead_id', leadId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data;
    },
    enabled: !!leadId
  });
}

export function useTransferLead() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ leadId, toUserId, toSquadId, reason }: TransferLeadParams) => {
      // First get current lead data
      const { data: currentLead, error: fetchError } = await supabase
        .from('leads')
        .select('assigned_to, squad_id')
        .eq('id', leadId)
        .single();

      if (fetchError) throw fetchError;

      // Update lead
      const { data: updatedLead, error: updateError } = await supabase
        .from('leads')
        .update({
          assigned_to: toUserId,
          squad_id: toSquadId,
          previous_assigned_to: currentLead.assigned_to,
          transferred_at: new Date().toISOString(),
          transferred_by: user?.id,
          transfer_reason: reason
        })
        .eq('id', leadId)
        .select()
        .single();

      if (updateError) throw updateError;

      // Create transfer history record
      const { error: historyError } = await supabase
        .from('lead_transfer_history')
        .insert({
          lead_id: leadId,
          from_user_id: currentLead.assigned_to,
          to_user_id: toUserId,
          from_squad_id: currentLead.squad_id,
          to_squad_id: toSquadId,
          reason,
          transferred_by: user?.id
        });

      if (historyError) throw historyError;

      return updatedLead;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      queryClient.invalidateQueries({ queryKey: ['lead', data.id] });
      queryClient.invalidateQueries({ queryKey: ['lead-transfer-history', data.id] });
    }
  });
}

export function useUnassignedLeads(squadId?: string) {
  return useQuery({
    queryKey: ['unassigned-leads', squadId],
    queryFn: async () => {
      let query = supabase
        .from('leads')
        .select(`
          *,
          pipeline_stages (*),
          squad:sales_squads(id, name, color)
        `)
        .is('assigned_to', null)
        .order('created_at', { ascending: false });

      if (squadId) {
        query = query.eq('squad_id', squadId);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data;
    }
  });
}
