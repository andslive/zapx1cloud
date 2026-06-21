import { useState } from 'react';
import { Search, ArrowRightLeft, Layers, User, Loader2, Bot, Lock, Smartphone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useQuery } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';

interface TransferConversationModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conversationId: string;
  currentAssignedUserId?: string;
  /** Canal da conversa — usado para mostrar o seletor de conexão só em WhatsApp */
  currentChannel?: string;
  /** ID da instância Evolution atualmente vinculada à conversa (se houver) */
  currentWhatsAppInstanceId?: string | null;
  onTransfer?: () => void;
}

export function TransferConversationModal({
  open,
  onOpenChange,
  conversationId,
  currentAssignedUserId,
  currentChannel,
  currentWhatsAppInstanceId,
  onTransfer,
}: TransferConversationModalProps) {
  const { profile, user } = useAuth();
  const { toast } = useToast();
  const [transferType, setTransferType] = useState<'user' | 'sector' | 'agent'>('user');
  const [searchUser, setSearchUser] = useState('');
  const [searchAgent, setSearchAgent] = useState('');
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [selectedSectorId, setSelectedSectorId] = useState<string | null>(null);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  // Conexão Evolution: 'keep' = manter atual, ou ID da nova instância
  const [selectedInstanceId, setSelectedInstanceId] = useState<string>('keep');
  const [internalNote, setInternalNote] = useState('');
  const [isTransferring, setIsTransferring] = useState(false);

  // Fetch team members
  const { data: teamMembers = [], isLoading: loadingTeam } = useQuery({
    queryKey: ['team-members-transfer', profile?.organization_id],
    queryFn: async () => {
      if (!profile?.organization_id) return [];
      
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, email, avatar_url')
        .eq('organization_id', profile.organization_id)
        .eq('is_active', true)
        .neq('id', currentAssignedUserId || '')
        .order('full_name', { ascending: true });

      if (error) throw error;
      return data;
    },
    enabled: !!profile?.organization_id && open,
  });

  // Fetch sectors (atendimento usa setores, não squads de venda)
  const { data: sectors = [], isLoading: loadingSectors } = useQuery({
    queryKey: ['sectors-transfer', profile?.organization_id],
    queryFn: async () => {
      if (!profile?.organization_id) return [];

      const { data, error } = await supabase
        .from('sectors')
        .select('id, name, color, icon')
        .eq('organization_id', profile.organization_id)
        .eq('is_active', true)
        .order('bot_order', { ascending: true, nullsFirst: false })
        .order('name', { ascending: true });

      if (error) throw error;
      return data;
    },
    enabled: !!profile?.organization_id && open,
  });

  // Verifica se o usuário pode transferir para Agente Admin (privado)
  const { data: canTransferToAdmin = false } = useQuery({
    queryKey: ['can-transfer-admin', profile?.organization_id, user?.id],
    queryFn: async () => {
      if (!profile?.organization_id || !user?.id) return false;

      // Match #1: usuário cadastrado como admin_user_id em auto_notification_settings
      const { data: settings } = await supabase
        .from('auto_notification_settings')
        .select('admin_user_id')
        .eq('organization_id', profile.organization_id)
        .maybeSingle();

      if (settings?.admin_user_id === user.id) return true;

      // Match #2: usuário tem role 'admin' (fallback)
      const { data: roles } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id);

      return (roles ?? []).some((r) => r.role === 'admin');
    },
    enabled: !!profile?.organization_id && !!user?.id && open,
  });

  // Fetch AI agents (filtra admin no client conforme permissão)
  const { data: aiAgents = [], isLoading: loadingAgents } = useQuery({
    queryKey: ['ai-agents-transfer', profile?.organization_id],
    queryFn: async () => {
      if (!profile?.organization_id) return [];

      const { data, error } = await supabase
        .from('product_agents')
        .select('id, name, description, agent_type, avatar_url, is_active, is_default, product_id, product:products(id, name)')
        .eq('organization_id', profile.organization_id)
        .eq('is_active', true)
        .order('is_default', { ascending: false })
        .order('name', { ascending: true });

      if (error) throw error;
      return data as Array<{
        id: string;
        name: string;
        description: string | null;
        agent_type: string;
        avatar_url: string | null;
        is_active: boolean;
        is_default: boolean;
        product_id: string | null;
        product: { id: string; name: string } | null;
      }>;
    },
    enabled: !!profile?.organization_id && open,
  });

  // Fetch WhatsApp instances (somente para conversas WhatsApp)
  const isWhatsApp = (currentChannel || '').toLowerCase() === 'whatsapp';
  const { data: whatsappInstances = [] } = useQuery({
    queryKey: ['whatsapp-instances-transfer', profile?.organization_id],
    queryFn: async () => {
      if (!profile?.organization_id) return [];
      const { data, error } = await supabase
        .from('evolution_instances')
        .select('id, name, phone_number, status')
        .eq('organization_id', profile.organization_id)
        .order('is_default', { ascending: false })
        .order('name', { ascending: true });
      if (error) throw error;
      return (data || []) as Array<{
        id: string;
        name: string;
        phone_number: string | null;
        status: string;
      }>;
    },
    enabled: !!profile?.organization_id && open && isWhatsApp,
  });

  // Filter team by search
  const filteredTeam = teamMembers.filter(member =>
    member.full_name.toLowerCase().includes(searchUser.toLowerCase()) ||
    member.email.toLowerCase().includes(searchUser.toLowerCase())
  );

  // Filter agents by search + esconde admin se não houver permissão
  const filteredAgents = aiAgents
    .filter((a) => canTransferToAdmin || a.agent_type !== 'admin')
    .filter((a) => {
      const q = searchAgent.toLowerCase();
      return (
        a.name.toLowerCase().includes(q) ||
        (a.description ?? '').toLowerCase().includes(q) ||
        (a.product?.name ?? '').toLowerCase().includes(q)
      );
    });

  const hasAdminInList = filteredAgents.some((a) => a.agent_type === 'admin');

  const handleTransfer = async () => {
    if (transferType === 'user' && !selectedUserId) {
      toast({
        title: 'Selecione um usuário',
        description: 'Escolha para quem deseja transferir a conversa.',
        variant: 'destructive',
      });
      return;
    }

    if (transferType === 'sector' && !selectedSectorId) {
      toast({
        title: 'Selecione um setor',
        description: 'Escolha para qual setor deseja transferir a conversa.',
        variant: 'destructive',
      });
      return;
    }

    if (transferType === 'agent' && !selectedAgentId) {
      toast({
        title: 'Selecione um agente de IA',
        description: 'Escolha qual agente deve assumir a conversa.',
        variant: 'destructive',
      });
      return;
    }

    setIsTransferring(true);

    try {
      // Detect admin takeover ahead of update so we can flag metadata.
      const adminTargetAgent =
        transferType === 'agent' && selectedAgentId
          ? aiAgents.find((a) => a.id === selectedAgentId && a.agent_type === 'admin')
          : null;

      // Update conversation assignment
      const updateData: any = {
        updated_at: new Date().toISOString(),
      };

      if (transferType === 'user') {
        updateData.assigned_user_id = selectedUserId;
        updateData.status = 'human_active';
      } else if (transferType === 'sector') {
        updateData.assigned_user_id = null;
        updateData.sector_id = selectedSectorId;
        updateData.status = 'waiting_human';
      } else {
        // agent: devolve a conversa para a IA com agente específico
        updateData.assigned_user_id = null;
        updateData.current_agent_id = selectedAgentId;
        updateData.status = 'bot_active';
        // Marca conversa como em atendimento pelo agente escolhido para que o
        // orquestrador não tente re-rotear (coluna é NOT NULL).
        updateData.orchestrator_state = 'em_atendimento';
      }

      // Troca opcional de conexão (instância Evolution / WhatsApp).
      // Não substitui as outras opções — funciona em conjunto.
      const willChangeInstance =
        isWhatsApp &&
        selectedInstanceId !== 'keep' &&
        selectedInstanceId !== (currentWhatsAppInstanceId || '');
      const newInstance = willChangeInstance
        ? whatsappInstances.find((i) => i.id === selectedInstanceId)
        : null;
      if (willChangeInstance && newInstance) {
        updateData.evolution_instance_id = newInstance.id;
      }

      // Read existing metadata to merge admin takeover flag
      if (adminTargetAgent) {
        const { data: existingConv } = await supabase
          .from('webchat_conversations')
          .select('metadata')
          .eq('id', conversationId)
          .maybeSingle();
        const prevMeta = (existingConv?.metadata as Record<string, any>) ?? {};
        updateData.metadata = {
          ...prevMeta,
          manual_admin_takeover: true,
          manual_admin_takeover_by: user?.id ?? null,
          manual_admin_takeover_at: new Date().toISOString(),
        };
      }

      const { error: updateError } = await supabase
        .from('webchat_conversations')
        .update(updateData)
        .eq('id', conversationId);

      if (updateError) throw updateError;

      // Create transfer record. Reaproveitamos `to_queue_id` para registrar o setor de destino,
      // já que a tabela ainda usa esse nome de coluna por compatibilidade.
      const targetAgent =
        transferType === 'agent' && selectedAgentId
          ? aiAgents.find((a) => a.id === selectedAgentId)
          : null;

      const targetSector =
        transferType === 'sector' && selectedSectorId
          ? sectors.find((s) => s.id === selectedSectorId)
          : null;

      const baseNote =
        transferType === 'agent'
          ? targetAgent?.agent_type === 'admin'
            ? `🔒 Transferido para Agente Admin: ${targetAgent?.name} — teste/intervenção manual por ${profile?.full_name ?? 'gestor'}${
                internalNote ? ` — ${internalNote}` : ''
              }`
            : `🤖 Transferido para Agente IA: ${targetAgent?.name ?? selectedAgentId}${
                internalNote ? ` — ${internalNote}` : ''
              }`
          : transferType === 'sector'
          ? `📂 Transferido para o setor: ${targetSector?.name ?? ''}${internalNote ? ` — ${internalNote}` : ''}`
          : internalNote || null;

      const connectionNote = newInstance
        ? `🔌 Conexão alterada para: ${newInstance.name}${newInstance.phone_number ? ` (${newInstance.phone_number})` : ''}`
        : null;

      const composedNote = [baseNote, connectionNote].filter(Boolean).join(' • ') || null;

      const { error: transferError } = await supabase
        .from('conversation_transfers')
        .insert({
          conversation_id: conversationId,
          from_user_id: currentAssignedUserId || user?.id,
          to_user_id: transferType === 'user' ? selectedUserId : null,
          to_queue_id: transferType === 'sector' ? selectedSectorId : null,
          internal_note: composedNote,
          created_by: user?.id,
        });

      if (transferError) throw transferError;

      const baseDesc =
        transferType === 'user'
          ? 'A conversa foi transferida com sucesso.'
          : transferType === 'sector'
          ? `A conversa foi enviada para o setor "${targetSector?.name ?? ''}".`
          : `Agente IA "${targetAgent?.name ?? ''}" agora está atendendo.`;
      const fullDesc = newInstance
        ? `${baseDesc} Conexão alterada para ${newInstance.name}.`
        : baseDesc;
      toast({ title: 'Conversa transferida', description: fullDesc });

      onOpenChange(false);
      onTransfer?.();

      // Reset state
      setSelectedUserId(null);
      setSelectedSectorId(null);
      setSelectedAgentId(null);
      setSelectedInstanceId('keep');
      setInternalNote('');
      setSearchUser('');
      setSearchAgent('');
    } catch (error) {
      console.error('Error transferring conversation:', error);
      toast({
        title: 'Erro ao transferir',
        description: 'Não foi possível transferir a conversa.',
        variant: 'destructive',
      });
    } finally {
      setIsTransferring(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowRightLeft className="h-5 w-5 text-primary" />
            Transferir Conversa
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Transfer Type */}
          <RadioGroup
            value={transferType}
            onValueChange={(value) => setTransferType(value as 'user' | 'sector' | 'agent')}
            className="flex flex-wrap gap-4"
          >
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="user" id="user" />
              <Label htmlFor="user" className="flex items-center gap-2 cursor-pointer">
                <User className="h-4 w-4" />
                Para usuário
              </Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="sector" id="sector" />
              <Label htmlFor="sector" className="flex items-center gap-2 cursor-pointer">
                <Layers className="h-4 w-4" />
                Para setor
              </Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="agent" id="agent" />
              <Label htmlFor="agent" className="flex items-center gap-2 cursor-pointer">
                <Bot className="h-4 w-4" />
                Para Agente IA
              </Label>
            </div>
          </RadioGroup>

          {/* User Selection */}
          {transferType === 'user' && (
            <div className="space-y-3">
              <Label>Selecionar usuário</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar por nome ou email..."
                  value={searchUser}
                  onChange={(e) => setSearchUser(e.target.value)}
                  className="pl-9"
                />
              </div>
              <ScrollArea className="h-48 border rounded-md">
                {loadingTeam ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                ) : filteredTeam.length === 0 ? (
                  <div className="p-4 text-center text-muted-foreground text-sm">
                    Nenhum usuário encontrado
                  </div>
                ) : (
                  <div className="p-2 space-y-1">
                    {filteredTeam.map((member) => (
                      <button
                        key={member.id}
                        onClick={() => setSelectedUserId(member.id)}
                        className={cn(
                          "w-full flex items-center gap-3 p-2 rounded-lg transition-colors",
                          selectedUserId === member.id
                            ? "bg-primary/10 border border-primary"
                            : "hover:bg-accent"
                        )}
                      >
                        <Avatar className="h-8 w-8">
                          <AvatarFallback className="text-xs">
                            {member.full_name.charAt(0)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 text-left">
                          <p className="text-sm font-medium">{member.full_name}</p>
                          <p className="text-xs text-muted-foreground">{member.email}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </div>
          )}

          {/* Sector Selection */}
          {transferType === 'sector' && (
            <div className="space-y-3">
              <Label>Selecionar setor</Label>
              <Select value={selectedSectorId || ''} onValueChange={setSelectedSectorId}>
                <SelectTrigger>
                  <SelectValue placeholder="Escolha um setor..." />
                </SelectTrigger>
                <SelectContent>
                  {loadingSectors ? (
                    <div className="flex items-center justify-center py-4">
                      <Loader2 className="h-4 w-4 animate-spin" />
                    </div>
                  ) : sectors.length === 0 ? (
                    <div className="p-4 text-center text-muted-foreground text-sm">
                      Nenhum setor disponível
                    </div>
                  ) : (
                    sectors.map((sector) => (
                      <SelectItem key={sector.id} value={sector.id}>
                        <div className="flex items-center gap-2">
                          <div
                            className="h-3 w-3 rounded-full"
                            style={{ backgroundColor: sector.color || 'hsl(var(--muted-foreground))' }}
                          />
                          {sector.name}
                        </div>
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                A conversa entrará na fila do setor escolhido e ficará disponível para qualquer atendente do setor assumir.
              </p>
            </div>
          )}

          {/* AI Agent Selection */}
          {transferType === 'agent' && (
            <div className="space-y-3">
              <Label>Selecionar agente de IA</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar agente por nome, descrição ou produto..."
                  value={searchAgent}
                  onChange={(e) => setSearchAgent(e.target.value)}
                  className="pl-9"
                />
              </div>
              <ScrollArea className="h-56 border rounded-md">
                {loadingAgents ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                ) : filteredAgents.length === 0 ? (
                  <div className="p-4 text-center text-muted-foreground text-sm">
                    Nenhum agente disponível
                  </div>
                ) : (
                  <div className="p-2 space-y-1">
                    {filteredAgents.map((a) => (
                      <button
                        key={a.id}
                        onClick={() => setSelectedAgentId(a.id)}
                        className={cn(
                          'w-full flex items-start gap-3 p-2 rounded-lg transition-colors text-left',
                          selectedAgentId === a.id
                            ? 'bg-primary/10 border border-primary'
                            : 'hover:bg-accent border border-transparent'
                        )}
                      >
                        <Avatar className="h-8 w-8 shrink-0">
                          <AvatarFallback className={cn(
                            "text-xs",
                            a.agent_type === 'admin'
                              ? "bg-warning/10 text-warning"
                              : "bg-primary/10 text-primary"
                          )}>
                            {a.agent_type === 'admin' ? <Lock className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <p className="text-sm font-medium truncate">{a.name}</p>
                            {a.agent_type === 'admin' && (
                              <Badge variant="outline" className="h-4 px-1.5 text-[10px] border-warning/40 text-warning shrink-0">
                                Admin
                              </Badge>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground truncate">
                            {a.product?.name ?? 'Global'}
                          </p>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </ScrollArea>
              <p className="text-xs text-muted-foreground">
                {hasAdminInList
                  ? 'Agentes 🔒 Admin são privados do gestor — use apenas para teste ou intervenção. A conversa volta ao modo IA com o agente escolhido.'
                  : 'A conversa volta ao modo IA com este agente assumindo o atendimento.'}
              </p>
            </div>
          )}

          {/* Connection (Evolution) Selection — só para WhatsApp */}
          {isWhatsApp && (
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Smartphone className="h-4 w-4" />
                Transferir para conexão
              </Label>
              <Select value={selectedInstanceId} onValueChange={setSelectedInstanceId}>
                <SelectTrigger>
                  <SelectValue placeholder="Manter conexão atual" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="keep">Manter conexão atual</SelectItem>
                  {whatsappInstances
                    .filter((i) => i.id !== (currentWhatsAppInstanceId || ''))
                    .map((i) => (
                      <SelectItem key={i.id} value={i.id}>
                        <div className="flex items-center gap-2">
                          <span
                            className={cn(
                              'h-2 w-2 rounded-full',
                              i.status === 'connected' ? 'bg-success' : 'bg-muted-foreground/50',
                            )}
                          />
                          {i.name}
                          {i.phone_number ? ` (${i.phone_number})` : ''}
                          {i.status !== 'connected' && (
                            <Badge variant="outline" className="h-4 px-1.5 text-[10px]">
                              {i.status}
                            </Badge>
                          )}
                        </div>
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Mude o número/conexão WhatsApp pelo qual essa conversa será atendida. O histórico é
                preservado.
              </p>
            </div>
          )}

          {/* Internal Note */}
          <div className="space-y-2">
            <Label>Observações internas (opcional)</Label>
            <Textarea
              placeholder="Adicione uma nota para o próximo atendente..."
              value={internalNote}
              onChange={(e) => setInternalNote(e.target.value)}
              className="min-h-[80px]"
            />
            <p className="text-xs text-muted-foreground">
              Esta mensagem é interna e não será visível para o cliente.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleTransfer} disabled={isTransferring}>
            {isTransferring ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Transferindo...
              </>
            ) : (
              <>
                <ArrowRightLeft className="h-4 w-4 mr-2" />
                Transferir
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
