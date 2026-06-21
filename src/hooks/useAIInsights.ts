import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Tables, TablesUpdate } from '@/integrations/supabase/types';

type AIInsight = Tables<'ai_insights'>;

export function useAIInsights(userId?: string, productId?: string) {
  return useQuery({
    queryKey: ['ai-insights', userId, productId],
    queryFn: async () => {
      let query = supabase
        .from('ai_insights')
        .select('*')
        .eq('is_dismissed', false)
        .order('created_at', { ascending: false });
      
      if (userId) {
        query = query.eq('user_id', userId);
      }
      if (productId) {
        query = query.eq('product_id', productId);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      return data as AIInsight[];
    },
    enabled: !!userId
  });
}

export function useDismissInsight() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (insightId: string) => {
      const { error } = await supabase
        .from('ai_insights')
        .update({ is_dismissed: true })
        .eq('id', insightId);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-insights'] });
    }
  });
}

export function useGenerateInsights() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ 
      userId, 
      productId, 
      organizationId 
    }: { 
      userId: string; 
      productId?: string; 
      organizationId: string;
    }) => {
      const { data, error } = await supabase.functions.invoke('generate-insights', {
        body: { userId, productId, organizationId }
      });
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-insights'] });
    }
  });
}
