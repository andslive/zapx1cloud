import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Form, FormBlock, FormSubmission, FormTemplate, FormStatus, DistributionRule, FormTheme, FormSettings, generateSlug } from '@/types/forms';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { Json } from '@/integrations/supabase/types';

// Parse form from database - use any to handle JSONB fields
function parseForm(data: any): Form {
  return {
    ...data,
    theme: data.theme || {},
    settings: data.settings || {},
    round_robin_config: data.round_robin_config || { users: [], current_index: 0 },
    custom_scripts: data.custom_scripts || { header: '', footer: '' },
  };
}

// Fetch all forms for the organization
export function useForms(productId?: string) {
  const { profile } = useAuth();
  
  return useQuery({
    queryKey: ['forms', productId],
    queryFn: async () => {
      let query = supabase
        .from('forms')
        .select('*, products(name)')
        .order('created_at', { ascending: false });
      
      if (productId) {
        query = query.eq('product_id', productId);
      }
      
      const { data, error } = await query;
      
      if (error) throw error;
      return (data || []).map(parseForm) as Form[];
    },
    enabled: !!profile?.organization_id,
  });
}

// Fetch a single form
export function useForm(formId?: string) {
  return useQuery({
    queryKey: ['form', formId],
    queryFn: async () => {
      if (!formId) return null;
      
      const { data, error } = await supabase
        .from('forms')
        .select('*, products(name)')
        .eq('id', formId)
        .single();
      
      if (error) throw error;
      return parseForm(data) as Form;
    },
    enabled: !!formId,
  });
}

// Fetch form blocks
export function useFormBlocks(formId?: string) {
  return useQuery({
    queryKey: ['form-blocks', formId],
    queryFn: async () => {
      if (!formId) return [] as FormBlock[];
      
      const { data, error } = await supabase
        .from('form_blocks')
        .select('*')
        .eq('form_id', formId)
        .order('order_index', { ascending: true });
      
      if (error) throw error;
      // Cast through unknown to handle JSONB fields
      return (data || []) as unknown as FormBlock[];
    },
    enabled: !!formId,
  });
}

// Fetch form submissions
export function useFormSubmissions(formId?: string) {
  return useQuery({
    queryKey: ['form-submissions', formId],
    queryFn: async () => {
      if (!formId) return [];
      
      const { data, error } = await supabase
        .from('form_submissions')
        .select('*, leads(name, email)')
        .eq('form_id', formId)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      // Cast through unknown to handle JSONB fields
      return (data || []) as unknown as FormSubmission[];
    },
    enabled: !!formId,
  });
}

// Fetch templates
export function useFormTemplates() {
  return useQuery({
    queryKey: ['form-templates'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('form_templates')
        .select('*')
        .order('usage_count', { ascending: false });
      
      if (error) throw error;
      return (data || []) as FormTemplate[];
    },
  });
}

