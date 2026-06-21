import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import type { 
  Funnel, 
  FunnelAnalytics, 
  CreateFunnelInput, 
  UpdateFunnelInput,
  FunnelBlock,
  FunnelChannelConfig,
  FunnelWidgetConfig,
  FunnelTheme,
  FunnelCustomScripts,
  RoundRobinConfig,
  FunnelAppearance,
} from '@/types/funnel';
import { generateSlug, defaultFunnelAppearance, getChannelAppearance } from '@/types/funnel';
import { Json } from '@/integrations/supabase/types';

// =====================================================
// Helper para converter tipos do Supabase para Funnel
// =====================================================

function parseFunnel(raw: any): Funnel {
  return {
    ...raw,
    flow_blocks: (raw.flow_blocks as FunnelBlock[]) || [],
    channels: (raw.channels as FunnelChannelConfig) || {
      chat: { enabled: false, slug_override: null },
      form: { enabled: false, slug_override: null },
      widget: { enabled: false },
    },
    widget_config: (raw.widget_config as FunnelWidgetConfig) || {
      position: 'bottom-right',
      primary_color: '#3B82F6',
      greeting: 'Olá! Como posso ajudar?',
      avatar_url: null,
      allowed_domains: [],
    },
    theme: (raw.theme as FunnelTheme) || {
      primary_color: '#3B82F6',
      background_color: '#0F172A',
      text_color: '#FFFFFF',
      font_family: 'Inter',
      logo_url: null,
      show_progress: true,
    },
    appearance: (() => {
      const ap = raw.appearance as FunnelAppearance | null | undefined;
      if (ap && ap.chat && ap.form && ap.widget && ap.quiz) return ap;
      // Deriva dos defaults usando o theme legado como base
      const base = defaultFunnelAppearance();
      const merged: FunnelAppearance = {
        chat: getChannelAppearance({ theme: raw.theme, appearance: null } as any, 'chat'),
        form: getChannelAppearance({ theme: raw.theme, appearance: null } as any, 'form'),
        widget: getChannelAppearance({ theme: raw.theme, appearance: null } as any, 'widget'),
        quiz: getChannelAppearance({ theme: raw.theme, appearance: null } as any, 'quiz'),
      };
      // Aplica patches existentes em ap (parcial) por cima
      if (ap) {
        (['chat','form','widget','quiz'] as const).forEach(k => {
          if (ap[k]) merged[k] = { ...merged[k], ...ap[k], channel_options: { ...merged[k].channel_options, ...(ap[k]?.channel_options as any) } };
        });
      }
      return merged;
    })(),
    custom_scripts: (raw.custom_scripts as FunnelCustomScripts) || {
      header: '',
      footer: '',
    },
    round_robin_config: (raw.round_robin_config as RoundRobinConfig) || {
      users: [],
      current_index: 0,
    },
    default_tags: raw.default_tags || [],
  };
}

// =====================================================
// Hook: Lista de funis
// =====================================================

export function useFunnels(productId?: string) {
  const { profile } = useAuth();

  return useQuery({
    queryKey: ['funnels', profile?.organization_id, productId],
    queryFn: async () => {
      if (!profile?.organization_id) return [];

      let query = supabase
        .from('capture_funnels')
        .select(`
          *,
          products:product_id (name)
        `)
        .eq('organization_id', profile.organization_id)
        .order('updated_at', { ascending: false });

      if (productId) {
        query = query.eq('product_id', productId);
      }

      const { data, error } = await query;

      if (error) throw error;
      return (data || []).map(parseFunnel);
    },
    enabled: !!profile?.organization_id,
  });
}

// =====================================================
// Hook: Funil individual
// =====================================================

export function useFunnel(funnelId?: string) {
  return useQuery({
    queryKey: ['funnel', funnelId],
    queryFn: async () => {
      if (!funnelId) return null;

      const { data, error } = await supabase
        .from('capture_funnels')
        .select(`
          *,
          products:product_id (name),
          profiles:created_by (full_name)
        `)
        .eq('id', funnelId)
        .maybeSingle();

      if (error) throw error;
      return data ? parseFunnel(data) : null;
    },
    enabled: !!funnelId,
  });
}

