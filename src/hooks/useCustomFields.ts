import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

export interface CustomField {
  id: string;
  organization_id: string;
  name: string;
  field_key: string;
  field_type: 'text' | 'number' | 'select' | 'boolean' | 'date';
  description: string | null;
  options: string[];
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateCustomFieldData {
  name: string;
  field_key: string;
  field_type: string;
  description?: string;
  options?: string[];
}

export function useCustomFields() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const orgId = profile?.organization_id;

  const { data: fields = [], isLoading } = useQuery({
    queryKey: ['custom-fields', orgId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('custom_fields')
        .select('*')
        .eq('organization_id', orgId!)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as unknown as CustomField[];
    },
    enabled: !!orgId,
  });

  const createField = useMutation({
    mutationFn: async (fieldData: CreateCustomFieldData) => {
      const { error } = await supabase.from('custom_fields').insert({
        organization_id: orgId!,
        name: fieldData.name,
        field_key: fieldData.field_key,
        field_type: fieldData.field_type,
        description: fieldData.description || null,
        options: fieldData.options || [],
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['custom-fields'] });
      toast.success('Campo criado com sucesso');
    },
    onError: (err: any) => {
      if (err.message?.includes('duplicate')) {
        toast.error('Já existe um campo com essa chave');
      } else {
        toast.error('Erro ao criar campo');
      }
    },
  });

  const updateField = useMutation({
    mutationFn: async ({ id, ...data }: { id: string } & Partial<CreateCustomFieldData>) => {
      const { error } = await supabase
        .from('custom_fields')
        .update(data as any)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['custom-fields'] });
      toast.success('Campo atualizado');
    },
    onError: () => toast.error('Erro ao atualizar campo'),
  });

  const deleteField = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('custom_fields').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['custom-fields'] });
      toast.success('Campo removido');
    },
    onError: () => toast.error('Erro ao remover campo'),
  });

  return { fields, isLoading, createField, updateField, deleteField };
}
