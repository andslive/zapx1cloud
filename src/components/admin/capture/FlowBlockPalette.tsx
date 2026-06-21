import { memo } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  FunnelBlockType, 
  FUNNEL_BLOCK_PALETTE, 
  BlockPaletteItem, 
  BlockCategory,
  CATEGORY_LABELS,
  CATEGORY_COLORS 
} from '@/types/funnel';
import { cn } from '@/lib/utils';
import { 
  Sparkles, 
  MessageSquare, 
  FormInput, 
  Brain, 
  GitBranch, 
  Zap, 
  Link,
  Video,
  ImageIcon,
  ExternalLink,
  Clock,
  ClipboardList,
  Bot,
  FileText,
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
  LayoutGrid,
  UserCog,
  Mic,
  CreditCard,
  BrainCircuit,
} from 'lucide-react';

interface FlowBlockPaletteProps {
  onAddBlock: (type: FunnelBlockType, position?: { x: number; y: number }) => void;
}

// Icon mapping
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
  pixel: Zap,
  input: FormInput,
  wait_response: Clock,
  quick_form: ClipboardList,
  ai_takeover: Bot,
  ai_decide: Brain,
  ai_receipt: Brain,
  ia_pergunta: BrainCircuit,
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
  crm_sync: RefreshCw,
};

const CATEGORY_ICONS: Record<BlockCategory, React.ComponentType<{ className?: string }>> = {
  experience: MessageSquare,
  capture: FormInput,
  ai: Brain,
  logic: GitBranch,
  action: Zap,
  integration: Link,
};

interface PaletteBlockItemProps {
  item: BlockPaletteItem;
  onDragStart: (e: React.DragEvent, type: FunnelBlockType) => void;
  onClick: () => void;
}

const PaletteBlockItem = memo(function PaletteBlockItem({ 
  item, 
  onDragStart,
  onClick 
}: PaletteBlockItemProps) {
  const colors = CATEGORY_COLORS[item.category];
  const Icon = BLOCK_ICONS[item.type];
  
  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, item.type)}
      onClick={onClick}
      className={cn(
        'flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm cursor-grab active:cursor-grabbing',
        'transition-all duration-150 border',
        'hover:scale-[1.02] active:scale-[0.98]',
        colors.bg,
        colors.border,
        'hover:shadow-sm'
      )}
    >
      <div className={cn(
        'w-7 h-7 rounded-md flex items-center justify-center shrink-0',
        item.color,
        'text-white shadow-sm'
      )}>
        <Icon className="w-3.5 h-3.5" />
      </div>
      <div className="flex-1 min-w-0">
        <span className={cn('font-medium text-xs', colors.text)}>{item.label}</span>
        <p className="text-[10px] text-muted-foreground truncate leading-tight">
          {item.description}
        </p>
      </div>
    </div>
  );
});

interface CategorySectionProps {
  category: BlockCategory;
  items: BlockPaletteItem[];
  onDragStart: (e: React.DragEvent, type: FunnelBlockType) => void;
  onAddBlock: (type: FunnelBlockType) => void;
}

const CategorySection = memo(function CategorySection({ 
  category, 
  items, 
  onDragStart,
  onAddBlock 
}: CategorySectionProps) {
  const colors = CATEGORY_COLORS[category];
  const labels = CATEGORY_LABELS[category];
  const Icon = CATEGORY_ICONS[category];
  
  return (
    <div className="space-y-1.5">
      <div className={cn(
        'flex items-center gap-2 px-2 py-1.5 rounded-md',
        colors.bg
      )}>
        <Icon className={cn("h-3.5 w-3.5", colors.text)} />
        <div className="flex-1">
          <span className={cn('text-[11px] font-semibold uppercase tracking-wider', colors.text)}>
            {labels.label}
          </span>
        </div>
      </div>
      <div className="space-y-1 pl-1">
        {items.map(item => (
          <PaletteBlockItem 
            key={item.type} 
            item={item} 
            onDragStart={onDragStart}
            onClick={() => onAddBlock(item.type)}
          />
        ))}
      </div>
    </div>
  );
});

export const FlowBlockPalette = memo(function FlowBlockPalette({ 
  onAddBlock 
}: FlowBlockPaletteProps) {
  // Group blocks by category
  const categories: { key: BlockCategory; items: BlockPaletteItem[] }[] = [
    { key: 'experience', items: FUNNEL_BLOCK_PALETTE.filter(b => b.category === 'experience') },
    { key: 'capture', items: FUNNEL_BLOCK_PALETTE.filter(b => b.category === 'capture') },
    { key: 'ai', items: FUNNEL_BLOCK_PALETTE.filter(b => b.category === 'ai') },
    { key: 'logic', items: FUNNEL_BLOCK_PALETTE.filter(b => b.category === 'logic') },
    { key: 'action', items: FUNNEL_BLOCK_PALETTE.filter(b => b.category === 'action') },
    { key: 'integration', items: FUNNEL_BLOCK_PALETTE.filter(b => b.category === 'integration') },
  ];

  const handleDragStart = (e: React.DragEvent, type: FunnelBlockType) => {
    e.dataTransfer.setData('block-type', type);
    e.dataTransfer.effectAllowed = 'copy';
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="px-3 py-3 border-b bg-gradient-to-r from-primary/5 to-transparent shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center">
            <Sparkles className="h-4 w-4 text-primary" />
          </div>
          <div>
            <h3 className="text-sm font-semibold">Blocos</h3>
            <p className="text-[10px] text-muted-foreground">
              Arraste para o canvas
            </p>
          </div>
        </div>
      </div>
      
      {/* Categories with scroll */}
      <ScrollArea className="flex-1">
        <div className="p-3 space-y-4">
          {categories.map(({ key, items }) => (
            <CategorySection
              key={key}
              category={key}
              items={items}
              onDragStart={handleDragStart}
              onAddBlock={onAddBlock}
            />
          ))}
        </div>
      </ScrollArea>
      
      {/* Footer Tip */}
      <div className="px-3 py-2 border-t bg-muted/30 shrink-0">
        <p className="text-[10px] text-muted-foreground text-center">
          Arraste o canvas para navegar
        </p>
      </div>
    </div>
  );
});
