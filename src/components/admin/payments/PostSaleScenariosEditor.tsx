import { useState } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Plus, Pencil, Trash2, Tag, Link2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  usePostSaleScenarios,
  useSavePostSaleScenario,
  useDeletePostSaleScenario,
  type PostSaleScenario,
  type PostSaleEvent,
  type PostSaleLink,
} from '@/hooks/usePostSaleScenarios';

const EVENT_LABEL: Record<PostSaleEvent, { label: string; color: string; emoji: string }> = {
  paid: { label: 'Pagamento confirmado', color: 'bg-green-500/10 text-green-700', emoji: '✅' },
  abandoned: {
    label: 'Checkout abandonado',
    color: 'bg-yellow-500/10 text-yellow-700',
    emoji: '⏳',
  },
  refunded: { label: 'Reembolso', color: 'bg-red-500/10 text-red-700', emoji: '💸' },
};

const TEMPLATES: Record<PostSaleEvent, { name: string; instruction: string; links: PostSaleLink[]; tags: string[] }[]> = {
  paid: [
    {
      name: 'Boas-vindas + acesso',
      instruction:
        'Parabenize o cliente pela compra, entregue o link de acesso à área de membros e pergunte se ele já entrou no grupo do WhatsApp. Tom: caloroso, próximo, sem floreios.',
      links: [
        { label: 'Área de acesso', url: 'https://area.suaempresa.com', when_to_offer: 'sempre' },
        { label: 'Grupo WhatsApp', url: 'https://chat.whatsapp.com/XXX', when_to_offer: 'após confirmar acesso' },
      ],
      tags: ['cliente_ativo', 'aguardando_acesso'],
    },
    {
      name: 'Convite pro webinário',
      instruction:
        'Convide o cliente pro próximo webinário gratuito. Mencione data, horário e o que ele vai aprender. Pergunte se ele consegue participar ao vivo.',
      links: [
        { label: 'Webinário', url: 'https://...', when_to_offer: 'sempre' },
      ],
      tags: ['convidado_webinario'],
    },
  ],
  abandoned: [
    {
      name: 'Recuperar Pix abandonado',
      instruction:
        'Cliente gerou Pix e não pagou. Pergunte se houve alguma dúvida ou problema com o pagamento. Ofereça reenviar o link/código se ele pedir. NÃO insista mais de 2x.',
      links: [],
      tags: ['checkout_abandonado_pix'],
    },
  ],
  refunded: [
    {
      name: 'Resgate pós-reembolso',
      instruction:
        'Seja empático. Pergunte o motivo do reembolso. Se for problema técnico, ofereça suporte. Se for expectativa, ofereça plano alternativo. NUNCA pareça insistente.',
      links: [],
      tags: ['reembolsado'],
    },
  ],
};

