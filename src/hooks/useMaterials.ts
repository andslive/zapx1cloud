import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Tables, TablesInsert, TablesUpdate } from '@/integrations/supabase/types';

type DBMaterial = Tables<'materials'>;
type MaterialInsert = TablesInsert<'materials'>;
type MaterialUpdate = TablesUpdate<'materials'>;

export interface Material {
  id: string;
  name: string;
  type: 'pdf' | 'video' | 'image' | 'link' | 'banner';
  url: string;
  tags: ('proof' | 'presentation' | 'objection' | 'closing')[];
  objective: string;
  status: 'active' | 'expired';
}

const validTypes = ['pdf', 'video', 'image', 'link', 'banner'] as const;
const validTags = ['proof', 'presentation', 'objection', 'closing'] as const;

function mapType(type: string): Material['type'] {
  if (validTypes.includes(type as any)) {
    return type as Material['type'];
  }
  return 'link'; // default fallback
}

function mapTags(tags: string[] | null): Material['tags'] {
  if (!tags) return [];
  return tags.filter(tag => validTags.includes(tag as any)) as Material['tags'];
}

function mapStatus(status: string | null): Material['status'] {
  return status === 'expired' ? 'expired' : 'active';
}

function transformMaterials(dbMaterials: DBMaterial[]): Material[] {
  return dbMaterials.map(mat => ({
    id: mat.id,
    name: mat.name,
    type: mapType(mat.type),
    url: mat.url,
    tags: mapTags(mat.tags),
    objective: mat.objective || '',
    status: mapStatus(mat.status),
  }));
}

export function useMaterials(productId?: string) {
  return useQuery({
    queryKey: ['materials', productId],
    queryFn: async () => {
      let query = supabase
        .from('materials')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (productId) {
        query = query.eq('product_id', productId);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      return transformMaterials(data || []);
    },
  });
}

// Export raw DB type for admin use
export type { DBMaterial };

export function useCreateMaterial() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (material: MaterialInsert) => {
      const { data, error } = await supabase
        .from('materials')
        .insert(material)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['materials'] });
      queryClient.invalidateQueries({ queryKey: ['materials-admin'] });
    },
  });
}

export function useUpdateMaterial() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ id, ...updates }: MaterialUpdate & { id: string }) => {
      const { data, error } = await supabase
        .from('materials')
        .update(updates)
        .eq('id', id)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['materials'] });
      queryClient.invalidateQueries({ queryKey: ['materials-admin'] });
    },
  });
}

export function useDeleteMaterial() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('materials')
        .delete()
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['materials'] });
      queryClient.invalidateQueries({ queryKey: ['materials-admin'] });
    },
  });
}
