import { useMemo, useRef, useState } from 'react';
import { PostSaleVariablePicker } from '@/components/admin/payments/PostSaleVariablePicker';
import { useProductAgents } from '@/hooks/useProductAgents';
import { useEmailTemplates } from '@/hooks/useEmailTemplates';
import { useLeadTags } from '@/hooks/useLeadTags';
import { useChatFlows } from '@/hooks/useChatFlows';
import { useSectors } from '@/hooks/useSectors';
import { useTeamMembers } from '@/hooks/useTeam';
import { useAuth } from '@/hooks/useAuth';
import { useWhatsAppInstances } from '@/hooks/useWhatsAppInstances';

import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import {
  POST_SALE_EVENT_TYPES,
  usePostSaleEventActions,
  useUpsertPostSaleEventAction,
  useDeletePostSaleEventAction,
  usePostSaleEventLogs,
  type PostSaleEventAction,
} from '@/hooks/usePostSaleEventActions';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  ChevronDown, ChevronUp, Loader2, Bot, Mail, ArrowRightCircle, History,
  CheckCircle2, XCircle, Tag, Send, Workflow, MessageSquare, Trophy, Users, Sparkles,
  Plus, Check,
} from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { TagPackageGeneratorDialog } from '@/components/admin/tags/TagPackageGeneratorDialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { useCreateLeadTag } from '@/hooks/useLeadTags';

interface Props {
  productId: string;
}

export function PostSaleTab({ productId }: Props) {
  const { data: actions, isLoading } = usePostSaleEventActions(productId);
  const { data: agents } = useProductAgents(productId);
  const { data: templates } = useEmailTemplates();
  const { data: tags } = useLeadTags();
  const { data: flows } = useChatFlows(productId);
  const { data: sectors } = useSectors();
  const { profile } = useAuth();
  const { data: team } = useTeamMembers(profile?.organization_id);
  const upsert = useUpsertPostSaleEventAction();
  const remove = useDeletePostSaleEventAction(productId);
  const [packageOpen, setPackageOpen] = useState(false);

  const stagesQuery = useQuery({
    queryKey: ['pipeline-stages', productId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('pipeline_stages')
        .select('id, name, order_index')
        .eq('product_id', productId)
        .order('order_index', { ascending: true });
      if (error) throw error;
      return (data || []) as Array<{ id: string; name: string }>;
    },
    enabled: !!productId,
  });

  const byEvent = useMemo(() => {
    const map = new Map<string, PostSaleEventAction>();
    actions?.forEach(a => map.set(a.event_type, a));
    return map;
  }, [actions]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Eventos Pós-venda</h2>
        <p className="text-sm text-muted-foreground">
          O webhook do gateway (Hotmart, Cakto, Doppus, Kiwify) já está conectado. Aqui você define <strong>o que acontece</strong> quando cada evento chega.
        </p>
      </div>

      <Card className="border-dashed">
        <CardContent className="flex items-center justify-between gap-3 py-4">
          <div className="flex items-center gap-3 min-w-0">
            <Sparkles className="h-5 w-5 text-primary shrink-0" />
            <div className="min-w-0">
              <p className="text-sm font-medium">Pacote de etiquetas deste produto</p>
              <p className="text-xs text-muted-foreground">Gera PIX, Boleto, Aguardando Pagamento, Cliente, Reembolso etc. já com automações.</p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={() => setPackageOpen(true)}>Gerar pacote</Button>
        </CardContent>
      </Card>

      <div className="grid gap-3">
        {POST_SALE_EVENT_TYPES.map(evt => (
          <EventCard
            key={evt.value}
            productId={productId}
            event={evt}
            existing={byEvent.get(evt.value)}
            agents={agents || []}
            templates={templates || []}
            stages={stagesQuery.data || []}
            tags={tags || []}
            flows={flows || []}
            sectors={sectors || []}
            team={team || []}
            onSave={(payload) => upsert.mutate(payload)}
            onDelete={(id) => remove.mutate(id)}
            saving={upsert.isPending}
          />
        ))}
      </div>

      <Separator />

      <RecentLogs productId={productId} />

      <TagPackageGeneratorDialog open={packageOpen} onOpenChange={setPackageOpen} />
    </div>
  );
}

