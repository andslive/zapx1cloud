import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { toast } from 'sonner';

export interface LeadQueueItem {
  id: string;
  lead_id: string;
  squad_id: string;
  organization_id: string;
  product_id: string | null;
  status: 'pending' | 'assigned' | 'expired';
  priority: number;
  queued_at: string;
  assigned_to: string | null;
  assigned_at: string | null;
  lead?: {
    id: string;
    name: string;
    email: string | null;
    phone: string | null;
    company: string | null;
    temperature: string | null;
    created_at: string;
  };
}

// Fetch pending leads in the user's squads
export function useMySquadQueue() {
  const { profile } = useAuth();

  const query = useQuery({
    queryKey: ['squad-queue', profile?.id],
    queryFn: async () => {
      // Get user's squads
      const { data: mySquads } = await supabase
        .from('squad_members')
        .select('squad_id')
        .eq('user_id', profile!.id);

      if (!mySquads || mySquads.length === 0) return [];

      const squadIds = mySquads.map(s => s.squad_id);

      const { data, error } = await supabase
        .from('lead_queue')
        .select(`
          *,
          lead:leads(id, name, email, phone, company, temperature, created_at)
        `)
        .in('squad_id', squadIds)
        .eq('status', 'pending')
        .order('priority', { ascending: false })
        .order('queued_at', { ascending: true });

      if (error) throw error;
      return (data || []) as LeadQueueItem[];
    },
    enabled: !!profile?.id,
    refetchInterval: 90000, // 30s -> 90s (Realtime cobre)
    refetchIntervalInBackground: false,
  });

  // Realtime subscription to lead_queue changes
  useEffect(() => {
    if (!profile?.id) return;

    const channel = supabase
      .channel('squad-queue-realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'lead_queue',
        },
        () => {
          query.refetch();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [profile?.id]);

  return query;
}

// Assume the next lead in queue
export function useAssumeNextLead() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async () => {
      if (!user?.id) throw new Error('User not authenticated');

      const { data, error } = await supabase.rpc('process_pending_queue', {
        p_user_id: user.id,
      });

      if (error) throw error;

      if (!data || data.length === 0) {
        throw new Error('NO_LEADS');
      }

      return data[0] as { assigned_lead_id: string; assigned_squad_id: string };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      queryClient.invalidateQueries({ queryKey: ['squad-queue'] });
      queryClient.invalidateQueries({ queryKey: ['user-status'] });
      toast.success('🎯 Lead assumido com sucesso!', {
        description: 'O lead foi adicionado ao seu pipeline.',
      });
    },
    onError: (error: Error) => {
      if (error.message === 'NO_LEADS') {
        toast.info('Nenhum lead pendente na fila do squad.');
      } else {
        toast.error('Erro ao assumir lead');
        console.error(error);
      }
    },
  });
}

// Assume a specific lead from queue
export function useAssumeSpecificLead() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ leadId, queueId }: { leadId: string; queueId: string }) => {
      if (!user?.id) throw new Error('User not authenticated');

      // Mark queue item as assigned
      const { error: queueError } = await supabase
        .from('lead_queue')
        .update({
          status: 'assigned',
          assigned_to: user.id,
          assigned_at: new Date().toISOString(),
        })
        .eq('id', queueId)
        .eq('status', 'pending');

      if (queueError) throw queueError;

      // Assign lead to user
      const { error: leadError } = await supabase
        .from('leads')
        .update({ assigned_to: user.id })
        .eq('id', leadId);

      if (leadError) throw leadError;

      return { leadId };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      queryClient.invalidateQueries({ queryKey: ['squad-queue'] });
      toast.success('🎯 Lead assumido!', {
        description: 'O lead foi adicionado ao seu pipeline.',
      });
    },
    onError: () => {
      toast.error('Erro ao assumir lead. Tente novamente.');
    },
  });
}
