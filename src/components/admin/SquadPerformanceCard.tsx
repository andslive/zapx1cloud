import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Squad } from '@/hooks/useSquads';
import { useSquadPerformance } from '@/hooks/useSquadPerformance';
import { Users, TrendingUp, Target, ChevronRight, Loader2 } from 'lucide-react';

interface SquadPerformanceCardProps {
  squad: Squad;
  onViewDetails?: () => void;
  onManageMembers?: () => void;
}

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(value);
};

export function SquadPerformanceCard({ squad, onViewDetails, onManageMembers }: SquadPerformanceCardProps) {
  const { data: performance, isLoading } = useSquadPerformance(squad.id);

  return (
    <Card className="gradient-card border-border overflow-hidden hover:border-primary/50 transition-colors">
      {/* Header with color bar */}
      <div 
        className="h-2" 
        style={{ backgroundColor: squad.color || 'hsl(var(--primary))' }}
      />
      
      <CardContent className="p-5">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            {squad.icon_url ? (
              <Avatar className="h-12 w-12">
                <AvatarImage src={squad.icon_url} alt={squad.name} />
                <AvatarFallback style={{ backgroundColor: squad.color || undefined }}>
                  {squad.name.charAt(0)}
                </AvatarFallback>
              </Avatar>
            ) : (
              <div 
                className="w-12 h-12 rounded-full flex items-center justify-center text-lg font-bold text-primary-foreground"
                style={{ backgroundColor: squad.color || 'hsl(var(--primary))' }}
              >
                {squad.name.charAt(0)}
              </div>
            )}
            <div>
              <h3 className="font-semibold text-foreground">{squad.name}</h3>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Users className="h-3 w-3" />
                <span>{squad.members_count || 0} membros</span>
                {squad.product?.name && (
                  <>
                    <span>•</span>
                    <span>{squad.product.name}</span>
                  </>
                )}
              </div>
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={onViewDetails}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-4">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
          </div>
        ) : (
          <>
            {/* Stats Grid */}
            <div className="grid grid-cols-3 gap-3 mb-4">
              <div className="text-center p-2 rounded-lg bg-muted/50">
                <p className="text-lg font-bold text-foreground">
                  {formatCurrency(performance?.totalValue || 0)}
                </p>
                <p className="text-xs text-muted-foreground">Vendas</p>
              </div>
              <div className="text-center p-2 rounded-lg bg-muted/50">
                <p className="text-lg font-bold text-foreground">
                  {performance?.totalDeals || 0}
                </p>
                <p className="text-xs text-muted-foreground">Deals</p>
              </div>
              <div className="text-center p-2 rounded-lg bg-muted/50">
                <p className="text-lg font-bold text-foreground">
                  {(performance?.conversionRate || 0).toFixed(0)}%
                </p>
                <p className="text-xs text-muted-foreground">Conversão</p>
              </div>
            </div>

            {/* Progress Bar */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground flex items-center gap-1">
                  <Target className="h-3 w-3" /> Meta
                </span>
                <span className="font-medium text-foreground">
                  {(performance?.progressPercent || 0).toFixed(0)}%
                </span>
              </div>
              <Progress value={performance?.progressPercent || 0} className="h-2" />
              <p className="text-xs text-muted-foreground">
                {formatCurrency(performance?.totalValue || 0)} de {formatCurrency(performance?.targetValue || 0)}
              </p>
            </div>

            {/* Top Seller */}
            {performance?.topSeller && (
              <div className="mt-4 pt-4 border-t border-border">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Top vendedor</span>
                  <Badge variant="outline" className="text-xs">
                    <TrendingUp className="h-3 w-3 mr-1" />
                    {performance.topSeller.name}
                  </Badge>
                </div>
              </div>
            )}
          </>
        )}

        {/* Actions */}
        <div className="mt-4 pt-4 border-t border-border">
          <Button 
            variant="outline" 
            size="sm" 
            className="w-full"
            onClick={onManageMembers}
          >
            <Users className="h-4 w-4 mr-2" />
            Gerenciar Membros
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
