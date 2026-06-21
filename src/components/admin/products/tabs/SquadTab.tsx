import { useState } from 'react';
import { useProduct } from '@/hooks/useProducts';
import { useTeamMembers } from '@/hooks/useTeam';
import { useSquads } from '@/hooks/useSquads';
import { useSalesGoals, useCreateSalesGoal, useUpdateSalesGoal } from '@/hooks/useSalesGoals';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Users, Target, TrendingUp, Loader2, Plus, Pencil } from 'lucide-react';
import { toast } from 'sonner';

interface SquadTabProps {
  productId: string;
}

export function SquadTab({ productId }: SquadTabProps) {
  const { profile } = useAuth();
  const { data: product } = useProduct(productId);
  const { data: teamMembers, isLoading: loadingMembers } = useTeamMembers();
  const { data: squads } = useSquads();
  const { data: goals } = useSalesGoals(undefined, productId);
  const createGoal = useCreateSalesGoal();
  const updateGoal = useUpdateSalesGoal();

  const [goalDialogOpen, setGoalDialogOpen] = useState(false);
  const [selectedMember, setSelectedMember] = useState<string | null>(null);
  const [goalValue, setGoalValue] = useState('');

  // Get product squads
  const productSquads = squads?.filter(s => s.product_id === productId) || [];
  
  // Get members assigned to this product's squads
  const assignedMembers = teamMembers?.filter(member => {
    const memberSquads = productSquads.filter(squad => {
      // Check if member is in this squad
      return squad.leader_id === member.id;
    });
    return memberSquads.length > 0;
  }) || [];

  // All active team members (for now showing all)
  const availableMembers = teamMembers || [];

  const productGoals = goals || [];

  const getMemberGoal = (userId: string) => {
    return productGoals.find(g => g.user_id === userId && g.is_active);
  };

  const getMemberStats = (userId: string) => {
    const goal = getMemberGoal(userId);
    if (!goal) return { target: 0, achieved: 0, progress: 0 };
    
    return {
      target: goal.target_value,
      achieved: goal.achieved_value || 0,
      progress: goal.target_value > 0 
        ? Math.round((goal.achieved_value || 0) / goal.target_value * 100)
        : 0,
    };
  };

  const openGoalDialog = (memberId: string) => {
    const existingGoal = getMemberGoal(memberId);
    setSelectedMember(memberId);
    setGoalValue(existingGoal?.target_value?.toString() || '');
    setGoalDialogOpen(true);
  };

  const handleSaveGoal = async () => {
    if (!selectedMember || !goalValue || !profile?.organization_id) return;

    const existingGoal = getMemberGoal(selectedMember);
    const now = new Date();
    const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    try {
      if (existingGoal) {
        await updateGoal.mutateAsync({
          id: existingGoal.id,
          target_value: parseFloat(goalValue),
        });
      } else {
        await createGoal.mutateAsync({
          user_id: selectedMember,
          product_id: productId,
          organization_id: profile.organization_id,
          created_by: profile.id,
          target_value: parseFloat(goalValue),
          target_deals: 0,
          period_start: periodStart.toISOString(),
          period_end: periodEnd.toISOString(),
          is_active: true,
        });
      }
      toast.success('Meta salva!');
      setGoalDialogOpen(false);
    } catch (error) {
      toast.error('Erro ao salvar meta');
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
      minimumFractionDigits: 0,
    }).format(value);
  };

  if (loadingMembers) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="bg-card">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <Users className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{availableMembers.length}</p>
                <p className="text-sm text-muted-foreground">Vendedores</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-success/10 flex items-center justify-center">
                <Target className="h-5 w-5 text-success" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">
                  {formatCurrency(productGoals.reduce((sum, g) => sum + (g.target_value || 0), 0))}
                </p>
                <p className="text-sm text-muted-foreground">Meta Total</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-accent/10 flex items-center justify-center">
                <TrendingUp className="h-5 w-5 text-accent" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">
                  {formatCurrency(productGoals.reduce((sum, g) => sum + (g.achieved_value || 0), 0))}
                </p>
                <p className="text-sm text-muted-foreground">Alcançado</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Team Members */}
      <Card className="bg-card">
        <CardHeader>
          <CardTitle className="text-base">Vendedores e Metas</CardTitle>
          <CardDescription>Gerencie as metas individuais de cada vendedor</CardDescription>
        </CardHeader>
        <CardContent>
          {availableMembers.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              Nenhum vendedor cadastrado na equipe
            </p>
          ) : (
            <div className="space-y-3">
              {availableMembers.map((member) => {
                const stats = getMemberStats(member.id);
                const hasGoal = stats.target > 0;

                return (
                  <div 
                    key={member.id} 
                    className="flex items-center justify-between p-4 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <Avatar className="h-10 w-10">
                        <AvatarImage src={member.avatar_url || ''} />
                        <AvatarFallback>
                          {member.full_name?.slice(0, 2).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="font-medium text-foreground">{member.full_name}</p>
                        <p className="text-sm text-muted-foreground">{member.email}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-4">
                      {hasGoal ? (
                        <div className="text-right">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-foreground">
                              {formatCurrency(stats.achieved)} / {formatCurrency(stats.target)}
                            </span>
                            <Badge 
                              variant="outline" 
                              className={stats.progress >= 100 
                                ? 'bg-success/10 text-success' 
                                : stats.progress >= 50 
                                  ? 'bg-warning/10 text-warning'
                                  : 'bg-muted text-muted-foreground'
                              }
                            >
                              {stats.progress}%
                            </Badge>
                          </div>
                          <div className="w-32 h-2 bg-muted rounded-full mt-1">
                            <div 
                              className="h-full bg-primary rounded-full transition-all"
                              style={{ width: `${Math.min(stats.progress, 100)}%` }}
                            />
                          </div>
                        </div>
                      ) : (
                        <span className="text-sm text-muted-foreground">Sem meta definida</span>
                      )}

                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => openGoalDialog(member.id)}
                      >
                        {hasGoal ? (
                          <Pencil className="h-4 w-4" />
                        ) : (
                          <Plus className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Goal Dialog */}
      <Dialog open={goalDialogOpen} onOpenChange={setGoalDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Definir Meta</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="goalValue">Meta mensal (R$)</Label>
              <Input
                id="goalValue"
                type="number"
                value={goalValue}
                onChange={(e) => setGoalValue(e.target.value)}
                placeholder="Ex: 50000"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setGoalDialogOpen(false)}>
              Cancelar
            </Button>
            <Button 
              onClick={handleSaveGoal}
              disabled={createGoal.isPending || updateGoal.isPending}
            >
              {(createGoal.isPending || updateGoal.isPending) && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
