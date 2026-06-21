import { memo, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  Trash2, 
  Copy,
  Play,
  MessageSquare,
  LayoutGrid,
  Video,
  Clock,
  FormInput,
  ClipboardList,
  Bot,
  Brain,
  Sparkles,
  FileText,
  GitBranch, 
  Zap,
  Dices, 

  TrendingUp,
  Tag,
  UserPlus,
  Pencil,
  CheckSquare,
  Calendar,
  UserCheck,
  Flag,
  Webhook,
  RefreshCw,
  UserCog,
  ImageIcon,
  ExternalLink,
  Mic,
  CreditCard,
  BrainCircuit,
  HelpCircle,
} from 'lucide-react';
import { 
  FunnelBlock, 
  FunnelBlockType,
  FUNNEL_BLOCK_PALETTE,
  getBlockCategoryColor,
} from '@/types/funnel';
import { cn } from '@/lib/utils';

// Distinct colors for per-option output dots
const OPTION_COLORS = [
  '#3B82F6', // blue
  '#F59E0B', // amber
  '#8B5CF6', // violet
  '#EC4899', // pink
  '#10B981', // emerald
  '#EF4444', // red
  '#06B6D4', // cyan
  '#F97316', // orange
];

export function getOptionColor(index: number): string {
  return OPTION_COLORS[index % OPTION_COLORS.length];
}

// Icon mapping - Lucide icons instead of emojis
const BLOCK_ICONS: Record<FunnelBlockType, React.ComponentType<{ className?: string }>> = {
  message: MessageSquare,
  buttons: LayoutGrid,
  video: Video,
  image: ImageIcon,
  audio: Mic,
  document: FileText,
  link: ExternalLink,
  delay: Clock,
  pix_button: CreditCard,
  input: FormInput,
  wait_response: Clock,
  quick_form: ClipboardList,
  ai_takeover: Bot,
  ai_decide: Brain,
  ai_receipt: Brain,
  ia_pergunta: HelpCircle,
  ai_qualify: Sparkles,
  ai_summarize: FileText,
  agent_switch: UserCog,
  condition: GitBranch,
  ab_test: Dices,
  score: TrendingUp,
  tag: Tag,
  create_lead: UserPlus,
  update_lead: Pencil,
  create_task: CheckSquare,
  schedule: Calendar,
  handoff: UserCheck,
  end: Flag,
  webhook: Webhook,
  pixel: Zap,
  crm_sync: RefreshCw,
};

interface FlowBlockNodeProps {
  block: FunnelBlock;
  isStart: boolean;
  isSelected: boolean;
  onSelect: () => void;
  onDelete: () => void;
  onDuplicate?: () => void;
  onSetStart: () => void;
  onDragStart: (e: React.MouseEvent) => void;
  zoom: number;
  // Drag-to-connect props
  onConnectionDragStart?: (
    blockId: string,
    outputType: 'normal' | 'condition_true' | 'condition_false' | 'option',
    e: React.MouseEvent,
    optionIndex?: number
  ) => void;
  onConnectionDrop?: (targetBlockId: string) => void;
  isConnectionTarget?: boolean;
}

