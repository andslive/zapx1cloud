import { useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

// Always fetch a fresh access token. The cached `session` from useAuth can lag
// behind Supabase's auto-refresh, causing 401 "Invalid token" errors right
// after the JWT expires. getSession() returns the up-to-date token.
async function getFreshAccessToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

// Types
export interface WebChatWidget {
  id: string;
  organization_id: string;
  product_id: string | null;
  name: string;
  is_active: boolean;
  primary_color: string;
  secondary_color: string;
  welcome_message: string;
  placeholder_text: string;
  position: string;
  avatar_url: string | null;
  auto_open_delay: number | null;
  business_hours: Record<string, unknown> | null;
  offline_message: string;
  collect_email: boolean;
  collect_phone: boolean;
  collect_name: boolean;
  created_at: string;
  updated_at: string;
}

export interface WebChatAgentConfig {
  id: string;
  widget_id: string;
  organization_id: string;
  product_id: string | null;
  agent_name: string;
  agent_avatar_url: string | null;
  system_prompt: string;
  knowledge_base: string | null;
  faq: Array<{ question: string; answer: string }> | null;
  handoff_triggers: string[] | null;
  auto_handoff_enabled: boolean;
  greeting_message: string;
  fallback_message: string;
  handoff_message: string;
  is_active: boolean;
  // Novos campos avançados
  temperature: number;
  max_tokens: number;
  persona_style: 'friendly' | 'professional' | 'casual';
  use_product_brain: boolean;
  collect_before_chat: boolean;
  required_fields: string[];
  welcome_flow: Record<string, unknown>[] | null;
  // Sales AI fields
  sales_prompt: string | null;
  sales_context: string | null;
  chunked_messages_enabled: boolean;
  typing_delay_ms: number;
  max_message_length: number;
  created_at: string;
  updated_at: string;
}

export interface WebChatConversation {
  id: string;
  organization_id: string;
  widget_id: string;
  channel: string;
  status: 'bot_active' | 'waiting_human' | 'human_active' | 'closed';
  visitor_id: string;
  visitor_name: string | null;
  visitor_email: string | null;
  visitor_phone: string | null;
  visitor_whatsapp: string | null;
  visitor_avatar_url: string | null;
  assigned_user_id: string | null;
  lead_id: string | null;
  current_page_url: string | null;
  referrer_url: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  last_message_at: string | null;
  unread_count_agents: number;
  first_response_at: string | null;
  data_collected: boolean;
  collected_data: Record<string, unknown>;
  lead_created_at: string | null;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
  connection_id: string | null;
  // Joined data
  webchat_widgets?: { name: string; primary_color: string; product_id?: string };
  profiles?: { id: string; full_name: string; avatar_url: string | null };
  leads?: { id: string; name: string; email: string | null; phone: string | null; connection_id?: string | null };
}


export interface WebChatMessage {
  id: string;
  conversation_id: string;
  direction: 'inbound' | 'outbound';
  sender_type: 'visitor' | 'bot' | 'agent';
  sender_id: string | null;
  content: string;
  content_type: string;
  metadata: Record<string, unknown>;
  created_at: string;
  is_deleted?: boolean;
  edited_at?: string | null;
  original_content?: string | null;
  reply_to_message_id?: string | null;
  is_starred?: boolean;
  forwarded_from_message_id?: string | null;
  profiles?: { id: string; full_name: string; avatar_url: string | null };
  reply_to?: { id: string; content: string; sender_type: string } | null;
}

// Hooks for Widgets
export function useWebChatWidgets() {
  const { profile } = useAuth();

  return useQuery({
    queryKey: ['webchat-widgets', profile?.organization_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('webchat_widgets')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as WebChatWidget[];
    },
    enabled: !!profile?.organization_id,
  });
}

export function useWebChatWidget(widgetId: string) {
  return useQuery({
    queryKey: ['webchat-widget', widgetId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('webchat_widgets')
        .select('*, webchat_agent_configs(*)')
        .eq('id', widgetId)
        .single();

      if (error) throw error;
      
      // Transform data to match our types
      const widget = data as any;
      return {
        ...widget,
        business_hours: widget.business_hours || null,
        webchat_agent_configs: (widget.webchat_agent_configs || []).map((config: any) => ({
          ...config,
          faq: Array.isArray(config.faq) ? config.faq : null,
          handoff_triggers: Array.isArray(config.handoff_triggers) ? config.handoff_triggers : null,
          required_fields: Array.isArray(config.required_fields) ? config.required_fields : ['name', 'whatsapp'],
          temperature: config.temperature ?? 0.7,
          max_tokens: config.max_tokens ?? 500,
          persona_style: config.persona_style || 'friendly',
          use_product_brain: config.use_product_brain ?? true,
          collect_before_chat: config.collect_before_chat ?? true,
          welcome_flow: Array.isArray(config.welcome_flow) ? config.welcome_flow : null,
        }))
      } as WebChatWidget & { webchat_agent_configs: WebChatAgentConfig[] };
    },
    enabled: !!widgetId,
  });
}

// Hook para buscar widget por produto
export function useWebChatWidgetByProduct(productId: string) {
  const { profile } = useAuth();
  
  return useQuery({
    queryKey: ['webchat-widget-product', productId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('webchat_widgets')
        .select('*, webchat_agent_configs(*)')
        .eq('product_id', productId)
        .maybeSingle();

      if (error) throw error;
      if (!data) return null;
      
      // Transform data to match our types
      const widget = data as any;
      return {
        ...widget,
        business_hours: widget.business_hours || null,
        webchat_agent_configs: (widget.webchat_agent_configs || []).map((config: any) => ({
          ...config,
          faq: Array.isArray(config.faq) ? config.faq : null,
          handoff_triggers: Array.isArray(config.handoff_triggers) ? config.handoff_triggers : null,
          required_fields: Array.isArray(config.required_fields) ? config.required_fields : ['name', 'whatsapp'],
          temperature: config.temperature ?? 0.7,
          max_tokens: config.max_tokens ?? 500,
          persona_style: config.persona_style || 'friendly',
          use_product_brain: config.use_product_brain ?? true,
          collect_before_chat: config.collect_before_chat ?? true,
          welcome_flow: Array.isArray(config.welcome_flow) ? config.welcome_flow : null,
        }))
      } as WebChatWidget & { webchat_agent_configs: WebChatAgentConfig[] };
    },
    enabled: !!productId && !!profile?.organization_id,
  });
}

// Hook para criar widget para produto
export function useCreateProductWidget() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();

  return useMutation({
    mutationFn: async ({ productId, productName }: { productId: string; productName: string }) => {
      if (!profile?.organization_id) throw new Error('No organization');

      const { data, error } = await supabase
        .from('webchat_widgets')
        .insert({
          name: `Chat - ${productName}`,
          organization_id: profile.organization_id,
          product_id: productId,
        })
        .select()
        .single();

      if (error) throw error;

      // Create default agent config linked to product
      await supabase.from('webchat_agent_configs').insert({
        widget_id: data.id,
        organization_id: profile.organization_id,
        product_id: productId,
        agent_name: 'Assistente Virtual',
        use_product_brain: true,
        collect_before_chat: true,
        required_fields: ['name', 'whatsapp'],
      });

      return data;
    },
    onSuccess: (_, { productId }) => {
      queryClient.invalidateQueries({ queryKey: ['webchat-widgets'] });
      queryClient.invalidateQueries({ queryKey: ['webchat-widget-product', productId] });
    },
  });
}

