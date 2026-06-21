import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { CadenceBlock } from './useCadence';

export interface CreateCadenceDayInput {
  productId: string;
  dayNumber: number;
  title: string;
  trigger?: string;
  blocks?: CadenceBlock[];
}

export interface UpdateCadenceDayInput {
  id: string;
  title?: string;
  trigger?: string;
  blocks?: CadenceBlock[];
}

export function useCreateCadenceDay() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateCadenceDayInput) => {
      const { data, error } = await supabase
        .from('cadence_templates')
        .insert([{
          product_id: input.productId,
          day_number: input.dayNumber,
          title: input.title,
          trigger: input.trigger || '',
          blocks: JSON.parse(JSON.stringify(input.blocks || [])),
        }])
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['cadence', variables.productId] });
      toast.success('Dia criado com sucesso!');
    },
    onError: (error) => {
      console.error('Error creating cadence day:', error);
      toast.error('Erro ao criar dia');
    },
  });
}

export function useUpdateCadenceDay() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...updates }: UpdateCadenceDayInput & { productId?: string }) => {
      const updateData: Record<string, unknown> = {};
      if (updates.title !== undefined) updateData.title = updates.title;
      if (updates.trigger !== undefined) updateData.trigger = updates.trigger;
      if (updates.blocks !== undefined) updateData.blocks = JSON.parse(JSON.stringify(updates.blocks));

      const { data, error } = await supabase
        .from('cadence_templates')
        .update(updateData)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cadence'] });
      toast.success('Dia atualizado!');
    },
    onError: (error) => {
      console.error('Error updating cadence day:', error);
      toast.error('Erro ao atualizar dia');
    },
  });
}

export function useDeleteCadenceDay() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, productId }: { id: string; productId: string }) => {
      const { error } = await supabase
        .from('cadence_templates')
        .delete()
        .eq('id', id);

      if (error) throw error;
      return { id, productId };
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['cadence', variables.productId] });
      toast.success('Dia removido!');
    },
    onError: (error) => {
      console.error('Error deleting cadence day:', error);
      toast.error('Erro ao remover dia');
    },
  });
}

export function useUploadCadenceMedia() {
  return useMutation({
    mutationFn: async ({ file, productId }: { file: File; productId: string }) => {
      const fileExt = file.name.split('.').pop();
      const fileName = `${productId}/${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('cadence-media')
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      const { data } = supabase.storage
        .from('cadence-media')
        .getPublicUrl(fileName);

      return data.publicUrl;
    },
    onError: (error) => {
      console.error('Error uploading media:', error);
      toast.error('Erro ao fazer upload');
    },
  });
}