// Preview do conteúdo do bloco
function getBlockPreview(block: FunnelBlock): string {
  switch (block.type) {
    case 'message':
      return block.data.content?.substring(0, 40) || 'Mensagem vazia...';
    case 'input':
      return `${block.data.input_type || 'texto'} → $${block.data.variable_name || 'var'}`;
    case 'buttons':
      const btnCount = block.data.options?.length || 0;
      return `${btnCount} ${btnCount === 1 ? 'opção' : 'opções'}`;
    case 'ai_takeover':
      if (block.data.agent_id) {
        const hasAutoSwitch = block.data.auto_switch_enabled && block.data.auto_switch_agents?.length;
        return hasAutoSwitch ? 'IA + Agente (auto-switch)' : 'IA + Agente selecionado';
      }
      return 'IA assume (genérico)';
    case 'ai_decide':
      return block.data.ai_objective || 'qualificar';
    case 'ai_receipt':
      return block.data.receipt_sent_message ? `Ctx: ${block.data.receipt_sent_message.substring(0, 25)}...` : 'Análise de Comprovante & Objeções';
    case 'ia_pergunta':
      return `Analisar {{${block.data.ia_pergunta_variable || 'var'}}}`;
    case 'wait_response': {
      if (block.data.wait_response_message) {
        return `💬 ${block.data.wait_response_message.substring(0, 30)}...`;
      }
      const unitMap: Record<string, string> = { seconds: 'seg', minutes: 'min', hours: 'h', days: 'd' };
      const unitLbl = unitMap[block.data.timeout_unit || 'minutes'] || 'min';
      const waitLbl = block.data.wait_indefinitely
        ? 'Aguardar indefinidamente'
        : `Aguardar até ${block.data.timeout_value || 15} ${unitLbl}`;
      return `${waitLbl} → {{${block.data.variable_name || 'resposta'}}}`;
    }
    case 'agent_switch':
      return block.data.agent_id ? 'Agente configurado' : 'Selecionar agente...';
    case 'condition':
      return block.data.condition?.variable || 'Condição';
    case 'delay':
      if (block.data.is_variable_delay) {
        return `Random: ${(block.data.min_delay_ms || 1000) / 1000}s - ${(block.data.max_delay_ms || 10000) / 1000}s`;
      }
      return `${(block.data.delay_ms || 5000) / 1000}s`;
    case 'tag':
      return block.data.apply_tags?.slice(0, 2).join(', ') || 'Tags';
    case 'video':
      return block.data.video_type === 'custom_html' ? 'HTML personalizado' : block.data.video_url?.substring(0, 30) || 'Vídeo';
    case 'image':
      return block.data.image_url?.substring(0, 30) || 'Imagem';
    case 'link':
      return block.data.link_title || block.data.link_url?.substring(0, 30) || 'Link';
    case 'handoff':
      return 'Transferir';
    case 'end':
      return block.data.success_message?.substring(0, 40) || 'Finalizar';
    case 'pix_button':
      return `${block.data.pix_type || 'PIX'} → ${block.data.pix_key || '...'}`;
    case 'pixel':
      return `${block.data.pixel_event_type || 'Evento'} → ${block.data.pixel_name || 'Pixel'}`;

    default:
      return '';
  }
}

