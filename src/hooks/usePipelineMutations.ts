import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface PipelineStage {
  id: string;
  name: string;
  color: string | null;
  order_index: number;
  is_won: boolean | null;
  is_lost: boolean | null;
  product_id: string;
  description: string | null;
}

export const DEFAULT_PIPELINE_STAGES = [
  { name: 'Novo Lead', color: '#3b82f6', order_index: 1, is_won: false, is_lost: false, description: 'Primeiro contato com o cliente potencial' },
  { name: 'Primeiro Contato', color: '#8b5cf6', order_index: 2, is_won: false, is_lost: false, description: 'Estabelecendo primeiro contato' },
  { name: 'Qualificação', color: '#f59e0b', order_index: 3, is_won: false, is_lost: false, description: 'Avaliando necessidades e fit' },
  { name: 'Proposta Enviada', color: '#ec4899', order_index: 4, is_won: false, is_lost: false, description: 'Proposta comercial enviada' },
  { name: 'Negociação', color: '#14b8a6', order_index: 5, is_won: false, is_lost: false, description: 'Negociando termos e condições' },
  { name: 'Fechado (Ganho)', color: '#22c55e', order_index: 6, is_won: true, is_lost: false, description: 'Negócio fechado com sucesso' },
  { name: 'Perdido', color: '#ef4444', order_index: 7, is_won: false, is_lost: true, description: 'Oportunidade perdida' },
];

export function usePipelineStages(productId?: string) {
  return useQuery({
    queryKey: ['pipeline-stages', productId],
    queryFn: async () => {
      if (!productId) return [];
      
      const { data, error } = await supabase
        .from('pipeline_stages')
        .select('*')
        .eq('product_id', productId)
        .order('order_index', { ascending: true });

      if (error) throw error;
      return data as PipelineStage[];
    },
    enabled: !!productId,
  });
}

export function useCreateDefaultPipelineStages() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (productId: string) => {
      const stages = DEFAULT_PIPELINE_STAGES.map(stage => ({
        ...stage,
        product_id: productId,
      }));

      const { data, error } = await supabase
        .from('pipeline_stages')
        .insert(stages)
        .select();

      if (error) throw error;
      return data;
    },
    onSuccess: (_, productId) => {
      queryClient.invalidateQueries({ queryKey: ['pipeline-stages', productId] });
    },
    onError: (error) => {
      console.error('Error creating default pipeline stages:', error);
    },
  });
}

export function useUpdatePipelineStage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<PipelineStage> & { id: string }) => {
      const { data, error } = await supabase
        .from('pipeline_stages')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['pipeline-stages', data.product_id] });
      toast.success('Etapa atualizada!');
    },
    onError: (error) => {
      console.error('Error updating pipeline stage:', error);
      toast.error('Erro ao atualizar etapa');
    },
  });
}

export function useCreatePipelineStage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (stage: Omit<PipelineStage, 'id'>) => {
      const { data, error } = await supabase
        .from('pipeline_stages')
        .insert(stage)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['pipeline-stages', data.product_id] });
      toast.success('Etapa criada!');
    },
    onError: (error) => {
      console.error('Error creating pipeline stage:', error);
      toast.error('Erro ao criar etapa');
    },
  });
}

export function useDeletePipelineStage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, productId }: { id: string; productId: string }) => {
      const { error } = await supabase
        .from('pipeline_stages')
        .delete()
        .eq('id', id);

      if (error) throw error;
      return { id, productId };
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['pipeline-stages', variables.productId] });
      toast.success('Etapa removida!');
    },
    onError: (error) => {
      console.error('Error deleting pipeline stage:', error);
      toast.error('Erro ao remover etapa');
    },
  });
}
