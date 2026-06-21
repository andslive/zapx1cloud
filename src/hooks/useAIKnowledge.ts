import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Tables, TablesInsert, TablesUpdate } from '@/integrations/supabase/types';

type AIKnowledge = Tables<'ai_knowledge_base'>;
type AIKnowledgeInsert = TablesInsert<'ai_knowledge_base'>;
type AIKnowledgeUpdate = TablesUpdate<'ai_knowledge_base'>;

export function useAIKnowledgeBase(productId?: string) {
  return useQuery({
    queryKey: ['ai-knowledge-base', productId],
    queryFn: async () => {
      let query = supabase
        .from('ai_knowledge_base')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (productId) {
        query = query.eq('product_id', productId);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      return data as AIKnowledge[];
    },
    enabled: true,
  });
}

export function useCreateAIKnowledge() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (knowledge: AIKnowledgeInsert) => {
      const { data, error } = await supabase
        .from('ai_knowledge_base')
        .insert(knowledge)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-knowledge-base'] });
    },
  });
}

export function useUpdateAIKnowledge() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ id, ...updates }: AIKnowledgeUpdate & { id: string }) => {
      const { data, error } = await supabase
        .from('ai_knowledge_base')
        .update(updates)
        .eq('id', id)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-knowledge-base'] });
    },
  });
}

export function useDeleteAIKnowledge() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('ai_knowledge_base')
        .delete()
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-knowledge-base'] });
    },
  });
}
