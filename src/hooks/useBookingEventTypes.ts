import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import type { Json } from '@/integrations/supabase/types';

export interface BookingEventType {
  id: string;
  organization_id: string;
  user_id: string;
  name: string;
  slug: string;
  description: string | null;
  duration_minutes: number;
  location_type: string;
  location_details: string | null;
  color: string;
  is_active: boolean;
  buffer_before: number;
  buffer_after: number;
  min_notice_hours: number;
  max_days_ahead: number;
  questions: QuestionField[];
  confirmation_message: string | null;
  create_meet: boolean;
  thank_you_title: string | null;
  thank_you_message: string | null;
  what_happens: unknown | null;
  next_steps: unknown | null;
  booking_experience: 'standard' | 'conversational';
  created_at: string;
  updated_at: string;
}

export interface QuestionField {
  id: string;
  label: string;
  type: 'text' | 'textarea' | 'select' | 'phone' | 'email';
  required: boolean;
  options?: string[];
  placeholder?: string;
}

export interface CreateEventTypeInput {
  name: string;
  slug: string;
  description?: string;
  duration_minutes: number;
  location_type: string;
  location_details?: string;
  color?: string;
  is_active?: boolean;
  buffer_before?: number;
  buffer_after?: number;
  min_notice_hours?: number;
  max_days_ahead?: number;
  questions?: QuestionField[];
  confirmation_message?: string;
  create_meet?: boolean;
  booking_experience?: 'standard' | 'conversational';
}

// Helper function to parse questions from JSON
function parseEventType(data: unknown): BookingEventType {
  const item = data as Record<string, unknown>;
  return {
    ...item,
    questions: Array.isArray(item.questions) ? item.questions as QuestionField[] : [],
  } as BookingEventType;
}

export function useBookingEventTypes() {
  const { user, profile } = useAuth();
  const queryClient = useQueryClient();

  const { data: eventTypes, isLoading, error } = useQuery({
    queryKey: ['booking-event-types', user?.id, profile?.organization_id],
    queryFn: async () => {
      if (!user?.id || !profile?.organization_id) return [];
      
      const { data, error } = await supabase
        .from('booking_event_types')
        .select('*')
        .eq('user_id', user.id)
        .eq('organization_id', profile.organization_id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return (data || []).map(parseEventType);
    },
    enabled: !!user?.id && !!profile?.organization_id,
  });

  const createEventType = useMutation({
    mutationFn: async (input: CreateEventTypeInput) => {
      if (!user?.id || !profile?.organization_id) {
        throw new Error('User not authenticated');
      }

      const { data, error } = await supabase
        .from('booking_event_types')
        .insert({
          name: input.name,
          slug: input.slug,
          description: input.description,
          duration_minutes: input.duration_minutes,
          location_type: input.location_type,
          location_details: input.location_details,
          color: input.color,
          is_active: input.is_active,
          buffer_before: input.buffer_before,
          buffer_after: input.buffer_after,
          min_notice_hours: input.min_notice_hours,
          max_days_ahead: input.max_days_ahead,
          questions: (input.questions || []) as unknown as Json,
          confirmation_message: input.confirmation_message,
          create_meet: input.create_meet,
          user_id: user.id,
          organization_id: profile.organization_id,
        })
        .select()
        .single();

      if (error) throw error;
      return parseEventType(data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['booking-event-types'] });
      toast.success('Tipo de evento criado com sucesso!');
    },
    onError: (error: Error) => {
      console.error('Error creating event type:', error);
      toast.error('Erro ao criar tipo de evento');
    },
  });

  const updateEventType = useMutation({
    mutationFn: async ({ id, questions, ...input }: Partial<BookingEventType> & { id: string }) => {
      const updateData: Record<string, unknown> = { ...input };
      if (questions !== undefined) {
        updateData.questions = questions as unknown as Json;
      }
      
      const { data, error } = await supabase
        .from('booking_event_types')
        .update(updateData)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return parseEventType(data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['booking-event-types'] });
      toast.success('Tipo de evento atualizado!');
    },
    onError: (error: Error) => {
      console.error('Error updating event type:', error);
      toast.error('Erro ao atualizar tipo de evento');
    },
  });

  const deleteEventType = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('booking_event_types')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['booking-event-types'] });
      toast.success('Tipo de evento excluído!');
    },
    onError: (error: Error) => {
      console.error('Error deleting event type:', error);
      toast.error('Erro ao excluir tipo de evento');
    },
  });

  const toggleActive = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { data, error } = await supabase
        .from('booking_event_types')
        .update({ is_active })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return parseEventType(data);
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['booking-event-types'] });
      toast.success(data.is_active ? 'Evento ativado!' : 'Evento desativado!');
    },
    onError: (error: Error) => {
      console.error('Error toggling event type:', error);
      toast.error('Erro ao alterar status do evento');
    },
  });

  return {
    eventTypes: eventTypes || [],
    isLoading,
    error,
    createEventType,
    updateEventType,
    deleteEventType,
    toggleActive,
  };
}

// Gerar slug a partir do nome
export function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}