export function useCreateWebChatWidget() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();

  return useMutation({
    mutationFn: async (widget: { name?: string }) => {
      if (!profile?.organization_id) throw new Error('No organization');

      const { data, error } = await supabase
        .from('webchat_widgets')
        .insert({
          name: widget.name || 'Novo Widget',
          organization_id: profile.organization_id,
        })
        .select()
        .single();

      if (error) throw error;

      // Create default agent config
      await supabase.from('webchat_agent_configs').insert({
        widget_id: data.id,
        organization_id: profile.organization_id,
      });

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['webchat-widgets'] });
    },
  });
}

export function useUpdateWebChatWidget() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: string; [key: string]: unknown }) => {
      const { data, error } = await supabase
        .from('webchat_widgets')
        .update(updates as Record<string, unknown>)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data as WebChatWidget;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['webchat-widgets'] });
      queryClient.invalidateQueries({ queryKey: ['webchat-widget', data.id] });
    },
  });
}

// Hooks for Agent Config
export function useUpdateAgentConfig() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<WebChatAgentConfig> & { id: string }) => {
      // Transform to database-compatible format
      const dbUpdates: Record<string, unknown> = {};
      
      Object.entries(updates).forEach(([key, value]) => {
        if (key === 'faq') {
          dbUpdates[key] = JSON.stringify(value);
        } else if (key === 'welcome_flow') {
          dbUpdates[key] = value ? JSON.stringify(value) : null;
        } else {
          dbUpdates[key] = value;
        }
      });

      const { data, error } = await supabase
        .from('webchat_agent_configs')
        .update(dbUpdates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['webchat-widget', data.widget_id] });
    },
  });
}