// Create form
export function useCreateForm() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();
  
  return useMutation({
    mutationFn: async (params: {
      productId: string;
      name: string;
      description?: string;
      templateId?: string;
      aiBlocks?: Array<{
        block_type: string;
        label: string;
        description?: string;
        placeholder?: string;
        required?: boolean;
        options?: unknown;
        maps_to?: string;
        order_index: number;
      }>;
    }) => {
      if (!profile?.organization_id) throw new Error('Organização não encontrada');
      
      const slug = generateSlug(params.name);
      
      // Check if slug is unique
      const { data: existing } = await supabase
        .from('forms')
        .select('id')
        .eq('organization_id', profile.organization_id)
        .eq('slug', slug)
        .maybeSingle();
      
      const finalSlug = existing ? `${slug}-${Date.now()}` : slug;
      
      // If using template, fetch it
      let templateData: Record<string, unknown> = {};
      if (params.templateId) {
        const { data: template } = await supabase
          .from('form_templates')
          .select('*')
          .eq('id', params.templateId)
          .single();
        
        if (template) {
          templateData = {
            theme: template.theme as unknown,
            settings: template.settings as unknown,
          };
          
          // Increment template usage
          await supabase
            .from('form_templates')
            .update({ usage_count: (template.usage_count || 0) + 1 })
            .eq('id', params.templateId);
        }
      }
      
      const insertData = {
        organization_id: profile.organization_id,
        product_id: params.productId,
        name: params.name,
        description: params.description || null,
        slug: finalSlug,
        status: 'draft' as const,
        distribution_rule: 'manual' as const,
        created_by: profile.id,
        ...templateData,
      };
      
      const { data, error } = await supabase
        .from('forms')
        .insert(insertData)
        .select('*, products(name)')
        .single();
      
      if (error) throw error;
      
      // If using template, copy blocks
      if (params.templateId) {
        const { data: template } = await supabase
          .from('form_templates')
          .select('blocks')
          .eq('id', params.templateId)
          .single();
        
        if (template?.blocks && Array.isArray(template.blocks)) {
          const blocks = template.blocks.map((block: any, index: number) => ({
            form_id: data.id,
            order_index: index,
            block_type: block.block_type,
            label: block.label || 'Pergunta',
            description: block.description,
            placeholder: block.placeholder,
            required: block.required || false,
            options: block.options || [],
            logic_rules: block.logic_rules || [],
            maps_to: block.maps_to,
            score_value: block.score_value || 0,
            score_rules: block.score_rules || [],
            apply_tags: block.apply_tags || [],
            validation: block.validation || {},
            block_settings: block.block_settings || {},
          }));
          
          if (blocks.length > 0) {
            await supabase.from('form_blocks').insert(blocks);
          }
        }
      }
      
      // If AI-generated blocks, save them
      if (params.aiBlocks && params.aiBlocks.length > 0) {
        const blocks = params.aiBlocks.map((block, index) => ({
          form_id: data.id,
          order_index: index,
          block_type: block.block_type,
          label: block.label || 'Pergunta',
          description: block.description || null,
          placeholder: block.placeholder || null,
          required: block.required !== false,
          options: (block.options as Json) || null,
          maps_to: block.maps_to || null,
          logic_rules: null as Json | null,
          score_value: null,
          score_rules: null as Json | null,
          apply_tags: null as string[] | null,
          validation: null as Json | null,
          block_settings: null as Json | null,
        }));
        
        await supabase.from('form_blocks').insert(blocks);
      }
      
      return parseForm(data) as Form;
    },
    onSuccess: (_, params) => {
      queryClient.invalidateQueries({ queryKey: ['forms'] });
      queryClient.invalidateQueries({ queryKey: ['forms', params.productId] });
      toast.success('Formulário criado com sucesso!');
    },
    onError: (error: Error) => {
      toast.error('Erro ao criar formulário: ' + error.message);
    },
  });
}

// Update form
export function useUpdateForm() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (params: {
      formId: string;
      updates: Partial<{
        name: string;
        description: string;
        status: FormStatus;
        distribution_rule: DistributionRule;
        assigned_squad_id: string;
        assigned_user_id: string;
        default_temperature: string;
        round_robin_config: { users: string[]; current_index: number };
        theme: Partial<FormTheme>;
        facebook_pixel_id: string;
        google_tag_id: string;
        custom_scripts: { header: string; footer: string };
        utm_capture: boolean;
        settings: Partial<FormSettings>;
      }>;
    }) => {
      const { data, error } = await supabase
        .from('forms')
        .update({
          ...params.updates,
          updated_at: new Date().toISOString(),
        } as any)
        .eq('id', params.formId)
        .select('*, products(name)')
        .single();
      
      if (error) throw error;
      return parseForm(data) as Form;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['forms'] });
      queryClient.invalidateQueries({ queryKey: ['forms', data.product_id] });
      queryClient.invalidateQueries({ queryKey: ['form', data.id] });
    },
    onError: (error: Error) => {
      toast.error('Erro ao atualizar formulário: ' + error.message);
    },
  });
}

// Save form blocks
export function useSaveFormBlocks() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (params: {
      formId: string;
      blocks: FormBlock[];
    }) => {
      // Delete existing blocks
      await supabase
        .from('form_blocks')
        .delete()
        .eq('form_id', params.formId);
      
      // Insert new blocks
      if (params.blocks.length > 0) {
        const blocksToInsert = params.blocks.map((block, index) => ({
          form_id: params.formId,
          order_index: index,
          block_type: block.block_type,
          label: block.label,
          description: block.description,
          placeholder: block.placeholder,
          required: block.required,
          options: block.options,
          logic_rules: block.logic_rules,
          maps_to: block.maps_to,
          score_value: block.score_value,
          score_rules: block.score_rules,
          apply_tags: block.apply_tags,
          validation: block.validation,
          block_settings: block.block_settings,
        }));
        
        const { error } = await supabase
          .from('form_blocks')
          .insert(blocksToInsert as any);
        
        if (error) throw error;
      }
      
      // Update form timestamp
      await supabase
        .from('forms')
        .update({ updated_at: new Date().toISOString() })
        .eq('id', params.formId);
      
      return params.blocks;
    },
    onSuccess: (_, params) => {
      queryClient.invalidateQueries({ queryKey: ['form-blocks', params.formId] });
      toast.success('Formulário salvo!');
    },
    onError: (error: Error) => {
      toast.error('Erro ao salvar formulário: ' + error.message);
    },
  });
}

