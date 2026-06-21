import { Target, Trophy, TrendingUp, Medal } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import { useSalesGoals } from '@/hooks/useSalesGoals';

interface MobileGoalsViewProps {
  userId: string;
  productId?: string;
}

export function MobileGoalsView({ userId, productId }: MobileGoalsViewProps) {
  const { data: goals = [], isLoading } = useSalesGoals(userId, productId);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  // Mock leaderboard data - in production, this would come from a hook
  const leaderboard = [
    { name: 'João Silva', value: 45000, position: 1 },
    { name: 'Maria Santos', value: 38000, position: 2 },
    { name: 'Pedro Lima', value: 32000, position: 3 },
    { name: 'Ana Costa', value: 28000, position: 4 },
    { name: 'Lucas Oliveira', value: 25000, position: 5 },
  ];

  const currentGoal = goals[0];
  const targetValue = currentGoal?.target_value || 50000;
  const achievedValue = currentGoal?.achieved_value || 0;
  const percentage = Math.min((achievedValue / targetValue) * 100, 100);

  return (
    <div className="p-4 space-y-4">
      {/* Main Goal Card */}
      <Card className="p-5 bg-gradient-to-br from-primary/10 to-transparent border-primary/20">
        <div className="flex items-center gap-3 mb-4">
          <div className="h-10 w-10 rounded-full bg-primary/20 flex items-center justify-center">
            <Target size={20} className="text-primary" />
          </div>
          <div>
            <h3 className="font-semibold text-foreground">Meta do Mês</h3>
            <p className="text-xs text-muted-foreground">Janeiro 2026</p>
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex items-end justify-between">
            <div>
              <span className="text-2xl font-bold text-foreground">
                {formatCurrency(achievedValue)}
              </span>
              <span className="text-sm text-muted-foreground ml-2">
                de {formatCurrency(targetValue)}
              </span>
            </div>
            <span className={cn(
              "text-lg font-bold",
              percentage >= 100 ? "text-green-500" : 
              percentage >= 75 ? "text-primary" :
              percentage >= 50 ? "text-yellow-500" : "text-muted-foreground"
            )}>
              {percentage.toFixed(0)}%
            </span>
          </div>

          <Progress value={percentage} className="h-3" />

          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <TrendingUp size={14} className="text-green-500" />
            <span>Faltam {formatCurrency(Math.max(targetValue - achievedValue, 0))} para a meta</span>
          </div>
        </div>
      </Card>

      {/* Quick Stats */}
      <div className="grid grid-cols-2 gap-3">
        <Card className="p-4 bg-card">
          <div className="flex items-center gap-2 mb-2">
            <Trophy size={16} className="text-yellow-500" />
            <span className="text-xs text-muted-foreground">Posição</span>
          </div>
          <span className="text-2xl font-bold text-foreground">3º</span>
          <p className="text-xs text-muted-foreground">no ranking</p>
        </Card>

        <Card className="p-4 bg-card">
          <div className="flex items-center gap-2 mb-2">
            <Medal size={16} className="text-primary" />
            <span className="text-xs text-muted-foreground">Vendas</span>
          </div>
          <span className="text-2xl font-bold text-foreground">
            {currentGoal?.achieved_deals || 8}
          </span>
          <p className="text-xs text-muted-foreground">
            de {currentGoal?.target_deals || 15} mês
          </p>
        </Card>
      </div>

      {/* Leaderboard */}
      <Card className="p-4 bg-card">
        <div className="flex items-center gap-2 mb-4">
          <Trophy size={18} className="text-yellow-500" />
          <h3 className="font-semibold text-foreground">Ranking do Mês</h3>
        </div>

        <div className="space-y-3">
          {leaderboard.map((seller, index) => (
            <div 
              key={seller.name}
              className={cn(
                "flex items-center gap-3 p-2 rounded-lg",
                index === 0 && "bg-yellow-500/10",
                index === 1 && "bg-gray-400/10",
                index === 2 && "bg-amber-600/10"
              )}
            >
              <span className={cn(
                "w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold",
                index === 0 && "bg-yellow-500 text-yellow-950",
                index === 1 && "bg-gray-400 text-gray-950",
                index === 2 && "bg-amber-600 text-amber-950",
                index > 2 && "bg-muted text-muted-foreground"
              )}>
                {seller.position}
              </span>

              <Avatar className="h-8 w-8">
                <AvatarFallback className="text-xs bg-secondary">
                  {seller.name.split(' ').map(n => n[0]).join('')}
                </AvatarFallback>
              </Avatar>

              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">
                  {seller.name}
                </p>
              </div>

              <span className="text-sm font-semibold text-foreground">
                {formatCurrency(seller.value)}
              </span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
