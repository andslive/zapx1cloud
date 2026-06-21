import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';

export interface CalendarEvent {
  id: string;
  organization_id: string;
  user_id: string;
  title: string;
  description: string | null;
  location: string | null;
  event_type: string;
  start_time: string;
  end_time: string;
  all_day: boolean;
  timezone: string;
  is_recurring: boolean;
  recurrence_rule: string | null;
  recurrence_end_date: string | null;
  parent_event_id: string | null;
  lead_id: string | null;
  product_id: string | null;
  deal_id: string | null;
  attendees: any[];
  status: string;
  reminder_minutes: number[];
  google_event_id: string | null;
  google_calendar_id: string | null;
  last_synced_at: string | null;
  sync_status: string;
  color: string | null;
  notes: string | null;
  metadata: Record<string, any>;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  meet_link: string | null;
  create_meet: boolean;
  // Joined data
  lead?: { id: string; name: string } | null;
  product?: { id: string; name: string } | null;
  user?: { id: string; full_name: string } | null;
}

export interface CreateEventData {
  title: string;
  description?: string;
  location?: string;
  event_type?: string;
  start_time: string;
  end_time: string;
  all_day?: boolean;
  lead_id?: string;
  product_id?: string;
  deal_id?: string;
  attendees?: any[];
  reminder_minutes?: number[];
  color?: string;
  notes?: string;
  is_recurring?: boolean;
  recurrence_rule?: string;
  recurrence_end_date?: string;
  create_meet?: boolean;
}

export interface CalendarFilters {
  userId?: string;
  productId?: string;
  eventType?: string;
  startDate: Date;
  endDate: Date;
}

export function useCalendarEvents(filters: CalendarFilters) {
  const { user, profile, isAdmin, isManager } = useAuth();

  return useQuery({
    queryKey: ['calendar-events', filters],
    queryFn: async () => {
      if (!profile?.organization_id) return [];

      let query = supabase
        .from('calendar_events')
        .select(`
          *,
          lead:leads(id, name),
          product:products(id, name)
        `)
        .eq('organization_id', profile.organization_id)
        .gte('start_time', filters.startDate.toISOString())
        .lte('start_time', filters.endDate.toISOString())
        .order('start_time', { ascending: true });

      // If not admin/manager, only show own events
      if (!isAdmin() && !isManager()) {
        query = query.eq('user_id', user?.id);
      } else if (filters.userId) {
        query = query.eq('user_id', filters.userId);
      }

      if (filters.productId) {
        query = query.eq('product_id', filters.productId);
      }

      if (filters.eventType) {
        query = query.eq('event_type', filters.eventType);
      }

      const { data, error } = await query;

      if (error) throw error;
      return (data || []) as CalendarEvent[];
    },
    enabled: !!profile?.organization_id,
  });
}

export function useUpcomingEvents(days: number = 7) {
  const { user, profile } = useAuth();
  const now = new Date();
  const endDate = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);

  return useQuery({
    queryKey: ['upcoming-events', user?.id, days],
    queryFn: async () => {
      if (!user?.id) return [];

      const { data, error } = await supabase
        .from('calendar_events')
        .select(`
          *,
          lead:leads(id, name),
          product:products(id, name)
        `)
        .eq('user_id', user.id)
        .gte('start_time', now.toISOString())
        .lte('start_time', endDate.toISOString())
        .order('start_time', { ascending: true })
        .limit(10);

      if (error) throw error;
      return (data || []) as CalendarEvent[];
    },
    enabled: !!user?.id,
  });
}

export function useCreateEvent() {
  const { user, profile } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (data: CreateEventData) => {
      if (!user?.id || !profile?.organization_id) {
        throw new Error('Usuário não autenticado');
      }

      const { data: event, error } = await supabase
        .from('calendar_events')
        .insert({
          ...data,
          user_id: user.id,
          organization_id: profile.organization_id,
          created_by: user.id,
        })
        .select()
        .single();

      if (error) throw error;
      return event;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['calendar-events'] });
      queryClient.invalidateQueries({ queryKey: ['upcoming-events'] });
      toast({
        title: 'Evento criado',
        description: 'O evento foi adicionado à agenda.',
      });
    },
    onError: (error) => {
      toast({
        title: 'Erro ao criar evento',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

export function useUpdateEvent() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ id, ...data }: Partial<CreateEventData> & { id: string }) => {
      const { data: event, error } = await supabase
        .from('calendar_events')
        .update(data)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return event;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['calendar-events'] });
      queryClient.invalidateQueries({ queryKey: ['upcoming-events'] });
      toast({
        title: 'Evento atualizado',
        description: 'As alterações foram salvas.',
      });
    },
    onError: (error) => {
      toast({
        title: 'Erro ao atualizar evento',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

export function useDeleteEvent() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('calendar_events')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['calendar-events'] });
      queryClient.invalidateQueries({ queryKey: ['upcoming-events'] });
      toast({
        title: 'Evento excluído',
        description: 'O evento foi removido da agenda.',
      });
    },
    onError: (error) => {
      toast({
        title: 'Erro ao excluir evento',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}
