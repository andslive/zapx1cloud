import { memo } from 'react';
import { 
  Type, Mail, Phone, Hash, AlignLeft, List, ListChecks, 
  ToggleLeft, SlidersHorizontal, GitBranch, Target, Tag, 
  EyeOff, Sparkles, MessageSquarePlus, Hand, CheckCircle,
  Trash2, GripVertical, ChevronUp, ChevronDown, Asterisk
} from 'lucide-react';
import { FormBlock, FormBlockType, getBlockConfig, SelectOption, ScaleOptions } from '@/types/forms';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

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

interface FormBlockNodeProps {
  block: FormBlock;
  index: number;
  totalBlocks: number;
  isSelected: boolean;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onMoveUp: (id: string) => void;
  onMoveDown: (id: string) => void;
  onDragStart: (id: string, e: React.DragEvent) => void;
  onDragOver: (id: string, e: React.DragEvent) => void;
  onDrop: (id: string, e: React.DragEvent) => void;
}

export const FormBlockNode = memo(function FormBlockNode({
  block,
  index,
  totalBlocks,
  isSelected,
  onSelect,
  onDelete,
  onMoveUp,
  onMoveDown,
  onDragStart,
  onDragOver,
  onDrop,
}: FormBlockNodeProps) {
  const config = getBlockConfig(block.block_type);
  const Icon = config ? (ICONS[config.icon] || Type) : Type;
  const categoryColor = config ? CATEGORY_COLORS[config.category] : 'bg-muted';
  
  const getBlockPreview = () => {
    switch (block.block_type) {
      case 'welcome_screen':
      case 'end_screen':
        return block.description || 'Clique para configurar';
      case 'text':
      case 'email':
      case 'phone':
      case 'number':
      case 'textarea':
        return block.placeholder || 'Digite aqui...';
      case 'select':
      case 'multi_select':
        const selectOptions = block.options as SelectOption[];
        if (Array.isArray(selectOptions) && selectOptions.length > 0) {
          return `${selectOptions.length} opções`;
        }
        return 'Adicionar opções';
      case 'scale':
        const scaleOpts = block.options as ScaleOptions;
        if (scaleOpts && typeof scaleOpts === 'object' && 'min' in scaleOpts) {
          return `${scaleOpts.min} a ${scaleOpts.max}`;
        }
        return '1 a 10';
      case 'yes_no':
        return 'Sim / Não';
      case 'score':
        return `+${block.score_value} pontos`;
      case 'tag':
        return block.apply_tags?.join(', ') || 'Adicionar etiquetas';
      case 'hidden_field':
        return `Mapeia para: ${block.maps_to || 'indefinido'}`;
      case 'ai_question':
      case 'ai_followup':
        return 'Pergunta adaptativa';
      default:
        return '';
    }
  };

  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(block.id, e)}
      onDragOver={(e) => onDragOver(block.id, e)}
      onDrop={(e) => onDrop(block.id, e)}
      onClick={() => onSelect(block.id)}
      className={cn(
        "group relative p-4 rounded-xl border-2 cursor-pointer transition-all",
        isSelected 
          ? "border-primary bg-primary/5 shadow-lg ring-2 ring-primary/20" 
          : "border-border hover:border-primary/50 hover:shadow-md bg-card"
      )}
    >
      <div className="flex items-start gap-3">
        {/* Drag handle and index */}
        <div className="flex flex-col items-center gap-1 pt-0.5">
          <GripVertical className="h-4 w-4 text-muted-foreground cursor-grab active:cursor-grabbing" />
          <span className="text-xs font-medium text-muted-foreground w-5 h-5 rounded-full bg-muted flex items-center justify-center">
            {index + 1}
          </span>
        </div>
        
        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1.5">
            <div className={cn("p-1 rounded", categoryColor)}>
              <Icon className="h-3.5 w-3.5 text-white" />
            </div>
            <Badge variant="secondary" className="text-xs font-normal">
              {config?.label || block.block_type}
            </Badge>
            {block.required && (
              <Badge variant="outline" className="text-xs font-normal gap-0.5">
                <Asterisk className="h-2.5 w-2.5" />
                Obrigatório
              </Badge>
            )}
            {block.maps_to && !['hidden_field'].includes(block.block_type) && (
              <Badge variant="outline" className="text-xs font-normal text-primary">
                → {block.maps_to}
              </Badge>
            )}
          </div>
          
          <p className="font-medium text-foreground line-clamp-1">{block.label}</p>
          
          <p className="text-sm text-muted-foreground mt-0.5 line-clamp-1">
            {getBlockPreview()}
          </p>
          
          {/* Options preview for select */}
          {['select', 'multi_select'].includes(block.block_type) && 
           Array.isArray(block.options) && 
           (block.options as SelectOption[]).length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {(block.options as SelectOption[]).slice(0, 4).map((opt, idx) => (
                <span 
                  key={idx}
                  className="text-xs bg-muted px-2 py-0.5 rounded-full"
                >
                  {opt.label}
                </span>
              ))}
              {(block.options as SelectOption[]).length > 4 && (
                <span className="text-xs text-muted-foreground">
                  +{(block.options as SelectOption[]).length - 4}
                </span>
              )}
            </div>
          )}
        </div>
        
        {/* Actions */}
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={(e) => { e.stopPropagation(); onMoveUp(block.id); }}
            disabled={index === 0}
          >
            <ChevronUp className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={(e) => { e.stopPropagation(); onMoveDown(block.id); }}
            disabled={index === totalBlocks - 1}
          >
            <ChevronDown className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10"
            onClick={(e) => { e.stopPropagation(); onDelete(block.id); }}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
});
