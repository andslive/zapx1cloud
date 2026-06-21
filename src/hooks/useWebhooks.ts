import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { Webhook, WebhookAction, WebhookLog, WebhookSampleRequest } from '@/types/webhook';
import type { Json } from '@/integrations/supabase/types';

// Helper to safely parse actions from DB
const parseActions = (actions: Json | null): WebhookAction[] => {
  if (!actions || !Array.isArray(actions)) return [];
  return actions as unknown as WebhookAction[];
};

// Fetch all webhooks for the organization
export function useWebhooks() {
  return useQuery({
    queryKey: ['webhooks'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('webhooks')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      
      return (data || []).map(w => ({
        ...w,
        actions: parseActions(w.actions),
        identification_config: w.identification_config || {}
      })) as Webhook[];
    }
  });
}

// Fetch a single webhook by ID
export function useWebhook(id: string | null) {
  return useQuery({
    queryKey: ['webhook', id],
    queryFn: async () => {
      if (!id) return null;
      
      const { data, error } = await supabase
        .from('webhooks')
        .select('*')
        .eq('id', id)
        .single();

      if (error) throw error;
      
      return {
        ...data,
        actions: parseActions(data.actions),
        identification_config: data.identification_config || {}
      } as Webhook;
    },
    enabled: !!id
  });
}

// Create a new webhook
export function useCreateWebhook() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: { name: string; description?: string; product_id?: string }) => {
      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error('Usuário não autenticado');
      }

      // Get current user's organization
      const { data: profile } = await supabase
        .from('profiles')
        .select('organization_id')
        .eq('id', user.id)
        .single();

      if (!profile?.organization_id) {
        throw new Error('Organização não encontrada');
      }

      // Generate slug from name
      const slug = data.name
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '');

      const { data: webhook, error } = await supabase
        .from('webhooks')
        .insert({
          organization_id: profile.organization_id,
          name: data.name,
          slug: `${slug}-${Date.now().toString(36)}`,
          description: data.description,
          product_id: data.product_id,
          is_active: false,
          is_test_mode: true,
          actions: [],
          identification_config: { lookup_strategy: 'email_first' }
        })
        .select()
        .single();

      if (error) throw error;
      return webhook;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['webhooks'] });
      toast.success('Webhook criado com sucesso!');
    },
    onError: (error: Error) => {
      toast.error(`Erro ao criar webhook: ${error.message}`);
    }
  });
}

// Update a webhook
export function useUpdateWebhook() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, actions, ...data }: Partial<Webhook> & { id: string }) => {
      const updateData: Record<string, unknown> = {
        ...data,
        updated_at: new Date().toISOString()
      };
      
      // Convert actions to JSON-compatible format
      if (actions !== undefined) {
        updateData.actions = actions as unknown as Json;
      }
      
      const { error } = await supabase
        .from('webhooks')
        .update(updateData)
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['webhooks'] });
      queryClient.invalidateQueries({ queryKey: ['webhook', variables.id] });
    },
    onError: (error: Error) => {
      toast.error(`Erro ao atualizar webhook: ${error.message}`);
    }
  });
}

// Delete a webhook
export function useDeleteWebhook() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('webhooks')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['webhooks'] });
      toast.success('Webhook excluído com sucesso!');
    },
    onError: (error: Error) => {
      toast.error(`Erro ao excluir webhook: ${error.message}`);
    }
  });
}

// Fetch webhook logs
export function useWebhookLogs(webhookId: string | null) {
  return useQuery({
    queryKey: ['webhook-logs', webhookId],
    queryFn: async () => {
      // Usando query direta mas com tipagem any para evitar recursão infinita no TS
      const query = (supabase.from('webhook_logs') as any)
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);

      const { data, error } = webhookId 
        ? await query.eq('webhook_id', webhookId) 
        : await query;

      if (error) throw error;
      return (data || []) as any[];
    },
    enabled: true
  });
}






// Fetch webhook sample requests
export function useWebhookSamples(webhookId: string | null) {
  return useQuery({
    queryKey: ['webhook-samples', webhookId],
    queryFn: async () => {
      if (!webhookId) return [];
      
      const { data, error } = await supabase
        .from('webhook_sample_requests')
        .select('*')
        .eq('webhook_id', webhookId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return (data || []) as WebhookSampleRequest[];
    },
    enabled: !!webhookId
  });
}

// Delete a sample request
export function useDeleteSample() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('webhook_sample_requests')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['webhook-samples'] });
    }
  });
}