// ============================================================================
// Hooks for Conversations (Inbox) — todos os filtros são aplicados no backend
// ============================================================================

export interface InboxBackendFilters {
  tab?: 'attending' | 'waiting' | 'resolved' | 'all';
  product_ids?: string[];        // pode incluir '__none__'
  sector_ids?: string[];         // pode incluir '__none__'
  assigned_user_ids?: string[];  // pode incluir 'unassigned'
  tag_ids?: string[];
  channel?: string | null;
  search?: string | null;
}

function buildInboxParams(filters?: InboxBackendFilters): URLSearchParams {
  const params = new URLSearchParams();
  params.set('action', 'conversations');
  if (filters?.tab) params.set('tab', filters.tab);
  if (filters?.product_ids?.length) params.set('product_ids', filters.product_ids.join(','));
  if (filters?.sector_ids?.length) params.set('sector_ids', filters.sector_ids.join(','));
  if (filters?.assigned_user_ids?.length) params.set('assigned_user_ids', filters.assigned_user_ids.join(','));
  if (filters?.tag_ids?.length) params.set('tag_ids', filters.tag_ids.join(','));
  if (filters?.channel) params.set('channel', filters.channel);
  if (filters?.search) params.set('search', filters.search);
  return params;
}

export function useWebChatConversations(filters?: InboxBackendFilters & { limit?: number }) {
  const { session, profile } = useAuth();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!profile?.organization_id) return;

    // Escuta mudanças em conversas para atualizar a lista instantaneamente
    const channel = supabase
      .channel('webchat-conversations-realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'webchat_conversations',
          filter: `organization_id=eq.${profile.organization_id}`
        },
        () => {
          queryClient.refetchQueries({ queryKey: ['webchat-conversations'], type: 'active' });
          queryClient.refetchQueries({ queryKey: ['webchat-conversation-counts'], type: 'active' });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [profile?.organization_id, queryClient]);

  return useQuery({
    queryKey: ['webchat-conversations', filters],
    queryFn: async () => {
      const params = buildInboxParams(filters);
      params.set('limit', String(filters?.limit ?? 50));

      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/webchat-inbox?${params.toString()}`;
      const res = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${session?.access_token}`,
          'Content-Type': 'application/json',
        },
      });

      const data = await res.json();
      if (!res.ok || data.success === false) {
        console.error('[useWebChatConversations] Error:', data);
        throw new Error(data.message || data.error || 'Failed to fetch conversations');
      }
      return data.conversations as WebChatConversation[];

    },
    enabled: !!session?.access_token,
    refetchInterval: 90000, // 30s -> 90s (Realtime cobre o tempo real; este é só backup)
    refetchIntervalInBackground: false,
  });
}

