import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { useWebChatConversations, useWebChatConversationCounts, useWebChatConversation, useSendAgentMessage, useCloseConversation, useReopenConversation, useReturnToQueue, useResumeConversation, useActivateBot, useEditMessage, useDeleteMessage, useStarMessage, useForwardMessage, useAssignConversation, useMarkConversationRead, type InboxBackendFilters } from '@/hooks/useWebChat';
import { useWhatsAppInstances } from '@/hooks/useWhatsAppInstances';
import { useAssignedProducts, useProducts } from '@/hooks/useProducts';
import { useNotificationSound } from '@/hooks/useNotificationSound';
import { supabase } from '@/integrations/supabase/client';
import { ConversationList, Conversation } from './inbox/ConversationList';
import { ChatArea, Message } from './inbox/ChatArea';
import { LeadContextPanel } from './inbox/LeadContextPanel';
import { TransferConversationModal } from './inbox/TransferConversationModal';
import { InboxMetricsHeader } from './inbox/InboxMetricsHeader';
import { InboxProductSelector } from './inbox/InboxProductSelector';

import { EditVisitorDialog } from './inbox/EditVisitorDialog';
import { LeadEditModal } from '@/components/lead/LeadEditModal';
import { StartConversationDialog } from './inbox/StartConversationDialog';
import { SendFlowDialog } from './inbox/SendFlowDialog';
import { SendCadenceDialog } from './inbox/SendCadenceDialog';
import { ScheduleMessageDialog } from './inbox/ScheduleMessageDialog';
import { ScheduleFollowupDialog } from './inbox/ScheduleFollowupDialog';
import { ConversationAnalysisPanel } from './inbox/ConversationAnalysisPanel';
import { CatalogPickerDialog } from './inbox/CatalogPickerDialog';
import { PaymentLinkDialog } from './inbox/PaymentLinkDialog';
import { EventModal } from '@/components/calendar/EventModal';
import { DealModal } from './DealModal';
import { InboxFiltersDrawer, defaultInboxFilters, InboxFiltersState, AcceptTicketBar } from '@/components/inbox';
import { AcceptTicketDialog } from './inbox/AcceptTicketDialog';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { Loader2, MessageSquare, PanelRightClose, PanelRight, Filter } from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';
import { useConversationPresence } from '@/hooks/useConversationPresence';
import { parseMessageContent } from '@/lib/messageFormat';

interface SellerInboxProps {
  productId?: string;
  pendingConversationId?: string | null;
  onConversationSelected?: () => void;
  /** "admin" exibe TODAS as conversas da org e libera filtros por usuário/encerrar em massa */
  mode?: 'seller' | 'admin';
}

