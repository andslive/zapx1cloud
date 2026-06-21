import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Tag as TagIcon, Plus, Pencil, Trash2, Sparkles, Zap } from 'lucide-react';
import { useLeadTags, useDeleteLeadTag } from '@/hooks/useLeadTags';
import { TagFormDialog } from './TagFormDialog';
import { TagAutomationsPanel } from './TagAutomationsPanel';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

export function TagsManager() {
  const [editingTag, setEditingTag] = useState<any>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const { data: tags, isLoading } = useLeadTags();
  const deleteMut = useDeleteLeadTag();

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Etiquetas</h1>
          <p className="text-sm text-muted-foreground">
            Organize seus leads com etiquetas manuais ou automáticas baseadas em eventos.
          </p>
        </div>
      </div>

      <Tabs defaultValue="catalog" className="space-y-4">
        <TabsList>
          <TabsTrigger value="catalog" className="gap-2">
            <TagIcon className="h-4 w-4" /> Catálogo
          </TabsTrigger>
          <TabsTrigger value="automations" className="gap-2">
            <Zap className="h-4 w-4" /> Automações
          </TabsTrigger>
        </TabsList>

        <TabsContent value="catalog" className="space-y-4">
          <div className="flex justify-end">
            <Button onClick={() => { setEditingTag(null); setDialogOpen(true); }}>
              <Plus className="h-4 w-4 mr-2" /> Nova etiqueta
            </Button>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Suas etiquetas</CardTitle>
              <CardDescription>Aplicadas manualmente, por fluxos, por agentes IA ou por automações.</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="space-y-2">
                  {[1,2,3].map((i) => <Skeleton key={i} className="h-14 w-full" />)}
                </div>
              ) : !tags || tags.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <TagIcon className="h-10 w-10 mx-auto mb-3 opacity-40" />
                  <p>Nenhuma etiqueta criada ainda.</p>
                  <Button variant="link" onClick={() => { setEditingTag(null); setDialogOpen(true); }}>
                    Criar a primeira
                  </Button>
                </div>
              ) : (
                <div className="space-y-2">
                  {tags.map((tag) => (
                    <div key={tag.id} className="flex items-center gap-3 p-3 rounded-lg border border-border hover:bg-muted/40 transition-colors">
                      <div
                        className="h-4 w-4 rounded-full shrink-0 border border-border"
                        style={{ backgroundColor: tag.color }}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium truncate">{tag.name}</span>
                          {tag.is_automatic && (
                            <Badge variant="secondary" className="gap-1 text-xs">
                              <Sparkles className="h-3 w-3" /> Automática
                            </Badge>
                          )}
                          <Badge variant="outline" className="text-xs">
                            {tag.leads_count ?? 0} {tag.leads_count === 1 ? 'lead' : 'leads'}
                          </Badge>
                        </div>
                        {tag.description && (
                          <p className="text-xs text-muted-foreground truncate mt-0.5">{tag.description}</p>
                        )}
                      </div>
                      <Button variant="ghost" size="icon" onClick={() => { setEditingTag(tag); setDialogOpen(true); }}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="icon" className="text-destructive">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Remover etiqueta?</AlertDialogTitle>
                            <AlertDialogDescription>
                              A etiqueta "{tag.name}" será removida de todos os leads. Esta ação não pode ser desfeita.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                            <AlertDialogAction
                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                              onClick={() => deleteMut.mutate(tag.id)}
                            >
                              Remover
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="automations">
          <TagAutomationsPanel />
        </TabsContent>
      </Tabs>

      <TagFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        tag={editingTag}
      />
    </div>
  );
}