export function useWebChatConversationCounts(filters?: Omit<InboxBackendFilters, 'tab'>) {
  const { session } = useAuth();

  return useQuery({
    queryKey: ['webchat-conversation-counts', filters],
    queryFn: async () => {
      const params = buildInboxParams(filters);
      params.set('action', 'conversation_counts');
      const token = (await getFreshAccessToken()) ?? session?.access_token;
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/webchat-inbox?${params.toString()}`;
      const res = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });
      const data = await res.json();
      if (!res.ok || data.success === false) {
        console.error('[useWebChatConversationCounts] Error:', data);
        throw new Error(data.message || data.error || 'Failed to fetch conversation counts');
      }
      return data as { attending: number; waiting: number; resolved: number };

    },
    enabled: !!session?.access_token,
    refetchInterval: 120000, // 60s -> 2min (contadores; Realtime cobre)
    refetchIntervalInBackground: false,
  });
}

export function useWebChatConversation(conversationId: string) {
  const { session } = useAuth();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!conversationId) return;

    // Escuta novas mensagens ou edições nesta conversa específica
    const channel = supabase
      .channel(`conversation-${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'webchat_messages',
          filter: `conversation_id=eq.${conversationId}`
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['webchat-conversation', conversationId] });
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'webchat_conversations',
          filter: `id=eq.${conversationId}`
        },
        () => {
          // Também atualiza se o status da conversa mudar (ex: bot para humano)
          queryClient.invalidateQueries({ queryKey: ['webchat-conversation', conversationId] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId, queryClient]);

  return useQuery({
    queryKey: ['webchat-conversation', conversationId],
    queryFn: async () => {
      const token = (await getFreshAccessToken()) ?? session?.access_token;
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/webchat-inbox?action=conversation&id=${conversationId}`;
      const res = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!res.ok) {
        let body: any = null;
        try { body = await res.json(); } catch { /* ignore */ }
        // 404 (conversa apagada) / 403 (sem acesso): NÃO lança erro — devolve
        // payload "vazio" sinalizado para o componente limpar a seleção sem
        // disparar overlay de runtime/blank screen.
        if (res.status === 404 || res.status === 403) {
          return {
            conversation: null as unknown as WebChatConversation,
            messages: [] as WebChatMessage[],
            notFound: res.status === 404,
            forbidden: res.status === 403,
          };
        }
        const err: any = new Error(body?.error || `Failed to fetch conversation (${res.status})`);
        err.status = res.status;
        err.details = body?.details;
        throw err;
      }
      const data = await res.json();
      return {
        conversation: data.conversation as WebChatConversation,
        messages: data.messages as WebChatMessage[],
        notFound: false,
        forbidden: false,
      };
    },
    enabled: !!session?.access_token && !!conversationId,
    staleTime: 30000,
    // Mantém a conversa anterior visível enquanto a nova carrega — elimina o "flash" de loading
    placeholderData: (prev) => prev,
    // Pinta cabeçalho/última mensagem instantaneamente a partir do cache da lista de conversas
    initialData: () => {
      if (!conversationId) return undefined;
      const list = queryClient.getQueryData<any>(['webchat-conversations']);
      const items: any[] = Array.isArray(list) ? list : (list?.conversations || []);
      const found = items.find((c) => c?.id === conversationId);
      if (!found) return undefined;
      return { conversation: found as WebChatConversation, messages: [] as WebChatMessage[] };
    },
    initialDataUpdatedAt: 0, // força refetch em background mesmo com initialData
    refetchInterval: 60000, // 15s -> 60s (Realtime já invalida em INSERT/UPDATE)
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: false,
    // Não insiste em IDs inválidos / sem permissão
    retry: (failureCount, error: any) => {
      if (error?.status === 404 || error?.status === 403) return false;
      return failureCount < 2;
    },
  });
}

export function useAssignConversation() {
  const queryClient = useQueryClient();
  const { session } = useAuth();

  return useMutation({
    mutationFn: async (conversationId: string) => {
      const token = await getFreshAccessToken();
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/webchat-inbox?action=assign`;
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ conversation_id: conversationId }),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to assign conversation');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['webchat-conversations'] });
    },
  });
}

