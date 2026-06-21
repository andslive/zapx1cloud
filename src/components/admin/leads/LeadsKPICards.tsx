import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { Users, Flame, Thermometer, Snowflake, UserX, TrendingUp } from 'lucide-react';

interface LeadsKPICardsProps {
  stats: {
    total: number;
    hot: number;
    warm: number;
    cold: number;
    unassigned: number;
  } | null | undefined;
  isLoading?: boolean;
}

const cards = [
  {
    key: 'total',
    label: 'Total de Leads',
    icon: Users,
    color: 'from-primary to-primary/70',
    iconColor: 'text-primary',
    bgColor: 'bg-primary/10',
  },
  {
    key: 'hot',
    label: 'Quentes',
    icon: Flame,
    color: 'from-red-500 to-orange-500',
    iconColor: 'text-red-500',
    bgColor: 'bg-red-500/10',
  },
  {
    key: 'warm',
    label: 'Mornos',
    icon: Thermometer,
    color: 'from-amber-500 to-yellow-500',
    iconColor: 'text-amber-500',
    bgColor: 'bg-amber-500/10',
  },
  {
    key: 'cold',
    label: 'Frios',
    icon: Snowflake,
    color: 'from-blue-500 to-cyan-500',
    iconColor: 'text-blue-500',
    bgColor: 'bg-blue-500/10',
  },
  {
    key: 'unassigned',
    label: 'Sem Carteira',
    icon: UserX,
    color: 'from-muted-foreground to-muted-foreground/70',
    iconColor: 'text-muted-foreground',
    bgColor: 'bg-muted',
  },
];

export function LeadsKPICards({ stats, isLoading }: LeadsKPICardsProps) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
      {cards.map((card) => {
        const Icon = card.icon;
        const value = stats?.[card.key as keyof typeof stats] || 0;
        
        return (
          <Card 
            key={card.key}
            className={cn(
              "relative overflow-hidden group hover:shadow-lg transition-all duration-300",
              "border-0 bg-gradient-to-br",
              card.key === 'total' && "col-span-2 md:col-span-1"
            )}
          >
            <div className={cn(
              "absolute inset-0 opacity-5 bg-gradient-to-br",
              card.color
            )} />
            <CardContent className="p-4 relative">
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    {card.label}
                  </p>
                  {isLoading ? (
                    <div className="h-8 w-16 bg-muted animate-pulse rounded" />
                  ) : (
                    <p className="text-2xl md:text-3xl font-bold text-foreground">
                      {value.toLocaleString('pt-BR')}
                    </p>
                  )}
                </div>
                <div className={cn(
                  "p-2 rounded-xl transition-transform group-hover:scale-110",
                  card.bgColor
                )}>
                  <Icon className={cn("h-5 w-5", card.iconColor)} />
                </div>
              </div>
              
              {card.key === 'total' && stats && (
                <div className="mt-3 flex items-center gap-1 text-xs text-muted-foreground">
                  <TrendingUp className="h-3 w-3 text-emerald-500" />
                  <span className="text-emerald-500 font-medium">+12%</span>
                  <span>vs. mês anterior</span>
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
