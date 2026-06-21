import { Badge } from '@/components/ui/badge';
import { TEMPLATE_VARIABLES } from '@/hooks/useBookingNotifications';
import { cn } from '@/lib/utils';

interface Props {
  onInsert: (variable: string) => void;
  className?: string;
}

export function VariablesChips({ onInsert, className }: Props) {
  return (
    <div className={cn('flex flex-wrap gap-2', className)}>
      {TEMPLATE_VARIABLES.map((v) => (
        <button
          key={v.key}
          type="button"
          onClick={() => onInsert(v.key)}
          className="group"
          title={v.label}
        >
          <Badge
            variant="secondary"
            className="font-mono text-xs cursor-pointer hover:bg-primary/20 hover:text-primary transition-colors border border-border/40"
          >
            {v.key}
          </Badge>
        </button>
      ))}
    </div>
  );
}