export interface SendAgentMessageVars {
  conversationId: string;
  content: string;
  replyToMessageId?: string;
  /** Mídia a anexar (formato canônico). Se enviada, será roteada para o canal. */
  media?: {
    kind: 'image' | 'audio' | 'video' | 'document' | 'sticker';
    url: string;
    mime?: string | null;
    filename?: string | null;
    size_bytes?: number | null;
    duration_ms?: number | null;
    width?: number | null;
    height?: number | null;
    caption?: string | null;
    thumbnail_url?: string | null;
  };
}

export function useSendAgentMessage() {
  const queryClient = useQueryClient();
  const { session, profile, user } = useAuth();

  return useMutation({
    mutationFn: async ({ conversationId, content, replyToMessageId, media, clientTempId }: SendAgentMessageVars & { clientTempId?: string }) => {
      const token = await getFreshAccessToken();
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/webchat-inbox?action=send`;
      
      const payload = {
        conversation_id: conversationId,
        content,
        reply_to_message_id: replyToMessageId,
        media,
        client_temp_id: clientTempId,
      };

      console.log("CHAT_SEND_FUNCTION_CALLED", {
        functionName: "webchat-inbox",
        action: "send",
        payload
      });

      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });
      
      const data = await res.json();
      if (!res.ok) {
        const error = new Error(data.message || data.error || 'Failed to send message') as any;
        error.error_code = data.error_code;
        error.debug = data.debug;
        error.raw_error = data.raw_error;
        error.uazapi_response = data.uazapi_response || data.debug?.uazapi_body;
        throw error;
      }
      return data;


      return data;

    },
    // Optimistic update - show message immediately.
    // Usa um clientTempId estável que é enviado para o backend e ecoado de volta
    // no broadcast `new_message` — assim o listener consegue SUBSTITUIR a bolha
    // otimista pela mensagem persistida em vez de duplicar.
    onMutate: async (vars) => {
      const { conversationId, content, media } = vars;
      const clientTempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      // Anexa no objeto de variáveis para o mutationFn enviá-lo ao backend
      (vars as any).clientTempId = clientTempId;

      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: ['webchat-conversation', conversationId] });

      // Snapshot previous value
      const previousData = queryClient.getQueryData(['webchat-conversation', conversationId]);

      // Optimistically add the new message
      queryClient.setQueryData(['webchat-conversation', conversationId], (old: any) => {
        if (!old) return old;
        return {
          ...old,
          messages: [
            ...(old.messages || []),
            {
              id: clientTempId,
              client_temp_id: clientTempId,
              conversation_id: conversationId,
              content,
              direction: 'outbound',
              sender_type: 'agent',
              sender_id: user?.id,
              content_type: media ? media.kind : 'text',
              metadata: media ? { media } : {},
              created_at: new Date().toISOString(),
              profiles: {
                id: user?.id,
                full_name: profile?.full_name || 'Você',
                avatar_url: profile?.avatar_url || null,
              },
            },
          ],
        };
      });

      return { previousData, clientTempId };
    },
    onError: (err, variables, context) => {
      // Rollback on error
      if (context?.previousData) {
        queryClient.setQueryData(['webchat-conversation', variables.conversationId], context.previousData);
      }
    },
    onSettled: (_, __, { conversationId }) => {
      // Always refetch after error or success to ensure data is in sync
      queryClient.invalidateQueries({ queryKey: ['webchat-conversation', conversationId] });
      queryClient.invalidateQueries({ queryKey: ['webchat-conversations'] });
    },
  });
}

export function useCloseConversation() {
  const queryClient = useQueryClient();
  const { session } = useAuth();

  return useMutation({
    mutationFn: async (conversationId: string) => {
      const token = await getFreshAccessToken();
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/webchat-inbox?action=close`;
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ conversation_id: conversationId }),
      });

      if (!res.ok) throw new Error('Failed to close conversation');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['webchat-conversations'] });
    },
  });
}

