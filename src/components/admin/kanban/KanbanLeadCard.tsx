import { Flame, Sun, Snowflake, Calendar, Target, DollarSign, Eye, Clock } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { format, differenceInDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { KanbanLead } from '@/hooks/useKanbanData';
import { cn } from '@/lib/utils';

interface KanbanLeadCardProps {
  lead: KanbanLead;
  stageColor: string;
  onViewDetails: () => void;
  isDragging?: boolean;
  onDragStart?: () => void;
}

const temperatureConfig = {
  hot: { icon: Flame, color: 'text-red-500', bg: 'bg-red-500/10', label: 'Quente' },
  warm: { icon: Sun, color: 'text-amber-500', bg: 'bg-amber-500/10', label: 'Morno' },
  cold: { icon: Snowflake, color: 'text-blue-500', bg: 'bg-blue-500/10', label: 'Frio' },
};

export function KanbanLeadCard({ lead, stageColor, onViewDetails, isDragging, onDragStart }: KanbanLeadCardProps) {
  const tempConfig = lead.temperature ? temperatureConfig[lead.temperature] : null;
  const TempIcon = tempConfig?.icon;

  const daysSinceContact = lead.last_contact_at
    ? differenceInDays(new Date(), new Date(lead.last_contact_at))
    : null;

  const isStale = daysSinceContact !== null && daysSinceContact > 7;

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', lead.id);
        onDragStart?.();
      }}
      className={cn(
        "group bg-card border rounded-lg p-3 hover:shadow-md transition-all duration-200 cursor-grab active:cursor-grabbing",
        "hover:scale-[1.02] hover:-translate-y-0.5",
        isStale && "ring-2 ring-amber-500/50",
        isDragging && "opacity-50"
      )}
      style={{ borderLeftWidth: 4, borderLeftColor: stageColor }}
      onClick={onViewDetails}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2 mb-2 min-w-0">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {TempIcon && (
            <div className={cn("p-1 rounded shrink-0", tempConfig?.bg)}>
              <TempIcon className={cn("h-3.5 w-3.5", tempConfig?.color)} />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <p className="font-medium text-sm truncate">{lead.name}</p>
            {lead.company && (
              <p className="text-xs text-muted-foreground truncate">{lead.company}</p>
            )}
          </div>
        </div>
        {isStale && (
          <Badge variant="outline" className="shrink-0 text-amber-600 border-amber-300 bg-amber-50 text-[10px] px-1.5">
            <Clock className="h-2.5 w-2.5 mr-0.5" />
            {daysSinceContact}d
          </Badge>
        )}
      </div>

      {/* Dates */}
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground mb-2">
        <div className="flex items-center gap-1">
          <Calendar className="h-3 w-3" />
          <span>{format(new Date(lead.created_at), 'dd/MM/yy', { locale: ptBR })}</span>
        </div>
        {lead.expected_close_date && (
          <div className="flex items-center gap-1">
            <Target className="h-3 w-3" />
            <span>{format(new Date(lead.expected_close_date), 'dd/MM/yy', { locale: ptBR })}</span>
          </div>
        )}
      </div>

      {/* Value */}
      {lead.deal_value > 0 && (
        <div className="flex items-center gap-1.5 mb-3">
          <div className="flex items-center gap-1 px-2 py-1 bg-emerald-500/10 text-emerald-600 rounded-md">
            <DollarSign className="h-3.5 w-3.5" />
            <span className="text-sm font-semibold">{formatCurrency(lead.deal_value)}</span>
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-end pt-2 border-t">
        {lead.profiles ? (
          <div className="flex items-center gap-1.5">
            <Avatar className="h-5 w-5">
              <AvatarImage src={lead.profiles.avatar_url || undefined} />
              <AvatarFallback className="text-[9px]">
                {lead.profiles.full_name?.split(' ').map(n => n[0]).join('').slice(0, 2)}
              </AvatarFallback>
            </Avatar>
            <span className="text-[10px] text-muted-foreground truncate max-w-[80px]">
              {lead.profiles.full_name?.split(' ')[0]}
            </span>
          </div>
        ) : (
          <Badge variant="outline" className="text-[10px] text-muted-foreground">
            Sem vendedor
          </Badge>
        )}
      </div>
    </div>
  );
}
