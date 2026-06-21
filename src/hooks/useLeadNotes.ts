import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface LeadNote {
  id: string;
  lead_id: string;
  author_id: string;
  content: string;
  role_label: string | null;
  created_at: string;
  profiles?: {
    full_name: string | null;
    avatar_url: string | null;
  };
}

export function useLeadNotes(leadId: string) {
  return useQuery({
    queryKey: ['lead-notes', leadId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('lead_notes')
        .select(`
          *,
          profiles:author_id (full_name, avatar_url)
        `)
        .eq('lead_id', leadId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as LeadNote[];
    },
    enabled: !!leadId
  });
}

interface CreateLeadNoteParams {
  lead_id: string;
  content: string;
  role_label?: string;
}

export function useCreateLeadNote() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: CreateLeadNoteParams) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data, error } = await supabase
        .from('lead_notes')
        .insert({
          lead_id: params.lead_id,
          author_id: user.id,
          content: params.content,
          role_label: params.role_label || 'Vendedor'
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['lead-notes', vars.lead_id] });
    }
  });
}
