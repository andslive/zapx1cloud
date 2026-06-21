import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

export interface ProductCTA {
  id: string;
  product_id: string | null;
  organization_id: string;
  cta_type: 'checkout' | 'whatsapp' | 'calendar' | 'callback' | 'video' | 'custom';
  label: string;
  action_url: string | null;
  whatsapp_number: string | null;
  whatsapp_message: string | null;
  video_url: string | null;
  icon: string;
  trigger_keywords: string[] | null;
  intent_level: 'high' | 'medium' | 'low';
  display_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateCTAInput {
  product_id: string;
  cta_type: 'checkout' | 'whatsapp' | 'calendar' | 'callback' | 'video' | 'custom';
  label: string;
  action_url?: string;
  whatsapp_number?: string;
  whatsapp_message?: string;
  video_url?: string;
  icon?: string;
  trigger_keywords?: string[];
  intent_level?: 'high' | 'medium' | 'low';
  display_order?: number;
}

export function useProductCTAs(productId: string) {
  const { profile } = useAuth();

  return useQuery({
    queryKey: ['product-ctas', productId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('product_ctas')
        .select('*')
        .eq('product_id', productId)
        .order('display_order', { ascending: true });

      if (error) throw error;
      return data as ProductCTA[];
    },
    enabled: !!productId && !!profile?.organization_id,
  });
}

export function useCreateProductCTA() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();

  return useMutation({
    mutationFn: async (input: CreateCTAInput) => {
      if (!profile?.organization_id) throw new Error('No organization');

      const { data, error } = await supabase
        .from('product_ctas')
        .insert({
          ...input,
          organization_id: profile.organization_id,
        })
        .select()
        .single();

      if (error) throw error;
      return data as ProductCTA;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['product-ctas', data.product_id] });
      toast.success('CTA criado com sucesso!');
    },
    onError: (error) => {
      console.error('Error creating CTA:', error);
      toast.error('Erro ao criar CTA');
    },
  });
}

export function useUpdateProductCTA() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<ProductCTA> & { id: string }) => {
      const { data, error } = await supabase
        .from('product_ctas')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data as ProductCTA;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['product-ctas', data.product_id] });
      toast.success('CTA atualizado!');
    },
    onError: (error) => {
      console.error('Error updating CTA:', error);
      toast.error('Erro ao atualizar CTA');
    },
  });
}

export function useDeleteProductCTA() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, productId }: { id: string; productId: string }) => {
      const { error } = await supabase
        .from('product_ctas')
        .delete()
        .eq('id', id);

      if (error) throw error;
      return productId;
    },
    onSuccess: (productId) => {
      queryClient.invalidateQueries({ queryKey: ['product-ctas', productId] });
      toast.success('CTA removido!');
    },
    onError: (error) => {
      console.error('Error deleting CTA:', error);
      toast.error('Erro ao remover CTA');
    },
  });
}
