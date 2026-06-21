import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import {
  Plus, Pencil, Trash2, LayoutGrid,
  Building2, Headphones, ShoppingCart, Wallet, Heart, Wrench,
  Users, MessageSquare, Phone, Mail, Star, Briefcase, Target,
} from 'lucide-react';
import { toast } from 'sonner';
import { Sector, useSectors, useDeleteSector } from '@/hooks/useSectors';
import { SectorFormDialog } from './SectorFormDialog';

const SECTOR_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  Building2, Headphones, ShoppingCart, Wallet, Heart, Wrench,
  Users, MessageSquare, Phone, Mail, Star, Briefcase, Target,
};

export function SectorsManager() {
  const { data: sectors, isLoading } = useSectors();
  const deleteSector = useDeleteSector();

  const [editing, setEditing] = useState<Sector | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [toDelete, setToDelete] = useState<Sector | null>(null);

  const handleAdd = () => {
    setEditing(null);
    setDialogOpen(true);
  };

  const handleEdit = (s: Sector) => {
    setEditing(s);
    setDialogOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!toDelete) return;
    try {
      await deleteSector.mutateAsync(toDelete.id);
      toast.success('Setor removido');
      setToDelete(null);
    } catch (err: any) {
      toast.error(err?.message || 'Erro ao remover setor');
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <LayoutGrid className="h-5 w-5 text-primary" />
            Setores ({sectors?.length || 0})
          </h3>
          <p className="text-sm text-muted-foreground">
            Filas de atendimento. Atribua membros aos setores que devem ter acesso.
          </p>
        </div>
        <Button onClick={handleAdd}>
          <Plus className="h-4 w-4 mr-2" />
          Adicionar Setor
        </Button>
      </div>

      {!sectors || sectors.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <LayoutGrid className="h-10 w-10 mx-auto text-muted-foreground/50 mb-3" />
            <p className="text-sm text-muted-foreground">Nenhum setor cadastrado</p>
            <Button onClick={handleAdd} className="mt-4" size="sm">
              <Plus className="h-4 w-4 mr-2" /> Criar primeiro setor
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-xs text-muted-foreground">
                  <tr>
                    <th className="text-left px-4 py-2.5 font-medium">Setor</th>
                    <th className="text-left px-4 py-2.5 font-medium">Ordem</th>
                    <th className="text-left px-4 py-2.5 font-medium">Status</th>
                    <th className="text-left px-4 py-2.5 font-medium">Membros</th>
                    <th className="text-right px-4 py-2.5 font-medium">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {sectors.map((s) => {
                    const Ico = SECTOR_ICONS[s.icon || 'Building2'] || Building2;
                    const color = s.color || '#999';
                    return (
                    <tr key={s.id} className="border-t border-border hover:bg-muted/30 transition">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <span
                            className="inline-flex items-center justify-center h-9 w-9 rounded-lg shrink-0"
                            style={{ backgroundColor: `${color}20`, color }}
                          >
                            <Ico className="h-4 w-4" />
                          </span>
                          <div className="font-medium text-foreground">{s.name}</div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{s.bot_order ?? '-'}</td>
                      <td className="px-4 py-3">
                        {s.is_active ? (
                          <span className="inline-flex items-center gap-1.5 text-xs text-emerald-600">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Ativo
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                            <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/50" /> Inativo
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {s.members && s.members.length > 0 ? (
                          <div className="flex items-center -space-x-2">
                            {s.members.slice(0, 4).map((m) => (
                              <Avatar key={m.user_id} className="h-6 w-6 border-2 border-background">
                                <AvatarImage src={m.avatar_url || ''} />
                                <AvatarFallback className="text-[10px]">
                                  {m.full_name?.charAt(0) || '?'}
                                </AvatarFallback>
                              </Avatar>
                            ))}
                            {s.members.length > 4 && (
                              <span className="ml-3 text-xs text-muted-foreground">
                                +{s.members.length - 4}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground italic">Sem membros</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Button variant="ghost" size="icon" onClick={() => handleEdit(s)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-destructive hover:text-destructive"
                          onClick={() => setToDelete(s)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </td>
                    </tr>
                  );
                })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      <SectorFormDialog sector={editing} open={dialogOpen} onOpenChange={setDialogOpen} />

      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover setor</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja remover <strong>{toDelete?.name}</strong>? Conversas e leads vinculados perderão a referência ao setor.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleConfirmDelete}
            >
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
