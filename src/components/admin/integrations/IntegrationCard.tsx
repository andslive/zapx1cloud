import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { IntegrationItem } from '@/config/integrationsCatalog';
import { CheckCircle2, Clock, Settings } from 'lucide-react';

interface IntegrationCardProps {
  item: IntegrationItem;
  isActive?: boolean;
  onClick: () => void;
}

export function IntegrationCard({ item, isActive, onClick }: IntegrationCardProps) {
  const Icon = item.icon;
  const showActive = isActive || item.alwaysActive;

  return (
    <Card
      onClick={onClick}
      className={cn(
        'group relative cursor-pointer p-4 transition-all hover:shadow-md hover:border-primary/40',
        item.comingSoon && 'opacity-60 hover:opacity-80',
      )}
    >
      <div className="flex items-start gap-3">
        {item.logoSrc ? (
          <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-background ring-1 ring-border">
            <img
              src={item.logoSrc}
              alt={`${item.name} logo`}
              loading="lazy"
              className="h-full w-full object-cover"
            />
          </div>
        ) : (
          <div
            className={cn(
              'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg',
              item.color,
            )}
          >
            <Icon className="h-5 w-5" />
          </div>
        )}

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <h4 className="text-sm font-semibold leading-tight truncate">{item.name}</h4>
            {item.comingSoon ? (
              <Badge variant="outline" className="shrink-0 gap-1 text-[10px]">
                <Clock className="h-3 w-3" />
                Em breve
              </Badge>
            ) : showActive ? (
              <Badge className="shrink-0 gap-1 bg-green-500/10 text-green-600 hover:bg-green-500/15 text-[10px] border-green-500/20">
                <CheckCircle2 className="h-3 w-3" />
                Ativo
              </Badge>
            ) : (
              <Badge variant="secondary" className="shrink-0 gap-1 text-[10px]">
                <Settings className="h-3 w-3" />
                Configurar
              </Badge>
            )}
          </div>
          <p className="mt-1 text-xs text-muted-foreground line-clamp-2">
            {item.description}
          </p>
        </div>
      </div>
    </Card>
  );
}