// =====================================================
// Hook: Funil por slug (público)
// =====================================================

export function useFunnelBySlug(slug?: string, channel?: 'chat' | 'form') {
  return useQuery({
    queryKey: ['funnel-public', slug, channel],
    queryFn: async () => {
      if (!slug) return null;

      const { data, error } = await supabase
        .from('capture_funnels')
        .select(`
          *,
          products:product_id (name)
        `)
        .eq('slug', slug)
        .eq('status', 'active')
        .maybeSingle();

      if (error) throw error;
      return data ? parseFunnel(data) : null;
    },
    enabled: !!slug,
  });
}

// =====================================================
// Hook: Criar funil
// =====================================================

export function useCreateFunnel() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();

  return useMutation({
    mutationFn: async (input: CreateFunnelInput) => {
      if (!profile?.organization_id) throw new Error('Organização não encontrada');

      // Gerar slug único se não fornecido
      const baseSlug = input.slug || generateSlug(input.name);
      let slug = baseSlug;
      let counter = 1;

      // Verificar se slug já existe
      while (true) {
        const { data: existing } = await supabase
          .from('capture_funnels')
          .select('id')
          .eq('organization_id', profile.organization_id)
          .eq('slug', slug)
          .maybeSingle();

        if (!existing) break;
        slug = `${baseSlug}-${counter}`;
        counter++;
      }

      const { data, error } = await supabase
        .from('capture_funnels')
        .insert({
          organization_id: profile.organization_id,
          product_id: input.product_id,
          name: input.name,
          description: input.description,
          slug,
          created_by: profile.id,
        })
        .select()
        .single();

      if (error) throw error;
      return parseFunnel(data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['funnels'] });
      toast.success('Funil criado com sucesso!');
    },
    onError: (error: Error) => {
      toast.error('Erro ao criar funil: ' + error.message);
    },
  });
}

// =====================================================
// Hook: Atualizar funil
// =====================================================

export function useUpdateFunnel() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...updates }: UpdateFunnelInput & { id: string }) => {
      // Converter tipos complexos para Json do Supabase
      const dbUpdates: Record<string, any> = { ...updates };
      
      if (updates.flow_blocks) {
        dbUpdates.flow_blocks = updates.flow_blocks as unknown as Json;
      }
      if (updates.channels) {
        dbUpdates.channels = updates.channels as unknown as Json;
      }
      if (updates.widget_config) {
        dbUpdates.widget_config = updates.widget_config as unknown as Json;
      }
      if (updates.theme) {
        dbUpdates.theme = updates.theme as unknown as Json;
      }
      if ((updates as any).appearance) {
        const ap = (updates as any).appearance as FunnelAppearance;
        dbUpdates.appearance = ap as unknown as Json;
        // Mantém theme legado em sincronia com o canal Chat para compat externa
        if (ap.chat) {
          dbUpdates.theme = {
            primary_color: ap.chat.primary_color,
            background_color: ap.chat.background_color,
            text_color: ap.chat.text_color,
            font_family: ap.chat.font_family,
            logo_url: ap.chat.logo_url ?? null,
            show_progress: true,
          } as unknown as Json;
        }
      }
      if (updates.custom_scripts) {
        dbUpdates.custom_scripts = updates.custom_scripts as unknown as Json;
      }
      if (updates.round_robin_config) {
        dbUpdates.round_robin_config = updates.round_robin_config as unknown as Json;
      }

      const { data, error } = await supabase
        .from('capture_funnels')
        .update(dbUpdates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return parseFunnel(data);
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['funnels'] });
      queryClient.invalidateQueries({ queryKey: ['funnel', data.id] });
    },
    onError: (error: Error) => {
      toast.error('Erro ao atualizar funil: ' + error.message);
    },
  });
}

// =====================================================
// Hook: Excluir funil
// =====================================================

export function useDeleteFunnel() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (funnelId: string) => {
      const { error } = await supabase
        .from('capture_funnels')
        .delete()
        .eq('id', funnelId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['funnels'] });
      toast.success('Funil excluído com sucesso!');
    },
    onError: (error: Error) => {
      toast.error('Erro ao excluir funil: ' + error.message);
    },
  });
}

