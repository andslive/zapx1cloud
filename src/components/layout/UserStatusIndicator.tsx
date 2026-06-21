import { Circle } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { useUserStatus, UserStatusType } from '@/hooks/useUserStatus';
import { cn } from '@/lib/utils';

const STATUS_CONFIG: Record<UserStatusType, { label: string; description: string; color: string }> = {
  online: {
    label: 'Disponível',
    description: 'Recebe leads automaticamente',
    color: 'text-green-500',
  },
  away: {
    label: 'Ausente',
    description: 'Não recebe novos leads',
    color: 'text-yellow-500',
  },
  offline: {
    label: 'Offline',
    description: 'Sai da rotação completamente',
    color: 'text-red-500',
  },
};

export function UserStatusIndicator() {
  const { status, setStatus, isLoading } = useUserStatus();

  if (isLoading) return null;

  const current = STATUS_CONFIG[status];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative h-9 w-9">
          <Circle
            className={cn('h-3.5 w-3.5 fill-current', current.color)}
          />
          <span className="sr-only">Status: {current.label}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        {(Object.entries(STATUS_CONFIG) as [UserStatusType, typeof current][]).map(
          ([key, config]) => (
            <DropdownMenuItem
              key={key}
              onClick={() => setStatus(key)}
              className={cn(
                'flex items-center gap-2 cursor-pointer',
                status === key && 'bg-accent'
              )}
            >
              <Circle className={cn('h-3 w-3 fill-current', config.color)} />
              <div className="flex flex-col">
                <span className="text-sm font-medium">{config.label}</span>
                <span className="text-xs text-muted-foreground">{config.description}</span>
              </div>
            </DropdownMenuItem>
          )
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
