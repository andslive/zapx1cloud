import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Tables } from '@/integrations/supabase/types';

type CadenceTemplate = Tables<'cadence_templates'>;

export interface CadenceBlock {
  id: string;
  type: 'message' | 'audio' | 'material' | 'cta' | 'image' | 'video' | 'link';
  variant: 'short' | 'medium' | 'long';
  content: string;
  audioScript?: string;
  materialId?: string;
  mediaUrl?: string;
  linkUrl?: string;
  linkTitle?: string;
}

export interface CadenceDay {
  id: string;
  day: number;
  title: string;
  trigger: string;
  blocks: CadenceBlock[];
}

function transformCadenceTemplates(templates: CadenceTemplate[]): CadenceDay[] {
  return templates
    .sort((a, b) => a.day_number - b.day_number)
    .map(template => ({
      id: template.id,
      day: template.day_number,
      title: template.title,
      trigger: template.trigger || '',
      blocks: Array.isArray(template.blocks) 
        ? (template.blocks as unknown as CadenceBlock[]).map((block, index) => ({
            id: block.id || `block-${template.day_number}-${index}`,
            type: block.type || 'message',
            variant: block.variant || 'medium',
            content: block.content || '',
            audioScript: block.audioScript,
            materialId: block.materialId,
            mediaUrl: block.mediaUrl,
            linkUrl: block.linkUrl,
            linkTitle: block.linkTitle,
          }))
        : [],
    }));
}

export function useCadence(productId?: string) {
  return useQuery({
    queryKey: ['cadence', productId],
    queryFn: async () => {
      if (!productId) return [];
      
      const { data, error } = await supabase
        .from('cadence_templates')
        .select('*')
        .eq('product_id', productId)
        .order('day_number', { ascending: true });
      
      if (error) throw error;
      return transformCadenceTemplates(data || []);
    },
    enabled: !!productId,
  });
}
