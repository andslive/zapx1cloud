import { useState, useMemo } from 'react';
import { Search, Filter, Globe, MessageCircle, Instagram, Mail, Phone, Plus, Volume2, VolumeX, User, Bot, Facebook } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { formatMessageTime, previewWithMedia } from '@/lib/messageFormat';

export interface Conversation {
  id: string;
  visitor_name: string | null;
  visitor_email: string | null;
  visitor_phone: string | null;
  visitor_avatar_url?: string | null;
  channel: string;
  status: string;
  unread_count: number;
  last_message_at: string | null;
  last_message?: string;
  lead_id: string | null;
  product_id?: string | null;
  product_name?: string;
  assigned_user_id?: string | null;
  assigned_user_name?: string;
  sector_id?: string | null;
  sector_name?: string;
  sector_color?: string;
  tag_ids?: string[];
  current_agent_name?: string | null;
  leads?: {
    id: string;
    lead_origin?: string | null;
  } | null;
}

interface ConversationListProps {
  conversations: Conversation[];
  selectedId: string | null;
  onSelect: (conversation: Conversation) => void;
  isLoading?: boolean;
  externalSearch?: string;
  externalShowResolved?: boolean;
  onOpenFilters?: () => void;
  activeFilterCount?: number;
  onNewConversation?: () => void;
  soundEnabled?: boolean;
  onToggleSound?: () => void;
  /** Mostra o nome do atendente em cada card (modo Admin). */
  showAssignedUser?: boolean;
  headerLabel?: string;
  /** Substitui o botão de filtro padrão (usado para ancorar popover). */
  filtersSlot?: React.ReactNode;
  /** Aba ativa controlada (backend filtra por status). */
  activeTab?: StatusTab;
  onTabChange?: (tab: StatusTab) => void;
  /** Contadores totais por aba vindos do backend. */
  tabCounts?: { attending: number; waiting: number; resolved: number };
}

type StatusTab = 'attending' | 'waiting' | 'resolved';

const channelIcons: Record<string, React.ReactNode> = {
  webchat: <Globe className="h-3 w-3" />,
  whatsapp: <Phone className="h-3 w-3" />,
  instagram: <Instagram className="h-3 w-3" />,
  email: <Mail className="h-3 w-3" />,
};

function OriginBadge({ origin }: { origin: string }) {
  if (!origin) return null;

  const configs: Record<string, { label: string; className: string; icon?: React.ReactNode }> = {
    facebook_ads: { 
      label: 'Facebook Ads', 
      className: 'bg-[#1877F2] text-white hover:bg-[#1877F2]/90 border-0',
      icon: <Facebook className="h-2.5 w-2.5" />
    },
    instagram_ads: { 
      label: 'Instagram Ads', 
      className: 'bg-gradient-to-tr from-purple-500 to-pink-500 text-white hover:opacity-90 border-0',
      icon: <Instagram className="h-2.5 w-2.5" />
    },
    organic_whatsapp: { 
      label: 'Orgânico', 
      className: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20',
      icon: <Phone className="h-2.5 w-2.5" />
    },
    site: {
      label: 'Site',
      className: 'bg-blue-500/10 text-blue-600 border-blue-500/20',
      icon: <Globe className="h-2.5 w-2.5" />
    }
  };

  const config = configs[origin] || { 
    label: origin.replace('_', ' '), 
    className: 'bg-muted text-muted-foreground' 
  };

  return (
    <Badge className={cn("h-5 px-1.5 text-[9px] flex items-center gap-1 uppercase font-bold tracking-wider", config.className)}>
      {config.icon}
      {config.label}
    </Badge>
  );
}

