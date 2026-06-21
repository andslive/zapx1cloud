import { useState } from 'react';
import { useProducts } from '@/hooks/useProducts';
import { useTeamMembers } from '@/hooks/useTeam';
import { useProductAssignments, useAssignProduct, useUnassignProduct, useUpdateAssignment } from '@/hooks/useTeam';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { Plus, Trash2, Target, Package, Users, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

export function AssignmentManager() {
  const { user } = useAuth();
  const { data: products, isLoading: loadingProducts } = useProducts();
  const { data: members, isLoading: loadingMembers } = useTeamMembers();
  const { data: assignments, isLoading: loadingAssignments } = useProductAssignments();
  
  const assignProduct = useAssignProduct();
  const unassignProduct = useUnassignProduct();
  const updateAssignment = useUpdateAssignment();

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [selectedProductId, setSelectedProductId] = useState('');
  const [monthlyGoal, setMonthlyGoal] = useState('');

  const sellers = members?.filter(m => 
    m.roles.some(r => r.role === 'seller')
  ) || [];

  const handleAssign = async () => {
    if (!selectedUserId || !selectedProductId) {
      toast.error('Selecione vendedor e produto');
      return;
    }

    try {
      await assignProduct.mutateAsync({
        userId: selectedUserId,
        productId: selectedProductId,
        monthlyGoal: monthlyGoal ? parseFloat(monthlyGoal) : 0,
        assignedBy: user?.id,
      });
      toast.success('Produto atribuído!');
      setIsDialogOpen(false);
      setSelectedUserId('');
      setSelectedProductId('');
      setMonthlyGoal('');
    } catch (error: any) {
      // Handle duplicate key error gracefully
      if (error?.code === '23505') {
        toast.error('Este vendedor já está atribuído a este produto');
      } else {
        toast.error('Erro ao atribuir produto');
      }
    }
  };

  const handleUnassign = async (assignmentId: string) => {
    try {
      await unassignProduct.mutateAsync(assignmentId);
      toast.success('Atribuição removida!');
    } catch (error) {
      toast.error('Erro ao remover atribuição');
    }
  };

  const handleUpdateGoal = async (assignmentId: string, newGoal: number) => {
    try {
      await updateAssignment.mutateAsync({ id: assignmentId, monthlyGoal: newGoal });
      toast.success('Meta atualizada!');
    } catch (error) {
      toast.error('Erro ao atualizar meta');
    }
  };

  const isLoading = loadingProducts || loadingMembers || loadingAssignments;

  // Group assignments by product
  const assignmentsByProduct = products?.map(product => ({
    product,
    assignments: assignments?.filter(a => a.product_id === product.id) || [],
  })) || [];

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <Skeleton className="h-6 w-32" />
            <Skeleton className="h-4 w-48" />
          </div>
          <Skeleton className="h-10 w-40" />
        </div>
        
        {[1, 2, 3].map((i) => (
          <Card key={i} className="bg-card">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-3">
                <Skeleton className="h-10 w-10 rounded-lg" />
                <div className="space-y-2">
                  <Skeleton className="h-5 w-32" />
                  <Skeleton className="h-4 w-24" />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {[1, 2].map((j) => (
                  <div key={j} className="flex items-center justify-between p-3 rounded-lg bg-muted/30">
                    <div className="flex items-center gap-3">
                      <Skeleton className="h-10 w-10 rounded-full" />
                      <div className="space-y-2">
                        <Skeleton className="h-4 w-28" />
                        <Skeleton className="h-3 w-36" />
                      </div>
                    </div>
                    <Skeleton className="h-8 w-24" />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-foreground">Atribuições</h2>
          <p className="text-sm text-muted-foreground">
            Vincule vendedores aos produtos e defina metas
          </p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <Button onClick={() => setIsDialogOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Nova Atribuição
          </Button>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Atribuir Produto</DialogTitle>
            </DialogHeader>
            
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Vendedor</label>
                <Select value={selectedUserId} onValueChange={setSelectedUserId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione um vendedor" />
                  </SelectTrigger>
                  <SelectContent>
                    {sellers.map(seller => (
                      <SelectItem key={seller.id} value={seller.id}>
                        <div className="flex items-center gap-2">
                          <Avatar className="h-6 w-6">
                            <AvatarImage src={seller.avatar_url || ''} />
                            <AvatarFallback className="text-xs">
                              {seller.full_name?.charAt(0)}
                            </AvatarFallback>
                          </Avatar>
                          {seller.full_name}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Produto</label>
                <Select value={selectedProductId} onValueChange={setSelectedProductId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione um produto" />
                  </SelectTrigger>
                  <SelectContent>
                    {products?.map(product => (
                      <SelectItem key={product.id} value={product.id}>
                        <div className="flex items-center gap-2">
                          <Package className="h-4 w-4 text-primary" />
                          {product.name}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Meta Mensal (opcional)</label>
                <Input
                  type="number"
                  value={monthlyGoal}
                  onChange={(e) => setMonthlyGoal(e.target.value)}
                  placeholder="Ex: 25"
                />
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                Cancelar
              </Button>
              <Button onClick={handleAssign} disabled={assignProduct.isPending}>
                {assignProduct.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Atribuir
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="space-y-6">
        {assignmentsByProduct.map(({ product, assignments }) => (
          <Card key={product.id} className="bg-card">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Package className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <CardTitle className="text-base">{product.name}</CardTitle>
                  <p className="text-sm text-muted-foreground">
                    {assignments.length} vendedor{assignments.length !== 1 ? 'es' : ''} atribuído{assignments.length !== 1 ? 's' : ''}
                  </p>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {assignments.length > 0 ? (
                <div className="space-y-3">
                  {assignments.map((assignment: any) => (
                    <div 
                      key={assignment.id}
                      className="flex items-center justify-between p-3 rounded-lg bg-muted/30"
                    >
                      <div className="flex items-center gap-3">
                        <Avatar>
                          <AvatarImage src={assignment.profiles?.avatar_url || ''} />
                          <AvatarFallback>
                            {assignment.profiles?.full_name?.charAt(0) || 'U'}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="font-medium text-sm">
                            {assignment.profiles?.full_name || 'Usuário'}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {assignment.profiles?.email}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        <div className="flex items-center gap-2">
                          <Target className="h-4 w-4 text-muted-foreground" />
                          <Input
                            type="number"
                            value={assignment.monthly_goal || 0}
                            onChange={(e) => handleUpdateGoal(assignment.id, parseFloat(e.target.value) || 0)}
                            className="w-20 h-8 text-center"
                          />
                          <span className="text-xs text-muted-foreground">/mês</span>
                        </div>
                        
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Remover atribuição?</AlertDialogTitle>
                              <AlertDialogDescription>
                                O vendedor perderá acesso a este produto.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancelar</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => handleUnassign(assignment.id)}
                                className="bg-destructive text-destructive-foreground"
                              >
                                Remover
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-6 text-muted-foreground text-sm">
                  <Users className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  Nenhum vendedor atribuído
                </div>
              )}
            </CardContent>
          </Card>
        ))}

        {(!products || products.length === 0) && (
          <Card className="bg-card">
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Package className="h-12 w-12 text-muted-foreground/50 mb-4" />
              <h3 className="text-lg font-medium text-foreground mb-1">Nenhum produto</h3>
              <p className="text-sm text-muted-foreground">
                Crie produtos primeiro para fazer atribuições
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
