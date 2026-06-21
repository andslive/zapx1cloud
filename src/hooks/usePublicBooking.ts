import { useQuery, useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { BookingEventType, QuestionField } from './useBookingEventTypes';

// Helper function to parse questions from JSON
function parseEventType(data: unknown): BookingEventType {
  const item = data as Record<string, unknown>;
  return {
    ...item,
    questions: Array.isArray(item.questions) ? item.questions as QuestionField[] : [],
    booking_experience: (item.booking_experience as 'standard' | 'conversational') || 'standard',
  } as BookingEventType;
}

export interface PublicProfile {
  id: string;
  full_name: string;
  avatar_url: string | null;
  booking_slug: string | null;
  booking_bio: string | null;
}

export interface AvailableSlot {
  start: string;
  end: string;
  available: boolean;
}

export interface BookingSubmitInput {
  eventTypeId: string;
  startTime: string;
  guestName: string;
  guestEmail: string;
  guestPhone?: string;
  additionalInfo?: Record<string, unknown>;
  timezone: string;
  tracking?: Record<string, unknown>;
}

// Buscar perfil público por slug
export function usePublicProfile(slug: string | undefined) {
  return useQuery({
    queryKey: ['public-profile', slug],
    queryFn: async () => {
      if (!slug) return null;
      
      const { data, error } = await (supabase as any)
        .from('public_booking_profiles')
        .select('id, full_name, avatar_url, booking_slug, booking_bio')
        .eq('booking_slug', slug)
        .maybeSingle();

      if (error) throw error;
      return data as PublicProfile | null;
    },
    enabled: !!slug,
  });
}

// Buscar tipos de evento ativos de um usuário
export function usePublicEventTypes(userId: string | undefined) {
  return useQuery({
    queryKey: ['public-event-types', userId],
    queryFn: async () => {
      if (!userId) return [];
      
      const { data, error } = await supabase
        .from('booking_event_types')
        .select('*')
        .eq('user_id', userId)
        .eq('is_active', true)
        .order('name');

      if (error) throw error;
      return (data || []).map(parseEventType);
    },
    enabled: !!userId,
  });
}

// Buscar tipo de evento por slug
export function usePublicEventTypeBySlug(userSlug: string | undefined, eventSlug: string | undefined) {
  return useQuery({
    queryKey: ['public-event-type', userSlug, eventSlug],
    queryFn: async () => {
      if (!userSlug || !eventSlug) return null;
      
      // Primeiro buscar o usuário pelo slug (view pública segura)
      const { data: profile, error: profileError } = await (supabase as any)
        .from('public_booking_profiles')
        .select('id, full_name, avatar_url, booking_slug, booking_bio')
        .eq('booking_slug', userSlug)
        .maybeSingle();

      if (profileError) throw profileError;
      if (!profile) return null;

      // Depois buscar o tipo de evento
      const { data: eventType, error: eventError } = await supabase
        .from('booking_event_types')
        .select('*')
        .eq('user_id', profile.id)
        .eq('slug', eventSlug)
        .eq('is_active', true)
        .maybeSingle();

      if (eventError) throw eventError;
      if (!eventType) return null;

      return {
        profile,
        eventType: parseEventType(eventType),
      };
    },
    enabled: !!userSlug && !!eventSlug,
  });
}

// Buscar slots disponíveis para uma data
export function useAvailableSlots(eventTypeId: string | undefined, date: string | undefined, timezone: string = 'America/Sao_Paulo') {
  return useQuery({
    queryKey: ['available-slots', eventTypeId, date, timezone],
    queryFn: async () => {
      if (!eventTypeId || !date) return [];
      
      const { data, error } = await supabase.functions.invoke('booking-availability', {
        body: { eventTypeId, date, timezone },
      });

      if (error) throw error;
      return (data?.slots || []) as AvailableSlot[];
    },
    enabled: !!eventTypeId && !!date,
    staleTime: 1000 * 60, // 1 minuto
  });
}

// Submeter agendamento
export function useSubmitBooking() {
  return useMutation({
    mutationFn: async (input: BookingSubmitInput) => {
      const { data, error } = await supabase.functions.invoke('booking-submit', {
        body: input,
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      
      return data as {
        success: boolean;
        bookingId: string;
        calendarEventId: string;
        meetLink?: string;
        confirmationToken: string;
      };
    },
    onSuccess: () => {
      toast.success('Agendamento confirmado!');
    },
    onError: (error: Error) => {
      console.error('Error submitting booking:', error);
      toast.error(error.message || 'Erro ao agendar');
    },
  });
}

// Cancelar booking público por token
export function useCancelBookingPublic() {
  return useMutation({
    mutationFn: async ({ token, reason }: { token: string; reason?: string }) => {
      const { data, error } = await supabase
        .from('booking_requests')
        .update({ 
          status: 'cancelled',
          cancellation_reason: reason 
        })
        .eq('confirmation_token', token)
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

      return data;
    },
    onSuccess: () => {
      toast.success('Agendamento cancelado com sucesso!');
    },
    onError: (error: Error) => {
      console.error('Error cancelling booking:', error);
      toast.error('Erro ao cancelar agendamento');
    },
  });
}
