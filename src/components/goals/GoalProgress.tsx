import { useCurrentGoal } from '@/hooks/useSalesGoals';
import { useAuth } from '@/hooks/useAuth';
import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { 
  Target, 
  TrendingUp, 
  Trophy, 
  Flame,
  Loader2
} from 'lucide-react';
import { format, differenceInDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface GoalProgressProps {
  productId?: string;
}

export function GoalProgress({ productId }: GoalProgressProps) {
  const { user } = useAuth();
  const { data: goal, isLoading } = useCurrentGoal(user?.id || '', productId);

  if (isLoading) {
    return (
      <Card className="p-6">
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      </Card>
    );
  }

  if (!goal) {
    return (
      <Card className="p-6">
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <Target className="h-12 w-12 text-muted-foreground/40 mb-3" />
          <h3 className="font-medium text-foreground mb-1">Sem meta definida</h3>
          <p className="text-sm text-muted-foreground">
            Aguarde seu gestor definir suas metas
          </p>
        </div>
      </Card>
    );
  }

  const valueProgress = goal.target_value > 0 
    ? Math.min(100, ((goal.achieved_value || 0) / goal.target_value) * 100)
    : 0;
  
  const dealsProgress = goal.target_deals > 0
    ? Math.min(100, ((goal.achieved_deals || 0) / goal.target_deals) * 100)
    : 0;

  const daysRemaining = differenceInDays(new Date(goal.period_end), new Date());
  const isOnTrack = valueProgress >= 50 || dealsProgress >= 50;
  const isAchieved = valueProgress >= 100 && dealsProgress >= 100;

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
      minimumFractionDigits: 0
    }).format(value);
  };

  return (
    <Card className="p-6 relative overflow-hidden">
      {/* Background decoration */}
      {isAchieved && (
        <div className="absolute inset-0 bg-gradient-to-br from-green-500/10 to-transparent" />
      )}

      <div className="relative">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
              {isAchieved ? (
                <Trophy className="h-5 w-5 text-yellow-500" />
              ) : (
                <Target className="h-5 w-5 text-primary" />
              )}
            </div>
            <div>
              <h3 className="font-semibold text-foreground">Meta do Período</h3>
              <p className="text-xs text-muted-foreground">
                {format(new Date(goal.period_start), "dd MMM", { locale: ptBR })} - {format(new Date(goal.period_end), "dd MMM", { locale: ptBR })}
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            {isAchieved ? (
              <Badge className="bg-green-500 text-white">
                <Trophy className="h-3 w-3 mr-1" />
                Meta Atingida!
              </Badge>
            ) : isOnTrack ? (
              <Badge variant="secondary" className="bg-primary/10 text-primary">
                <TrendingUp className="h-3 w-3 mr-1" />
                No caminho
              </Badge>
            ) : (
              <Badge variant="outline" className="text-muted-foreground">
                {daysRemaining > 0 ? `${daysRemaining} dias restantes` : 'Prazo encerrado'}
              </Badge>
            )}
          </div>
        </div>

        {/* Value Progress */}
        <div className="space-y-2 mb-6">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Valor em Vendas</span>
            <span className="font-medium text-foreground">
              {formatCurrency(goal.achieved_value || 0)} / {formatCurrency(goal.target_value)}
            </span>
          </div>
          <Progress 
            value={valueProgress} 
            className="h-3"
          />
          <p className="text-xs text-right text-muted-foreground">
            {valueProgress.toFixed(0)}% alcançado
          </p>
        </div>

        {/* Deals Progress */}
        <div className="space-y-2 mb-6">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Número de Vendas</span>
            <span className="font-medium text-foreground">
              {goal.achieved_deals || 0} / {goal.target_deals} deals
            </span>
          </div>
          <Progress 
            value={dealsProgress} 
            className="h-3"
          />
          <p className="text-xs text-right text-muted-foreground">
            {dealsProgress.toFixed(0)}% alcançado
          </p>
        </div>

        {/* Motivation message */}
        {!isAchieved && daysRemaining > 0 && (
          <div className="bg-secondary/50 rounded-lg p-3 flex items-center gap-3">
            <Flame className="h-5 w-5 text-orange-500 flex-shrink-0" />
            <p className="text-sm text-muted-foreground">
              {valueProgress < 25 
                ? "Vamos lá! Cada contato te aproxima da meta."
                : valueProgress < 50
                ? "Bom progresso! Continue focado."
                : valueProgress < 75
                ? "Excelente! Você está quase lá."
                : "Incrível! Falta pouco para a vitória!"
              }
            </p>
          </div>
        )}
      </div>
    </Card>
  );
}
