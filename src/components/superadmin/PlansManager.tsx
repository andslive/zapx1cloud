import { useState } from 'react';
import { Layers, Plus, Pencil, Trash2, Check, X } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import {
  PlatformPlan,
  useAllPlans,
  useDeletePlan,
  usePlanUsageCounts,
} from '@/hooks/usePlatformPlans';
import { PlanFormDialog } from './plans/PlanFormDialog';

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0);

export function PlansManager() {
  const { data: plans, isLoading } = useAllPlans();
  const { data: usage } = usePlanUsageCounts();
  const deletePlan = useDeletePlan();

  const [editing, setEditing] = useState<PlatformPlan | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<PlatformPlan | null>(null);

  const handleDelete = async () => {
    if (!deleting) return;
    const inUse = usage?.[deleting.id] || 0;
    if (inUse > 0) {
      toast.error(`Não é possível excluir: ${inUse} empresa(s) usando este plano.`);
      setDeleting(null);
      return;
    }
    try {
      await deletePlan.mutateAsync(deleting.id);
      toast.success('Plano excluído');
      setDeleting(null);
    } catch (err: any) {
      toast.error(err.message || 'Erro ao excluir plano');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Planos</h1>
          <p className="text-muted-foreground">
            Catálogo de planos comerciais com limites e funcionalidades
          </p>
        </div>
        <Button onClick={() => setCreating(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Novo plano
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-14 w-full" />
              ))}
            </div>
          ) : !plans?.length ? (
            <div className="p-12 text-center">
              <Layers className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
              <p className="text-muted-foreground">Nenhum plano cadastrado</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Plano</TableHead>
                  <TableHead>Mensal</TableHead>
                  <TableHead>Usuários</TableHead>
                  <TableHead>Conexões</TableHead>
                  <TableHead>Setores</TableHead>
                  <TableHead>Empresas</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {plans.map((plan) => {
                  const inUse = usage?.[plan.id] || 0;
                  return (
                    <TableRow key={plan.id}>
                      <TableCell>
                        <div className="flex flex-col">
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{plan.name}</span>
                            {plan.is_default && (
                              <Badge variant="outline" className="text-xs">
                                Padrão
                              </Badge>
                            )}
                          </div>
                          <span className="text-xs text-muted-foreground">{plan.slug}</span>
                        </div>
                      </TableCell>
                      <TableCell>{formatCurrency(plan.price_monthly)}</TableCell>
                      <TableCell>{plan.max_users}</TableCell>
                      <TableCell>{plan.max_connections}</TableCell>
                      <TableCell>{plan.max_sectors}</TableCell>
                      <TableCell>{inUse}</TableCell>
                      <TableCell>
                        {plan.is_active ? (
                          <Badge className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20">
                            <Check className="h-3 w-3 mr-1" />
                            Ativo
                          </Badge>
                        ) : (
                          <Badge variant="secondary">
                            <X className="h-3 w-3 mr-1" />
                            Inativo
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="icon" onClick={() => setEditing(plan)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setDeleting(plan)}
                          disabled={inUse > 0}
                          title={inUse > 0 ? `${inUse} empresa(s) usando` : 'Excluir'}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <PlanFormDialog open={creating} onOpenChange={setCreating} />
      <PlanFormDialog
        open={!!editing}
        onOpenChange={(open) => !open && setEditing(null)}
        plan={editing}
      />

      <AlertDialog open={!!deleting} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir plano?</AlertDialogTitle>
            <AlertDialogDescription>
              O plano "{deleting?.name}" será removido. Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
