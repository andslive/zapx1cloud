import { useState } from 'react';
import { useReleases, useUpsertRelease, useDeleteRelease } from '@/hooks/useReleases';
import { useHelpCategories } from '@/hooks/useHelp';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { RichEditor } from '@/components/editor/RichEditor';
import { Plus, Pencil, Trash2, Sparkles, Eye, EyeOff, Wrench, Bug } from 'lucide-react';
import { toast } from 'sonner';

const TYPES = [
  { key: 'feature', label: 'Nova feature', icon: Sparkles },
  { key: 'improvement', label: 'Melhoria', icon: Wrench },
  { key: 'fix', label: 'Correção', icon: Bug },
];

export function ReleasesManager() {
  const { data: releases = [] } = useReleases();
  const { data: categories = [] } = useHelpCategories();
  const upsert = useUpsertRelease();
  const del = useDeleteRelease();

  const [editing, setEditing] = useState<any | null>(null);

  const toggleType = (t: string) => {
    const types: string[] = editing.release_types || [];
    setEditing({ ...editing, release_types: types.includes(t) ? types.filter(x => x !== t) : [...types, t] });
  };

  const save = async () => {
    if (!editing?.title) { toast.error('Título obrigatório'); return; }
    const payload: any = {
      ...editing,
      published_at: editing.is_published ? (editing.published_at || new Date().toISOString()) : null,
    };
    if (editing.publish_as_article && !editing.is_published) {
      toast.error('Para publicar como artigo, marque "Publicar atualização" primeiro.');
      return;
    }
    await upsert.mutateAsync(payload);
    toast.success(editing.publish_as_article && editing.is_published ? 'Atualização publicada e artigo criado na Central de Ajuda' : 'Atualização salva');
    setEditing(null);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Atualizações da Plataforma</h2>
          <p className="text-muted-foreground text-sm">Publique novidades, melhorias e correções para todos os usuários.</p>
        </div>
        <Button onClick={() => setEditing({ is_published: false, release_types: ['feature'], publish_as_article: false })} className="gap-2">
          <Plus className="h-4 w-4" /> Nova atualização
        </Button>
      </div>

      {releases.length === 0 ? (
        <Card><CardContent className="text-center py-8 text-muted-foreground">Nenhuma atualização cadastrada.</CardContent></Card>
      ) : (
        <div className="space-y-2">
          {releases.map(r => (
            <Card key={r.id}>
              <CardContent className="p-4 flex items-center gap-3">
                <Sparkles className="h-4 w-4 text-primary shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    {r.version && <Badge variant="outline" className="font-mono text-xs">v{r.version}</Badge>}
                    <span className="font-medium truncate">{r.title}</span>
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5 flex gap-1.5">
                    {(r.release_types || []).map(t => <Badge key={t} variant="secondary" className="text-[10px]">{TYPES.find(x => x.key === t)?.label || t}</Badge>)}
                  </div>
                </div>
                <Badge variant={r.is_published ? 'default' : 'outline'} className="gap-1">
                  {r.is_published ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
                  {r.is_published ? 'Publicada' : 'Rascunho'}
                </Badge>
                <Button variant="ghost" size="icon" onClick={() => setEditing(r)}><Pencil className="h-4 w-4" /></Button>
                <Button variant="ghost" size="icon" onClick={() => { if (confirm('Excluir atualização?')) del.mutate(r.id); }}>
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing?.id ? 'Editar atualização' : 'Nova atualização'}</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2">
                  <Label>Título</Label>
                  <Input value={editing.title || ''} onChange={(e) => setEditing({ ...editing, title: e.target.value })} placeholder="Ex: Nova Central de Ajuda" />
                </div>
                <div>
                  <Label>Versão</Label>
                  <Input value={editing.version || ''} onChange={(e) => setEditing({ ...editing, version: e.target.value })} placeholder="1.4.0" />
                </div>
              </div>

              <div>
                <Label>Resumo curto</Label>
                <Textarea rows={2} value={editing.summary || ''} onChange={(e) => setEditing({ ...editing, summary: e.target.value })} />
              </div>

              <div>
                <Label>Tipos de atualização</Label>
                <div className="flex gap-2 mt-1.5 flex-wrap">
                  {TYPES.map(t => {
                    const active = (editing.release_types || []).includes(t.key);
                    const Icon = t.icon;
                    return (
                      <Button key={t.key} type="button" size="sm" variant={active ? 'default' : 'outline'} onClick={() => toggleType(t.key)} className="gap-1.5">
                        <Icon className="h-3.5 w-3.5" /> {t.label}
                      </Button>
                    );
                  })}
                </div>
              </div>

              <div>
                <Label>Conteúdo</Label>
                <RichEditor
                  value={editing.content_json}
                  onChange={(json, html) => setEditing({ ...editing, content_json: json, content_html: html })}
                  placeholder="Descreva o que mudou, com texto, imagens, links e vídeos..."
                />
              </div>

              <div className="space-y-3 p-3 rounded-lg border bg-muted/40">
                <div className="flex items-center gap-3">
                  <Switch checked={!!editing.is_published} onCheckedChange={(v) => setEditing({ ...editing, is_published: v })} />
                  <Label>Publicar atualização (visível na página /novidades)</Label>
                </div>
                <div className="flex items-center gap-3">
                  <Switch checked={!!editing.publish_as_article} onCheckedChange={(v) => setEditing({ ...editing, publish_as_article: v })} />
                  <Label>Publicar também como artigo na Central de Ajuda</Label>
                </div>
                {editing.publish_as_article && (
                  <div>
                    <Label>Categoria do artigo</Label>
                    <Select value={editing.article_category_id || ''} onValueChange={(v) => setEditing({ ...editing, article_category_id: v })}>
                      <SelectTrigger><SelectValue placeholder="Selecione uma categoria" /></SelectTrigger>
                      <SelectContent>
                        {categories.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditing(null)}>Cancelar</Button>
            <Button onClick={save}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
