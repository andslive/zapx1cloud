import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Package, Loader2, Target } from 'lucide-react';
import { toast } from 'sonner';
import { useProducts } from '@/hooks/useProducts';
import { useAssignProduct, useUnassignProduct, TeamMember } from '@/hooks/useTeam';
import { useAuth } from '@/hooks/useAuth';

interface ProductAssignment {
  productId: string;
  selected: boolean;
  monthlyGoal: number;
  assignmentId?: string;
}

interface AssignProductDialogProps {
  member: TeamMember | null;
  existingAssignments: Array<{
    id: string;
    product_id: string;
    monthly_goal: number | null;
  }>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AssignProductDialog({ 
  member, 
  existingAssignments,
  open, 
  onOpenChange 
}: AssignProductDialogProps) {
  const { data: products, isLoading: productsLoading } = useProducts();
  const assignProduct = useAssignProduct();
  const unassignProduct = useUnassignProduct();
  const { user } = useAuth();
  
  const [assignments, setAssignments] = useState<ProductAssignment[]>([]);
  const [saving, setSaving] = useState(false);

  // Initialize assignments when dialog opens
  useEffect(() => {
    if (open && products && member) {
      const initialAssignments = products.map(product => {
        const existing = existingAssignments.find(a => a.product_id === product.id);
        return {
          productId: product.id,
          selected: !!existing,
          monthlyGoal: existing?.monthly_goal || 0,
          assignmentId: existing?.id,
        };
      });
      setAssignments(initialAssignments);
    }
  }, [open, products, member, existingAssignments]);

  const toggleProduct = (productId: string) => {
    setAssignments(prev => prev.map(a => 
      a.productId === productId 
        ? { ...a, selected: !a.selected }
        : a
    ));
  };

  const updateGoal = (productId: string, goal: number) => {
    setAssignments(prev => prev.map(a => 
      a.productId === productId 
        ? { ...a, monthlyGoal: goal }
        : a
    ));
  };

  const handleSave = async () => {
    if (!member) return;
    
    setSaving(true);
    try {
      const promises: Promise<any>[] = [];
      
      for (const assignment of assignments) {
        const wasAssigned = existingAssignments.some(a => a.product_id === assignment.productId);
        
        if (assignment.selected && !wasAssigned) {
          // New assignment
          promises.push(
            assignProduct.mutateAsync({
              userId: member.id,
              productId: assignment.productId,
              monthlyGoal: assignment.monthlyGoal,
              assignedBy: user?.id,
            })
          );
        } else if (assignment.selected && wasAssigned) {
          // Update existing (only if goal changed)
          const existing = existingAssignments.find(a => a.product_id === assignment.productId);
          if (existing && existing.monthly_goal !== assignment.monthlyGoal) {
            promises.push(
              assignProduct.mutateAsync({
                userId: member.id,
                productId: assignment.productId,
                monthlyGoal: assignment.monthlyGoal,
                assignedBy: user?.id,
              })
            );
          }
        } else if (!assignment.selected && wasAssigned && assignment.assignmentId) {
          // Unassign
          promises.push(unassignProduct.mutateAsync(assignment.assignmentId));
        }
      }
      
      await Promise.all(promises);
      toast.success('Atribuições atualizadas com sucesso!');
      onOpenChange(false);
    } catch (error: any) {
      console.error('Error updating assignments:', error);
      toast.error('Erro ao atualizar atribuições');
    } finally {
      setSaving(false);
    }
  };

  const selectedCount = assignments.filter(a => a.selected).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Atribuir Produtos</DialogTitle>
        </DialogHeader>
        
        {member && (
          <div className="space-y-4">
            {/* Member Info */}
            <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
              <Avatar className="h-10 w-10">
                <AvatarImage src={member.avatar_url || ''} />
                <AvatarFallback className="bg-primary/10 text-primary">
                  {member.full_name?.charAt(0)}
                </AvatarFallback>
              </Avatar>
              <div>
                <p className="font-medium">{member.full_name}</p>
                <p className="text-sm text-muted-foreground">{member.email}</p>
              </div>
            </div>

            {/* Products List */}
            <div className="space-y-2">
              <p className="text-sm font-medium text-muted-foreground">
                Selecione os produtos ({selectedCount} selecionado{selectedCount !== 1 ? 's' : ''}):
              </p>
              
              {productsLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : products?.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Package className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p>Nenhum produto cadastrado</p>
                </div>
              ) : (
                <ScrollArea className="h-[280px] pr-4">
                  <div className="space-y-3">
                    {products?.map(product => {
                      const assignment = assignments.find(a => a.productId === product.id);
                      const isSelected = assignment?.selected || false;
                      
                      return (
                        <div 
                          key={product.id}
                          className={`p-3 rounded-lg border transition-colors ${
                            isSelected 
                              ? 'border-primary bg-primary/5' 
                              : 'border-border hover:border-muted-foreground/30'
                          }`}
                        >
                          <div className="flex items-start gap-3">
                            <Checkbox
                              id={product.id}
                              checked={isSelected}
                              onCheckedChange={() => toggleProduct(product.id)}
                              className="mt-1"
                            />
                            <div className="flex-1 min-w-0">
                              <label 
                                htmlFor={product.id}
                                className="font-medium cursor-pointer block"
                              >
                                {product.name}
                              </label>
                              {product.description && (
                                <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">
                                  {product.description}
                                </p>
                              )}
                              
                              {isSelected && (
                                <div className="mt-3 flex items-center gap-2">
                                  <Target className="h-4 w-4 text-muted-foreground shrink-0" />
                                  <Input
                                    type="number"
                                    min="0"
                                    placeholder="0"
                                    value={assignment?.monthlyGoal || ''}
                                    onChange={(e) => updateGoal(product.id, parseInt(e.target.value) || 0)}
                                    className="h-8 w-24"
                                  />
                                  <span className="text-xs text-muted-foreground">vendas/mês</span>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </ScrollArea>
              )}
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Salvar Atribuições
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