// =====================================================
// Hook: Duplicar funil
// =====================================================

export function useDuplicateFunnel() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();

  return useMutation({
    mutationFn: async (funnelId: string) => {
      if (!profile?.organization_id) throw new Error('Organização não encontrada');

      // Buscar funil original
      const { data: original, error: fetchError } = await supabase
        .from('capture_funnels')
        .select('*')
        .eq('id', funnelId)
        .single();

      if (fetchError || !original) throw fetchError || new Error('Funil não encontrado');

      // Gerar novo slug
      const baseSlug = `${original.slug}-copia`;
      let slug = baseSlug;
      let counter = 1;

      while (true) {
        const { data: existing } = await supabase
          .from('capture_funnels')
          .select('id')
          .eq('organization_id', profile.organization_id)
          .eq('slug', slug)
          .maybeSingle();

        if (!existing) break;
        slug = `${baseSlug}-${counter}`;
        counter++;
      }

      // Criar cópia
      const { data, error } = await supabase
        .from('capture_funnels')
        .insert({
          organization_id: original.organization_id,
          product_id: original.product_id,
          name: `${original.name} (Cópia)`,
          description: original.description,
          slug,
          status: 'draft',
          flow_blocks: original.flow_blocks,
          start_block_id: original.start_block_id,
          channels: { chat: { enabled: false }, form: { enabled: false }, widget: { enabled: false } },
          widget_config: original.widget_config,
          distribution_rule: original.distribution_rule,
          assigned_squad_id: original.assigned_squad_id,
          assigned_user_id: original.assigned_user_id,
          round_robin_config: original.round_robin_config,
          default_temperature: original.default_temperature,
          default_tags: original.default_tags,
          theme: original.theme,
          ai_enabled: original.ai_enabled,
          ai_context: original.ai_context,
          created_by: profile.id,
        })
        .select()
        .single();

      if (error) throw error;
      return parseFunnel(data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['funnels'] });
      toast.success('Funil duplicado com sucesso!');
    },
    onError: (error: Error) => {
      toast.error('Erro ao duplicar funil: ' + error.message);
    },
  });
}

// =====================================================
// Hook: Analytics do funil
// =====================================================

export function useFunnelAnalytics(funnelId?: string, days = 30) {
  return useQuery({
    queryKey: ['funnel-analytics', funnelId, days],
    queryFn: async () => {
      if (!funnelId) return [];

      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      const { data, error } = await supabase
        .from('funnel_analytics')
        .select('*')
        .eq('funnel_id', funnelId)
        .gte('date', startDate.toISOString().split('T')[0])
        .order('date', { ascending: true });

      if (error) throw error;
      return (data || []) as FunnelAnalytics[];
    },
    enabled: !!funnelId,
  });
}

// =====================================================
// Hook: Alterar status do funil
// =====================================================

export function useUpdateFunnelStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: Funnel['status'] }) => {
      const { data, error } = await supabase
        .from('capture_funnels')
        .update({ status })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return parseFunnel(data);
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['funnels'] });
      queryClient.invalidateQueries({ queryKey: ['funnel', data.id] });
      
      const statusLabels: Record<string, string> = {
        draft: 'Rascunho',
        active: 'Ativo',
        paused: 'Pausado',
        archived: 'Arquivado',
      };
      toast.success(`Funil alterado para ${statusLabels[data.status]}`);
    },
    onError: (error: Error) => {
      toast.error('Erro ao alterar status: ' + error.message);
    },
  });
}

// =====================================================
// Hook: Salvar flow blocks
// =====================================================

export function useSaveFlowBlocks() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ 
      id, 
      flow_blocks, 
      start_block_id 
    }: { 
      id: string; 
      flow_blocks: FunnelBlock[]; 
      start_block_id: string | null;
    }) => {
      const { data, error } = await supabase
        .from('capture_funnels')
        .update({ 
          flow_blocks: flow_blocks as unknown as Json,
          start_block_id 
        })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return parseFunnel(data);
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['funnel', data.id] });
      toast.success('Fluxo salvo com sucesso!');
    },
    onError: (error: Error) => {
      toast.error('Erro ao salvar fluxo: ' + error.message);
    },
  });
}
