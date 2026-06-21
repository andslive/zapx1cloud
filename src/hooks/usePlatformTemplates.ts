import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface PlatformEmailTemplate {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  category: 'acesso' | 'cobranca' | 'sistema' | 'mala_direta';
  subject: string;
  html_content: string;
  variables: string[];
  is_active: boolean;
  is_system: boolean;
  created_at: string;
  updated_at: string;
}

export function usePlatformTemplates(category?: string) {
  return useQuery({
    queryKey: ['platform_email_templates', category ?? 'all'],
    queryFn: async () => {
      let q = supabase
        .from('platform_email_templates')
        .select('*')
        .order('category', { ascending: true })
        .order('name', { ascending: true });
      if (category) q = q.eq('category', category);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as PlatformEmailTemplate[];
    },
  });
}

export function usePlatformTemplate(slug: string | null) {
  return useQuery({
    queryKey: ['platform_email_template', slug],
    enabled: !!slug,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('platform_email_templates')
        .select('*')
        .eq('slug', slug as string)
        .maybeSingle();
      if (error) throw error;
      return data as unknown as PlatformEmailTemplate | null;
    },
  });
}

export function useUpdatePlatformTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: Partial<PlatformEmailTemplate> & { id: string }) => {
      const { id, ...rest } = payload;
      const { error } = await supabase
        .from('platform_email_templates')
        .update(rest)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['platform_email_templates'] });
      qc.invalidateQueries({ queryKey: ['platform_email_template'] });
      toast.success('Template salvo com sucesso');
    },
    onError: (e: any) => toast.error(e.message ?? 'Erro ao salvar template'),
  });
}

export function useCreatePlatformTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: Omit<PlatformEmailTemplate, 'id' | 'created_at' | 'updated_at' | 'is_system'>) => {
      const { error } = await supabase
        .from('platform_email_templates')
        .insert({ ...payload, is_system: false } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['platform_email_templates'] });
      toast.success('Template criado');
    },
    onError: (e: any) => toast.error(e.message ?? 'Erro ao criar template'),
  });
}

export function useDeletePlatformTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('platform_email_templates')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['platform_email_templates'] });
      toast.success('Template removido');
    },
    onError: (e: any) => toast.error(e.message ?? 'Erro ao remover'),
  });
}
