import { useLeaderboard } from '@/hooks/useSalesGoals';
import { Card } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  Trophy, 
  Medal,
  TrendingUp,
  Loader2
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface LeaderboardProps {
  productId?: string;
  period?: { start: string; end: string };
  maxHeight?: string;
}

export function Leaderboard({ productId, period, maxHeight = "400px" }: LeaderboardProps) {
  const { data: leaderboard, isLoading } = useLeaderboard(productId, period);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
      minimumFractionDigits: 0
    }).format(value);
  };

  const getPositionIcon = (position: number) => {
    switch (position) {
      case 1:
        return <Trophy className="h-5 w-5 text-yellow-500" />;
      case 2:
        return <Medal className="h-5 w-5 text-gray-400" />;
      case 3:
        return <Medal className="h-5 w-5 text-amber-600" />;
      default:
        return (
          <span className="h-5 w-5 flex items-center justify-center text-sm font-medium text-muted-foreground">
            {position}
          </span>
        );
    }
  };

  const getPositionClass = (position: number) => {
    switch (position) {
      case 1:
        return "bg-gradient-to-r from-yellow-500/10 to-transparent border-yellow-500/30";
      case 2:
        return "bg-gradient-to-r from-gray-400/10 to-transparent border-gray-400/30";
      case 3:
        return "bg-gradient-to-r from-amber-600/10 to-transparent border-amber-600/30";
      default:
        return "";
    }
  };

  if (isLoading) {
    return (
      <Card className="p-6">
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-border bg-secondary/30">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <TrendingUp className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h3 className="font-semibold text-foreground">Ranking de Vendedores</h3>
            <p className="text-xs text-muted-foreground">
              {period ? 'Período selecionado' : 'Todos os tempos'}
            </p>
          </div>
        </div>
      </div>

      {/* Leaderboard List */}
      <ScrollArea style={{ maxHeight }}>
        {leaderboard && leaderboard.length > 0 ? (
          <div className="divide-y divide-border">
            {leaderboard.map((seller, index) => {
              const position = index + 1;
              return (
                <div
                  key={seller.userId}
                  className={cn(
                    "flex items-center gap-4 p-4 transition-colors hover:bg-secondary/50",
                    getPositionClass(position)
                  )}
                >
                  {/* Position */}
                  <div className="w-8 flex items-center justify-center">
                    {getPositionIcon(position)}
                  </div>

                  {/* Avatar & Name */}
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <Avatar className="h-10 w-10 border-2 border-background">
                      <AvatarImage src={seller.avatarUrl || undefined} />
                      <AvatarFallback className="bg-primary/10 text-primary font-medium">
                        {seller.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <p className="font-medium text-foreground truncate">
                        {seller.name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {seller.totalDeals} {seller.totalDeals === 1 ? 'venda' : 'vendas'}
                      </p>
                    </div>
                  </div>

                  {/* Stats */}
                  <div className="text-right">
                    <p className="font-semibold text-foreground">
                      {formatCurrency(seller.totalValue)}
                    </p>
                    {position <= 3 && (
                      <Badge 
                        variant="secondary" 
                        className={cn(
                          "text-xs mt-1",
                          position === 1 && "bg-yellow-500/10 text-yellow-600",
                          position === 2 && "bg-gray-400/10 text-gray-500",
                          position === 3 && "bg-amber-600/10 text-amber-600"
                        )}
                      >
                        Top {position}
                      </Badge>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Trophy className="h-12 w-12 text-muted-foreground/40 mb-3" />
            <h4 className="font-medium text-foreground mb-1">Sem dados ainda</h4>
            <p className="text-sm text-muted-foreground">
              O ranking aparecerá quando houver vendas
            </p>
          </div>
        )}
      </ScrollArea>
    </Card>
  );
}
