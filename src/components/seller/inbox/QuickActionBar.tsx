import {
  Calendar,
  Flame,
  LinkIcon,
  Sparkles,
  Workflow,
  CalendarDays,
  BarChart3,
  CalendarPlus,
  DollarSign,
  Route,
  ExternalLink,
  Package,
  CreditCard,
  Layers,
  X,
  Square,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { cn } from '@/lib/utils';

interface QuickActionBarProps {
  onScheduleFollowup?: () => void;
  onMarkHot?: () => void;
  
  onSuggestReply?: () => void;
  isSuggestingReply?: boolean;
  onCloneFunnel?: () => void;
  isCloningFunnel?: boolean;
  onStopFlow?: () => void;
  isStoppingFlow?: boolean;
  onSendFlow?: () => void;
  onSendCadence?: () => void;
  onAnalyze?: () => void;
  /** Cria um evento de calendário (atalho rápido). */
  onCreateEvent?: () => void;
  /** Cria uma oportunidade de venda. Visível só com lead vinculado. */
  onCreateDeal?: () => void;
  /** Abre os "Dados do Contato" / detalhe do lead. */
  onViewLead?: () => void;
  /** Move o lead para outro estágio do funil — opcional. */
  onMoveStageQuick?: (stageId: string) => void;
  pipelineStages?: { id: string; name: string; color: string | null }[];
  currentStageId?: string | null;
  /** Abre seletor de produto do catálogo para enviar como mensagem rica. */
  onPickCatalog?: () => void;
  /** Abre dialog de gerar/enviar link de pagamento. */
  onSendPaymentLink?: () => void;
}

export function QuickActionBar({
  onScheduleFollowup,
  onMarkHot,
  onSuggestReply,
  isSuggestingReply,
  onCloneFunnel,
  isCloningFunnel,
  onStopFlow,
  isStoppingFlow,
  onSendFlow,
  onSendCadence,
  onAnalyze,
  onCreateEvent,
  onCreateDeal,
  onViewLead,
  onMoveStageQuick,
  pipelineStages = [],
  currentStageId,
  onPickCatalog,
  onSendPaymentLink,
}: QuickActionBarProps) {
  const currentStage = pipelineStages.find((s) => s.id === currentStageId);

  return (
    <div className="flex w-full max-w-full min-w-0 flex-shrink-0 items-center gap-1 overflow-x-auto px-3 py-1.5 border-t border-border bg-muted/20">
      {onSuggestReply && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs gap-1.5 text-primary hover:text-primary shrink-0"
              onClick={onSuggestReply}
              disabled={isSuggestingReply}
            >
              <Sparkles className={cn('h-3.5 w-3.5', isSuggestingReply && 'animate-spin')} />
              Sugerir Resposta IA
            </Button>
          </TooltipTrigger>
          <TooltipContent>Gerar sugestão com IA baseada no contexto</TooltipContent>
        </Tooltip>
      )}
      {onCloneFunnel && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs gap-1.5 text-purple-600 hover:text-purple-700 shrink-0"
              onClick={onCloneFunnel}
              disabled={isCloningFunnel}
            >
              <Layers className={cn('h-3.5 w-3.5', isCloningFunnel && 'animate-spin')} />
              Clonar Funil
            </Button>
          </TooltipTrigger>
          <TooltipContent>Transformar esta conversa em um funil de captação</TooltipContent>
        </Tooltip>
      )}
      
      {onStopFlow && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs gap-1.5 text-red-600 hover:text-red-700 shrink-0"
              onClick={onStopFlow}
              disabled={isStoppingFlow}
            >
              <Square className={cn('h-3.5 w-3.5 fill-current', isStoppingFlow && 'animate-spin')} />
              Parar Funil
            </Button>
          </TooltipTrigger>
          <TooltipContent>Interromper a execução de funis/fluxos nesta conversa</TooltipContent>
        </Tooltip>
      )}
      
      {onSendFlow && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="sm" className="h-7 text-xs gap-1.5 shrink-0 text-blue-600 hover:text-blue-700" onClick={onSendFlow}>
              <Workflow className="h-3.5 w-3.5" />
              Fluxo
            </Button>
          </TooltipTrigger>
          <TooltipContent>Enviar fluxo para o visitante</TooltipContent>
        </Tooltip>
      )}

      {onPickCatalog && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs gap-1.5 shrink-0 text-blue-600 hover:text-blue-700"
              onClick={onPickCatalog}
            >
              <Package className="h-3.5 w-3.5" />
              Catálogo
            </Button>
          </TooltipTrigger>
          <TooltipContent>Enviar produto do catálogo no chat</TooltipContent>
        </Tooltip>
      )}

      {onSendPaymentLink && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs gap-1.5 shrink-0 text-green-600 hover:text-green-700"
              onClick={onSendPaymentLink}
            >
              <CreditCard className="h-3.5 w-3.5" />
              Cobrar
            </Button>
          </TooltipTrigger>
          <TooltipContent>Gerar e enviar link de pagamento</TooltipContent>
        </Tooltip>
      )}

      {onCreateEvent && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs gap-1.5 shrink-0 text-emerald-600 hover:text-emerald-700"
              onClick={onCreateEvent}
            >
              <CalendarPlus className="h-3.5 w-3.5" />
              Novo Evento
            </Button>
          </TooltipTrigger>
          <TooltipContent>Criar evento na agenda já vinculado a este lead</TooltipContent>
        </Tooltip>
      )}

      {onScheduleFollowup && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="sm" className="h-7 text-xs gap-1.5 shrink-0" onClick={onScheduleFollowup}>
              <Calendar className="h-3.5 w-3.5" />
              Follow-up
            </Button>
          </TooltipTrigger>
          <TooltipContent>Agendar tarefa de follow-up</TooltipContent>
        </Tooltip>
      )}

      {onCreateDeal && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs gap-1.5 shrink-0 text-amber-600 hover:text-amber-700"
              onClick={onCreateDeal}
            >
              <DollarSign className="h-3.5 w-3.5" />
              Oportunidade
            </Button>
          </TooltipTrigger>
          <TooltipContent>Registrar uma nova oportunidade (deal)</TooltipContent>
        </Tooltip>
      )}

      {onMoveStageQuick && pipelineStages.length > 0 && (
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="sm" className="h-7 text-xs gap-1.5 shrink-0">
              <Route className="h-3.5 w-3.5" />
              {currentStage?.name ?? 'Mover etapa'}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-56 p-1">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground px-2 py-1.5">
              Mover para etapa
            </div>
            <div className="flex flex-col">
              {pipelineStages.map((stage) => (
                <button
                  key={stage.id}
                  type="button"
                  onClick={() => onMoveStageQuick(stage.id)}
                  className={cn(
                    'flex items-center gap-2 px-2 py-1.5 text-xs rounded-md hover:bg-muted text-left',
                    stage.id === currentStageId && 'bg-muted font-medium',
                  )}
                >
                  <span
                    className="h-2.5 w-2.5 rounded-full flex-shrink-0"
                    style={{ backgroundColor: stage.color || 'hsl(var(--muted-foreground))' }}
                  />
                  <span className="truncate">{stage.name}</span>
                </button>
              ))}
            </div>
          </PopoverContent>
        </Popover>
      )}

      {onMarkHot && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="sm" className="h-7 text-xs gap-1.5 text-orange-500 hover:text-orange-600 shrink-0" onClick={onMarkHot}>
              <Flame className="h-3.5 w-3.5" />
              Quente
            </Button>
          </TooltipTrigger>
          <TooltipContent>Marcar lead como quente</TooltipContent>
        </Tooltip>
      )}


      {onViewLead && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="sm" className="h-7 text-xs gap-1.5 shrink-0" onClick={onViewLead}>
              <ExternalLink className="h-3.5 w-3.5" />
              Ver Lead
            </Button>
          </TooltipTrigger>
          <TooltipContent>Abrir os dados completos do lead</TooltipContent>
        </Tooltip>
      )}


      {onSendCadence && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="sm" className="h-7 text-xs gap-1.5 shrink-0" onClick={onSendCadence}>
              <CalendarDays className="h-3.5 w-3.5" />
              Cadência
            </Button>
          </TooltipTrigger>
          <TooltipContent>Iniciar cadência para o lead</TooltipContent>
        </Tooltip>
      )}

      {onAnalyze && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="sm" className="h-7 text-xs gap-1.5 shrink-0" onClick={onAnalyze}>
              <BarChart3 className="h-3.5 w-3.5" />
              Analisar
            </Button>
          </TooltipTrigger>
          <TooltipContent>Analisar conversa com IA</TooltipContent>
        </Tooltip>
      )}
    </div>
  );
}
