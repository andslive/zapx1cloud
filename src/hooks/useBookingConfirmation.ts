import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface BookingDetails {
  id: string;
  guest_name: string;
  guest_email: string;
  guest_phone: string | null;
  start_time: string;
  end_time: string;
  timezone: string;
  status: string;
  confirmation_token: string;
  additional_info: Record<string, unknown>;
  created_at: string;
  event_type: {
    id: string;
    name: string;
    description: string | null;
    duration_minutes: number;
    color: string;
    location_type: string;
    thank_you_title: string | null;
    thank_you_message: string | null;
    what_happens: unknown | null;
    next_steps: unknown | null;
  } | null;
  host_profile: {
    id: string;
    full_name: string;
    avatar_url: string | null;
  } | null;
  calendar_event: {
    id: string;
    meet_link: string | null;
  } | null;
}

export function useBookingByToken(token: string | undefined) {
  return useQuery({
    queryKey: ['booking-by-token', token],
    queryFn: async (): Promise<BookingDetails | null> => {
      if (!token) return null;

      // Use SECURITY DEFINER RPC instead of direct table read.
      // The RPC validates the token server-side, preventing any anonymous
      // enumeration of booking PII.
      const { data: rows, error } = await supabase
        .rpc('get_booking_by_token', { p_token: token });

      if (error) throw error;
      const data = Array.isArray(rows) ? rows[0] : rows;
      if (!data) return null;

      // Fetch related data
      const [eventTypeResult, hostResult, calendarEventResult] = await Promise.all([
        supabase
          .from('booking_event_types')
          .select('id, name, description, duration_minutes, color, location_type, thank_you_title, thank_you_message, what_happens, next_steps')
          .eq('id', data.event_type_id)
          .maybeSingle(),
        supabase
          .from('profiles')
          .select('id, full_name, avatar_url')
          .eq('id', data.host_user_id)
          .maybeSingle(),
        data.calendar_event_id
          ? supabase
              .from('calendar_events')
              .select('id, meet_link')
              .eq('id', data.calendar_event_id)
              .maybeSingle()
          : Promise.resolve({ data: null, error: null }),
      ]);

      return {
        ...data,
        additional_info: (data.additional_info as Record<string, unknown>) || {},
        event_type: eventTypeResult.data,
        host_profile: hostResult.data,
        calendar_event: calendarEventResult.data,
      };
    },
    enabled: !!token,
  });
}

export function useRescheduleBooking() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ 
      token, 
      newStartTime,
      timezone 
    }: { 
      token: string; 
      newStartTime: string;
      timezone: string;
    }) => {
      // First, get the booking details
      const { data: booking, error: bookingError } = await supabase
        .from('booking_requests')
        .select('*, booking_event_types!inner(duration_minutes)')
        .eq('confirmation_token', token)
        .single();

      if (bookingError || !booking) {
        throw new Error('Booking not found');
      }

      const duration = (booking.booking_event_types as { duration_minutes: number }).duration_minutes;
      const startDate = new Date(newStartTime);
      const endDate = new Date(startDate.getTime() + duration * 60 * 1000);

      // Update booking_requests
      const { error: updateError } = await supabase
        .from('booking_requests')
        .update({
          start_time: newStartTime,
          end_time: endDate.toISOString(),
          timezone,
        })
        .eq('confirmation_token', token);

      if (updateError) throw updateError;

      // Update calendar_events if exists
      if (booking.calendar_event_id) {
        await supabase
          .from('calendar_events')
          .update({
            start_time: newStartTime,
            end_time: endDate.toISOString(),
          })
          .eq('id', booking.calendar_event_id);
      }

      return { success: true };
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['booking-by-token', variables.token] });
      toast.success('Agendamento reagendado com sucesso!');
    },
    onError: (error: Error) => {
      console.error('Error rescheduling:', error);
      toast.error('Erro ao reagendar');
    },
  });
}

export function useCancelBookingByToken() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ token, reason }: { token: string; reason?: string }) => {
      const { data, error } = await supabase
        .from('booking_requests')
        .update({ 
          status: 'cancelled',
          cancellation_reason: reason,
        })
        .eq('confirmation_token', token)
        .select('calendar_event_id')
        .single();

      if (error) throw error;

      // Cancel calendar event
      if (data?.calendar_event_id) {
        await supabase
          .from('calendar_events')
          .update({ status: 'cancelled' })
          .eq('id', data.calendar_event_id);
      }

      return { success: true };
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['booking-by-token', variables.token] });
      toast.success('Agendamento cancelado');
    },
    onError: (error: Error) => {
      console.error('Error cancelling:', error);
      toast.error('Erro ao cancelar');
    },
  });
}
