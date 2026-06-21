import { useState, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Plus, Trash2, Zap, Sparkles, Package } from 'lucide-react';
import {
  useTagAutomations, useUpsertTagAutomation, useDeleteTagAutomation,
  useLeadTags, TAG_EVENT_LABELS, type TagAutomation,
} from '@/hooks/useLeadTags';
import { useProducts } from '@/hooks/useProducts';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { TagPackageGeneratorDialog } from './TagPackageGeneratorDialog';

export function TagAutomationsPanel() {
  const { data: automations } = useTagAutomations();
  const { data: tags } = useLeadTags();
  const { data: products } = useProducts();
  const deleteMut = useDeleteTagAutomation();
  const [editing, setEditing] = useState<TagAutomation | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [packageDialogOpen, setPackageDialogOpen] = useState(false);

  // Agrupa automações por produto (NULL = "Qualquer produto")
  const grouped = useMemo(() => {
    const map = new Map<string | null, TagAutomation[]>();
    automations?.forEach((a) => {
      const key = a.product_id;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(a);
    });
    return Array.from(map.entries());
  }, [automations]);

  const tagById = (id: string) => tags?.find((t) => t.id === id);
  const productById = (id: string | null) => products?.find((p) => p.id === id);

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle className="text-base flex items-center gap-2">
            <Zap className="h-4 w-4" /> Automações por evento
          </CardTitle>
          <CardDescription>
            Aplique etiquetas automaticamente conforme o status do checkout. Etiquetas marcadas como
            "transitórias" são removidas quando a compra é confirmada — etiquetas permanentes preservam o histórico do cliente.
          </CardDescription>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button onClick={() => setPackageDialogOpen(true)} className="gap-2">
            <Sparkles className="h-4 w-4" /> Gerar pacote para produto
          </Button>
          <Button variant="outline" onClick={() => { setEditing(null); setDialogOpen(true); }}>
            <Plus className="h-4 w-4 mr-2" /> Manual
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {!automations || automations.length === 0 ? (
          <div className="text-center py-10 text-muted-foreground">
            <Sparkles className="h-10 w-10 mx-auto mb-3 opacity-40" />
            <p className="font-medium">Nenhuma automação configurada.</p>
            <p className="text-xs mt-1">
              Clique em <strong>"Gerar pacote para produto"</strong> e escolha um produto.
              <br />Em 1 clique você cria 6 etiquetas e 6 regras prontas.
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {grouped.map(([prodId, items]) => {
              const product = prodId ? productById(prodId) : null;
              return (
                <div key={prodId ?? 'global'} className="space-y-2">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <Package className="h-4 w-4 text-muted-foreground" />
                    {product ? product.name : 'Qualquer produto (global)'}
                    <Badge variant="secondary" className="text-xs">{items.length} regras</Badge>
                  </div>
                  <div className="space-y-2 pl-1">
                    {items.map((a) => {
                      const addTag = tagById(a.tag_id_to_add);
                      const removeTag = a.tag_id_to_remove ? tagById(a.tag_id_to_remove) : null;
                      return (
                        <div key={a.id} className="flex items-center gap-3 p-3 rounded-lg border border-border">
                          <Switch checked={a.is_active} onCheckedChange={() => { /* TODO toggle */ }} />
                          <div className="flex-1 min-w-0 text-sm">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-muted-foreground">Quando</span>
                              <Badge variant="secondary">{TAG_EVENT_LABELS[a.event_type]}</Badge>
                              <span className="text-muted-foreground">→ aplicar</span>
                              {addTag && (
                                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs" style={{ backgroundColor: `${addTag.color}20`, color: addTag.color }}>
                                  <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: addTag.color }} />
                                  {addTag.name}
                                </span>
                              )}
                              {addTag?.is_lifecycle_status && (
                                <Badge variant="outline" className="text-[10px] border-orange-500/40 text-orange-600">
                                  transitória
                                </Badge>
                              )}
                              {removeTag && (
                                <>
                                  <span className="text-muted-foreground">+ remover</span>
                                  <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs line-through opacity-70" style={{ backgroundColor: `${removeTag.color}20`, color: removeTag.color }}>
                                    {removeTag.name}
                                  </span>
                                </>
                              )}
                            </div>
                          </div>
                          <Button variant="ghost" size="sm" onClick={() => { setEditing(a); setDialogOpen(true); }}>
                            Editar
                          </Button>
                          <Button variant="ghost" size="icon" className="text-destructive" onClick={() => deleteMut.mutate(a.id)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>

      <AutomationDialog open={dialogOpen} onOpenChange={setDialogOpen} automation={editing} />
      <TagPackageGeneratorDialog open={packageDialogOpen} onOpenChange={setPackageDialogOpen} />
    </Card>
  );
}

function AutomationDialog({ open, onOpenChange, automation }: { open: boolean; onOpenChange: (o: boolean) => void; automation: TagAutomation | null }) {
  const { data: tags } = useLeadTags();
  const { data: products } = useProducts();
  const upsert = useUpsertTagAutomation();

  const [eventType, setEventType] = useState<TagAutomation['event_type']>(automation?.event_type ?? 'compra_aprovada');
  const [productId, setProductId] = useState<string>(automation?.product_id ?? '');
  const [tagToAdd, setTagToAdd] = useState<string>(automation?.tag_id_to_add ?? '');
  const [tagToRemove, setTagToRemove] = useState<string>(automation?.tag_id_to_remove ?? '');

  const handleSave = async () => {
    if (!tagToAdd) return;
    try {
      await upsert.mutateAsync({
        id: automation?.id,
        event_type: eventType,
        product_id: productId || null,
        tag_id_to_add: tagToAdd,
        tag_id_to_remove: tagToRemove || null,
        is_active: true,
      });
      onOpenChange(false);
    } catch {}
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{automation ? 'Editar automação' : 'Nova automação'}</DialogTitle>
          <DialogDescription>Configure quando uma etiqueta deve ser aplicada automaticamente.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Quando este evento acontecer</Label>
            <Select value={eventType} onValueChange={(v) => setEventType(v as any)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(TAG_EVENT_LABELS).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Para o produto</Label>
            <Select value={productId || 'any'} onValueChange={(v) => setProductId(v === 'any' ? '' : v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="any">Qualquer produto</SelectItem>
                {products?.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Aplicar a etiqueta</Label>
            <Select value={tagToAdd} onValueChange={setTagToAdd}>
              <SelectTrigger><SelectValue placeholder="Selecione uma etiqueta" /></SelectTrigger>
              <SelectContent>
                {tags?.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    <span className="inline-flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: t.color }} />
                      {t.name}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>E remover (opcional)</Label>
            <Select value={tagToRemove || 'none'} onValueChange={(v) => setTagToRemove(v === 'none' ? '' : v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Não remover nada</SelectItem>
                {tags?.filter((t) => t.id !== tagToAdd).map((t) => (
                  <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSave} disabled={!tagToAdd || upsert.isPending}>Salvar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