interface EventCardProps {
  productId: string;
  event: typeof POST_SALE_EVENT_TYPES[number];
  existing?: PostSaleEventAction;
  agents: Array<{ id: string; name: string; is_default?: boolean | null }>;
  templates: Array<{ id: string; name: string }>;
  stages: Array<{ id: string; name: string }>;
  tags: Array<{ id: string; name: string; color: string }>;
  flows: Array<{ id: string; name: string; is_active: boolean }>;
  sectors: Array<{ id: string; name: string }>;
  team: Array<{ id: string; full_name: string | null; email?: string | null }>;
  onSave: (payload: any) => void;
  onDelete: (id: string) => void;
  saving: boolean;
}

const NONE = '__none__';

function EventCard({ productId, event, existing, agents, templates, stages, tags, flows, sectors, team, onSave, onDelete, saving }: EventCardProps) {
  const [open, setOpen] = useState(false);
  const [isActive, setIsActive] = useState(existing?.is_active ?? true);
  const [addTagIds, setAddTagIds] = useState<string[]>((existing as any)?.add_tag_ids ?? []);
  const [removeTagIds, setRemoveTagIds] = useState<string[]>((existing as any)?.remove_tag_ids ?? []);
  const [sendMode, setSendMode] = useState<'none' | 'flow' | 'message'>((existing as any)?.send_mode ?? 'none');
  const [flowId, setFlowId] = useState<string | null>((existing as any)?.flow_id ?? null);
  const [inlineMessage, setInlineMessage] = useState<string>((existing as any)?.inline_message ?? '');
  const [messageChannel, setMessageChannel] = useState<'whatsapp' | 'email'>((existing as any)?.message_channel ?? 'whatsapp');
  const [evolutionInstanceId, setWhatsAppInstanceId] = useState<string | null>((existing as any)?.evolution_instance_id ?? null);
  const { data: evolutionInstances } = useWhatsAppInstances();
  const [targetStageId, setTargetStageId] = useState<string | null>(existing?.target_stage_id ?? null);
  const [dealOutcome, setDealOutcome] = useState<'none' | 'won' | 'lost'>((existing as any)?.deal_outcome ?? 'none');
  const [dealValueSource, setDealValueSource] = useState<'none' | 'webhook' | 'manual'>((existing as any)?.deal_value_source ?? 'none');
  const [dealValueManual, setDealValueManual] = useState<string>(((existing as any)?.deal_value_manual ?? '').toString());
  const [forwardKind, setForwardKind] = useState<'none' | 'sector' | 'user' | 'agent'>(() => {
    if (existing?.agent_id) return 'agent';
    if ((existing as any)?.assign_user_id) return 'user';
    if ((existing as any)?.assign_sector_id) return 'sector';
    return 'none';
  });
  const [assignSectorId, setAssignSectorId] = useState<string | null>((existing as any)?.assign_sector_id ?? null);
  const [assignUserId, setAssignUserId] = useState<string | null>((existing as any)?.assign_user_id ?? null);
  const [agentId, setAgentId] = useState<string | null>(existing?.agent_id ?? null);
  const [objective, setObjective] = useState(existing?.agent_objective ?? '');
  const [extraContext, setExtraContext] = useState(existing?.agent_extra_context ?? '');
  const [agentOutreachMode, setAgentOutreachMode] = useState<'direct' | 'conversational'>(
    ((existing as any)?.agent_outreach_mode as 'direct' | 'conversational') ?? 'direct',
  );
  const [emailTemplateId, setEmailTemplateId] = useState<string | null>(existing?.email_template_id ?? null);
  const [delayMinutes, setDelayMinutes] = useState<string>(((existing as any)?.delay_minutes ?? 0).toString());

  const inlineMessageRef = useRef<HTMLTextAreaElement>(null);
  const isConfigured = !!existing;

  const toggleTag = (id: string, list: string[], setter: (v: string[]) => void) => {
    setter(list.includes(id) ? list.filter(x => x !== id) : [...list, id]);
  };

  const handleSave = () => {
    onSave({
      id: existing?.id,
      product_id: productId,
      event_type: event.value,
      is_active: isActive,
      add_tag_ids: addTagIds,
      remove_tag_ids: removeTagIds,
      send_mode: sendMode,
      flow_id: sendMode === 'flow' ? flowId : null,
      inline_message: sendMode === 'message' ? (inlineMessage || null) : null,
      message_channel: messageChannel,
      evolution_instance_id: messageChannel === 'whatsapp' && sendMode === 'message' ? evolutionInstanceId : null,
      target_stage_id: targetStageId,
      deal_outcome: dealOutcome,
      deal_value_source: dealValueSource,
      deal_value_manual: dealValueSource === 'manual' && dealValueManual ? Number(dealValueManual) : null,
      assign_sector_id: forwardKind === 'sector' ? assignSectorId : null,
      assign_user_id: forwardKind === 'user' ? assignUserId : null,
      agent_id: forwardKind === 'agent' ? agentId : null,
      agent_objective: forwardKind === 'agent' ? (objective || null) : null,
      agent_extra_context: forwardKind === 'agent' ? (extraContext || null) : null,
      agent_outreach_mode: forwardKind === 'agent' ? agentOutreachMode : 'direct',
      email_template_id: emailTemplateId,
      delay_minutes: Math.max(0, Math.min(10080, parseInt(delayMinutes || '0', 10) || 0)),
    });
    setOpen(false);
  };

  return (
    <Card className={isConfigured && isActive ? 'border-primary/40' : ''}>
      <CardHeader className="cursor-pointer" onClick={() => setOpen(o => !o)}>
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <CardTitle className="text-base">{event.label}</CardTitle>
              {isConfigured ? (
                <Badge variant={isActive ? 'default' : 'secondary'}>{isActive ? 'Ativo' : 'Pausado'}</Badge>
              ) : (
                <Badge variant="outline">Não configurado</Badge>
              )}
              {!!(existing as any)?.add_tag_ids?.length && <Badge variant="outline" className="gap-1"><Tag className="h-3 w-3" />+{(existing as any).add_tag_ids.length}</Badge>}
              {(existing as any)?.send_mode === 'flow' && <Badge variant="outline" className="gap-1"><Workflow className="h-3 w-3" />Fluxo</Badge>}
              {(existing as any)?.send_mode === 'message' && <Badge variant="outline" className="gap-1"><MessageSquare className="h-3 w-3" />Mensagem</Badge>}
              {existing?.target_stage_id && <Badge variant="outline" className="gap-1"><ArrowRightCircle className="h-3 w-3" />Etapa</Badge>}
              {existing?.agent_id && <Badge variant="outline" className="gap-1"><Bot className="h-3 w-3" />IA</Badge>}
              {!!(existing as any)?.delay_minutes && (
                <Badge variant="outline" className="gap-1">⏱ {(existing as any).delay_minutes}min</Badge>
              )}
            </div>
            <CardDescription className="mt-1">{event.description}</CardDescription>
          </div>
          <Button variant="ghost" size="icon">
            {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </Button>
        </div>
      </CardHeader>

      {open && (
        <CardContent className="space-y-5 border-t pt-4">
          <div className="flex items-center justify-between">
            <Label>Automação ativa</Label>
            <Switch checked={isActive} onCheckedChange={setIsActive} />
          </div>

          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <Label>Atraso antes de disparar</Label>
              <p className="text-xs text-muted-foreground mt-1">
                0 = imediato. Vale para mensagem, agente IA e e-mail. Etiquetas, etapa e encaminhamento são imediatos.
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Input
                type="number" min="0" max="10080" step="1"
                className="w-24"
                value={delayMinutes}
                onChange={(e) => setDelayMinutes(e.target.value)}
              />
              <span className="text-xs text-muted-foreground">min</span>
            </div>
          </div>

          {/* 1. Etiquetas */}
          <Section icon={<Tag className="h-4 w-4" />} title="1. Etiquetas">
            <div className="space-y-3">
              <div>
                <Label className="text-xs text-muted-foreground">Adicionar</Label>
                <TagMultiSelect tags={tags} selected={addTagIds} onToggle={(id) => toggleTag(id, addTagIds, setAddTagIds)} />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Remover</Label>
                <TagMultiSelect tags={tags} selected={removeTagIds} onToggle={(id) => toggleTag(id, removeTagIds, setRemoveTagIds)} />
              </div>
            </div>
          </Section>

          {/* 2. Enviar */}
          <Section icon={<Send className="h-4 w-4" />} title="2. Enviar">
            <div className="space-y-3">
              <Select value={sendMode} onValueChange={(v: any) => setSendMode(v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Não enviar nada</SelectItem>
                  <SelectItem value="flow">Fluxo pronto</SelectItem>
                  <SelectItem value="message">Mensagem na hora</SelectItem>
                </SelectContent>
              </Select>

              {sendMode === 'flow' && (
                flows.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    Nenhum fluxo criado para este produto. Crie um na aba <strong>Fluxos</strong> primeiro.
                  </p>
                ) : (
                  <Select value={flowId ?? ''} onValueChange={(v) => setFlowId(v || null)}>
                    <SelectTrigger><SelectValue placeholder="Selecionar fluxo" /></SelectTrigger>
                    <SelectContent>
                      {flows.map(f => <SelectItem key={f.id} value={f.id}>{f.name}{!f.is_active ? ' (inativo)' : ''}</SelectItem>)}
                    </SelectContent>
                  </Select>
                )
              )}

              {sendMode === 'message' && (
                <div className="space-y-2">
                  <Select value={messageChannel} onValueChange={(v: any) => setMessageChannel(v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="whatsapp">WhatsApp</SelectItem>
                      <SelectItem value="email">E-mail</SelectItem>
                    </SelectContent>
                  </Select>
                  {messageChannel === 'whatsapp' && (
                    <div>
                      <Label className="text-xs text-muted-foreground">Número WhatsApp para disparo</Label>
                      <Select
                        value={evolutionInstanceId ?? NONE}
                        onValueChange={(v) => setWhatsAppInstanceId(v === NONE ? null : v)}
                      >
                        <SelectTrigger><SelectValue placeholder="Instância padrão da organização" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value={NONE}>Instância padrão (automático)</SelectItem>
                          {(evolutionInstances || []).map((inst) => (
                            <SelectItem key={inst.id} value={inst.id}>
                              {inst.name}{inst.phone_number ? ` · ${inst.phone_number}` : ''}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  <div className="flex justify-end">
                    <PostSaleVariablePicker
                      targetRef={inlineMessageRef}
                      value={inlineMessage}
                      onChange={setInlineMessage}
                    />
                  </div>
                  <Textarea
                    ref={inlineMessageRef}
                    rows={5}
                    placeholder={'Olá {{lead_name}}! Segue o PIX da sua compra de {{product_name}}:\n{{pix_code}}'}
                    value={inlineMessage}
                    onChange={(e) => setInlineMessage(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Use o botão <strong>Variáveis</strong> para inserir dados do lead, pedido, PIX, boleto e links.
                  </p>
                </div>
              )}
            </div>
          </Section>

          {/* 3. Pipeline */}
          <Section icon={<Trophy className="h-4 w-4" />} title="3. Pipeline (opcional)">
            <div className="grid sm:grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Mover para etapa</Label>
                <Select value={targetStageId ?? NONE} onValueChange={(v) => setTargetStageId(v === NONE ? null : v)}>
                  <SelectTrigger><SelectValue placeholder="Não mover" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Não mover</SelectItem>
                    {stages.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Resultado</Label>
                <Select value={dealOutcome} onValueChange={(v: any) => setDealOutcome(v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">—</SelectItem>
                    <SelectItem value="won">Ganho</SelectItem>
                    <SelectItem value="lost">Perdido</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Valor do negócio</Label>
                <Select value={dealValueSource} onValueChange={(v: any) => setDealValueSource(v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Não atualizar</SelectItem>
                    <SelectItem value="webhook">Puxar do webhook (amount)</SelectItem>
                    <SelectItem value="manual">Valor manual</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {dealValueSource === 'manual' && (
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Valor (R$)</Label>
                  <Input
                    type="number" step="0.01" min="0"
                    value={dealValueManual}
                    onChange={(e) => setDealValueManual(e.target.value)}
                  />
                </div>
              )}
            </div>
          </Section>

          {/* 4. Encaminhar */}
          <Section icon={<Users className="h-4 w-4" />} title="4. Encaminhar lead (opcional)">
            <div className="space-y-3">
              <Select value={forwardKind} onValueChange={(v: any) => setForwardKind(v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Não encaminhar</SelectItem>
                  <SelectItem value="sector">Setor</SelectItem>
                  <SelectItem value="user">Pessoa</SelectItem>
                  <SelectItem value="agent">Agente de IA</SelectItem>
                </SelectContent>
              </Select>

              {forwardKind === 'sector' && (
                <Select value={assignSectorId ?? NONE} onValueChange={(v) => setAssignSectorId(v === NONE ? null : v)}>
                  <SelectTrigger><SelectValue placeholder="Selecionar setor" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>—</SelectItem>
                    {sectors.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              )}

              {forwardKind === 'user' && (
                <Select value={assignUserId ?? NONE} onValueChange={(v) => setAssignUserId(v === NONE ? null : v)}>
                  <SelectTrigger><SelectValue placeholder="Selecionar pessoa" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>—</SelectItem>
                    {team.map(m => <SelectItem key={m.id} value={m.id}>{m.full_name || m.email || m.id}</SelectItem>)}
                  </SelectContent>
                </Select>
              )}

              {forwardKind === 'agent' && (
                <div className="space-y-2">
                  <Select value={agentId ?? NONE} onValueChange={(v) => setAgentId(v === NONE ? null : v)}>
                    <SelectTrigger><SelectValue placeholder="Selecionar agente" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>—</SelectItem>
                      {agents.map(a => <SelectItem key={a.id} value={a.id}>{a.name}{a.is_default ? ' (padrão)' : ''}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Input placeholder="Objetivo do contato" value={objective} onChange={(e) => setObjective(e.target.value)} />
                  <Textarea rows={3} placeholder="Contexto extra para a IA (opcional)" value={extraContext} onChange={(e) => setExtraContext(e.target.value)} />

                  <div className="space-y-2 pt-2 border-t">
                    <Label className="text-xs text-muted-foreground">Modo de abordagem</Label>
                    <div className="grid grid-cols-1 gap-2">
                      <label
                        className={`flex items-start gap-2 p-2 rounded-md border cursor-pointer transition-colors ${agentOutreachMode === 'direct' ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/50'}`}
                      >
                        <input
                          type="radio"
                          name="agent_outreach_mode"
                          className="mt-1"
                          checked={agentOutreachMode === 'direct'}
                          onChange={() => setAgentOutreachMode('direct')}
                        />
                        <div className="text-xs">
                          <div className="font-medium text-foreground">Mensagem direta</div>
                          <div className="text-muted-foreground">Envia tudo de uma vez (Pix, link, instruções) em até 2 bolhas curtas.</div>
                        </div>
                      </label>
                      <label
                        className={`flex items-start gap-2 p-2 rounded-md border cursor-pointer transition-colors ${agentOutreachMode === 'conversational' ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/50'}`}
                      >
                        <input
                          type="radio"
                          name="agent_outreach_mode"
                          className="mt-1"
                          checked={agentOutreachMode === 'conversational'}
                          onChange={() => setAgentOutreachMode('conversational')}
                        />
                        <div className="text-xs">
                          <div className="font-medium text-foreground">Conversa intencional</div>
                          <div className="text-muted-foreground">Abre com uma pergunta curta. A IA só entrega Pix/link conforme o lead reage.</div>
                        </div>
                      </label>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </Section>

          {/* E-mail por template (mantido como opção avançada) */}
          <Section icon={<Mail className="h-4 w-4" />} title="E-mail por template (opcional)">
            <Select value={emailTemplateId ?? NONE} onValueChange={(v) => setEmailTemplateId(v === NONE ? null : v)}>
              <SelectTrigger><SelectValue placeholder="Nenhum" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Nenhum</SelectItem>
                {templates.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </Section>

          <div className="flex justify-end gap-2 pt-2">
            {existing && (
              <Button variant="ghost" onClick={() => onDelete(existing.id)}>Remover</Button>
            )}
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Salvar
            </Button>
          </div>
        </CardContent>
      )}
    </Card>
  );
}

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-sm font-medium">
        {icon}{title}
      </div>
      <div className="pl-6">{children}</div>
    </div>
  );
}

function TagMultiSelect({
  tags, selected, onToggle,
}: { tags: Array<{ id: string; name: string; color: string }>; selected: string[]; onToggle: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const createTag = useCreateLeadTag();

  const filtered = useMemo(
    () => tags.filter(t => t.name.toLowerCase().includes(query.toLowerCase())),
    [tags, query],
  );
  const exactMatch = tags.some(t => t.name.toLowerCase() === query.trim().toLowerCase());

  const handleCreate = async () => {
    const name = query.trim();
    if (!name) return;
    try {
      const created: any = await createTag.mutateAsync({ name, color: '#6366f1' });
      if (created?.id) onToggle(created.id);
      setQuery('');
    } catch (e) {
      // toast já é exibido pelo hook
    }
  };

  const selectedTags = tags.filter(t => selected.includes(t.id));

  return (
    <div className="space-y-2">
      {selectedTags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selectedTags.map(t => (
            <button
              key={t.id}
              type="button"
              onClick={() => onToggle(t.id)}
              className="text-xs px-2 py-1 rounded-md border border-primary bg-primary/10 hover:bg-primary/20 transition"
              title="Clique para remover"
            >
              <span className="inline-block w-2 h-2 rounded-full mr-1.5 align-middle" style={{ background: t.color }} />
              {t.name} ×
            </button>
          ))}
        </div>
      )}

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button type="button" variant="outline" size="sm" className="h-8 text-xs">
            <Tag className="h-3 w-3 mr-1.5" /> Adicionar etiqueta
          </Button>
        </PopoverTrigger>
        <PopoverContent className="p-0 w-72" align="start">
          <Command shouldFilter={false}>
            <CommandInput placeholder="Buscar ou criar etiqueta..." value={query} onValueChange={setQuery} />
            <CommandList>
              <CommandEmpty>
                {query.trim() ? (
                  <button
                    type="button"
                    onClick={handleCreate}
                    disabled={createTag.isPending}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-accent flex items-center gap-2"
                  >
                    {createTag.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
                    Criar "<strong>{query.trim()}</strong>"
                  </button>
                ) : (
                  <p className="px-3 py-2 text-sm text-muted-foreground">Digite para buscar ou criar</p>
                )}
              </CommandEmpty>
              <CommandGroup>
                {filtered.map(t => {
                  const active = selected.includes(t.id);
                  return (
                    <CommandItem
                      key={t.id}
                      value={t.name}
                      onSelect={() => onToggle(t.id)}
                      className="cursor-pointer"
                    >
                      <span className="inline-block w-2 h-2 rounded-full mr-2" style={{ background: t.color }} />
                      <span className="flex-1">{t.name}</span>
                      {active && <Check className="h-3 w-3 text-primary" />}
                    </CommandItem>
                  );
                })}
                {!exactMatch && query.trim() && filtered.length > 0 && (
                  <CommandItem onSelect={handleCreate} className="cursor-pointer text-primary">
                    <Plus className="h-3 w-3 mr-2" />
                    Criar "{query.trim()}"
                  </CommandItem>
                )}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}

function RecentLogs({ productId }: { productId: string }) {
  const { data: logs, isLoading } = usePostSaleEventLogs(productId, 15);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2"><History className="h-4 w-4" />Histórico recente</CardTitle>
        <CardDescription>Últimos eventos pós-venda processados para este produto.</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="text-sm text-muted-foreground">Carregando...</div>
        ) : !logs || logs.length === 0 ? (
          <div className="text-sm text-muted-foreground">Nenhum evento registrado ainda.</div>
        ) : (
          <div className="space-y-2">
            {logs.map(log => {
              const executed = Array.isArray(log.executed_actions) ? log.executed_actions : [];
              const hasFailure = executed.some((a: any) => a?.success === false);
              const ok = !hasFailure;
              return (
                <div key={log.id} className="flex items-start justify-between gap-3 p-3 rounded-lg bg-muted/40 text-sm">
                  <div className="flex items-start gap-2 min-w-0">
                    {ok ? <CheckCircle2 className="h-4 w-4 text-success mt-0.5" /> : <XCircle className="h-4 w-4 text-destructive mt-0.5" />}
                    <div className="min-w-0">
                      <div className="font-medium">{log.event_type}</div>
                      <div className="text-xs text-muted-foreground">
                        {log.source || 'webhook'} · {executed.length} ação(ões) · {format(new Date(log.created_at), "dd/MM 'às' HH:mm", { locale: ptBR })}
                      </div>
                    </div>
                  </div>
                  <Badge variant={ok ? 'default' : 'destructive'} className="shrink-0">
                    {ok ? 'sucesso' : 'falha parcial'}
                  </Badge>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
