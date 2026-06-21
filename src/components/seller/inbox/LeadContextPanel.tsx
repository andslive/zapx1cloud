import { useState } from 'react';
import {
  User, Phone, Mail, MapPin, Building,
  ExternalLink, Plus, Calendar, CalendarPlus, X,
  MessageCircle, Clock, DollarSign, Edit, Ban, Volume2,
  Tag, Route, Sparkles, History, Info, Bot, Users2, Plug,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { formatMessageTime } from '@/lib/messageFormat';
import { InternalNotes } from './InternalNotes';
import { JourneyTimeline } from './JourneyTimeline';
import { ConversationHistoryList } from './ConversationHistoryList';
import { AISummaryTab } from './AISummaryTab';
import {
  useLeadTagsForLead,
  useLeadTags,
  useAssignLeadTag,
  useRemoveLeadTag,
  useCreateLeadTag,
} from '@/hooks/useLeadTags';
import { useSetConversationSector, useUpdateWebChatWidget } from '@/hooks/useWebChat';
import { useSectors } from '@/hooks/useSectors';
import { useWhatsAppInstances } from '@/hooks/useWhatsAppInstances';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

interface Lead {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  company: string | null;
  position: string | null;
  current_stage_id: string | null;
  deal_value: number | null;
  temperature: string | null;
  landing_page: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  campaign_name: string | null;
  adset_name: string | null;
  ad_name: string | null;
  fbclid: string | null;
  ctwa_clid: string | null;
  source: string | null;
  created_at: string;
  last_contact_at: string | null;
  pipeline_stage?: { id: string; name: string; color: string | null };
  connection_id?: string | null;
  ad_body?: string | null;
  ad_source_app?: string | null;
  ad_source_url?: string | null;
  entry_point_conversion_source?: string | null;
}


interface PipelineStage {
  id: string;
  name: string;
  color: string | null;
  order_index: number;
}

interface LeadContextPanelProps {
  lead: Lead | null;
  conversationId: string;
  visitorName: string | null;
  visitorEmail: string | null;
  visitorPhone: string | null;
  visitorAvatarUrl?: string | null;
  channel: string;
  conversationStartedAt: string | null;
  messageCount: number;
  stages?: PipelineStage[];
  /** Agente IA atualmente vinculado (current_agent_id) */
  currentAgent?: { id: string; name: string; avatar_url: string | null } | null;
  /** Setor responsável pela conversa */
  currentSectorId?: string | null;
  /** Conexão de origem (ex.: nome da instância WhatsApp) */
  connectionLabel?: string | null;
  /** ID da conexão real (UazAPI) vinculada */
  connectionId?: string | null;
  /** ID da instância vinculada (LEGACY) */
  evolutionInstanceId?: string | null;

  /** Se a conversa está carregando */
  isLoading?: boolean;
  onViewLead?: () => void;
  onMoveStage?: (stageId: string) => void;
  onCreateTask?: () => void;
  onCreateEvent?: () => void;
  onEdit?: () => void;
  onClose?: () => void;
}

export function LeadContextPanel({
  lead,
  conversationId,
  visitorName,
  visitorEmail,
  visitorPhone,
  visitorAvatarUrl,
  channel,
  conversationStartedAt,
  messageCount,
  stages = [],
  currentAgent,
  currentSectorId,
  connectionLabel,
  connectionId,
  evolutionInstanceId,

  isLoading,
  onViewLead,
  onMoveStage,
  onCreateTask,
  onCreateEvent,
  onEdit,
  onClose,
}: LeadContextPanelProps) {
  const [acceptAudio, setAcceptAudio] = useState(true);
  const [newTagName, setNewTagName] = useState('');
  const [newTagColor, setNewTagColor] = useState('#3B82F6');
  const [tagPopoverOpen, setTagPopoverOpen] = useState(false);

  const [isEditingConnection, setIsEditingConnection] = useState(false);
  const { data: whatsappInstances = [] } = useWhatsAppInstances();
  const updateConversation = useUpdateWebChatWidget();

  const setSector = useSetConversationSector();
  const { data: sectors = [] } = useSectors();
  const { data: orgTags = [] } = useLeadTags();
  const assignTag = useAssignLeadTag();
  const removeTag = useRemoveLeadTag();
  const createTag = useCreateLeadTag();

  const temperatureColors: Record<string, string> = {
    hot: 'bg-red-500',
    warm: 'bg-orange-500',
    cold: 'bg-blue-500',
  };

  const displayName = lead?.name || visitorName || 'Visitante';
  const displayPhone = lead?.phone || visitorPhone;
  const displayEmail = lead?.email || visitorEmail;
  const initials = displayName.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase();

  // Lead tags (only if a lead is linked)
  const { data: leadTagAssignments = [] } = useLeadTagsForLead(lead?.id || undefined);
  const leadTags = leadTagAssignments.map((a) => a.tag).filter(Boolean);

  return (
    <div className="w-full h-full min-h-0 md:w-80 md:flex-shrink-0 flex flex-col bg-background overflow-hidden">
      {/* Header */}
      <div className="h-14 px-4 border-b border-border flex items-center justify-between flex-shrink-0">
        <h3 className="font-semibold text-sm">Dados do Contato</h3>
        {onClose && (
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>

      <Tabs defaultValue="overview" className="flex-1 flex flex-col min-h-0">
        <TabsList className="grid grid-cols-5 w-full rounded-none bg-muted/30 h-10 flex-shrink-0">
          <TabsTrigger value="overview" className="text-[10px] gap-1">
            <Info className="h-3 w-3" />
            <span className="hidden sm:inline">Visão</span>
          </TabsTrigger>
          <TabsTrigger value="history" className="text-[10px] gap-1">
            <History className="h-3 w-3" />
            <span className="hidden sm:inline">Histórico</span>
          </TabsTrigger>
          <TabsTrigger value="tags" className="text-[10px] gap-1">
            <Tag className="h-3 w-3" />
            <span className="hidden sm:inline">Etiquetas</span>
          </TabsTrigger>
          <TabsTrigger value="journey" className="text-[10px] gap-1">
            <Route className="h-3 w-3" />
            <span className="hidden sm:inline">Jornada</span>
          </TabsTrigger>
          <TabsTrigger value="summary" className="text-[10px] gap-1">
            <Sparkles className="h-3 w-3" />
            <span className="hidden sm:inline">Resumo</span>
          </TabsTrigger>
        </TabsList>

        {/* Overview */}
        <TabsContent value="overview" className="flex-1 m-0 overflow-hidden">
          <ScrollArea className="h-full">
            <div className="p-4 space-y-5">
              {/* Identity */}
              <div className="text-center space-y-2">
                <Avatar className="h-20 w-20 mx-auto ring-2 ring-background shadow-md">
                  {visitorAvatarUrl && <AvatarImage src={visitorAvatarUrl} alt={displayName} />}
                  <AvatarFallback className="text-xl bg-primary/10 text-primary">
                    {initials}
                  </AvatarFallback>
                </Avatar>
                <h4 className="font-semibold text-base leading-tight">{displayName}</h4>
                {lead?.company && (
                  <p className="text-xs text-muted-foreground">{lead.company}</p>
                )}
                {displayPhone && (
                  <a
                    href={`https://wa.me/${displayPhone.replace(/\D/g, '')}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center gap-1 text-xs text-muted-foreground hover:text-emerald-600"
                  >
                    <Phone className="h-3 w-3" />
                    {displayPhone}
                  </a>
                )}
              </div>

              {/* Tags do lead (chips inline) */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label className="text-[10px] uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                    <Tag className="h-3 w-3" /> Etiquetas
                  </Label>
                  {lead && (
                    <Popover open={tagPopoverOpen} onOpenChange={setTagPopoverOpen}>
                      <PopoverTrigger asChild>
                        <Button variant="ghost" size="sm" className="h-6 px-2 text-[11px] gap-1">
                          <Plus className="h-3 w-3" /> Etiqueta
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent align="end" className="w-64 p-3 space-y-3">
                        <div className="space-y-1.5">
                          <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                            Aplicar existente
                          </Label>
                          {orgTags.filter((t) => !leadTags.some((lt: any) => lt.id === t.id)).length === 0 ? (
                            <p className="text-[11px] text-muted-foreground">Todas já aplicadas.</p>
                          ) : (
                            <div className="max-h-40 overflow-auto space-y-0.5">
                              {orgTags
                                .filter((t) => !leadTags.some((lt: any) => lt.id === t.id))
                                .map((t) => (
                                  <button
                                    key={t.id}
                                    onClick={() => assignTag.mutate({ leadId: lead.id, tagId: t.id })}
                                    className="w-full flex items-center gap-2 px-2 py-1 text-xs rounded hover:bg-muted text-left"
                                  >
                                    <span
                                      className="h-2.5 w-2.5 rounded-full shrink-0"
                                      style={{ backgroundColor: t.color }}
                                    />
                                    <span className="truncate">{t.name}</span>
                                  </button>
                                ))}
                            </div>
                          )}
                        </div>
                        <div className="space-y-1.5 pt-2 border-t">
                          <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                            Criar nova
                          </Label>
                          <div className="flex gap-2">
                            <Input
                              value={newTagName}
                              onChange={(e) => setNewTagName(e.target.value)}
                              placeholder="Nome"
                              className="h-7 text-xs"
                            />
                            <input
                              type="color"
                              value={newTagColor}
                              onChange={(e) => setNewTagColor(e.target.value)}
                              className="h-7 w-9 rounded border border-border cursor-pointer"
                              aria-label="Cor"
                            />
                          </div>
                          <Button
                            size="sm"
                            className="w-full h-7 text-xs"
                            disabled={!newTagName.trim() || createTag.isPending}
                            onClick={async () => {
                              const created = await createTag.mutateAsync({
                                name: newTagName.trim(),
                                color: newTagColor,
                              });
                              if (created?.id && lead?.id) {
                                await assignTag.mutateAsync({ leadId: lead.id, tagId: created.id });
                              }
                              setNewTagName('');
                            }}
                          >
                            <Plus className="h-3 w-3 mr-1" /> Criar e aplicar
                          </Button>
                        </div>
                      </PopoverContent>
                    </Popover>
                  )}
                </div>
                {!lead ? (
                  <p className="text-[11px] text-muted-foreground">
                    Vincule um lead para gerenciar etiquetas.
                  </p>
                ) : leadTags.length === 0 ? (
                  <p className="text-[11px] text-muted-foreground">Nenhuma etiqueta.</p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {leadTags.map((t: any) => (
                      <Badge
                        key={t.id}
                        variant="outline"
                        className="text-[11px] gap-1 pr-1 font-normal"
                        style={{ borderColor: t.color || undefined, color: t.color || undefined }}
                      >
                        {t.name}
                        <button
                          onClick={() => removeTag.mutate({ leadId: lead.id, tagId: t.id })}
                          className="ml-0.5 hover:text-destructive"
                          aria-label="Remover etiqueta"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                )}
              </div>

              {/* Current AI agent badge */}
              {currentAgent && (
                <div className="flex items-center gap-2 p-2 bg-muted/50 rounded-lg">
                  <Avatar className="h-7 w-7">
                    {currentAgent.avatar_url && (
                      <AvatarImage src={currentAgent.avatar_url} alt={currentAgent.name} />
                    )}
                    <AvatarFallback className="bg-secondary text-[10px]">
                      <Bot className="h-3.5 w-3.5" />
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      Atendendo agora
                    </p>
                    <p className="text-xs font-medium truncate">{currentAgent.name} · IA</p>
                  </div>
                </div>
              )}

              {/* Setor responsável */}
              {sectors.length > 0 && (
                <div className="space-y-1.5">
                  <Label className="text-[10px] uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                    <Users2 className="h-3 w-3" /> Setor responsável
                  </Label>
                  <Select
                    value={currentSectorId || 'none'}
                    onValueChange={(val) => {
                      setSector.mutate(
                        { conversationId, sectorId: val === 'none' ? null : val },
                        {
                          onSuccess: () => toast({ title: 'Setor atualizado' }),
                          onError: (e: any) => toast({ title: 'Erro', description: e.message, variant: 'destructive' }),
                        },
                      );
                    }}
                    disabled={setSector.isPending}
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="Sem setor" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Sem setor</SelectItem>
                      {sectors.map((s: any) => (
                        <SelectItem key={s.id} value={s.id}>
                          <span className="flex items-center gap-2">
                            {s.color && (
                              <span
                                className="h-2.5 w-2.5 rounded-full"
                                style={{ backgroundColor: s.color }}
                              />
                            )}
                            {s.name}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Conexão de origem (Editável) */}
              {(connectionId || evolutionInstanceId || whatsappInstances.length > 0) && (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label className="text-[10px] uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                      <Plug className="h-3 w-3" /> Conexão
                    </Label>
                    {!isEditingConnection ? (
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className="h-6 px-2 text-[10px]"
                        onClick={() => setIsEditingConnection(true)}
                      >
                        <Edit className="h-3 w-3 mr-1" /> Editar
                      </Button>
                    ) : (
                      <div className="flex gap-1">
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          className="h-6 px-2 text-[10px] text-destructive"
                          onClick={() => setIsEditingConnection(false)}
                        >
                          Cancelar
                        </Button>
                      </div>
                    )}
                  </div>

                  {!isEditingConnection ? (
                    <div className="text-xs px-2.5 py-1.5 rounded-md bg-muted/50 border border-border truncate flex items-center justify-between">
                      <span className="truncate">
                        {whatsappInstances.find(i => i.id === connectionId || i.id === evolutionInstanceId)?.name || 
                         connectionLabel || 
                         'Sem conexão vinculada'}
                      </span>
                    </div>
                  ) : (
                    <Select
                      value={connectionId || evolutionInstanceId || 'none'}
                      onValueChange={async (val) => {
                        const newId = val === 'none' ? null : val;
                        try {
                          await supabase
                            .from('webchat_conversations')
                            .update({ 
                              connection_id: newId,
                              evolution_instance_id: newId 
                            })
                            .eq('id', conversationId);
                          
                          if (lead?.id) {
                            await supabase
                              .from('leads')
                              .update({ connection_id: newId })
                              .eq('id', lead.id);
                          }
                          
                          setIsEditingConnection(false);
                          toast({ title: 'Conexão atualizada' });
                        } catch (err: any) {
                          toast({ 
                            title: 'Erro ao atualizar conexão', 
                            description: err.message, 
                            variant: 'destructive' 
                          });
                        }
                      }}
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue placeholder="Selecionar conexão" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Sem conexão</SelectItem>
                        {whatsappInstances.map((inst: any) => (
                          <SelectItem key={inst.id} value={inst.id}>
                            <span className="flex items-center gap-2">
                              {inst.status === 'connected' ? (
                                <span className="h-2 w-2 rounded-full bg-green-500" />
                              ) : (
                                <span className="h-2 w-2 rounded-full bg-red-500" />
                              )}
                              {inst.name} {inst.phone_number ? `· +${inst.phone_number}` : ''}
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
              )}


              {/* Quick Actions */}
              <div className="grid grid-cols-2 gap-2">
                <Button variant="outline" size="sm" className="h-9" onClick={onEdit}>
                  <Edit className="h-3.5 w-3.5 mr-1.5" />
                  Editar
                </Button>
                <Button variant="outline" size="sm" className="h-9 text-destructive hover:text-destructive">
                  <Ban className="h-3.5 w-3.5 mr-1.5" />
                  Bloquear
                </Button>
              </div>

              {/* Audio Toggle */}
              <div className="flex items-center justify-between p-2.5 bg-muted/50 rounded-lg">
                <div className="flex items-center gap-2">
                  <Volume2 className="h-4 w-4 text-muted-foreground" />
                  <Label htmlFor="accept-audio" className="text-xs cursor-pointer">Aceitar áudios</Label>
                </div>
                <Switch id="accept-audio" checked={acceptAudio} onCheckedChange={setAcceptAudio} />
              </div>

              <Separator />

              {/* Contact info */}
              <div className="space-y-2.5">
                <h5 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                  Informações
                </h5>
                {displayEmail && (
                  <div className="flex items-center gap-2.5 text-xs">
                    <Mail className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                    <a href={`mailto:${displayEmail}`} className="hover:text-primary truncate">
                      {displayEmail}
                    </a>
                  </div>
                )}
                {lead?.company && (
                  <div className="flex items-center gap-2.5 text-xs">
                    <Building className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                    <span className="truncate">{lead.company}</span>
                  </div>
                )}
              </div>

              <Separator />

              {/* Funnel */}
              {lead ? (
                <div className="space-y-2.5">
                  <h5 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                    Funil de Vendas
                  </h5>

                  {lead.temperature && (
                    <div className="flex items-center gap-2">
                      <div className={cn(
                        "h-2.5 w-2.5 rounded-full",
                        temperatureColors[lead.temperature] || 'bg-muted',
                      )} />
                      <span className="text-xs capitalize">{lead.temperature}</span>
                    </div>
                  )}

                  {stages.length > 0 && (
                    <Select onValueChange={onMoveStage} value={lead.current_stage_id || undefined}>
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue placeholder="Selecionar estágio..." />
                      </SelectTrigger>
                      <SelectContent>
                        {stages.map((stage) => (
                          <SelectItem key={stage.id} value={stage.id}>
                            <div className="flex items-center gap-2">
                              <div
                                className="h-2.5 w-2.5 rounded-full"
                                style={{ backgroundColor: stage.color || '#888' }}
                              />
                              {stage.name}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}

                  {lead.deal_value && (
                    <div className="flex items-center gap-2 p-2.5 bg-muted/50 rounded-lg">
                      <DollarSign className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <p className="text-[10px] text-muted-foreground">Valor do negócio</p>
                        <p className="text-sm font-semibold">
                          {new Intl.NumberFormat('pt-BR', {
                            style: 'currency', currency: 'BRL',
                          }).format(lead.deal_value)}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="p-3 bg-muted/30 rounded-lg text-center">
                    <User className="h-7 w-7 mx-auto mb-2 text-muted-foreground/50" />
                    <p className="text-xs text-muted-foreground">
                      Carregando dados do lead…
                    </p>
                  </div>
                </div>
              )}

              <Separator />

              {/* Origin */}
              <div className="space-y-2.5">
                <h5 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                  Origem
                </h5>
                <div className="space-y-1.5 text-xs">
                  <div className="flex items-center gap-2">
                    <MessageCircle className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="capitalize">{channel}</span>
                  </div>
                  {conversationStartedAt && (
                    <div className="flex items-center gap-2">
                      <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                      <span title={formatMessageTime(conversationStartedAt, 'full')}>
                        Iniciado {formatDistanceToNow(new Date(conversationStartedAt), {
                          addSuffix: true, locale: ptBR,
                        })}
                      </span>
                    </div>
                  )}
                  {lead?.landing_page && (
                    <div className="flex items-center gap-2">
                      <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="truncate text-[11px]">{lead.landing_page}</span>
                    </div>
                  )}
                </div>

                {(lead?.utm_source || lead?.utm_medium || lead?.utm_campaign || lead?.campaign_name || lead?.ad_name || lead?.fbclid || lead?.ctwa_clid) && (
                  <div className="p-2.5 bg-muted/30 rounded-lg text-[11px] space-y-1.5 border border-primary/10">
                    <p className="text-[9px] uppercase font-bold text-primary/70">Atribuição de Marketing</p>
                    <div className="space-y-0.5">
                      {lead.source && (<p><span className="text-muted-foreground">Origem:</span> <Badge variant="outline" className="text-[9px] h-4 py-0 px-1 font-normal">{lead.source}</Badge></p>)}
                      {lead.campaign_name && (<p><span className="text-muted-foreground">Campanha:</span> {lead.campaign_name}</p>)}
                      {lead.adset_name && (<p><span className="text-muted-foreground">Conjunto:</span> {lead.adset_name}</p>)}
                      {lead.ad_name && (<p><span className="text-muted-foreground">Criativo/Headline:</span> {lead.ad_name}</p>)}
                      {lead.ad_body && (<p><span className="text-muted-foreground">Texto do anúncio:</span> {lead.ad_body}</p>)}
                      {lead.ad_source_app && (<p><span className="text-muted-foreground">Source App:</span> {lead.ad_source_app}</p>)}
                      {lead.ad_source_url && (
                        <p className="truncate">
                          <span className="text-muted-foreground">Source URL:</span>{' '}
                          <a href={lead.ad_source_url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                            Link
                          </a>
                        </p>
                      )}
                      {lead.entry_point_conversion_source && (
                        <p><span className="text-muted-foreground">Entry Point:</span> {lead.entry_point_conversion_source}</p>
                      )}
                      {(lead.ctwa_clid || lead.entry_point_conversion_source === 'ctwa_ad') && (
                        <p className="flex items-center gap-1.5 mt-1">
                          <Badge variant="secondary" className="bg-blue-500/10 text-blue-500 text-[9px] h-4 py-0 px-1 border-none">CTWA Detectado</Badge>
                        </p>
                      )}
                      {lead.fbclid && (<p className="truncate"><span className="text-muted-foreground">FBCLID:</span> {lead.fbclid}</p>)}
                      {lead.ctwa_clid && (<p className="truncate"><span className="text-muted-foreground">CTWA ID:</span> {lead.ctwa_clid}</p>)}
                      {lead.utm_source && (<p><span className="text-muted-foreground">Source:</span> {lead.utm_source}</p>)}
                      {lead.utm_medium && (<p><span className="text-muted-foreground">Medium:</span> {lead.utm_medium}</p>)}
                      {lead.utm_campaign && (<p><span className="text-muted-foreground">Campaign:</span> {lead.utm_campaign}</p>)}
                    </div>
                  </div>
                )}
              </div>

              <Separator />

              {/* Stats */}
              <div className="grid grid-cols-2 gap-2">
                <div className="p-2.5 bg-muted/50 rounded-lg text-center">
                  <p className="text-xl font-bold">{messageCount}</p>
                  <p className="text-[10px] text-muted-foreground">Mensagens</p>
                </div>
                <div className="p-2.5 bg-muted/50 rounded-lg text-center">
                  <p className="text-sm font-bold leading-tight pt-1">
                    {lead?.last_contact_at
                      ? formatDistanceToNow(new Date(lead.last_contact_at), { locale: ptBR })
                      : '-'}
                  </p>
                  <p className="text-[10px] text-muted-foreground">Último contato</p>
                </div>
              </div>

              <Separator />

              {/* Internal notes */}
              <InternalNotes conversationId={conversationId} />

              <Separator />

              {/* Quick actions */}
              <div className="space-y-1.5">
                <h5 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                  Ações Rápidas
                </h5>
                {lead && onViewLead && (
                  <Button variant="outline" size="sm" onClick={onViewLead} className="w-full justify-start">
                    <ExternalLink className="h-3.5 w-3.5 mr-2" />
                    Ver Lead Completo
                  </Button>
                )}
                {onCreateEvent && (
                  <Button variant="outline" size="sm" onClick={onCreateEvent} className="w-full justify-start">
                    <CalendarPlus className="h-3.5 w-3.5 mr-2 text-emerald-600" />
                    Novo Evento na Agenda
                  </Button>
                )}
                {onCreateTask && (
                  <Button variant="outline" size="sm" onClick={onCreateTask} className="w-full justify-start">
                    <Calendar className="h-3.5 w-3.5 mr-2" />
                    Agendar Tarefa
                  </Button>
                )}
                {displayPhone && (
                  <Button
                    variant="outline" size="sm"
                    className="w-full justify-start text-emerald-600 hover:text-emerald-700"
                    asChild
                  >
                    <a href={`https://wa.me/${displayPhone.replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer">
                      <MessageCircle className="h-3.5 w-3.5 mr-2" />
                      Abrir no WhatsApp
                    </a>
                  </Button>
                )}
              </div>
            </div>
          </ScrollArea>
        </TabsContent>

        {/* History */}
        <TabsContent value="history" className="flex-1 m-0 overflow-hidden">
          <ScrollArea className="h-full">
            <div className="p-4">
              <ConversationHistoryList
                currentConversationId={conversationId}
                leadId={lead?.id || null}
                visitorPhone={visitorPhone}
              />
            </div>
          </ScrollArea>
        </TabsContent>

        {/* Tags */}
        <TabsContent value="tags" className="flex-1 m-0 overflow-hidden">
          <ScrollArea className="h-full">
            <div className="p-4 space-y-4">
              {!lead ? (
                <p className="text-xs text-muted-foreground text-center py-4">
                  Vincule um lead para gerenciar etiquetas.
                </p>
              ) : (
                <>
                  {/* Atribuídas */}
                  <div className="space-y-2">
                    <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      Etiquetas atribuídas
                    </Label>
                    {leadTags.length === 0 ? (
                      <p className="text-xs text-muted-foreground">Nenhuma etiqueta.</p>
                    ) : (
                      <div className="flex flex-wrap gap-1.5">
                        {leadTags.map((t: any) => (
                          <Badge
                            key={t.id}
                            variant="outline"
                            className="text-[11px] gap-1 pr-1"
                            style={{ borderColor: t.color || undefined, color: t.color || undefined }}
                          >
                            {t.name}
                            <button
                              onClick={() => removeTag.mutate({ leadId: lead.id, tagId: t.id })}
                              className="ml-0.5 hover:text-destructive"
                              aria-label="Remover etiqueta"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Aplicar existente */}
                  {orgTags.length > 0 && (
                    <div className="space-y-2">
                      <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                        Aplicar etiqueta existente
                      </Label>
                      <Select
                        onValueChange={(tagId) => assignTag.mutate({ leadId: lead.id, tagId })}
                      >
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue placeholder="Escolher etiqueta..." />
                        </SelectTrigger>
                        <SelectContent>
                          {orgTags
                            .filter((t) => !leadTags.some((lt: any) => lt.id === t.id))
                            .map((t) => (
                              <SelectItem key={t.id} value={t.id}>
                                <span className="flex items-center gap-2">
                                  <span
                                    className="h-2.5 w-2.5 rounded-full"
                                    style={{ backgroundColor: t.color }}
                                  />
                                  {t.name}
                                </span>
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  {/* Criar nova */}
                  <div className="space-y-2 pt-2 border-t">
                    <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      Criar nova etiqueta
                    </Label>
                    <div className="flex gap-2">
                      <Input
                        value={newTagName}
                        onChange={(e) => setNewTagName(e.target.value)}
                        placeholder="Nome"
                        className="h-8 text-xs"
                      />
                      <input
                        type="color"
                        value={newTagColor}
                        onChange={(e) => setNewTagColor(e.target.value)}
                        className="h-8 w-10 rounded border border-border cursor-pointer"
                        aria-label="Cor"
                      />
                    </div>
                    <Button
                      size="sm"
                      className="w-full h-8"
                      disabled={!newTagName.trim() || createTag.isPending}
                      onClick={async () => {
                        const created = await createTag.mutateAsync({
                          name: newTagName.trim(),
                          color: newTagColor,
                        });
                        if (created?.id && lead?.id) {
                          await assignTag.mutateAsync({ leadId: lead.id, tagId: created.id });
                        }
                        setNewTagName('');
                      }}
                    >
                      <Plus className="h-3.5 w-3.5 mr-1" />
                      Criar e aplicar
                    </Button>
                  </div>
                </>
              )}
            </div>
          </ScrollArea>
        </TabsContent>

        {/* Journey */}
        <TabsContent value="journey" className="flex-1 m-0 overflow-hidden">
          <ScrollArea className="h-full">
            <div className="p-4">
              <JourneyTimeline conversationId={conversationId} />
            </div>
          </ScrollArea>
        </TabsContent>

        {/* AI Summary */}
        <TabsContent value="summary" className="flex-1 m-0 overflow-hidden">
          <ScrollArea className="h-full">
            <div className="p-4">
              <AISummaryTab conversationId={conversationId} />
            </div>
          </ScrollArea>
        </TabsContent>
      </Tabs>
    </div>
  );
}