// Delete form
export function useDeleteForm() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (formId: string) => {
      const { error } = await supabase
        .from('forms')
        .delete()
        .eq('id', formId);
      
      if (error) throw error;
      return formId;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['forms'] });
      toast.success('Formulário excluído!');
    },
    onError: (error: Error) => {
      toast.error('Erro ao excluir formulário: ' + error.message);
    },
  });
}

// Duplicate form
export function useDuplicateForm() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();
  
  return useMutation({
    mutationFn: async (formId: string) => {
      if (!profile?.organization_id) throw new Error('Organização não encontrada');
      
      // Fetch original form
      const { data: original, error: fetchError } = await supabase
        .from('forms')
        .select('*')
        .eq('id', formId)
        .single();
      
      if (fetchError) throw fetchError;
      
      const slug = `${original.slug}-copia-${Date.now()}`;
      
      // Create copy
      const { data: newForm, error } = await supabase
        .from('forms')
        .insert({
          organization_id: original.organization_id,
          product_id: original.product_id,
          name: `${original.name} (cópia)`,
          description: original.description,
          slug,
          status: 'draft',
          distribution_rule: original.distribution_rule,
          assigned_squad_id: original.assigned_squad_id,
          assigned_user_id: original.assigned_user_id,
          default_temperature: original.default_temperature,
          round_robin_config: original.round_robin_config,
          theme: original.theme,
          facebook_pixel_id: original.facebook_pixel_id,
          google_tag_id: original.google_tag_id,
          custom_scripts: original.custom_scripts,
          utm_capture: original.utm_capture,
          settings: original.settings,
          created_by: profile.id,
        })
        .select()
        .single();
      
      if (error) throw error;
      
      // Copy blocks
      const { data: blocks } = await supabase
        .from('form_blocks')
        .select('*')
        .eq('form_id', formId)
        .order('order_index');
      
      if (blocks && blocks.length > 0) {
        const newBlocks = blocks.map(block => ({
          form_id: newForm.id,
          order_index: block.order_index,
          block_type: block.block_type,
          label: block.label,
          description: block.description,
          placeholder: block.placeholder,
          required: block.required,
          options: block.options,
          logic_rules: block.logic_rules,
          maps_to: block.maps_to,
          score_value: block.score_value,
          score_rules: block.score_rules,
          apply_tags: block.apply_tags,
          validation: block.validation,
          block_settings: block.block_settings,
        }));
        
        await supabase.from('form_blocks').insert(newBlocks as any);
      }
      
      return parseForm(newForm) as Form;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['forms'] });
      queryClient.invalidateQueries({ queryKey: ['forms', data.product_id] });
      toast.success('Formulário duplicado!');
    },
    onError: (error: Error) => {
      toast.error('Erro ao duplicar formulário: ' + error.message);
    },
  });
}

// Toggle form status (activate/deactivate)
export function useToggleFormStatus() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (params: { formId: string; status: FormStatus }) => {
      const { data, error } = await supabase
        .from('forms')
        .update({ 
          status: params.status,
          updated_at: new Date().toISOString(),
        })
        .eq('id', params.formId)
        .select('*, products(name)')
        .single();
      
      if (error) throw error;
      return parseForm(data) as Form;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['forms'] });
      queryClient.invalidateQueries({ queryKey: ['forms', data.product_id] });
      queryClient.invalidateQueries({ queryKey: ['form', data.id] });
      
      const statusMessages: Record<FormStatus, string> = {
        active: 'Formulário ativado!',
        paused: 'Formulário pausado!',
        draft: 'Formulário movido para rascunho!',
        archived: 'Formulário arquivado!',
      };
      toast.success(statusMessages[data.status]);
    },
    onError: (error: Error) => {
      toast.error('Erro ao alterar status: ' + error.message);
    },
  });
}
