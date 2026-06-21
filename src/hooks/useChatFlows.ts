import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { ChatFlow, FlowBlock, TriggerConditions, CollectedVariable, TriggerType } from '@/types/chatFlow';
import { toast } from 'sonner';

// Helper para converter tipos do banco
function parseChatFlow(data: any): ChatFlow {
  return {
    id: data.id,
    product_id: data.product_id,
    organization_id: data.organization_id,
    name: data.name,
    description: data.description,
    blocks: (data.blocks || []) as FlowBlock[],
    start_block_id: data.start_block_id,
    is_active: data.is_active ?? true,
    trigger_type: (data.trigger_type || 'always') as TriggerType,
    trigger_conditions: (data.trigger_conditions || {}) as TriggerConditions,
    collected_variables: (data.collected_variables || []) as CollectedVariable[],
    created_at: data.created_at,
    updated_at: data.updated_at,
    created_by: data.created_by,
  };
}

// Buscar todos os fluxos de um produto
export function useChatFlows(productId?: string) {
  return useQuery({
    queryKey: ['chat-flows', productId],
    queryFn: async () => {
      let query = supabase
        .from('chat_flows')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (productId) {
        query = query.eq('product_id', productId);
      }
      
      const { data, error } = await query;
      
      if (error) throw error;
      return (data || []).map(parseChatFlow);
    },
    enabled: !!productId,
  });
}

// Buscar um fluxo específico
export function useChatFlow(flowId?: string) {
  return useQuery({
    queryKey: ['chat-flow', flowId],
    queryFn: async () => {
      if (!flowId) return null;
      
      const { data, error } = await supabase
        .from('chat_flows')
        .select('*')
        .eq('id', flowId)
        .single();
      
      if (error) throw error;
      return parseChatFlow(data);
    },
    enabled: !!flowId,
  });
}

// Buscar fluxo ativo de um produto
export function useActiveChatFlow(productId?: string) {
  return useQuery({
    queryKey: ['chat-flow-active', productId],
    queryFn: async () => {
      if (!productId) return null;
      
      const { data, error } = await supabase
        .from('chat_flows')
        .select('*')
        .eq('product_id', productId)
        .eq('is_active', true)
        .maybeSingle();
      
      if (error) throw error;
      return data ? parseChatFlow(data) : null;
    },
    enabled: !!productId,
  });
}

// Criar novo fluxo
export function useCreateChatFlow() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (params: {
      productId: string;
      organizationId: string;
      name?: string;
      description?: string;
    }) => {
      const { data, error } = await supabase
        .from('chat_flows')
        .insert({
          product_id: params.productId,
          organization_id: params.organizationId,
          name: params.name || 'Novo Fluxo',
          description: params.description || null,
          blocks: [],
          start_block_id: null,
          is_active: false,
          trigger_type: 'always',
          trigger_conditions: {},
          collected_variables: [],
        })
        .select()
        .single();
      
      if (error) throw error;
      return parseChatFlow(data);
    },
    onSuccess: (_, params) => {
      queryClient.invalidateQueries({ queryKey: ['chat-flows', params.productId] });
      toast.success('Fluxo criado com sucesso!');
    },
    onError: (error: Error) => {
      toast.error('Erro ao criar fluxo: ' + error.message);
    },
  });
}

// Atualizar fluxo
export function useUpdateChatFlow() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (params: {
      flowId: string;
      updates: Partial<{
        name: string;
        description: string | null;
        blocks: FlowBlock[];
        start_block_id: string | null;
        is_active: boolean;
        trigger_type: TriggerType;
        trigger_conditions: TriggerConditions;
        collected_variables: CollectedVariable[];
      }>;
    }) => {
      // Cast to any for JSONB fields
      const updatePayload: any = {
        ...params.updates,
        updated_at: new Date().toISOString(),
      };
      
      const { data, error } = await supabase
        .from('chat_flows')
        .update(updatePayload)
        .eq('id', params.flowId)
        .select()
        .single();
      
      if (error) throw error;
      return parseChatFlow(data);
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['chat-flows', data.product_id] });
      queryClient.invalidateQueries({ queryKey: ['chat-flow', data.id] });
      queryClient.invalidateQueries({ queryKey: ['chat-flow-active', data.product_id] });
    },
    onError: (error: Error) => {
      toast.error('Erro ao atualizar fluxo: ' + error.message);
    },
  });
}