export function ConversationList({
  conversations,
  selectedId,
  onSelect,
  isLoading,
  externalSearch,
  externalShowResolved,
  onOpenFilters,
  activeFilterCount = 0,
  onNewConversation,
  soundEnabled,
  onToggleSound,
  showAssignedUser = false,
  headerLabel,
  filtersSlot,
  activeTab: activeTabProp,
  onTabChange,
  tabCounts,
}: ConversationListProps) {
  const [internalSearch, setInternalSearch] = useState('');
  const [internalTab, setInternalTab] = useState<StatusTab>('attending');
  const activeTab = activeTabProp ?? internalTab;
  const setActiveTab = (t: StatusTab) => {
    if (onTabChange) onTabChange(t);
    else setInternalTab(t);
  };

  // Usa busca externa apenas se houver valor; caso contrário, usa a interna (digitada na toolbar)
  const search = (externalSearch && externalSearch.length > 0) ? externalSearch : internalSearch;
  const showResolved = externalShowResolved ?? false;

  // Deduplicate: 1 card per contact (lead_id > phone > email > visitor_id).
  // Picks the most relevant conversation per contact:
  //   1) prefer non-closed (active/waiting) over closed
  //   2) then most recent by last_message_at (fallback created_at via id sort)
  const dedupedConversations = useMemo(() => {
    const STATUS_RANK: Record<string, number> = {
      human_active: 0,
      bot_active: 0,
      waiting_human: 1,
      closed: 2,
    };
    const keyOf = (c: Conversation) =>
      c.lead_id ||
      (c.visitor_phone ? `phone:${c.visitor_phone}` : null) ||
      (c.visitor_email ? `email:${c.visitor_email.toLowerCase()}` : null) ||
      `conv:${c.id}`;

    const map = new Map<string, Conversation>();
    for (const conv of conversations) {
      const key = keyOf(conv);
      const current = map.get(key);
      if (!current) {
        map.set(key, conv);
        continue;
      }
      const rankNew = STATUS_RANK[conv.status] ?? 3;
      const rankCur = STATUS_RANK[current.status] ?? 3;
      if (rankNew < rankCur) {
        map.set(key, conv);
        continue;
      }
      if (rankNew === rankCur) {
        const tNew = conv.last_message_at ? new Date(conv.last_message_at).getTime() : 0;
        const tCur = current.last_message_at ? new Date(current.last_message_at).getTime() : 0;
        const winner = tNew >= tCur ? conv : current;
        // Sum unread counts so the surviving card reflects the contact's full backlog
        map.set(key, {
          ...winner,
          unread_count: (current.unread_count || 0) + (conv.unread_count || 0),
        });
      }
    }
    return Array.from(map.values());
  }, [conversations]);

  // Contadores: usar os do backend (totais reais por aba) quando vierem; caso
  // contrário, calcular a partir do que está em tela.
  // "Atendendo" = humano. "Aguardando" inclui IA atendendo (bot_active) +
  // sem ninguém (waiting_human) — em ambos os casos, ainda não há humano.
  const counts = useMemo(() => {
    if (tabCounts) return tabCounts;
    return {
      attending: dedupedConversations.filter((c) => c.status === 'human_active' || c.status === 'bot_active').length,
      waiting: dedupedConversations.filter(
        (c) => c.status === 'waiting_human',
      ).length,
      resolved: dedupedConversations.filter((c) => c.status === 'closed').length,
    };
  }, [dedupedConversations, tabCounts]);

  // O backend já filtra por status conforme a aba selecionada. Aqui só aplicamos
  // a busca local opcional (digitada na toolbar deste componente).
  const filteredConversations = useMemo(() => {
    let filtered = dedupedConversations;

    if (search) {
      const s = search.toLowerCase();
      filtered = filtered.filter(
        (c) =>
          c.visitor_name?.toLowerCase().includes(s) ||
          c.visitor_email?.toLowerCase().includes(s) ||
          c.visitor_phone?.includes(search) ||
          c.last_message?.toLowerCase().includes(s),
      );
    }

    return [...filtered].sort((a, b) => {
      if (a.unread_count > 0 && b.unread_count === 0) return -1;
      if (a.unread_count === 0 && b.unread_count > 0) return 1;
      const dateA = a.last_message_at ? new Date(a.last_message_at).getTime() : 0;
      const dateB = b.last_message_at ? new Date(b.last_message_at).getTime() : 0;
      return dateB - dateA;
    });
  }, [dedupedConversations, search]);

  const getInitials = (name: string | null, phone: string | null) => {
    if (name) return name.split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase();
    if (phone) return phone.slice(-2);
    return 'V';
  };

  const formatDate = (date: string | null) => formatMessageTime(date, 'list');

  return (
    <div className="flex flex-col h-full bg-background border-r border-border">
      {/* O headerLabel foi removido a pedido do usuário para evitar duplicidade e bugs visuais */}

      {/* Top toolbar */}
      <div className="px-3 py-2.5 border-b flex items-center gap-2 bg-card">
        {filtersSlot ?? (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9 relative"
                onClick={onOpenFilters}
              >
                <Filter className="h-4 w-4" />
                {activeFilterCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 h-4 w-4 rounded-full bg-destructive text-destructive-foreground text-[10px] flex items-center justify-center">
                    {activeFilterCount}
                  </span>
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent>Filtros</TooltipContent>
          </Tooltip>
        )}

        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Buscar conversa..."
            value={internalSearch}
            onChange={(e) => setInternalSearch(e.target.value)}
            className="pl-8 h-9 bg-muted/40 border-0"
            data-inbox-search
          />
        </div>

        {onToggleSound && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="h-9 w-9" onClick={onToggleSound}>
                {soundEnabled ? (
                  <Volume2 className="h-4 w-4 text-primary" />
                ) : (
                  <VolumeX className="h-4 w-4 text-muted-foreground" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent>{soundEnabled ? 'Som ativado' : 'Som desativado'}</TooltipContent>
          </Tooltip>
        )}

        {onNewConversation && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button size="icon" className="h-9 w-9" onClick={onNewConversation}>
                <Plus className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Nova conversa</TooltipContent>
          </Tooltip>
        )}
      </div>

      {/* Tabs pílula — limpas, sem barra verde sólida */}
      <div className="px-2 py-2 border-b bg-background">
        <div className="grid grid-cols-3 gap-1 p-1 bg-muted/40 rounded-lg">
          <TabButton
            label="Atendendo"
            count={counts.attending}
            active={activeTab === 'attending'}
            onClick={() => setActiveTab('attending')}
            badgeVariant="success"
          />
          <TabButton
            label="Em Fila"
            count={counts.waiting}
            active={activeTab === 'waiting'}
            onClick={() => setActiveTab('waiting')}
            badgeVariant="danger"
          />
          <TabButton
            label="Resolvidos"
            count={counts.resolved}
            active={activeTab === 'resolved'}
            onClick={() => setActiveTab('resolved')}
            badgeVariant="muted"
          />
        </div>
      </div>

      {/* Lista de conversas */}
      <ScrollArea className="flex-1 bg-muted/20">
        {isLoading ? (
          <div className="p-4 space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="animate-pulse flex gap-3 p-3 bg-background rounded-lg">
                <div className="h-12 w-12 rounded-full bg-muted" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-3/4 bg-muted rounded" />
                  <div className="h-3 w-1/2 bg-muted rounded" />
                </div>
              </div>
            ))}
          </div>
        ) : filteredConversations.length === 0 ? (
          <div className="p-10 text-center text-muted-foreground">
            <MessageCircle className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p className="text-sm font-medium">Nenhuma conversa</p>
            <p className="text-xs mt-1">
              {activeTab === 'waiting'
                ? 'Não há conversas aguardando atendimento'
                : activeTab === 'resolved'
                ? 'Nenhum atendimento resolvido'
                : 'Sem conversas nesta aba'}
            </p>
          </div>
        ) : (
          <div className="bg-background">
            {filteredConversations.map((conv) => (
              <button
                key={conv.id}
                onClick={() => onSelect(conv)}
                className={cn(
                  'w-full text-left px-3 py-2 transition-all border-b border-border/40 relative hover:bg-emerald-50/30 group before:absolute before:left-0 before:top-0 before:bottom-0 before:bg-emerald-500 before:transition-all hover:before:opacity-100',
                  selectedId === conv.id ? 'bg-[#E9FBF3] before:w-[4px] before:opacity-100' : 'before:w-[4px] before:opacity-0'
                )}


              >
                <div className="flex gap-3 items-center">
                  {/* Avatar — usa foto real se disponível */}
                  <div className="relative flex-shrink-0">
                    <Avatar className="h-11 w-11">
                      {conv.visitor_avatar_url && (
                        <AvatarImage src={conv.visitor_avatar_url} alt={conv.visitor_name || 'Visitante'} />
                      )}
                      <AvatarFallback
                        className={cn(
                          'text-sm font-semibold',
                          conv.unread_count > 0 ? 'bg-primary/10 text-primary' : 'bg-muted',
                        )}
                      >
                        {getInitials(conv.visitor_name, conv.visitor_phone)}
                      </AvatarFallback>
                    </Avatar>
                    <div
                      className={cn(
                        'absolute -bottom-0.5 -right-0.5 h-4 w-4 rounded-full flex items-center justify-center border-2 border-background',
                        conv.channel === 'whatsapp'
                          ? 'bg-emerald-500 text-white'
                          : conv.channel === 'instagram'
                          ? 'bg-gradient-to-tr from-purple-500 to-pink-500 text-white'
                          : 'bg-primary text-primary-foreground',
                      )}
                    >
                      {channelIcons[conv.channel] || <Globe className="h-2.5 w-2.5" />}
                    </div>
                  </div>

                  {/* Conteúdo */}
                  <div className="flex flex-col justify-center flex-1 min-w-0 min-h-[48px] overflow-visible relative z-[2]">
                    <div className="flex items-start justify-between gap-2">
                      <span
                        className={cn(
                          'font-semibold text-[14px] leading-[1.3] h-auto overflow-visible whitespace-nowrap text-ellipsis relative z-[2]',
                          conv.unread_count > 0 ? 'text-foreground' : 'text-foreground/90',
                        )}
                      >
                        {conv.visitor_name || conv.visitor_phone || 'Visitante'}
                      </span>
                      <span
                        className={cn(
                          'text-[10px] whitespace-nowrap font-medium pt-0.5',
                          conv.unread_count > 0 ? 'text-emerald-600' : 'text-muted-foreground',
                        )}
                      >
                        {formatDate(conv.last_message_at)}
                      </span>
                    </div>

                    <div className="flex items-center justify-between gap-2 mt-0.5">
                      <p
                        className={cn(
                          'text-[12px] leading-[1.3] opacity-80 truncate',
                          conv.unread_count > 0
                            ? 'text-foreground font-medium'
                            : 'text-muted-foreground',
                        )}
                      >
                        {previewWithMedia(conv.last_message, (conv as any).last_message_metadata, 90) || 'Nova conversa'}
                      </p>
                      {conv.unread_count > 0 && (
                        <Badge className="h-5 min-w-[22px] px-1.5 text-[11px] flex-shrink-0 rounded-full bg-emerald-500 hover:bg-emerald-500 text-white">
                          {conv.unread_count}
                        </Badge>
                      )}
                    </div>

                    {/* Setor + produto + atendente */}
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      {(conv.status === 'human_active' || conv.status === 'active') && (
                        <Badge className="h-6 px-2 text-[9px] bg-emerald-500 hover:bg-emerald-600 text-white border-0 font-bold uppercase tracking-wider">
                          ATENDENDO
                        </Badge>
                      )}
                      {(conv.status === 'waiting' || conv.status === 'waiting_human') && (
                        <Badge className="h-6 px-2 text-[9px] bg-amber-500 hover:bg-amber-600 text-white border-0 font-bold uppercase tracking-wider">
                          EM FILA
                        </Badge>
                      )}
                      {conv.status === 'bot_active' && (
                        <Badge className="h-6 px-2 text-[9px] bg-blue-600 hover:bg-blue-700 text-white border-0 font-bold uppercase tracking-wider">
                          ATENDIMENTO POR IA
                        </Badge>
                      )}
                      {conv.status === 'closed' && (
                        <Badge className="h-6 px-2 text-[9px] bg-zinc-400 hover:bg-zinc-500 text-white border-0 font-bold uppercase tracking-wider">
                          RESOLVIDO
                        </Badge>
                      )}
                      {conv.status === 'stopped' && (
                        <Badge className="h-6 px-2 text-[9px] bg-destructive hover:bg-destructive/90 text-white border-0 font-bold uppercase tracking-wider">
                          FUNIL INTERROMPIDO
                        </Badge>
                      )}
                      {conv.status === 'finished' && (
                        <Badge className="h-6 px-2 text-[9px] bg-zinc-500 hover:bg-zinc-600 text-white border-0 font-bold uppercase tracking-wider">
                          FINALIZADO
                        </Badge>
                      )}

                      {conv.sector_name && (
                        <Badge
                          className="h-4 px-1.5 text-[10px] border font-medium"
                          style={{
                            backgroundColor: conv.sector_color ? `${conv.sector_color}1a` : undefined,
                            color: conv.sector_color || undefined,
                            borderColor: conv.sector_color ? `${conv.sector_color}40` : undefined,
                          }}
                        >
                          {conv.sector_name}
                        </Badge>
                      )}
                      {/* Atendente único: humano tem prioridade sobre IA */}
                      {showAssignedUser && conv.assigned_user_name ? (
                        <Badge variant="secondary" className="h-4 px-1.5 text-[10px] flex items-center gap-1">
                          <User className="h-2.5 w-2.5" />
                          {conv.assigned_user_name}
                        </Badge>
                      ) : conv.current_agent_name ? (
                        <Badge className="h-5 px-1.5 text-[9px] flex items-center gap-1 border-0 bg-blue-600 text-white font-bold uppercase tracking-wider">
                          <Bot className="h-2.5 w-2.5" />
                          IA: {conv.current_agent_name}
                        </Badge>
                      ) : null}
                      {conv.leads?.lead_origin && (
                        <OriginBadge origin={conv.leads.lead_origin} />
                      )}
                    </div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}

function TabButton({
  label,
  count,
  active,
  onClick,
  badgeVariant,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
  badgeVariant: 'success' | 'danger' | 'muted';
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'relative flex items-center justify-center gap-1 py-1.5 px-1 rounded-md text-[10.5px] font-semibold uppercase tracking-wide transition-all',
        active
          ? 'bg-background text-foreground shadow-sm'
          : 'text-muted-foreground hover:text-foreground hover:bg-background/40',
      )}
    >
      <span className="whitespace-nowrap">{label}</span>
      {count > 0 && (
        <span
          className={cn(
            'inline-flex items-center justify-center h-4 min-w-[18px] px-1 rounded-full text-[10px] font-bold',
            badgeVariant === 'success' && 'bg-emerald-500 text-white',
            badgeVariant === 'danger' && 'bg-amber-500 text-white',
            badgeVariant === 'muted' && 'bg-zinc-400 text-white',

          )}
        >
          {count > 99 ? '99+' : count}
        </span>
      )}
    </button>
  );
}