export const FlowBlockNode = memo(function FlowBlockNode({
  block,
  isStart,
  isSelected,
  onSelect,
  onDelete,
  onDuplicate,
  onSetStart,
  onDragStart,
  zoom,
  onConnectionDragStart,
  onConnectionDrop,
  isConnectionTarget,
}: FlowBlockNodeProps) {
  const paletteItem = FUNNEL_BLOCK_PALETTE.find(p => p.type === block.type);
  const categoryColors = getBlockCategoryColor(block.type);
  const preview = getBlockPreview(block);
  const Icon = BLOCK_ICONS[block.type] || MessageSquare;
  const hasMultipleOutputs = ['condition', 'ai_decide', 'ab_test', 'ai_receipt', 'ia_pergunta', 'input'].includes(block.type);
  const isButtonsBlock = block.type === 'buttons';
  const buttonOptions = isButtonsBlock ? (block.data.options || []) : [];

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button === 0 && !e.ctrlKey) {
      onDragStart(e);
    }
  }, [onDragStart]);

  // Handle connection output drag start
  const handleOutputMouseDown = useCallback((
    outputType: 'normal' | 'condition_true' | 'condition_false' | 'option',
    e: React.MouseEvent,
    optionIndex?: number
  ) => {
    e.stopPropagation();
    e.preventDefault();
    onConnectionDragStart?.(block.id, outputType, e, optionIndex);
  }, [block.id, onConnectionDragStart]);

  // Handle connection drop on input
  const handleInputMouseUp = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onConnectionDrop?.(block.id);
  }, [block.id, onConnectionDrop]);

  return (
    <div
      className={cn(
        "group absolute w-[220px] bg-card rounded-lg border-2 shadow-sm transition-all cursor-grab active:cursor-grabbing select-none",
        isSelected 
          ? "border-primary shadow-lg ring-4 ring-primary/20" 
          : "border-border hover:border-primary/50 hover:shadow-md",
      )}
      style={{
        left: block.position.x,
        top: block.position.y,
        transform: `scale(${1})`,
      }}
      onClick={(e) => {
        e.stopPropagation();
        onSelect();
      }}
      onMouseDown={handleMouseDown}
    >
      {/* Start indicator */}
      {isStart && (
        <div className="absolute -top-7 left-1/2 -translate-x-1/2 flex items-center gap-1 text-[10px] font-semibold text-green-600 bg-green-500/10 px-2 py-0.5 rounded-full border border-green-500/30">
          <Play className="w-3 h-3 fill-green-600" />
          INÍCIO
        </div>
      )}
      
      {/* Category color bar */}
      <div 
        className={cn(
          "absolute left-0 top-2 bottom-2 w-1 rounded-r-full",
          paletteItem?.color || 'bg-muted'
        )}
      />

      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border/50">
        {/* Icon */}
        <div className={cn(
          "w-8 h-8 rounded-md flex items-center justify-center shrink-0",
          paletteItem?.color || 'bg-muted',
          "text-white"
        )}>
          <Icon className="w-4 h-4" />
        </div>
        
        {/* Title & Actions */}
        <div className="flex-1 min-w-0">
          <span className={cn("font-medium text-sm", categoryColors.text)}>
            {paletteItem?.label}
          </span>
        </div>
        
        {/* Action buttons */}
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          {!isStart && (
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={(e) => {
                e.stopPropagation();
                onSetStart();
              }}
              title="Definir como início"
            >
              <Play className="h-3 w-3" />
            </Button>
          )}
          {onDuplicate && (
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={(e) => {
                e.stopPropagation();
                onDuplicate();
              }}
              title="Duplicar"
            >
              <Copy className="h-3 w-3" />
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-destructive hover:text-destructive hover:bg-destructive/10"
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            title="Excluir"
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      </div>

      {/* Content preview */}
      <div className="px-3 py-2 space-y-1.5">
        <p className="text-xs text-muted-foreground line-clamp-2">
          {preview}
        </p>
        
        {/* Badges for buttons with per-option output dots */}
        {isButtonsBlock && buttonOptions.length > 0 && (
          <div className="flex flex-col gap-1">
            {buttonOptions.map((opt, idx) => (
              <div key={idx} className="flex items-center gap-1.5">
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ background: getOptionColor(idx) }}
                />
                <Badge 
                  variant="secondary" 
                  className="text-[10px] h-5 px-1.5 truncate max-w-[160px]"
                >
                  {opt.label}
                </Badge>
              </div>
            ))}
          </div>
        )}
        
        {/* AI badge */}
        {block.type.startsWith('ai_') && (
          <Badge variant="outline" className="text-[10px] h-5 bg-orange-500/10 text-orange-600 border-orange-500/30 gap-1">
            <Bot className="h-3 w-3" />
            IA
          </Badge>
        )}
      </div>

      {/* Connection point - Input (left) */}
      <div 
        className={cn(
          "absolute left-0 top-1/2 -translate-x-1/2 -translate-y-1/2 w-4 h-4 rounded-full transition-all duration-150",
          isConnectionTarget 
            ? "bg-primary/20 border-2 border-primary scale-150 ring-4 ring-primary/30" 
            : "bg-background border-2 border-muted-foreground/40 hover:border-primary hover:bg-primary/10"
        )}
        title="Entrada - Solte aqui para conectar"
        onMouseUp={handleInputMouseUp}
      >
        {/* Expanded invisible drop area */}
        <div className="absolute inset-[-12px]" onMouseUp={handleInputMouseUp} />
      </div>

      {/* Connection point - Output (right) - single output for non-branching blocks */}
      {!['end', 'handoff', 'wait_response'].includes(block.type) && !hasMultipleOutputs && !isButtonsBlock && (
        <div 
          className="absolute right-0 top-1/2 translate-x-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-primary border-2 border-primary hover:scale-150 active:scale-125 transition-transform cursor-crosshair"
          title="Arraste para conectar"
          onMouseDown={(e) => handleOutputMouseDown('normal', e)}
        />
      )}

      {/* Wait Response: 2 outputs (Resposta + Timeout) */}
      {(block.type === 'wait_response') && (
        <div className="absolute right-0 top-1/2 translate-x-1/2 -translate-y-1/2 flex flex-col gap-2">
          <div 
            className="w-4 h-4 rounded-full bg-green-500 border-2 border-green-500 hover:scale-150 active:scale-125 transition-transform cursor-crosshair relative group/output"
            title="Saída: Lead respondeu"
            onMouseDown={(e) => handleOutputMouseDown('normal', e)}
          >
            <div className="absolute left-full ml-2 px-1.5 py-0.5 bg-black/80 text-[9px] text-white rounded opacity-0 group-hover/output:opacity-100 whitespace-nowrap pointer-events-none">
              Resposta
            </div>
          </div>
          <div 
            className="w-4 h-4 rounded-full bg-slate-400 border-2 border-slate-400 hover:scale-150 active:scale-125 transition-transform cursor-crosshair relative group/output"
            title="Saída: Sem Resposta / Timeout"
            onMouseDown={(e) => handleOutputMouseDown('option', e, 999)}
          >
            <div className="absolute left-full ml-2 px-1.5 py-0.5 bg-black/80 text-[9px] text-white rounded opacity-0 group-hover/output:opacity-100 whitespace-nowrap pointer-events-none">
              Sem resposta
            </div>
          </div>
        </div>
      )}

      {/* Multiple outputs for condition/ai_decide/input with timeout */}
      {hasMultipleOutputs && (
        <div className="absolute right-0 top-1/2 translate-x-1/2 -translate-y-1/2 flex flex-col gap-2">
          <div 
            className="w-4 h-4 rounded-full bg-green-500 border-2 border-green-500 hover:scale-150 active:scale-125 transition-transform cursor-crosshair relative group/output"
            title={block.type === 'ai_receipt' ? "Saída: Comprovante Identificado" : (block.type === 'ia_pergunta' || block.type === 'input') ? "Saída: #sim" : "Saída: Verdadeiro - Arraste para conectar"}
            onMouseDown={(e) => handleOutputMouseDown('condition_true', e)}
          >
            <div className="absolute left-full ml-2 px-1.5 py-0.5 bg-black/80 text-[9px] text-white rounded opacity-0 group-hover/output:opacity-100 whitespace-nowrap pointer-events-none">
              {block.type === 'ai_receipt' ? "Comprovante" : (block.type === 'ia_pergunta' || block.type === 'input') ? "#sim" : "Verdadeiro"}
            </div>
          </div>
          <div 
            className="w-4 h-4 rounded-full bg-red-500 border-2 border-red-500 hover:scale-150 active:scale-125 transition-transform cursor-crosshair relative group/output"
            title={block.type === 'ai_receipt' ? "Saída: Não é comprovante" : (block.type === 'ia_pergunta' || block.type === 'input') ? "Saída: #não" : "Saída: Falso - Arraste para conectar"}
            onMouseDown={(e) => handleOutputMouseDown('condition_false', e)}
          >
            <div className="absolute left-full ml-2 px-1.5 py-0.5 bg-black/80 text-[9px] text-white rounded opacity-0 group-hover/output:opacity-100 whitespace-nowrap pointer-events-none">
              {block.type === 'ai_receipt' ? "Não é comprovante" : (block.type === 'ia_pergunta' || block.type === 'input') ? "#não" : "Falso"}
            </div>
          </div>
          {(block.type === 'input' || block.type === 'ai_receipt' || block.type === 'ia_pergunta') && (
            <div 
              className="w-4 h-4 rounded-full bg-slate-400 border-2 border-slate-400 hover:scale-150 active:scale-125 transition-transform cursor-crosshair relative group/output"
              title="Saída: Sem Resposta / Timeout"
              onMouseDown={(e) => handleOutputMouseDown('option', e, 999)}
            >
              <div className="absolute left-full ml-2 px-1.5 py-0.5 bg-black/80 text-[9px] text-white rounded opacity-0 group-hover/output:opacity-100 whitespace-nowrap pointer-events-none">
                Timeout
              </div>
            </div>
          )}
        </div>

      )}

      {/* Per-option outputs for buttons block */}
      {isButtonsBlock && buttonOptions.length > 0 && (
        <div className="absolute right-0 translate-x-1/2 flex flex-col gap-1.5" style={{ top: '50%', transform: `translateX(50%) translateY(-${buttonOptions.length * 10}px)` }}>
          {buttonOptions.map((opt, idx) => (
            <div
              key={opt.id || idx}
              className="w-4 h-4 rounded-full hover:scale-150 active:scale-125 transition-transform cursor-crosshair border-2"
              style={{ 
                background: getOptionColor(idx),
                borderColor: getOptionColor(idx),
              }}
              title={`${opt.label} - Arraste para conectar`}
              onMouseDown={(e) => handleOutputMouseDown('option', e, idx)}
            />
          ))}
        </div>
      )}
    </div>
  );
});
