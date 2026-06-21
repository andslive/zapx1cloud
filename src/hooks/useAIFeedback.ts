import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export interface AIFeedback {
  id: string;
  message_id: string | null;
  conversation_id: string | null;
  original_response: string;
  suggested_response: string;
  feedback_type: 'correction' | 'tone' | 'accuracy' | 'content';
  created_by: string | null;
  organization_id: string;
  created_at: string;
  applied_to_training: boolean;
  applied_at: string | null;
  // Joined data
  webchat_conversations?: {
    visitor_name: string | null;
    visitor_email: string | null;
  };
  profiles?: {
    full_name: string;
  };
}

export function useAIFeedback() {
  const { profile } = useAuth();

  return useQuery({
    queryKey: ['ai-feedback', profile?.organization_id],
    queryFn: async () => {
      if (!profile?.organization_id) return [];

      const { data, error } = await supabase
        .from('ai_response_feedback')
        .select(`
          *,
          webchat_conversations(visitor_name, visitor_email),
          profiles(full_name)
        `)
        .eq('organization_id', profile.organization_id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as AIFeedback[];
    },
    enabled: !!profile?.organization_id,
  });
}

export function useCreateAIFeedback() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();

  return useMutation({
    mutationFn: async (feedback: {
      messageId: string;
      conversationId: string;
      originalResponse: string;
      suggestedResponse: string;
      feedbackType: 'correction' | 'tone' | 'accuracy' | 'content';
    }) => {
      if (!profile?.organization_id) throw new Error('No organization');

      const { data, error } = await supabase
        .from('ai_response_feedback')
        .insert({
          message_id: feedback.messageId,
          conversation_id: feedback.conversationId,
          original_response: feedback.originalResponse,
          suggested_response: feedback.suggestedResponse,
          feedback_type: feedback.feedbackType,
          created_by: profile.id,
          organization_id: profile.organization_id,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-feedback'] });
    },
  });
}

export function useApplyAIFeedback() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (feedbackId: string) => {
      const { data, error } = await supabase
        .from('ai_response_feedback')
        .update({
          applied_to_training: true,
          applied_at: new Date().toISOString(),
        })
        .eq('id', feedbackId)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-feedback'] });
    },
  });
}

export function useDeleteAIFeedback() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (feedbackId: string) => {
      const { error } = await supabase
        .from('ai_response_feedback')
        .delete()
        .eq('id', feedbackId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-feedback'] });
    },
  });
}
