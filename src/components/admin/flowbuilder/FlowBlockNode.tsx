import { memo } from 'react';
import { 
  MessageSquare, 
  FormInput, 
  LayoutGrid, 
  Bot, 
  UserCheck, 
  Tag, 
  Video, 
  Clock,
  Trash2,
  GripVertical,
  ArrowDown,
  Play
} from 'lucide-react';
import { FlowBlock, FlowBlockType, BLOCK_TYPES, INPUT_TYPES } from '@/types/chatFlow';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

const ICONS: Record<FlowBlockType, React.ComponentType<{ className?: string }>> = {
  message: MessageSquare,
  input: FormInput,
  buttons: LayoutGrid,
  ai_takeover: Bot,
  handoff: UserCheck,
  tag: Tag,
  video: Video,
  delay: Clock,
};

interface FlowBlockNodeProps {
  block: FlowBlock;
  isSelected: boolean;
  isStart: boolean;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onConnect: (fromId: string) => void;
  onDragStart: (id: string, e: React.MouseEvent) => void;
}

export const FlowBlockNode = memo(function FlowBlockNode({
  block,
  isSelected,
  isStart,
  onSelect,
  onDelete,
  onConnect,
  onDragStart,
}: FlowBlockNodeProps) {
  const blockMeta = BLOCK_TYPES.find(b => b.type === block.type);
  const Icon = ICONS[block.type];
  
  const getBlockPreview = () => {
    switch (block.type) {
      case 'message':
        return block.data.content?.substring(0, 50) + (block.data.content && block.data.content.length > 50 ? '...' : '') || 'Mensagem vazia';
      case 'input':
        const inputType = INPUT_TYPES.find(t => t.type === block.data.input_type);
        return `Captura: ${inputType?.label || 'Texto'} → $${block.data.variable_name || 'variavel'}`;
      case 'buttons':
        const buttonCount = block.data.buttons?.length || 0;
        return `${buttonCount} ${buttonCount === 1 ? 'botão' : 'botões'}`;
      case 'ai_takeover':
        return 'Sofia assume a conversa';
      case 'handoff':
        return block.data.handoff_message?.substring(0, 40) || 'Transferir para atendente';
      case 'tag':
        return `Tag: ${block.data.tag_name || 'sem nome'}`;
      case 'video':
        return block.data.video_title || block.data.video_url?.substring(0, 30) || 'Sem vídeo';
      case 'delay':
        return `Aguardar ${block.data.delay_seconds || 2}s`;
      default:
        return '';
    }
  };

  return (
    <div
      className={cn(
        "absolute w-64 bg-card rounded-lg shadow-lg border-2 transition-all",
        isSelected ? "border-primary ring-2 ring-primary/20" : "border-border",
        "hover:shadow-xl cursor-pointer"
      )}
      style={{
        left: block.position.x,
        top: block.position.y,
      }}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(block.id);
      }}
    >
      {/* Start indicator */}
      {isStart && (
        <div className="absolute -top-8 left-1/2 -translate-x-1/2 flex items-center gap-1 text-xs text-primary font-medium">
          <Play className="w-3 h-3 fill-primary" />
          INÍCIO
        </div>
      )}
      
      {/* Header */}
      <div 
        className={cn(
          "flex items-center gap-2 p-3 rounded-t-lg",
          blockMeta?.color || 'bg-muted'
        )}
        onMouseDown={(e) => {
          e.stopPropagation();
          onDragStart(block.id, e);
        }}
      >
        <GripVertical className="w-4 h-4 text-white/70 cursor-grab active:cursor-grabbing" />
        <Icon className="w-4 h-4 text-white" />
        <span className="text-sm font-medium text-white flex-1">
          {blockMeta?.label}
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 hover:bg-white/20 text-white"
          onClick={(e) => {
            e.stopPropagation();
            onDelete(block.id);
          }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <Trash2 className="w-3 h-3" />
        </Button>
      </div>
      
      {/* Content */}
      <div className="p-3">
        <p className="text-xs text-muted-foreground line-clamp-2">
          {getBlockPreview()}
        </p>
        
        {/* Buttons preview */}
        {block.type === 'buttons' && block.data.buttons && block.data.buttons.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {block.data.buttons.slice(0, 3).map((btn, idx) => (
              <span 
                key={idx}
                className="text-xs bg-muted px-2 py-0.5 rounded-full"
              >
                {btn.emoji} {btn.label}
              </span>
            ))}
            {block.data.buttons.length > 3 && (
              <span className="text-xs text-muted-foreground">
                +{block.data.buttons.length - 3}
              </span>
            )}
          </div>
        )}
      </div>
      
      {/* Connection point (bottom) */}
      {block.type !== 'ai_takeover' && block.type !== 'handoff' && (
        <div 
          className="absolute -bottom-3 left-1/2 -translate-x-1/2 w-6 h-6 bg-primary rounded-full flex items-center justify-center cursor-pointer hover:scale-110 transition-transform"
          onClick={(e) => {
            e.stopPropagation();
            onConnect(block.id);
          }}
        >
          <ArrowDown className="w-3 h-3 text-primary-foreground" />
        </div>
      )}
      
      {/* Next block indicator */}
      {block.next_block_id && (
        <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 text-xs text-muted-foreground">
          ↓
        </div>
      )}
    </div>
  );
});