export function useLinkLead() {
  const queryClient = useQueryClient();
  const { session } = useAuth();

  return useMutation({
    mutationFn: async ({ conversationId, leadId }: { conversationId: string; leadId?: string }) => {
      const token = await getFreshAccessToken();
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/webchat-inbox?action=link-lead`;
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ conversation_id: conversationId, lead_id: leadId }),
      });

      if (!res.ok) throw new Error('Failed to link lead');
      return res.json();
    },
    onSuccess: (_, { conversationId }) => {
      queryClient.invalidateQueries({ queryKey: ['webchat-conversation', conversationId] });
      queryClient.invalidateQueries({ queryKey: ['webchat-conversations'] });
    },
  });
}

/**
 * Define (ou limpa) o produto de uma conversa do Inbox manualmente.
 * Override manual feito pelo atendente no painel direito.
 */
export function useSetConversationProduct() {
  const queryClient = useQueryClient();
  const { session } = useAuth();

  return useMutation({
    mutationFn: async ({ conversationId, productId }: { conversationId: string; productId: string | null }) => {
      const token = await getFreshAccessToken();
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/webchat-inbox?action=set-product`;
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ conversation_id: conversationId, product_id: productId }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to set product');
      }
      return res.json();
    },
    onSuccess: (_, { conversationId }) => {
      queryClient.invalidateQueries({ queryKey: ['webchat-conversation', conversationId] });
      queryClient.invalidateQueries({ queryKey: ['webchat-conversations'] });
      queryClient.invalidateQueries({ queryKey: ['linked-lead'] });
    },
  });
}

export function useSetConversationSector() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ conversationId, sectorId }: { conversationId: string; sectorId: string | null }) => {
      const { error } = await supabase
        .from('webchat_conversations')
        .update({ sector_id: sectorId })
        .eq('id', conversationId);
      if (error) throw error;
      return { ok: true };
    },
    onSuccess: (_, { conversationId }) => {
      queryClient.invalidateQueries({ queryKey: ['webchat-conversation', conversationId] });
      queryClient.invalidateQueries({ queryKey: ['webchat-conversations'] });
    },
  });
}

// New hooks for conversation management
// Mapeia ação -> status alvo para atualização otimista da UI.
const ACTION_TO_STATUS: Record<string, string | undefined> = {
  reopen: 'human_active',
  resume: 'human_active',
  'activate-bot': 'bot_active',
  close: 'closed',
  'return-to-queue': 'waiting_human',
};

function useConversationAction(actionName: string) {
  const queryClient = useQueryClient();
  const { session } = useAuth();

  return useMutation({
    mutationFn: async (conversationId: string) => {
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/webchat-inbox?action=${actionName}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session?.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ conversation_id: conversationId }),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || `Failed to ${actionName}`);
      }
      return res.json();
    },
    // Atualização otimista — UI reflete na hora, antes do servidor responder.
    onMutate: async (conversationId: string) => {
      const targetStatus = ACTION_TO_STATUS[actionName];
      if (!targetStatus) return { previousDetail: undefined, previousList: undefined };

      await queryClient.cancelQueries({ queryKey: ['webchat-conversation', conversationId] });

      const previousDetail = queryClient.getQueryData<any>(['webchat-conversation', conversationId]);
      if (previousDetail?.conversation) {
        queryClient.setQueryData(['webchat-conversation', conversationId], {
          ...previousDetail,
          conversation: { ...previousDetail.conversation, status: targetStatus },
        });
      }

      // Atualiza todas as listas em cache (qualquer filtro)
      const listQueries = queryClient.getQueriesData<any>({ queryKey: ['webchat-conversations'] });
      const previousList = listQueries.map(([key, data]) => [key, data] as const);
      listQueries.forEach(([key, data]) => {
        if (!Array.isArray(data)) return;
        queryClient.setQueryData(
          key,
          data.map((c: any) => (c.id === conversationId ? { ...c, status: targetStatus } : c)),
        );
      });

      return { previousDetail, previousList };
    },
    onError: (_err, conversationId, ctx: any) => {
      if (ctx?.previousDetail) {
        queryClient.setQueryData(['webchat-conversation', conversationId], ctx.previousDetail);
      }
      if (ctx?.previousList) {
        ctx.previousList.forEach(([key, data]: any) => queryClient.setQueryData(key, data));
      }
    },
    onSettled: (_data, _err, conversationId) => {
      queryClient.invalidateQueries({ queryKey: ['webchat-conversations'] });
      queryClient.invalidateQueries({ queryKey: ['webchat-conversation', conversationId] });
    },
  });
}

