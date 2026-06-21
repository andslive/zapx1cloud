import { useMemo, useState } from 'react';
import { useAllAgents } from '@/hooks/useProductAgents';
import {
  useAgentSpecialists,
  useUpsertSpecialist,
  useDeleteSpecialist,
  useAgentRoutingRules,
  useUpsertRoutingRule,
  useDeleteRoutingRule,
  type AgentSpecialist,
  type AgentRoutingRule,
} from '@/hooks/useAgentSupervisor';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Bot, Plus, Trash2, GitBranch, Users, Zap } from 'lucide-react';

const ROLE_OPTIONS = [
  { value: 'sdr', label: 'SDR (Qualificação)' },
  { value: 'closer', label: 'Closer (Fechamento)' },
  { value: 'support', label: 'Suporte' },
  { value: 'retention', label: 'Retenção' },
  { value: 'recovery', label: 'Recuperação' },
  { value: 'custom', label: 'Outro' },
];

const CHANNEL_OPTIONS = ['whatsapp', 'instagram', 'webchat', 'facebook', 'voice'];
const EVENT_OPTIONS = ['paid', 'abandoned', 'refunded', 'new_message', 'first_contact'];

export function AgentSupervisorPanel() {
  const { data: allAgents = [] } = useAllAgents();
  const { data: specialists = [], isLoading: spLoading } = useAgentSpecialists();
  const { data: rules = [], isLoading: rulesLoading } = useAgentRoutingRules();
  const upsertSpecialist = useUpsertSpecialist();
  const deleteSpecialist = useDeleteSpecialist();
  const upsertRule = useUpsertRoutingRule();
  const deleteRule = useDeleteRoutingRule();

  const [editingSpecialist, setEditingSpecialist] = useState<Partial<AgentSpecialist> | null>(null);
  const [editingRule, setEditingRule] = useState<Partial<AgentRoutingRule> | null>(null);

  const specialistsById = useMemo(
    () => Object.fromEntries(specialists.map((s) => [s.id, s])),
    [specialists],
  );

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <GitBranch className="h-5 w-5 text-primary" />
              </div>
              <div>
                <CardTitle>Supervisor Multi-agente</CardTitle>
                <CardDescription>
                  Roteamento inteligente: defina especialistas e regras. Quando nenhuma regra bate,
                  o supervisor IA decide automaticamente.
                </CardDescription>
              </div>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* ESPECIALISTAS */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-muted-foreground" />
              <CardTitle className="text-base">Especialistas</CardTitle>
            </div>
            <Button
              size="sm"
              onClick={() =>
                setEditingSpecialist({
                  role: 'sdr',
                  display_name: '',
                  is_active: true,
                  priority: 100,
                })
              }
            >
              <Plus className="h-4 w-4 mr-1" /> Novo especialista
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {spLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}
          {!spLoading && specialists.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Nenhum especialista cadastrado. Vincule seus agentes a um papel pra ativar o roteamento.
            </p>
          )}
          {specialists.map((sp) => {
            const agent = allAgents.find((a) => a.id === sp.agent_id);
            return (
              <div
                key={sp.id}
                className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-accent/30 transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <Bot className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium truncate">{sp.display_name}</span>
                      <Badge variant="secondary" className="text-xs">
                        {ROLE_OPTIONS.find((r) => r.value === sp.role)?.label ?? sp.role}
                      </Badge>
                      {!sp.is_active && <Badge variant="outline">Inativo</Badge>}
                    </div>
                    <p className="text-xs text-muted-foreground truncate">
                      Agente: {agent?.name ?? sp.agent_id} · prioridade {sp.priority}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="ghost" onClick={() => setEditingSpecialist(sp)}>
                    Editar
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => {
                      if (confirm(`Remover ${sp.display_name}?`)) deleteSpecialist.mutate(sp.id);
                    }}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* REGRAS DE ROTEAMENTO */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-muted-foreground" />
              <CardTitle className="text-base">Regras de Roteamento</CardTitle>
            </div>
            <Button
              size="sm"
              disabled={specialists.length === 0}
              onClick={() =>
                setEditingRule({
                  name: '',
                  is_active: true,
                  priority: 100,
                  target_specialist_id: specialists[0]?.id,
                })
              }
            >
              <Plus className="h-4 w-4 mr-1" /> Nova regra
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {rulesLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}
          {!rulesLoading && rules.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Nenhuma regra. Sem regras, o supervisor IA decide cada handoff automaticamente.
            </p>
          )}
          {rules.map((r) => {
            const target = specialistsById[r.target_specialist_id];
            return (
              <div
                key={r.id}
                className="flex items-center justify-between p-3 rounded-lg border bg-card"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium truncate">{r.name}</span>
                    {!r.is_active && <Badge variant="outline">Inativa</Badge>}
                    <Badge variant="secondary" className="text-xs">
                      → {target?.display_name ?? '?'}
                    </Badge>
                    {r.match_count > 0 && (
                      <Badge variant="outline" className="text-xs">
                        {r.match_count} matches
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Prioridade {r.priority}
                    {r.match_events?.length ? ` · eventos: ${r.match_events.join(', ')}` : ''}
                    {r.match_channels?.length ? ` · canais: ${r.match_channels.join(', ')}` : ''}
                    {r.deal_value_min != null ? ` · ≥ R$${r.deal_value_min}` : ''}
                    {r.deal_value_max != null ? ` · ≤ R$${r.deal_value_max}` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="ghost" onClick={() => setEditingRule(r)}>
                    Editar
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => {
                      if (confirm(`Remover regra "${r.name}"?`)) deleteRule.mutate(r.id);
                    }}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* DIALOG: ESPECIALISTA */}
      <Dialog open={!!editingSpecialist} onOpenChange={(o) => !o && setEditingSpecialist(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingSpecialist?.id ? 'Editar especialista' : 'Novo especialista'}
            </DialogTitle>
            <DialogDescription>
              Vincule um agente já existente a um papel pra que o supervisor possa rotear conversas pra ele.
            </DialogDescription>
          </DialogHeader>
          {editingSpecialist && (
            <div className="space-y-4">
              <div>
                <Label>Nome de exibição</Label>
                <Input
                  value={editingSpecialist.display_name ?? ''}
                  onChange={(e) =>
                    setEditingSpecialist({ ...editingSpecialist, display_name: e.target.value })
                  }
                  placeholder="Ex: SDR de WhatsApp"
                />
              </div>
              <div>
                <Label>Papel</Label>
                <Select
                  value={editingSpecialist.role}
                  onValueChange={(v) => setEditingSpecialist({ ...editingSpecialist, role: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ROLE_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Agente</Label>
                <Select
                  value={editingSpecialist.agent_id}
                  onValueChange={(v) => setEditingSpecialist({ ...editingSpecialist, agent_id: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione um agente" />
                  </SelectTrigger>
                  <SelectContent>
                    {allAgents.map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Descrição (ajuda o supervisor IA a escolher)</Label>
                <Input
                  value={editingSpecialist.description ?? ''}
                  onChange={(e) =>
                    setEditingSpecialist({ ...editingSpecialist, description: e.target.value })
                  }
                  placeholder="Ex: especialista em qualificação BANT pra leads novos"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Prioridade</Label>
                  <Input
                    type="number"
                    value={editingSpecialist.priority ?? 100}
                    onChange={(e) =>
                      setEditingSpecialist({
                        ...editingSpecialist,
                        priority: Number(e.target.value),
                      })
                    }
                  />
                </div>
                <div className="flex items-center justify-between pt-6">
                  <Label>Ativo</Label>
                  <Switch
                    checked={editingSpecialist.is_active ?? true}
                    onCheckedChange={(v) =>
                      setEditingSpecialist({ ...editingSpecialist, is_active: v })
                    }
                  />
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingSpecialist(null)}>
              Cancelar
            </Button>
            <Button
              onClick={() => {
                if (!editingSpecialist?.display_name || !editingSpecialist.agent_id) return;
                upsertSpecialist.mutate(editingSpecialist as any, {
                  onSuccess: () => setEditingSpecialist(null),
                });
              }}
            >
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* DIALOG: REGRA */}
      <Dialog open={!!editingRule} onOpenChange={(o) => !o && setEditingRule(null)}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingRule?.id ? 'Editar regra' : 'Nova regra de roteamento'}
            </DialogTitle>
            <DialogDescription>
              Quando todas as condições preenchidas baterem, a conversa vai pro especialista escolhido.
            </DialogDescription>
          </DialogHeader>
          {editingRule && (
            <div className="space-y-4">
              <div>
                <Label>Nome</Label>
                <Input
                  value={editingRule.name ?? ''}
                  onChange={(e) => setEditingRule({ ...editingRule, name: e.target.value })}
                  placeholder="Ex: Pix abandonado vai pra recuperação"
                />
              </div>

              <div>
                <Label>Especialista alvo</Label>
                <Select
                  value={editingRule.target_specialist_id}
                  onValueChange={(v) =>
                    setEditingRule({ ...editingRule, target_specialist_id: v })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {specialists.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.display_name} ({s.role})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Eventos (qualquer)</Label>
                <div className="flex flex-wrap gap-2 mt-1">
                  {EVENT_OPTIONS.map((ev) => {
                    const active = editingRule.match_events?.includes(ev);
                    return (
                      <Badge
                        key={ev}
                        variant={active ? 'default' : 'outline'}
                        className="cursor-pointer"
                        onClick={() => {
                          const cur = editingRule.match_events ?? [];
                          setEditingRule({
                            ...editingRule,
                            match_events: active
                              ? cur.filter((c) => c !== ev)
                              : [...cur, ev],
                          });
                        }}
                      >
                        {ev}
                      </Badge>
                    );
                  })}
                </div>
              </div>

              <div>
                <Label>Canais (qualquer)</Label>
                <div className="flex flex-wrap gap-2 mt-1">
                  {CHANNEL_OPTIONS.map((ch) => {
                    const active = editingRule.match_channels?.includes(ch);
                    return (
                      <Badge
                        key={ch}
                        variant={active ? 'default' : 'outline'}
                        className="cursor-pointer"
                        onClick={() => {
                          const cur = editingRule.match_channels ?? [];
                          setEditingRule({
                            ...editingRule,
                            match_channels: active
                              ? cur.filter((c) => c !== ch)
                              : [...cur, ch],
                          });
                        }}
                      >
                        {ch}
                      </Badge>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Valor mínimo (R$)</Label>
                  <Input
                    type="number"
                    value={editingRule.deal_value_min ?? ''}
                    onChange={(e) =>
                      setEditingRule({
                        ...editingRule,
                        deal_value_min: e.target.value ? Number(e.target.value) : null,
                      })
                    }
                  />
                </div>
                <div>
                  <Label>Valor máximo (R$)</Label>
                  <Input
                    type="number"
                    value={editingRule.deal_value_max ?? ''}
                    onChange={(e) =>
                      setEditingRule({
                        ...editingRule,
                        deal_value_max: e.target.value ? Number(e.target.value) : null,
                      })
                    }
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Prioridade (menor = primeiro)</Label>
                  <Input
                    type="number"
                    value={editingRule.priority ?? 100}
                    onChange={(e) =>
                      setEditingRule({ ...editingRule, priority: Number(e.target.value) })
                    }
                  />
                </div>
                <div className="flex items-center justify-between pt-6">
                  <Label>Ativa</Label>
                  <Switch
                    checked={editingRule.is_active ?? true}
                    onCheckedChange={(v) => setEditingRule({ ...editingRule, is_active: v })}
                  />
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingRule(null)}>
              Cancelar
            </Button>
            <Button
              onClick={() => {
                if (!editingRule?.name || !editingRule.target_specialist_id) return;
                upsertRule.mutate(editingRule as any, {
                  onSuccess: () => setEditingRule(null),
                });
              }}
            >
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