export function PostSaleScenariosEditor() {
  const { data: scenarios, isLoading } = usePostSaleScenarios();
  const [editing, setEditing] = useState<Partial<PostSaleScenario> | null>(null);

  const openNew = (event: PostSaleEvent) =>
    setEditing({
      trigger_event: event,
      name: '',
      description: '',
      instruction: '',
      links: [],
      tags_to_apply: [],
      priority: 0,
      is_active: true,
      filters: {},
    });

  const grouped: Record<PostSaleEvent, PostSaleScenario[]> = {
    paid: [],
    abandoned: [],
    refunded: [],
  };
  (scenarios ?? []).forEach((s) => grouped[s.trigger_event]?.push(s));

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Cenários de Pós-Venda</CardTitle>
        <CardDescription>
          Defina o que o agente deve fazer em cada situação. As instruções aqui são
          injetadas automaticamente no prompt do agente quando o evento acontece.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {(Object.keys(EVENT_LABEL) as PostSaleEvent[]).map((event) => {
          const meta = EVENT_LABEL[event];
          return (
            <div key={event} className="space-y-3 rounded-lg border p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-lg">{meta.emoji}</span>
                  <h3 className="font-semibold">{meta.label}</h3>
                  <Badge variant="secondary">{grouped[event].length} cenário(s)</Badge>
                </div>
                <Button size="sm" variant="outline" onClick={() => openNew(event)}>
                  <Plus className="mr-1 h-4 w-4" /> Novo cenário
                </Button>
              </div>

              {grouped[event].length === 0 ? (
                <div className="rounded-md bg-muted/30 p-4 text-center text-sm text-muted-foreground">
                  Nenhum cenário configurado. O agente usará apenas o briefing padrão.
                  <div className="mt-2 flex flex-wrap justify-center gap-2">
                    {TEMPLATES[event].map((t) => (
                      <Button
                        key={t.name}
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          setEditing({
                            trigger_event: event,
                            name: t.name,
                            description: '',
                            instruction: t.instruction,
                            links: t.links,
                            tags_to_apply: t.tags,
                            priority: 0,
                            is_active: true,
                            filters: {},
                          })
                        }
                      >
                        + Usar template "{t.name}"
                      </Button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  {grouped[event].map((s) => (
                    <ScenarioRow key={s.id} scenario={s} onEdit={() => setEditing(s)} />
                  ))}
                </div>
              )}
            </div>
          );
        })}

        {editing && (
          <ScenarioDialog
            scenario={editing}
            onClose={() => setEditing(null)}
          />
        )}
      </CardContent>
    </Card>
  );
}

function ScenarioRow({
  scenario,
  onEdit,
}: {
  scenario: PostSaleScenario;
  onEdit: () => void;
}) {
  const del = useDeletePostSaleScenario();
  return (
    <div className="flex items-start justify-between gap-3 rounded-md border bg-card p-3">
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex items-center gap-2">
          <span className={`h-2 w-2 rounded-full ${scenario.is_active ? 'bg-green-500' : 'bg-muted-foreground/40'}`} />
          <span className="font-medium">{scenario.name}</span>
          {scenario.priority > 0 && (
            <Badge variant="outline" className="text-xs">
              prioridade {scenario.priority}
            </Badge>
          )}
        </div>
        <p className="line-clamp-2 text-xs text-muted-foreground">
          {scenario.instruction}
        </p>
        <div className="flex flex-wrap gap-1 pt-1">
          {scenario.links.map((l, i) => (
            <Badge key={i} variant="secondary" className="text-xs">
              <Link2 className="mr-1 h-3 w-3" />
              {l.label}
            </Badge>
          ))}
          {scenario.tags_to_apply.map((t) => (
            <Badge key={t} variant="outline" className="text-xs">
              <Tag className="mr-1 h-3 w-3" />
              {t}
            </Badge>
          ))}
        </div>
      </div>
      <div className="flex shrink-0 gap-1">
        <Button size="icon" variant="ghost" onClick={onEdit}>
          <Pencil className="h-4 w-4" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          onClick={() => {
            if (confirm(`Excluir cenário "${scenario.name}"?`)) {
              del.mutate(scenario.id, {
                onSuccess: () => toast.success('Cenário excluído'),
              });
            }
          }}
        >
          <Trash2 className="h-4 w-4 text-destructive" />
        </Button>
      </div>
    </div>
  );
}

function ScenarioDialog({
  scenario,
  onClose,
}: {
  scenario: Partial<PostSaleScenario>;
  onClose: () => void;
}) {
  const save = useSavePostSaleScenario();
  const [draft, setDraft] = useState(scenario);
  const [tagInput, setTagInput] = useState('');

  const update = <K extends keyof PostSaleScenario>(key: K, value: PostSaleScenario[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  const addLink = () =>
    update('links', [
      ...(draft.links ?? []),
      { label: '', url: '', when_to_offer: '' },
    ]);

  const updateLink = (idx: number, key: keyof PostSaleLink, value: string) => {
    const links = [...(draft.links ?? [])];
    links[idx] = { ...links[idx], [key]: value };
    update('links', links);
  };

  const removeLink = (idx: number) =>
    update('links', (draft.links ?? []).filter((_, i) => i !== idx));

  const addTag = () => {
    const t = tagInput.trim();
    if (!t) return;
    if ((draft.tags_to_apply ?? []).includes(t)) return;
    update('tags_to_apply', [...(draft.tags_to_apply ?? []), t]);
    setTagInput('');
  };

  const handleSave = () => {
    if (!draft.name?.trim() || !draft.instruction?.trim() || !draft.trigger_event) {
      toast.error('Preencha nome, evento e instrução');
      return;
    }
    save.mutate(
      {
        id: draft.id,
        name: draft.name,
        description: draft.description ?? null,
        trigger_event: draft.trigger_event,
        priority: draft.priority ?? 0,
        is_active: draft.is_active ?? true,
        instruction: draft.instruction,
        links: draft.links ?? [],
        tags_to_apply: draft.tags_to_apply ?? [],
        filters: draft.filters ?? {},
      },
      {
        onSuccess: () => {
          toast.success(draft.id ? 'Cenário atualizado' : 'Cenário criado');
          onClose();
        },
        onError: (e: any) => toast.error(e.message),
      },
    );
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {draft.id ? 'Editar cenário' : 'Novo cenário'}
          </DialogTitle>
          <DialogDescription>
            Defina o que o agente deve fazer quando esse evento acontecer.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Nome do cenário</Label>
              <Input
                value={draft.name ?? ''}
                onChange={(e) => update('name', e.target.value)}
                placeholder="Ex: Boas-vindas + acesso"
              />
            </div>
            <div className="space-y-2">
              <Label>Evento que dispara</Label>
              <Select
                value={draft.trigger_event}
                onValueChange={(v) => update('trigger_event', v as PostSaleEvent)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(EVENT_LABEL) as PostSaleEvent[]).map((e) => (
                    <SelectItem key={e} value={e}>
                      {EVENT_LABEL[e].emoji} {EVENT_LABEL[e].label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Instrução pro agente</Label>
            <Textarea
              rows={5}
              value={draft.instruction ?? ''}
              onChange={(e) => update('instruction', e.target.value)}
              placeholder="Ex: Parabenize o cliente, entregue o link de acesso e pergunte se ele já entrou no grupo do WhatsApp..."
            />
            <p className="text-xs text-muted-foreground">
              Linguagem natural. O agente vai seguir isso à risca.
            </p>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Links que o agente pode oferecer</Label>
              <Button size="sm" variant="ghost" onClick={addLink}>
                <Plus className="mr-1 h-3 w-3" /> Adicionar link
              </Button>
            </div>
            {(draft.links ?? []).map((link, idx) => (
              <div key={idx} className="grid grid-cols-12 gap-2 rounded-md border p-2">
                <Input
                  className="col-span-3"
                  placeholder="Rótulo"
                  value={link.label}
                  onChange={(e) => updateLink(idx, 'label', e.target.value)}
                />
                <Input
                  className="col-span-5"
                  placeholder="https://..."
                  value={link.url}
                  onChange={(e) => updateLink(idx, 'url', e.target.value)}
                />
                <Input
                  className="col-span-3"
                  placeholder="Quando oferecer"
                  value={link.when_to_offer ?? ''}
                  onChange={(e) => updateLink(idx, 'when_to_offer', e.target.value)}
                />
                <Button
                  size="icon"
                  variant="ghost"
                  className="col-span-1"
                  onClick={() => removeLink(idx)}
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            ))}
          </div>

          <div className="space-y-2">
            <Label>Tags aplicadas automaticamente</Label>
            <div className="flex gap-2">
              <Input
                placeholder="Ex: cliente_ativo"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addTag();
                  }
                }}
              />
              <Button variant="outline" onClick={addTag}>
                Adicionar
              </Button>
            </div>
            <div className="flex flex-wrap gap-1">
              {(draft.tags_to_apply ?? []).map((t) => (
                <Badge
                  key={t}
                  variant="secondary"
                  className="cursor-pointer"
                  onClick={() =>
                    update(
                      'tags_to_apply',
                      (draft.tags_to_apply ?? []).filter((x) => x !== t),
                    )
                  }
                >
                  {t} ✕
                </Badge>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Prioridade</Label>
              <Input
                type="number"
                value={draft.priority ?? 0}
                onChange={(e) => update('priority', Number(e.target.value) || 0)}
              />
              <p className="text-xs text-muted-foreground">
                Maior número = aplicado primeiro.
              </p>
            </div>
            <div className="flex items-end gap-2">
              <Switch
                checked={draft.is_active ?? true}
                onCheckedChange={(v) => update('is_active', v)}
              />
              <Label>{draft.is_active ?? true ? 'Ativo' : 'Desativado'}</Label>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={save.isPending}>
            {save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
