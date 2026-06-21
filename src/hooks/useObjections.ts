import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Tables } from '@/integrations/supabase/types';

type DBObjection = Tables<'objections'>;

export interface Objection {
  id: string;
  category: 'price' | 'trust' | 'timing' | 'thinking' | 'partner' | 'competitor';
  whatTheySay: string;
  whatTheyMean: string;
  suggestedResponse: string;
  followUpQuestion: string;
  proofMaterialId?: string;
}

const validCategories = ['price', 'trust', 'timing', 'thinking', 'partner', 'competitor'] as const;

function mapCategory(category: string): Objection['category'] {
  if (validCategories.includes(category as any)) {
    return category as Objection['category'];
  }
  return 'thinking'; // default fallback
}

function transformObjections(dbObjections: DBObjection[]): Objection[] {
  return dbObjections.map(obj => ({
    id: obj.id,
    category: mapCategory(obj.category),
    whatTheySay: obj.what_they_say,
    whatTheyMean: obj.what_they_mean || '',
    suggestedResponse: obj.suggested_response,
    followUpQuestion: obj.follow_up_question || '',
    proofMaterialId: obj.proof_material_id || undefined,
  }));
}

export function useObjections(productId?: string) {
  return useQuery({
    queryKey: ['objections', productId],
    queryFn: async () => {
      let query = supabase
        .from('objections')
        .select('*')
        .order('created_at', { ascending: true });
      
      if (productId) {
        query = query.eq('product_id', productId);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      return transformObjections(data || []);
    },
  });
}