// Salvar blocos do fluxo
export function useSaveChatFlowBlocks() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (params: {
      flowId: string;
      blocks: FlowBlock[];
      startBlockId: string | null;
      collectedVariables: CollectedVariable[];
    }) => {
      const { data, error } = await supabase
        .from('chat_flows')
        .update({
          blocks: params.blocks as any,
          start_block_id: params.startBlockId,
          collected_variables: params.collectedVariables as any,
          updated_at: new Date().toISOString(),
        })
        .eq('id', params.flowId)
        .select()
        .single();
      
      if (error) throw error;
      return parseChatFlow(data);
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['chat-flows', data.product_id] });
      queryClient.invalidateQueries({ queryKey: ['chat-flow', data.id] });
      toast.success('Fluxo salvo!');
    },
    onError: (error: Error) => {
      toast.error('Erro ao salvar fluxo: ' + error.message);
    },
  });
}

// Ativar/Desativar fluxo
export function useToggleChatFlowActive() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (params: { flowId: string; isActive: boolean; productId: string }) => {
      // Se ativando, desativar outros fluxos do produto primeiro
      if (params.isActive) {
        await supabase
          .from('chat_flows')
          .update({ is_active: false })
          .eq('product_id', params.productId)
          .neq('id', params.flowId);
      }
      
      const { data, error } = await supabase
        .from('chat_flows')
        .update({ 
          is_active: params.isActive,
          updated_at: new Date().toISOString(),
        })
        .eq('id', params.flowId)
        .select()
        .single();
      
      if (error) throw error;
      return parseChatFlow(data);
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['chat-flows', data.product_id] });
      queryClient.invalidateQueries({ queryKey: ['chat-flow', data.id] });
      queryClient.invalidateQueries({ queryKey: ['chat-flow-active', data.product_id] });
      toast.success(data.is_active ? 'Fluxo ativado!' : 'Fluxo desativado!');
    },
    onError: (error: Error) => {
      toast.error('Erro ao alterar status: ' + error.message);
    },
  });
}

// Deletar fluxo
export function useDeleteChatFlow() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (params: { flowId: string; productId: string }) => {
      const { error } = await supabase
        .from('chat_flows')
        .delete()
        .eq('id', params.flowId);
      
      if (error) throw error;
      return params;
    },
    onSuccess: (params) => {
      queryClient.invalidateQueries({ queryKey: ['chat-flows', params.productId] });
      queryClient.invalidateQueries({ queryKey: ['chat-flow-active', params.productId] });
      toast.success('Fluxo excluído!');
    },
    onError: (error: Error) => {
      toast.error('Erro ao excluir fluxo: ' + error.message);
    },
  });
}

// Duplicar fluxo
export function useDuplicateChatFlow() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (flowId: string) => {
      // Buscar fluxo original
      const { data: original, error: fetchError } = await supabase
        .from('chat_flows')
        .select('*')
        .eq('id', flowId)
        .single();
      
      if (fetchError) throw fetchError;
      
      // Criar cópia
      const { data, error } = await supabase
        .from('chat_flows')
        .insert({
          product_id: original.product_id,
          organization_id: original.organization_id,
          name: `${original.name} (cópia)`,
          description: original.description,
          blocks: original.blocks,
          start_block_id: original.start_block_id,
          is_active: false,
          trigger_type: original.trigger_type,
          trigger_conditions: original.trigger_conditions,
          collected_variables: original.collected_variables,
        })
        .select()
        .single();
      
      if (error) throw error;
      return parseChatFlow(data);
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['chat-flows', data.product_id] });
      toast.success('Fluxo duplicado!');
    },
    onError: (error: Error) => {
      toast.error('Erro ao duplicar fluxo: ' + error.message);
    },
  });
}
