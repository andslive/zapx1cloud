import { 
  MessageSquare, 
  FormInput, 
  LayoutGrid, 
  Bot, 
  UserCheck, 
  Tag, 
  Video, 
  Clock,
  GripVertical
} from 'lucide-react';
import { FlowBlockType, BLOCK_TYPES } from '@/types/chatFlow';
import { cn } from '@/lib/utils';

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

interface FlowBlockPaletteProps {
  onDragStart: (type: FlowBlockType) => void;
}

export function FlowBlockPalette({ onDragStart }: FlowBlockPaletteProps) {
  return (
    <div className="w-64 bg-card border-r p-4 flex flex-col gap-2">
      <h3 className="font-semibold text-sm text-muted-foreground mb-2">
        Blocos Disponíveis
      </h3>
      <p className="text-xs text-muted-foreground mb-4">
        Arraste para o canvas
      </p>
      
      <div className="flex flex-col gap-2">
        {BLOCK_TYPES.map((block) => {
          const Icon = ICONS[block.type];
          return (
            <div
              key={block.type}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData('blockType', block.type);
                onDragStart(block.type);
              }}
              className={cn(
                "flex items-center gap-3 p-3 rounded-lg cursor-grab",
                "bg-muted/50 hover:bg-muted border border-border",
                "transition-all hover:shadow-md active:cursor-grabbing"
              )}
            >
              <GripVertical className="w-4 h-4 text-muted-foreground" />
              <div className={cn("p-1.5 rounded", block.color)}>
                <Icon className="w-4 h-4 text-white" />
              </div>
              <span className="text-sm font-medium">{block.label}</span>
            </div>
          );
        })}
      </div>
      
      <div className="mt-auto pt-4 border-t">
        <div className="text-xs text-muted-foreground space-y-1">
          <p>💡 <strong>Dica:</strong></p>
          <p>Comece com uma mensagem de boas-vindas, capture dados importantes e finalize com "IA Assume".</p>
        </div>
      </div>
    </div>
  );
}
