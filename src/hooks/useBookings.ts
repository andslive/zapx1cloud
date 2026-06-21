import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

export interface BookingRequest {
  id: string;
  organization_id: string;
  event_type_id: string;
  host_user_id: string;
  calendar_event_id: string | null;
  guest_name: string;
  guest_email: string;
  guest_phone: string | null;
  start_time: string;
  end_time: string;
  timezone: string;
  status: 'pending' | 'confirmed' | 'cancelled' | 'completed';
  additional_info: Record<string, unknown>;
  cancellation_reason: string | null;
  confirmation_token: string;
  lead_id: string | null;
  tracking: Record<string, unknown>;
  created_at: string;
  // Joined data
  event_type?: {
    id: string;
    name: string;
    color: string;
    duration_minutes: number;
    location_type: string;
  };
  host?: {
    id: string;
    full_name: string;
    avatar_url: string | null;
  };
}

export interface BookingsFilter {
  status?: string;
  dateFrom?: string;
  dateTo?: string;
  upcoming?: boolean;
}

export function useBookings(filter?: BookingsFilter) {
  const { user, profile } = useAuth();
  const queryClient = useQueryClient();

  const { data: bookings, isLoading, error } = useQuery({
    queryKey: ['bookings', user?.id, profile?.organization_id, filter],
    queryFn: async () => {
      if (!user?.id || !profile?.organization_id) return [];
      
      let query = supabase
        .from('booking_requests')
        .select(`
          *,
          event_type:booking_event_types!event_type_id(
            id, name, color, duration_minutes, location_type
          ),
          host:profiles!host_user_id(
            id, full_name, avatar_url
          )
        `)
        .eq('host_user_id', user.id)
        .eq('organization_id', profile.organization_id)
        .order('start_time', { ascending: filter?.upcoming !== false });

      if (filter?.status) {
        query = query.eq('status', filter.status);
      }

      if (filter?.upcoming) {
        query = query.gte('start_time', new Date().toISOString());
      }

      if (filter?.dateFrom) {
        query = query.gte('start_time', filter.dateFrom);
      }

      if (filter?.dateTo) {
        query = query.lte('start_time', filter.dateTo);
      }

      const { data, error } = await query;

      if (error) throw error;
      return (data || []) as BookingRequest[];
    },
    enabled: !!user?.id && !!profile?.organization_id,
  });

  const cancelBooking = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason?: string }) => {
      const { data, error } = await supabase
        .from('booking_requests')
        .update({ 
          status: 'cancelled',
          cancellation_reason: reason 
        })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      // Também cancelar o evento de calendário associado
      if (data.calendar_event_id) {
        await supabase
          .from('calendar_events')
          .update({ status: 'cancelled' })
          .eq('id', data.calendar_event_id);
      }

      return data as BookingRequest;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bookings'] });
      queryClient.invalidateQueries({ queryKey: ['calendar-events'] });
      toast.success('Agendamento cancelado!');
    },
    onError: (error: Error) => {
      console.error('Error cancelling booking:', error);
      toast.error('Erro ao cancelar agendamento');
    },
  });

  const markCompleted = useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase
        .from('booking_requests')
        .update({ status: 'completed' })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data as BookingRequest;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bookings'] });
      toast.success('Agendamento concluído!');
    },
    onError: (error: Error) => {
      console.error('Error marking booking completed:', error);
      toast.error('Erro ao concluir agendamento');
    },
  });

  // Agrupar por data
  const bookingsByDate = (bookings || []).reduce((acc, booking) => {
    const date = booking.start_time.split('T')[0];
    if (!acc[date]) {
      acc[date] = [];
    }
    acc[date].push(booking);
    return acc;
  }, {} as Record<string, BookingRequest[]>);

  return {
    bookings: bookings || [],
    bookingsByDate,
    isLoading,
    error,
    cancelBooking,
    markCompleted,
  };
}

// Hook para buscar um booking por token (público)
export function useBookingByToken(token: string | undefined) {
  return useQuery({
    queryKey: ['booking-by-token', token],
    queryFn: async () => {
      if (!token) return null;
      
      const { data, error } = await supabase
        .from('booking_requests')
        .select(`
          *,
          event_type:booking_event_types!event_type_id(
            id, name, color, duration_minutes, location_type, location_details
          ),
          host:profiles!host_user_id(
            id, full_name, avatar_url, booking_bio
          )
        `)
        .eq('confirmation_token', token)
        .maybeSingle();

      if (error) throw error;
      return data as BookingRequest | null;
    },
    enabled: !!token,
  });
}