export function SellerInbox({ productId, pendingConversationId, onConversationSelected, mode = 'seller' }: SellerInboxProps) {
  const isAdminMode = mode === 'admin';
  const { user, profile, roles } = useAuth();
  const isAdminRole = roles?.includes('admin') || roles?.includes('super_admin');
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isMobile = useIsMobile();
  const { playNotification, isEnabled: soundEnabled, toggleSound } = useNotificationSound();
  const { data: whatsappInstances } = useWhatsAppInstances();

  /**
   * Resolve label da conexão DO BOT (não o telefone do lead).
   * - WhatsApp: instância Evolution vinculada à conversa, ou a padrão da org.
   * - Outros canais: nome do canal.
   */
  const buildConnectionLabel = useCallback((conv: any): string | null => {
    if (!conv) return null;
    const ch: string = conv.channel || '';
    if (ch === 'whatsapp') {
      const list = whatsappInstances || [];
      const inst =
        list.find((i: any) => i.id === conv.evolution_instance_id) ||
        list.find((i: any) => i.is_default) ||
        list[0];
      if (inst) {
        const display = (inst.metadata as any)?.display_name || inst.name;
        const phone = inst.phone_number ? ` · +${inst.phone_number}` : '';
        return `${display}${phone}`;
      }
      return 'WhatsApp';
    }
    if (!ch) return null;
    return ch.charAt(0).toUpperCase() + ch.slice(1);
  }, [whatsappInstances]);
  
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  // Painel "Dados do Contato": no mobile sempre começa fechado (chat aparece primeiro);
  // no desktop fica aberto por padrão. Mantemos sincronizado com o breakpoint.
  const [showPanel, setShowPanel] = useState(false);
  useEffect(() => {
    setShowPanel(!isMobile);
  }, [isMobile]);
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [acceptDialog, setAcceptDialog] = useState<{ open: boolean; isTakeover: boolean; previousAssigneeName?: string | null }>({
    open: false,
    isTakeover: false,
    previousAssigneeName: null,
  });
  const [isTyping, setIsTyping] = useState(false);
  
  const [showEditContact, setShowEditContact] = useState(false);
  const [showSendFlow, setShowSendFlow] = useState(false);
  const [showSendCadence, setShowSendCadence] = useState(false);
  const [showScheduleMessage, setShowScheduleMessage] = useState(false);
  const [showScheduleFollowup, setShowScheduleFollowup] = useState(false);
  const [showCreateEvent, setShowCreateEvent] = useState(false);
  const [showCreateDeal, setShowCreateDeal] = useState(false);
  const [showAnalysis, setShowAnalysis] = useState(false);
  const [showStartConversation, setShowStartConversation] = useState(false);
  const [showCatalog, setShowCatalog] = useState(false);
  const [showPaymentLink, setShowPaymentLink] = useState(false);
  const [showFiltersDrawer, setShowFiltersDrawer] = useState(false);
  const [isCloningFunnel, setIsCloningFunnel] = useState(false);
  const [isStoppingFlow, setIsStoppingFlow] = useState(false);
  const [filters, setFilters] = useState<InboxFiltersState>(defaultInboxFilters);
  const [activeTab, setActiveTab] = useState<'attending' | 'waiting' | 'resolved'>('attending');

  const assignMutation = useAssignConversation();

  // Realtime presence + typing for the currently selected conversation.
  const { peerOnline, peerTyping, sendTyping } = useConversationPresence({
    conversationId: selectedConversation?.id ?? null,
    selfActor: 'agent',
    selfName: profile?.full_name || profile?.email || undefined,
    selfUserId: user?.id,
    enabled: !!selectedConversation?.id,
  });

  // Produtos atribuídos ao vendedor — fonte para o seletor
  const { data: assignedProductsData } = useAssignedProducts(user?.id || '');
  const assignedProducts = useMemo(
    () => (assignedProductsData?.map((ap: any) => ap.products).filter(Boolean) || []),
    [assignedProductsData]
  );

  // Filtro de produto: prioridade — localStorage > productId vindo da rota > null
  const [selectedProductFilter, setSelectedProductFilter] = useState<string | null>(() => {
    try {
      const stored = localStorage.getItem('inbox.selectedProductId');
      if (stored && stored !== 'null') return stored;
    } catch {}
    return productId ?? null;
  });

  // Quando o productId vindo do contexto muda, atualiza o filtro
  useEffect(() => {
    if (productId) {
      setSelectedProductFilter(productId);
    }
  }, [productId]);

  // Auto-correção: se o filtro persistido não bate com nenhum produto atribuído
  // (e não estamos em admin), limpa para evitar lista vazia "fantasma".
  useEffect(() => {
    if (isAdminMode) return;
    if (!selectedProductFilter) return;
    if (!assignedProducts.length) return;
    const stillValid = assignedProducts.some((p: any) => p.id === selectedProductFilter);
    if (!stillValid) {
      setSelectedProductFilter(null);
    }
  }, [assignedProducts, selectedProductFilter, isAdminMode]);

  // Persistir escolha
  useEffect(() => {
    try {
      localStorage.setItem('inbox.selectedProductId', selectedProductFilter ?? 'null');
    } catch {}
  }, [selectedProductFilter]);

  // Produto do header/rota NÃO filtra a inbox — afeta apenas dashboards.
  // A inbox só é filtrada por produto quando o usuário escolhe explicitamente
  // dentro do drawer "Filtros".
  const inboxFilters: InboxBackendFilters = useMemo(() => {
    return {
      tab: activeTab,
      product_ids: filters.selectedProductIds.length ? filters.selectedProductIds : undefined,
      sector_ids: filters.selectedSectorIds.length ? filters.selectedSectorIds : undefined,
      assigned_user_ids: isAdminMode && filters.selectedUserIds.length ? filters.selectedUserIds : undefined,
      tag_ids: filters.selectedTagIds.length ? filters.selectedTagIds : undefined,
      search: filters.search || undefined,
    };
  }, [activeTab, filters, isAdminMode]);

  // Filtros para os contadores (sem `tab`, para totalizar todas as abas)
  const countsFilters = useMemo(() => {
    const { tab, ...rest } = inboxFilters;
    return rest;
  }, [inboxFilters]);

  const { data: conversationsData, isLoading: loadingConversations, refetch: refetchConversations } = useWebChatConversations(inboxFilters);
  const { data: tabCounts, refetch: refetchCounts } = useWebChatConversationCounts(countsFilters);

  // Fetch selected conversation details
  const { data: conversationDetail, isLoading: loadingDetail, error: conversationError } = useWebChatConversation(
    selectedConversation?.id || ''
  );

  // Se a conversa selecionada retornar 404/403 (apagada, transferida, fora do escopo),
  // limpa a seleção e atualiza a lista em vez de deixar a tela em estado de erro.
  useEffect(() => {
    const status = (conversationError as any)?.status;
    const notFound = (conversationDetail as any)?.notFound;
    const forbidden = (conversationDetail as any)?.forbidden;
    const isGone = status === 404 || status === 403 || notFound || forbidden;
    if (!isGone) return;
    const lostId = selectedConversation?.id;
    setSelectedConversation(null);
    if (lostId) {
      queryClient.removeQueries({ queryKey: ['webchat-conversation', lostId] });
    }
    refetchConversations();
    if (status === 403 || forbidden) {
      toast({
        title: 'Sem acesso a esta conversa',
        description: 'Ela pertence a outra organização ou foi transferida.',
        variant: 'destructive',
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationError, (conversationDetail as any)?.notFound, (conversationDetail as any)?.forbidden]);

  // Mutations
  const sendMessage = useSendAgentMessage();
  const closeConversation = useCloseConversation();
  const reopenConversation = useReopenConversation();
  const returnToQueueMutation = useReturnToQueue();
  const resumeConversation = useResumeConversation();
  const activateBotMutation = useActivateBot();
  const editMessageMutation = useEditMessage();
  const deleteMessageMutation = useDeleteMessage();
  const starMessageMutation = useStarMessage();
  const forwardMessageMutation = useForwardMessage();
  const markReadMutation = useMarkConversationRead();

  // Mark conversation as read when selected
  useEffect(() => {
    if (selectedConversation?.id && selectedConversation.unread_count > 0) {
      markReadMutation.mutate(selectedConversation.id);
    }
  }, [selectedConversation?.id]);

  // Mapa global de produtos da org (para resolver o nome quando vier só do lead)
  const { data: allProducts = [] } = useProducts();
  const productNameById = useMemo(() => {
    const m = new Map<string, string>();
    (allProducts || []).forEach((p: any) => m.set(p.id, p.name));
    return m;
  }, [allProducts]);

  // Transform conversations for the list (memoizado)
  const conversations: Conversation[] = useMemo(
    () =>
      (conversationsData || []).map((conv: any) => {
        // Produto efetivo: override manual da conversa > produto do lead vinculado > produto do widget
        const effectiveProductId =
          conv.product_id
          || conv.leads?.product_id
          || conv.webchat_widgets?.product_id
          || null;
        const effectiveProductName =
          (conv.product?.name)
          || (effectiveProductId ? productNameById.get(effectiveProductId) : null)
          || conv.webchat_widgets?.products?.name
          || conv.webchat_widgets?.name
          || null;
        return {
          id: conv.id,
          visitor_name: conv.visitor_name,
          visitor_email: conv.visitor_email,
          visitor_phone: conv.visitor_phone,
          visitor_avatar_url: conv.visitor_avatar_url || null,
          channel: conv.channel || 'webchat',
          status: conv.status,
          unread_count: conv.unread_count_agents || conv.unread_count || 0,
          last_message_at: conv.last_message_at,
          last_message: conv.last_message || conv.messages?.[0]?.content,
          lead_id: conv.lead_id,
          product_id: effectiveProductId,
          product_name: effectiveProductName,
          assigned_user_id: conv.assigned_user_id || null,
          assigned_user_name: conv.profiles?.full_name,
          sector_id: conv.sector_id || null,
          sector_name: conv.sectors?.name,
          sector_color: conv.sectors?.color,
          current_agent_id: conv.current_agent_id || null,
          current_agent_name: conv.current_agent?.name || null,
          current_agent_avatar: conv.current_agent?.avatar_url || null,
        } as any;
      }),
    [conversationsData, productNameById],
  );

  // Backend já entrega filtrado/paginado/visibilidade — não refiltrar client-side.
  const filteredConversations = conversations;

  // Auto-select pending conversation from navigation
  useEffect(() => {
    if (pendingConversationId && filteredConversations.length > 0) {
      const found = filteredConversations.find(c => c.id === pendingConversationId);
      if (found) {
        setSelectedConversation(found);
        onConversationSelected?.();
      }
    }
  }, [pendingConversationId, filteredConversations, onConversationSelected]);

  // Fetch linked lead data
  const { data: linkedLead } = useQuery({
    queryKey: ['linked-lead', selectedConversation?.lead_id],
    queryFn: async () => {
      if (!selectedConversation?.lead_id) return null;
      const { data } = await supabase
        .from('leads')
        .select('*, pipeline_stages:current_stage_id(id, name, color)')
        .eq('id', selectedConversation.lead_id)
        .single();
      return data;
    },
    enabled: !!selectedConversation?.lead_id,
  });

  // Fetch pipeline stages for the lead's product
  const { data: pipelineStages } = useQuery({
    queryKey: ['pipeline-stages-for-lead', linkedLead?.product_id],
    queryFn: async () => {
      if (!linkedLead?.product_id) return [];
      const { data } = await supabase
        .from('pipeline_stages')
        .select('id, name, color, order_index')
        .eq('product_id', linkedLead.product_id)
        .order('order_index');
      return data || [];
    },
    enabled: !!linkedLead?.product_id,
  });

  // Transform linked lead for the panel
  const leadForPanel = linkedLead ? {
    id: linkedLead.id,
    name: linkedLead.name,
    email: linkedLead.email,
    phone: linkedLead.phone,
    company: linkedLead.company,
    position: linkedLead.position,
    current_stage_id: linkedLead.current_stage_id,
    deal_value: linkedLead.deal_value,
    temperature: linkedLead.temperature,
    landing_page: linkedLead.landing_page,
    utm_source: linkedLead.utm_source,
    utm_medium: linkedLead.utm_medium,
    utm_campaign: linkedLead.utm_campaign,
    created_at: linkedLead.created_at,
    last_contact_at: linkedLead.last_contact_at,
    pipeline_stage: linkedLead.pipeline_stages as any,
    campaign_name: linkedLead.campaign_name,
    adset_name: linkedLead.adset_name,
    ad_name: linkedLead.ad_name,
    fbclid: linkedLead.fbclid,
    ctwa_clid: linkedLead.ctwa_clid,
    source: linkedLead.source,
  } : null;

  // Handle move stage
  const handleMoveStage = useCallback(async (stageId: string) => {
    if (!linkedLead?.id) return;
    await supabase.from('leads').update({ current_stage_id: stageId }).eq('id', linkedLead.id);
    queryClient.invalidateQueries({ queryKey: ['linked-lead', selectedConversation?.lead_id] });
    toast({ title: 'Estágio atualizado' });
  }, [linkedLead?.id, selectedConversation?.lead_id, queryClient, toast]);

  // AI suggestion handler (defined after messages below)

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        // Focus the search in ConversationList
        const searchInput = document.querySelector<HTMLInputElement>('[data-inbox-search]');
        searchInput?.focus();
      }
      if (e.key === 'Escape' && isMobile && selectedConversation) {
        setSelectedConversation(null);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isMobile, selectedConversation]);

  // Transform messages
  const messages: Message[] = (conversationDetail?.messages || []).map((msg: any) => ({
    id: msg.id,
    content: msg.content,
    sender_type: msg.sender_type,
    sender_name: msg.sender_name || msg.profiles?.full_name || null,
    sender_id: msg.sender_id,
    created_at: msg.created_at,
    is_deleted: msg.is_deleted || false,
    edited_at: msg.edited_at || null,
    is_starred: msg.is_starred || false,
    forwarded_from_message_id: msg.forwarded_from_message_id || null,
    reply_to: msg.reply_to || null,
    metadata: msg.metadata ?? null,
    content_type: msg.content_type ?? null,
    direction: msg.direction ?? null,
  } as any));

  // AI suggestion handler
  const handleAiSuggest = useCallback(async (): Promise<string> => {
    if (!selectedConversation?.id || !profile?.organization_id) return '';
    const lastMessages = messages.slice(-5).map(m => `${m.sender_type}: ${parseMessageContent(m.content)}`).join('\n');
    const { data, error } = await supabase.functions.invoke('sales-copilot', {
      body: {
        question: `Baseado na conversa abaixo, sugira uma resposta profissional para o visitante. Seja direto e estratégico.\n\nConversa:\n${lastMessages}\n\nSugira a melhor resposta para enviar agora:`,
        organizationId: profile.organization_id,
      },
    });
    if (error) throw error;
    return data?.answer || '';
  }, [selectedConversation, messages, profile?.organization_id]);

  const handleCloneFunnel = useCallback(async () => {
    if (!selectedConversation?.id || !profile?.organization_id || !user?.id) return;
    
    setIsCloningFunnel(true);
    try {
      const { data, error } = await supabase.functions.invoke('clone-funnel', {
        body: {
          conversation_id: selectedConversation.id,
          organization_id: profile.organization_id,
          user_id: user.id
        },
      });

      if (error) throw error;

      toast({
        title: 'Funil clonado com sucesso!',
        description: 'Um novo funil foi criado no menu Funil.',
      });
      
    } catch (err: any) {
      toast({ 
        title: 'Erro ao clonar funil', 
        description: err.message, 
        variant: 'destructive' 
      });
    } finally {
      setIsCloningFunnel(false);
    }
  }, [selectedConversation, profile?.organization_id, user?.id, toast]);

  const handleStopFlow = useCallback(async () => {
    if (!selectedConversation?.id) return;
    setIsStoppingFlow(true);
    try {
      await supabase.functions.invoke('webchat-inbox', {
        body: {
          action: 'stop-flow',
          conversation_id: selectedConversation.id,
        },
      });
      toast({ title: 'Funil interrompido com sucesso!' });
    } catch (error) {
      console.error('Error stopping flow:', error);
      toast({ title: 'Erro ao interromper funil', variant: 'destructive' });
    } finally {
      setIsStoppingFlow(false);
    }
  }, [selectedConversation?.id, toast]);

  // Handle send message
  const handleSendMessage = async (
    content: string,
    replyToMessageId?: string,
    media?: import('@/components/seller/inbox/MediaAttachment').MediaPayload,
  ) => {
    if (!selectedConversation) return;

    try {
      await sendMessage.mutateAsync({
        conversationId: selectedConversation.id,
        content,
        replyToMessageId,
        media,
      });
    } catch (error: any) {
      console.error('Full Send Error:', error);
      toast({
        title: 'Falha ao enviar',
        description: (
          <div className="mt-2 text-xs space-y-1 max-h-[200px] overflow-auto">
            <p><strong>Erro:</strong> {error.message}</p>
            {error.error_code && <p><strong>Código:</strong> {error.error_code}</p>}
            {error.debug && (
              <pre className="p-1 bg-muted rounded">
                {JSON.stringify(error.debug, null, 2)}
              </pre>
            )}
            {error.uazapi_response && (
              <pre className="p-1 bg-muted rounded">
                {JSON.stringify(error.uazapi_response, null, 2)}
              </pre>
            )}
          </div>
        ) as any,
        variant: 'destructive',
      });
    }


  };

  // Handle message actions
  const handleEditMessage = async (messageId: string, newContent: string) => {
    try {
      await editMessageMutation.mutateAsync({ message_id: messageId, new_content: newContent });
      toast({ title: 'Mensagem editada' });
    } catch {
      toast({ title: 'Erro ao editar', variant: 'destructive' });
    }
  };

  const handleDeleteMessage = async (messageId: string) => {
    try {
      await deleteMessageMutation.mutateAsync({ message_id: messageId });
      toast({ title: 'Mensagem apagada' });
    } catch {
      toast({ title: 'Erro ao apagar', variant: 'destructive' });
    }
  };

  const handleStarMessage = async (messageId: string) => {
    try {
      await starMessageMutation.mutateAsync({ message_id: messageId });
    } catch {
      toast({ title: 'Erro ao favoritar', variant: 'destructive' });
    }
  };

  const handleForwardMessage = async (messageId: string, targetConversationId: string) => {
    try {
      await forwardMessageMutation.mutateAsync({ message_id: messageId, target_conversation_id: targetConversationId });
      toast({ title: 'Mensagem encaminhada' });
    } catch {
      toast({ title: 'Erro ao encaminhar', variant: 'destructive' });
    }
  };

  // Handle close conversation
  const handleCloseConversation = async () => {
    if (!selectedConversation) return;

    try {
      await closeConversation.mutateAsync(selectedConversation.id);
      setSelectedConversation(null);
      toast({
        title: 'Conversa encerrada',
        description: 'A conversa foi encerrada com sucesso.',
      });
    } catch (error) {
      toast({
        title: 'Erro',
        description: 'Não foi possível encerrar a conversa.',
        variant: 'destructive',
      });
    }
  };

  // Handle reopen
  const handleReopenConversation = async () => {
    if (!selectedConversation) return;
    try {
      await reopenConversation.mutateAsync(selectedConversation.id);
      toast({ title: 'Conversa reaberta' });
    } catch { toast({ title: 'Erro', description: 'Não foi possível reabrir.', variant: 'destructive' }); }
  };

  // Handle return to queue
  const handleReturnToQueue = async () => {
    if (!selectedConversation) return;
    try {
      await returnToQueueMutation.mutateAsync(selectedConversation.id);
      setSelectedConversation(null);
      toast({ title: 'Devolvida à fila' });
    } catch { toast({ title: 'Erro', description: 'Não foi possível devolver.', variant: 'destructive' }); }
  };

  // Handle resume
  const handleResumeConversation = async () => {
    if (!selectedConversation) return;
    try {
      await resumeConversation.mutateAsync(selectedConversation.id);
      toast({ title: 'Atendimento retomado' });
    } catch { toast({ title: 'Erro', description: 'Não foi possível retomar.', variant: 'destructive' }); }
  };

  const handleActivateBot = async () => {
    if (!selectedConversation) return;
    try {
      await activateBotMutation.mutateAsync(selectedConversation.id);
      toast({ title: 'Bot ativado', description: 'A IA vai enviar uma mensagem estratégica.' });
    } catch { toast({ title: 'Erro', description: 'Não foi possível ativar o bot.', variant: 'destructive' }); }
  };

  // Handle transfer
  const handleTransfer = () => {
    refetchConversations();
    setSelectedConversation(null);
  };

  // Global subscription for conversation list updates.
  // Removido o filtro `assigned_user_id=eq.${user.id}` para que mudanças em conversas
  // não atribuídas (em fila, IA) ou de outros vendedores também atualizem a lista.
  // RLS já garante que só recebemos eventos de conversas que podemos ver.
  // 🔧 IMPORTANTE: a tabela é atualizada a cada mensagem (last_message_at,
  // unread_count_agents). Sem debounce isso causa chuva de refetch e o
  // "sistema girando". Agrupamos os eventos em janelas de 1.5s.
  const refetchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduleListRefetch = useCallback(() => {
    if (refetchDebounceRef.current) clearTimeout(refetchDebounceRef.current);
    refetchDebounceRef.current = setTimeout(() => {
      refetchDebounceRef.current = null;
      refetchConversations();
    }, 300);
  }, [refetchConversations]);

  useEffect(() => {
    if (!user?.id) return;

    const globalChannel = supabase
      .channel('seller-inbox-conversations')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'webchat_conversations',
        },
        () => {
          scheduleListRefetch();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(globalChannel);
      if (refetchDebounceRef.current) {
        clearTimeout(refetchDebounceRef.current);
        refetchDebounceRef.current = null;
      }
    };
  }, [user?.id, scheduleListRefetch]);

  // Subscription for selected conversation messages - uses Broadcast for realtime
  useEffect(() => {
    if (!selectedConversation?.id) return;
    const conversationId = selectedConversation.id;

    // Listen for broadcast events from edge function
    const broadcastChannel = supabase
      .channel(`conversation:${conversationId}`)
      .on('broadcast', { event: 'new_message' }, (payload) => {
        // Play sound if message is from visitor
        if (payload.payload?.sender_type === 'visitor') {
          playNotification();
        }
        // Add message directly to cache for instant update.
        // Substitui a bolha otimista (id === client_temp_id) pela versão real
        // — evita duplicação visual no agente que acabou de enviar.
        queryClient.setQueryData(['webchat-conversation', conversationId], (old: any) => {
          if (!old) return old;
          const incoming = payload.payload;
          const msgs = old.messages || [];

          // Já existe pelo ID real → ignora
          if (msgs.some((m: any) => m.id === incoming?.id)) return old;

          // Existe uma temp com mesmo client_temp_id → substitui no lugar
          const tempId = incoming?.client_temp_id;
          if (tempId) {
            const tempIdx = msgs.findIndex(
              (m: any) => m.id === tempId || m.client_temp_id === tempId
            );
            if (tempIdx >= 0) {
              const next = msgs.slice();
              next[tempIdx] = incoming;
              return { ...old, messages: next };
            }
          }

          // Mensagem nova de fato
          return { ...old, messages: [...msgs, incoming] };
        });
      })
      .on('broadcast', { event: 'typing' }, (payload) => {
        if (payload.payload?.sender_type === 'visitor') {
          setIsTyping(true);
          setTimeout(() => setIsTyping(false), 3000);
        }
      })
      .on('broadcast', { event: 'conversation_updated' }, () => {
        // Mudança de produto / lead vinculado / etiqueta — recarrega detalhe e lista
        queryClient.invalidateQueries({ queryKey: ['webchat-conversation', conversationId] });
        queryClient.invalidateQueries({ queryKey: ['webchat-conversations'] });
      })
      .subscribe();

    // NOTA: Não escutamos `postgres_changes` em `webchat_messages` aqui de propósito.
    // O broadcast `new_message` acima já entrega cada mensagem nova exatamente uma vez
    // (tanto inbound do whatsapp-webhook quanto outbound do webchat-inbox emitem o
    // broadcast). Escutar postgres_changes em paralelo causava DUPLICAÇÃO visual das
    // mensagens no Inbox.

    // Postgres changes — a própria conversa selecionada (status, sector, assigned_user, etc.)
    // Garante que reabrir / encerrar / transferir / aceitar reflitam imediatamente,
    // mesmo quando a ação vem de outro agente ou de uma edge function.
    const conversationChannel = supabase
      .channel(`conversation-row:${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'webchat_conversations',
          filter: `id=eq.${conversationId}`,
        },
        () => {
          queryClient.invalidateQueries({
            queryKey: ['webchat-conversation', conversationId]
          });
          queryClient.invalidateQueries({
            queryKey: ['webchat-conversations']
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(broadcastChannel);
      supabase.removeChannel(conversationChannel);
    };
  }, [selectedConversation?.id, queryClient, playNotification]);

  // Realtime para o lead vinculado — estágio, temperatura, deal_value etc.
  useEffect(() => {
    const leadId = selectedConversation?.lead_id;
    if (!leadId) return;

    const leadChannel = supabase
      .channel(`lead-row:${leadId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'leads',
          filter: `id=eq.${leadId}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['linked-lead', leadId] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(leadChannel);
    };
  }, [selectedConversation?.lead_id, queryClient]);

  // Mobile: show only list or chat
  const showList = isMobile ? !selectedConversation : true;
  const showChat = isMobile ? !!selectedConversation : true;

  const handleAcceptTicket = useCallback(async (sectorId?: string) => {
    if (!selectedConversation) return;
    const conv: any = (conversationDetail?.conversation as any) || selectedConversation;
    const existingSector = conv.sector_id || (selectedConversation as any).sector_id || null;

    // If a sector is provided directly OR conversation already has one and user is the assignee
    // path, fall back to the legacy assign mutation. Otherwise, open the dialog.
    if (!sectorId && !existingSector) {
      setAcceptDialog({ open: true, isTakeover: false, previousAssigneeName: null });
      return;
    }
    if (sectorId || existingSector) {
      const finalSectorId = sectorId || existingSector;
      const detailKey = ['webchat-conversation', selectedConversation.id];
      const previousDetail = queryClient.getQueryData<any>(detailKey);

      // Patch otimista do detalhe — desbloqueia o composer instantaneamente
      const nowIso = new Date().toISOString();
      if (previousDetail?.conversation && user?.id) {
        queryClient.setQueryData(detailKey, {
          ...previousDetail,
          conversation: {
            ...previousDetail.conversation,
            assigned_user_id: user.id,
            sector_id: finalSectorId,
            status: 'human_active',
            accepted_at: nowIso,
            accepted_by: user.id,
            current_agent_id: null,
            last_message_at: nowIso,
          },
        });
      }

      // Use the new edge function action so server-side enforces sector membership.
      try {
        const { data, error } = await supabase.functions.invoke('webchat-inbox', {
          body: {
            action: 'accept',
            conversation_id: selectedConversation.id,
            sector_id: finalSectorId,
          },
        });
        if (error) throw error;
        if (data?.error) throw new Error(data.error);
        toast({ title: 'Atendimento aceito' });
        queryClient.invalidateQueries({ queryKey: detailKey, refetchType: 'active' });
        refetchConversations();
      } catch (e: any) {
        // Rollback do patch otimista
        if (previousDetail !== undefined) {
          queryClient.setQueryData(detailKey, previousDetail);
        }
        toast({ title: 'Erro ao aceitar', description: e?.message, variant: 'destructive' });
      }
    }
  }, [selectedConversation, conversationDetail, toast, refetchConversations, queryClient, user?.id]);

  const handleTakeoverTicket = useCallback(() => {
    if (!selectedConversation) return;
    const conv: any = (conversationDetail?.conversation as any) || selectedConversation;
    setAcceptDialog({
      open: true,
      isTakeover: true,
      previousAssigneeName: conv?.profiles?.full_name || (selectedConversation as any).assigned_user_name || null,
    });
  }, [selectedConversation, conversationDetail]);

  const handleCloseAllTickets = useCallback(async () => {
    const open = filteredConversations.filter(c => c.status !== 'closed');
    await Promise.allSettled(open.map(c => closeConversation.mutateAsync(c.id)));
    toast({ title: `${open.length} atendimentos encerrados` });
    refetchConversations();
  }, [filteredConversations, closeConversation, toast, refetchConversations]);

  const activeFilterCount =
    (filters.selectedTagIds.length > 0 ? 1 : 0) +
    (filters.selectedSectorIds.length > 0 ? 1 : 0) +
    (filters.selectedUserIds.length > 0 ? 1 : 0) +
    (filters.selectedProductIds.length > 0 ? 1 : 0) +
    (filters.showResolved ? 1 : 0);

  // Backend já aplica todos os filtros (produto/setor/usuário/etiqueta/busca/aba)
  // e a visibilidade por permissões. Aqui só repassamos a lista para a UI.
  const visibleConversations = filteredConversations;

  // Nome do produto atualmente filtrado (para exibição na faixa) — usa só o
  // produto da rota como sugestão visual; não há mais "trava" de produto.
  const activeProductName = useMemo(() => {
    if (!selectedProductFilter) return null;
    const p = assignedProducts.find((p: any) => p.id === selectedProductFilter);
    return p?.name || null;
  }, [selectedProductFilter, assignedProducts]);

  const showProductBanner = false; // Produto da rota/header não trava mais a inbox

  if (loadingConversations) {
    return (
      <div className="h-[calc(100vh-64px)] flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="h-[calc(100vh-64px)] flex flex-col border-0 overflow-hidden bg-background">
      <style>{`
        .py-4 { display: none !important; }
      `}</style>

      <div className="flex-1 flex min-w-0 overflow-hidden">
        {/* Conversation List with new look */}
        {showList && (
          <div className={cn('flex-shrink-0 overflow-hidden', isMobile ? 'w-full' : 'w-[340px]')}>
            <ConversationList
              conversations={visibleConversations}
              selectedId={selectedConversation?.id || null}
              onSelect={setSelectedConversation}
              isLoading={loadingConversations}
              externalSearch={filters.search}
              externalShowResolved={filters.showResolved}
              activeFilterCount={activeFilterCount}
              onNewConversation={() => setShowStartConversation(true)}
              soundEnabled={soundEnabled}
              onToggleSound={toggleSound}
              showAssignedUser={isAdminMode}
              headerLabel="Atendimentos"
              activeTab={activeTab}
              onTabChange={setActiveTab}
              tabCounts={tabCounts}
              filtersSlot={
                <InboxFiltersDrawer
                  open={showFiltersDrawer}
                  onOpenChange={setShowFiltersDrawer}
                  filters={filters}
                  onFiltersChange={setFilters}
                  isAdmin={isAdminMode}
                  onCloseAllTickets={isAdminMode ? handleCloseAllTickets : undefined}
                  trigger={
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9 relative"
                      aria-label="Filtros"
                    >
                      <Filter className="h-4 w-4" />
                      {activeFilterCount > 0 && (
                        <span className="absolute -top-0.5 -right-0.5 h-4 w-4 rounded-full bg-destructive text-destructive-foreground text-[10px] flex items-center justify-center">
                          {activeFilterCount}
                        </span>
                      )}
                    </Button>
                  }
                />
              }
            />
          </div>
        )}


        {/* Chat Area */}
        {showChat && (
          <div className="flex-1 min-w-0 overflow-hidden">
            <ChatArea
              conversationId={selectedConversation?.id || null}
              visitorName={selectedConversation?.visitor_name || 'Visitante'}
              visitorPhone={selectedConversation?.visitor_phone}
              visitorAvatarUrl={(conversationDetail?.conversation as any)?.visitor_avatar_url || (selectedConversation as any)?.visitor_avatar_url || null}
              channel={selectedConversation?.channel || 'webchat'}
              status={(conversationDetail?.conversation as any)?.status || selectedConversation?.status || 'active'}
              messages={messages}
              isLoading={loadingDetail}
              isSending={sendMessage.isPending}
              isTyping={peerTyping || isTyping}
              peerOnline={peerOnline}
              onTyping={(typing) => { if (typing) sendTyping(); }}
              productName={selectedConversation?.product_name}
              currentUserId={user?.id}
              ticketCode={selectedConversation?.id?.slice(0, 6)}
              sectorName={(conversationDetail?.conversation as any)?.sectors?.name || (selectedConversation as any)?.sector_name}
              sectorColor={(conversationDetail?.conversation as any)?.sectors?.color || (selectedConversation as any)?.sector_color}
              leadId={(conversationDetail?.conversation as any)?.lead_id || (selectedConversation as any)?.lead_id || null}
              currentAgentName={(conversationDetail?.conversation as any)?.current_agent?.name || (selectedConversation as any)?.current_agent_name || null}
              needsAccept={(() => {
                const freshStatus = (conversationDetail?.conversation as any)?.status ?? selectedConversation?.status;
                const freshAssigned = (conversationDetail?.conversation as any)?.assigned_user_id;
                return !!selectedConversation
                  && (freshStatus === 'waiting' || freshStatus === 'waiting_human')
                  && !freshAssigned;
              })()}
              onAcceptTicket={handleAcceptTicket}
              isAccepting={assignMutation.isPending}
              viewerMode={(() => {
                const freshAssigned = (conversationDetail?.conversation as any)?.assigned_user_id ?? (selectedConversation as any)?.assigned_user_id;
                const freshStatus = (conversationDetail?.conversation as any)?.status ?? selectedConversation?.status;
                return !!freshAssigned
                  && freshAssigned !== user?.id
                  && freshStatus !== 'closed'
                  && (isAdminMode || isAdminRole);
              })()}
              attendantName={(conversationDetail?.conversation as any)?.profiles?.full_name || (selectedConversation as any)?.assigned_user_name || null}
              onTakeover={handleTakeoverTicket}
              onSendMessage={handleSendMessage}
              onEditMessage={handleEditMessage}
              onDeleteMessage={handleDeleteMessage}
              onStarMessage={handleStarMessage}
              onForwardMessage={handleForwardMessage}
              onClose={handleCloseConversation}
              onTransfer={() => setShowTransferModal(true)}
              onTogglePanel={() => setShowPanel(!showPanel)}
              onBack={() => setSelectedConversation(null)}
              onReopen={handleReopenConversation}
              onResume={handleResumeConversation}
              onReturnToQueue={handleReturnToQueue}
              onActivateBot={handleActivateBot}
              onCloneFunnel={handleCloneFunnel}
              isCloningFunnel={isCloningFunnel}
              onStopFlow={handleStopFlow}
              isStoppingFlow={isStoppingFlow}
              isReopening={reopenConversation.isPending}
              isResuming={resumeConversation.isPending}
              isReturning={returnToQueueMutation.isPending}
              isActivatingBot={activateBotMutation.isPending}
              showBackButton={isMobile}
              onAiSuggest={handleAiSuggest}
              onScheduleFollowup={() => setShowScheduleFollowup(true)}
              onMarkHot={async () => {
                if (!linkedLead?.id) { toast({ title: 'Sem lead vinculado' }); return; }
                await supabase.from('leads').update({ temperature: 'hot' }).eq('id', linkedLead.id);
                queryClient.invalidateQueries({ queryKey: ['linked-lead'] });
                toast({ title: '🔥 Lead marcado como quente' });
              }}
              onSendFlow={() => setShowSendFlow(true)}
              onSendCadence={() => setShowSendCadence(true)}
              onAnalyze={() => setShowAnalysis(true)}
              onScheduleMessage={() => setShowScheduleMessage(true)}
              onCreateEvent={() => setShowCreateEvent(true)}
              onCreateDeal={linkedLead?.id ? () => setShowCreateDeal(true) : undefined}
              onViewLead={linkedLead?.id ? () => setShowPanel(true) : undefined}
              onMoveStageQuick={linkedLead?.id ? handleMoveStage : undefined}
              pipelineStages={pipelineStages || []}
              currentStageId={linkedLead?.current_stage_id || null}
              onPickCatalog={() => setShowCatalog(true)}
              onSendPaymentLink={() => setShowPaymentLink(true)}
            />
          </div>
        )}

        {/* Lead Context Panel — desktop inline */}
        {showPanel && selectedConversation && !isMobile && (
          <aside className="w-80 flex-shrink-0 overflow-hidden border-l border-border bg-background">
            <LeadContextPanel
              lead={leadForPanel}
              conversationId={selectedConversation.id}
              visitorName={selectedConversation.visitor_name}
              visitorEmail={selectedConversation.visitor_email}
              visitorPhone={selectedConversation.visitor_phone}
              visitorAvatarUrl={(conversationDetail?.conversation as any)?.visitor_avatar_url || null}
              channel={selectedConversation.channel}
              conversationStartedAt={conversationDetail?.conversation?.created_at || null}
              messageCount={messages.length}
              stages={pipelineStages || []}
              currentAgent={
                (conversationDetail?.conversation as any)?.current_agent
                || ((selectedConversation as any).current_agent_id
                  ? {
                      id: (selectedConversation as any).current_agent_id,
                      name: (selectedConversation as any).current_agent_name,
                      avatar_url: (selectedConversation as any).current_agent_avatar,
                    }
                  : null)
              }
              currentSectorId={(conversationDetail?.conversation as any)?.sector_id || (selectedConversation as any).sector_id || null}
              connectionLabel={buildConnectionLabel(selectedConversation)}
              connectionId={(conversationDetail?.conversation as any)?.connection_id || (selectedConversation as any).connection_id}
              evolutionInstanceId={(conversationDetail?.conversation as any)?.evolution_instance_id || (selectedConversation as any).evolution_instance_id}

              isLoading={loadingDetail}
              onMoveStage={handleMoveStage}
              onEdit={() => setShowEditContact(true)}
              onCreateTask={() => setShowScheduleFollowup(true)}
              onCreateEvent={() => setShowCreateEvent(true)}
              onClose={() => setShowPanel(false)}
            />
          </aside>
        )}
      </div>

      {/* Lead Context Panel — mobile drawer */}
      {selectedConversation && isMobile && (
        <Sheet open={showPanel} onOpenChange={setShowPanel}>
          <SheetContent side="right" className="w-full sm:max-w-md p-0" hideClose>
            <LeadContextPanel
              lead={leadForPanel}
              conversationId={selectedConversation.id}
              visitorName={selectedConversation.visitor_name}
              visitorEmail={selectedConversation.visitor_email}
              visitorPhone={selectedConversation.visitor_phone}
              visitorAvatarUrl={(conversationDetail?.conversation as any)?.visitor_avatar_url || null}
              channel={selectedConversation.channel}
              conversationStartedAt={conversationDetail?.conversation?.created_at || null}
              messageCount={messages.length}
              stages={pipelineStages || []}
              currentAgent={
                (conversationDetail?.conversation as any)?.current_agent
                || ((selectedConversation as any).current_agent_id
                  ? {
                      id: (selectedConversation as any).current_agent_id,
                      name: (selectedConversation as any).current_agent_name,
                      avatar_url: (selectedConversation as any).current_agent_avatar,
                    }
                  : null)
              }
              currentSectorId={(conversationDetail?.conversation as any)?.sector_id || (selectedConversation as any).sector_id || null}
              connectionLabel={buildConnectionLabel(selectedConversation)}
              connectionId={(conversationDetail?.conversation as any)?.connection_id || (selectedConversation as any).connection_id}
              evolutionInstanceId={(conversationDetail?.conversation as any)?.evolution_instance_id || (selectedConversation as any).evolution_instance_id}

              isLoading={loadingDetail}
              onMoveStage={handleMoveStage}
              onEdit={() => setShowEditContact(true)}
              onCreateTask={() => setShowScheduleFollowup(true)}
              onCreateEvent={() => setShowCreateEvent(true)}
              onClose={() => setShowPanel(false)}
            />
          </SheetContent>
        </Sheet>
      )}

      {/* Transfer Modal */}
      {selectedConversation && (
        <TransferConversationModal
          open={showTransferModal}
          onOpenChange={setShowTransferModal}
          conversationId={selectedConversation.id}
          currentAssignedUserId={user?.id}
          currentChannel={
            (conversationDetail?.conversation as any)?.channel ||
            (selectedConversation as any)?.channel
          }
          currentWhatsAppInstanceId={
            (conversationDetail?.conversation as any)?.evolution_instance_id ||
            (selectedConversation as any)?.evolution_instance_id ||
            null
          }
          onTransfer={handleTransfer}
        />
      )}

      {/* Accept / Takeover Dialog */}
      {selectedConversation && (
        <AcceptTicketDialog
          open={acceptDialog.open}
          onOpenChange={(open) => setAcceptDialog((prev) => ({ ...prev, open }))}
          conversationId={selectedConversation.id}
          defaultSectorId={(conversationDetail?.conversation as any)?.sector_id || (selectedConversation as any)?.sector_id || null}
          isTakeover={acceptDialog.isTakeover}
          previousAssigneeName={acceptDialog.previousAssigneeName}
          onAccepted={() => {
            queryClient.invalidateQueries({
              queryKey: ['webchat-conversation', selectedConversation.id],
              refetchType: 'active',
            });
            refetchConversations();
          }}
        />
      )}

      {/* Dialogs */}
      {selectedConversation && (
        <>
          {linkedLead ? (
            <LeadEditModal
              isOpen={showEditContact}
              onClose={() => setShowEditContact(false)}
              lead={linkedLead as any}
              onSave={async (updates) => {
                const { error } = await supabase.from('leads').update(updates).eq('id', linkedLead.id);
                if (error) throw error;
                queryClient.invalidateQueries({ queryKey: ['linked-lead'] });
                queryClient.invalidateQueries({ queryKey: ['webchat-conversations'] });
              }}
            />
          ) : (
            <EditVisitorDialog
              open={showEditContact}
              onOpenChange={setShowEditContact}
              conversationId={selectedConversation.id}
              visitorName={selectedConversation.visitor_name}
              visitorEmail={selectedConversation.visitor_email}
              visitorPhone={selectedConversation.visitor_phone}
            />
          )}
          <SendFlowDialog
            open={showSendFlow}
            onOpenChange={setShowSendFlow}
            conversationId={selectedConversation.id}
          />
          <SendCadenceDialog
            open={showSendCadence}
            onOpenChange={setShowSendCadence}
            conversationId={selectedConversation.id}
            leadId={linkedLead?.id}
            productId={linkedLead?.product_id}
          />
          <ScheduleMessageDialog
            open={showScheduleMessage}
            onOpenChange={setShowScheduleMessage}
            conversationId={selectedConversation.id}
          />
          <ScheduleFollowupDialog
            open={showScheduleFollowup}
            onOpenChange={setShowScheduleFollowup}
            conversationId={selectedConversation.id}
            leadId={linkedLead?.id}
            visitorName={selectedConversation.visitor_name}
          />
          <ConversationAnalysisPanel
            open={showAnalysis}
            onOpenChange={setShowAnalysis}
            conversationId={selectedConversation.id}
          />

          {/* Criar evento de calendário direto da conversa */}
          <EventModal
            open={showCreateEvent}
            onOpenChange={setShowCreateEvent}
            defaultLeadId={linkedLead?.id}
            defaultProductId={linkedLead?.product_id || selectedConversation.product_id || undefined}
          />

          {/* Criar oportunidade direto da conversa (somente com lead vinculado) */}
          {linkedLead?.id && profile?.organization_id && (
            <DealModal
              isOpen={showCreateDeal}
              onClose={() => setShowCreateDeal(false)}
              leadId={linkedLead.id}
              leadName={linkedLead.name || selectedConversation.visitor_name || 'Lead'}
              productId={linkedLead.product_id}
              organizationId={profile.organization_id}
            />
          )}

          <CatalogPickerDialog
            open={showCatalog}
            onOpenChange={setShowCatalog}
            productId={linkedLead?.product_id || selectedConversation.product_id || null}
            onSend={(text, media) => handleSendMessage(text, undefined, media)}
          />

          <PaymentLinkDialog
            open={showPaymentLink}
            onOpenChange={setShowPaymentLink}
            conversationId={selectedConversation.id}
            leadId={linkedLead?.id || null}
            onSend={(text) => handleSendMessage(text)}
          />
        </>
      )}

      {/* Start Conversation Dialog */}
      <StartConversationDialog
        open={showStartConversation}
        onOpenChange={setShowStartConversation}
        onConversationCreated={(convId) => {
          refetchConversations();
          // Select the new conversation after refetch
          setTimeout(() => {
            refetchConversations().then(() => {
              const conv = filteredConversations.find(c => c.id === convId);
              if (conv) setSelectedConversation(conv);
            });
          }, 500);
        }}
      />

    </div>
  );
}