export function useReopenConversation() {
  return useConversationAction('reopen');
}

export function useReturnToQueue() {
  return useConversationAction('return-to-queue');
}

export function useResumeConversation() {
  return useConversationAction('resume');
}

export function useActivateBot() {
  return useConversationAction('activate-bot');
}

export function useAIReactivate() {
  const queryClient = useQueryClient();
  const { session } = useAuth();

  return useMutation({
    mutationFn: async (conversationId: string) => {
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/webchat-inbox?action=ai-reactivate`;
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session?.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ conversation_id: conversationId }),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to send reactivation');
      }
      return res.json();
    },
    onSuccess: (_, conversationId) => {
      queryClient.invalidateQueries({ queryKey: ['webchat-conversation', conversationId] });
      queryClient.invalidateQueries({ queryKey: ['webchat-conversations'] });
    },
  });
}

export function useTriggerFlow() {
  const queryClient = useQueryClient();
  const { session } = useAuth();

  return useMutation({
    mutationFn: async ({ conversationId, flowId }: { conversationId: string; flowId: string }) => {
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/webchat-inbox?action=trigger-flow`;
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session?.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ conversation_id: conversationId, flow_id: flowId }),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to trigger flow');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['webchat-conversations'] });
      queryClient.invalidateQueries({ queryKey: ['webchat-conversation'] });
    },
  });
}

// Message action hooks
function useMessageAction(actionName: string) {
  const queryClient = useQueryClient();
  const { session } = useAuth();

  return useMutation({
    mutationFn: async (params: Record<string, unknown>) => {
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/webchat-inbox?action=${actionName}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session?.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(params),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || `Failed to ${actionName}`);
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['webchat-conversations'] });
      queryClient.invalidateQueries({ queryKey: ['webchat-conversation'] });
    },
  });
}

export function useEditMessage() {
  return useMessageAction('edit-message');
}

export function useDeleteMessage() {
  return useMessageAction('delete-message');
}

export function useStarMessage() {
  return useMessageAction('star-message');
}

export function useForwardMessage() {
  return useMessageAction('forward-message');
}

export function useMarkConversationRead() {
  const queryClient = useQueryClient();
  const { session } = useAuth();

  return useMutation({
    mutationFn: async (conversationId: string) => {
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/webchat-inbox?action=mark-read`;
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session?.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ conversation_id: conversationId }),
      });

      if (!res.ok) {
        const error = await res.json().catch(() => ({}));
        throw new Error(error.error || 'Failed to mark as read');
      }
      return res.json();
    },
    onSuccess: (_, conversationId) => {
      // Atualiza o contador de não lidas localmente para resposta instantânea
      queryClient.setQueryData(['webchat-conversation-counts'], (old: any) => {
        if (!old) return old;
        return { ...old, waiting: Math.max(0, old.waiting - 1) };
      });
      
      // Invalida a conversa para limpar os badges
      queryClient.invalidateQueries({ queryKey: ['webchat-conversation', conversationId] });
      queryClient.invalidateQueries({ queryKey: ['webchat-conversations'] });
    },
  });
}
