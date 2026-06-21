import { memo } from 'react';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { MoreHorizontal, Edit, Trash2, Star, Copy, Crown } from 'lucide-react';
import {
  ProductAgent,
  AGENT_TYPE_LABELS,
  AGENT_TEMPLATES,
} from '@/types/agents';
import { cn } from '@/lib/utils';

interface AgentTreeNodeProps {
  agent: ProductAgent;
  variant?: 'orchestrator' | 'global' | 'product';
  isExecutive?: boolean;
  onEdit: (agent: ProductAgent) => void;
  onDelete: (agent: ProductAgent) => void;
  onSetDefault: (agent: ProductAgent) => void;
  onDuplicate: (agent: ProductAgent) => void;
  onToggleStatus: (agent: ProductAgent, isActive: boolean) => void;
  onOpenExecutiveTab?: (agent: ProductAgent) => void;
}

export const AgentTreeNode = memo(function AgentTreeNode({
  agent,
  variant = 'product',
  isExecutive = false,
  onEdit,
  onDelete,
  onSetDefault,
  onDuplicate,
  onToggleStatus,
  onOpenExecutiveTab,
}: AgentTreeNodeProps) {
  const template = AGENT_TEMPLATES[agent.agent_type];
  const isOrchestrator = variant === 'orchestrator';

  return (
    <div
      className={cn(
        'group relative w-[200px] rounded-xl border bg-card shadow-sm transition-all',
        'hover:shadow-lg hover:-translate-y-0.5 hover:border-primary/60 cursor-pointer',
        agent.is_default && 'border-primary/70 ring-2 ring-primary/30',
        isOrchestrator && 'w-[240px] ring-2 ring-primary/40 border-primary/60',
        isExecutive && 'ring-2 ring-amber-400/50 border-amber-400/60',
        !agent.is_active && 'opacity-50'
      )}
      onClick={() => onEdit(agent)}
    >
      {/* Padrão badge */}
      {agent.is_default && (
        <div className="absolute -top-2.5 left-1/2 -translate-x-1/2 z-10">
          <Badge className="h-5 px-2 text-[10px] gap-1 shadow-sm">
            <Crown className="h-3 w-3" />
            Padrão
          </Badge>
        </div>
      )}

      {/* Executivo badge (top-right) */}
      {isExecutive && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onOpenExecutiveTab?.(agent);
          }}
          className="absolute -top-2.5 right-2 z-10 inline-flex items-center gap-1 h-5 px-2 rounded-full text-[10px] font-medium bg-amber-500 text-white shadow-sm hover:bg-amber-600 transition-colors"
          title="Abrir aba Executivo"
        >
          <Crown className="h-3 w-3" />
          Executivo
        </button>
      )}

      {/* Orchestrator gradient header */}
      {isOrchestrator && (
        <div
          className="absolute inset-x-0 top-0 h-1 rounded-t-xl"
          style={{ background: 'var(--gradient-primary, hsl(var(--primary)))' }}
        />
      )}

      <div className="p-3">
        {/* Top row: avatar + status + menu */}
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex items-center gap-2 min-w-0">
            <div
              className={cn(
                'flex items-center justify-center rounded-lg shrink-0',
                isOrchestrator ? 'h-10 w-10 text-2xl' : 'h-9 w-9 text-xl',
                isOrchestrator
                  ? 'bg-primary/10 ring-1 ring-primary/30'
                  : 'bg-muted'
              )}
            >
              {template.icon}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span
                  className={cn(
                    'h-1.5 w-1.5 rounded-full shrink-0',
                    agent.is_active ? 'bg-emerald-500' : 'bg-muted-foreground/40'
                  )}
                />
                <p className="text-sm font-semibold truncate">{agent.name}</p>
              </div>
              <p className="text-[10px] text-muted-foreground truncate uppercase tracking-wide">
                {AGENT_TYPE_LABELS[agent.agent_type]}
              </p>
            </div>
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
              <button
                className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-muted"
                aria-label="Mais ações"
              >
                <MoreHorizontal className="h-3.5 w-3.5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
              <DropdownMenuItem onClick={() => onEdit(agent)}>
                <Edit className="h-3.5 w-3.5 mr-2" />
                Editar
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onDuplicate(agent)}>
                <Copy className="h-3.5 w-3.5 mr-2" />
                Duplicar
              </DropdownMenuItem>
              {agent.product_id && !agent.is_default && (
                <DropdownMenuItem onClick={() => onSetDefault(agent)}>
                  <Star className="h-3.5 w-3.5 mr-2" />
                  Tornar padrão
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => onDelete(agent)}
                className="text-destructive focus:text-destructive"
              >
                <Trash2 className="h-3.5 w-3.5 mr-2" />
                Excluir
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Bottom: switch */}
        <div
          className="flex items-center justify-between pt-2 border-t border-border/60"
          onClick={(e) => e.stopPropagation()}
        >
          <span className="text-[10px] text-muted-foreground">
            {agent.is_active ? 'Ativo' : 'Inativo'}
          </span>
          <Switch
            checked={agent.is_active}
            onCheckedChange={(v) => onToggleStatus(agent, v)}
            className="scale-75 origin-right"
          />
        </div>
      </div>
    </div>
  );
});
