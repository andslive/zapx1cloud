import { 
  Type, Mail, Phone, Hash, AlignLeft, List, ListChecks, 
  ToggleLeft, SlidersHorizontal, GitBranch, Target, Tag, 
  EyeOff, Sparkles, MessageSquarePlus, Hand, CheckCircle,
  GripVertical
} from 'lucide-react';
import { FormBlockType, BLOCK_CONFIGS, BlockConfig } from '@/types/forms';
import { cn } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  Type, Mail, Phone, Hash, AlignLeft, List, ListChecks, 
  ToggleLeft, SlidersHorizontal, GitBranch, Target, Tag, 
  EyeOff, Sparkles, MessageSquarePlus, Hand, CheckCircle,
};

const CATEGORY_COLORS: Record<string, string> = {
  screen: 'bg-purple-500',
  input: 'bg-blue-500',
  selection: 'bg-green-500',
  logic: 'bg-orange-500',
  advanced: 'bg-pink-500',
};

const CATEGORY_LABELS: Record<string, string> = {
  screen: 'TELAS',
  input: 'ENTRADAS',
  selection: 'SELEÇÃO',
  logic: 'LÓGICA',
  advanced: 'IA AVANÇADO',
};

interface FormBlockPaletteProps {
  onDragStart: (type: FormBlockType) => void;
  onBlockClick: (type: FormBlockType) => void;
}

export function FormBlockPalette({ onDragStart, onBlockClick }: FormBlockPaletteProps) {
  const categories = ['screen', 'input', 'selection', 'logic', 'advanced'];
  
  const renderCategory = (category: string) => {
    const blocks = BLOCK_CONFIGS.filter(b => b.category === category);
    if (blocks.length === 0) return null;
    
    return (
      <div key={category} className="mb-4">
        <p className="text-xs font-semibold text-muted-foreground px-2 mb-2 tracking-wide">
          {CATEGORY_LABELS[category]}
        </p>
        <div className="space-y-1">
          {blocks.map((config) => {
            const Icon = ICONS[config.icon] || Type;
            return (
              <div
                key={config.type}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData('blockType', config.type);
                  onDragStart(config.type);
                }}
                onClick={() => onBlockClick(config.type)}
                className={cn(
                  "flex items-center gap-2 px-3 py-2.5 rounded-lg cursor-grab",
                  "bg-muted/50 hover:bg-muted border border-transparent hover:border-border",
                  "transition-all hover:shadow-sm active:cursor-grabbing active:scale-[0.98]"
                )}
              >
                <GripVertical className="w-3.5 h-3.5 text-muted-foreground/50" />
                <div className={cn("p-1.5 rounded", CATEGORY_COLORS[category])}>
                  <Icon className="w-3.5 h-3.5 text-white" />
                </div>
                <span className="text-sm font-medium">{config.label}</span>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="w-56 bg-card border-r flex flex-col">
      <div className="p-4 border-b">
        <h3 className="font-semibold text-sm">Blocos</h3>
        <p className="text-xs text-muted-foreground mt-1">
          Arraste ou clique para adicionar
        </p>
      </div>
      
      <ScrollArea className="flex-1 p-3">
        {categories.map(renderCategory)}
      </ScrollArea>
      
      <div className="p-3 border-t bg-muted/30">
        <div className="text-xs text-muted-foreground space-y-1">
          <p>💡 <strong>Dica:</strong></p>
          <p>Comece com uma tela de boas-vindas e termine com uma tela final.</p>
        </div>
      </div>
    </div>
  );
}
