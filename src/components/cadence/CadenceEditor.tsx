import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { 
  Plus, 
  Calendar, 
  ChevronLeft, 
  ChevronRight, 
  Trash2, 
  Edit2,
  MessageSquare,
  Mic,
  FileText,
  MousePointer,
  Image,
  Video,
  Link,
  Loader2,
  Save
} from 'lucide-react';
import { CadenceDay, CadenceBlock } from '@/hooks/useCadence';
import { 
  useCreateCadenceDay, 
  useUpdateCadenceDay, 
  useDeleteCadenceDay 
} from '@/hooks/useCadenceMutations';
import { CadenceBlockEditor } from './CadenceBlockEditor';
import { CadenceAIGenerator } from './CadenceAIGenerator';
import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { toast } from 'sonner';

interface CadenceEditorProps {
  cadence: CadenceDay[];
  productId: string;
  productName: string;
}

const blockTypes = [
  { type: 'message', icon: MessageSquare, label: 'Mensagem' },
  { type: 'audio', icon: Mic, label: 'Áudio' },
  { type: 'image', icon: Image, label: 'Imagem' },
  { type: 'video', icon: Video, label: 'Vídeo' },
  { type: 'link', icon: Link, label: 'Link' },
  { type: 'material', icon: FileText, label: 'Material' },
  { type: 'cta', icon: MousePointer, label: 'CTA' },
];

export function CadenceEditor({ cadence, productId, productName }: CadenceEditorProps) {
  const [activeDay, setActiveDay] = useState(1);
  const [localCadence, setLocalCadence] = useState<CadenceDay[]>(cadence);
  const [editingTitle, setEditingTitle] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [aiGeneratorOpen, setAiGeneratorOpen] = useState(false);
  const [currentBlockId, setCurrentBlockId] = useState<string | null>(null);

  const createDay = useCreateCadenceDay();
  const updateDay = useUpdateCadenceDay();
  const deleteDay = useDeleteCadenceDay();

  useEffect(() => {
    setLocalCadence(cadence);
  }, [cadence]);

  const currentDay = localCadence.find(d => d.day === activeDay);
  const isSaving = updateDay.isPending || createDay.isPending;

  const handleAddDay = () => {
    const newDayNumber = localCadence.length > 0 
      ? Math.max(...localCadence.map(d => d.day)) + 1 
      : 1;

    createDay.mutate({
      productId,
      dayNumber: newDayNumber,
      title: `Dia ${newDayNumber}`,
      trigger: '',
      blocks: [],
    });
  };

  const handleDeleteDay = (dayId: string) => {
    deleteDay.mutate({ 
      id: dayId, 
      productId 
    });

    const deletedDay = localCadence.find(d => d.id === dayId);
    if (deletedDay && activeDay === deletedDay.day) {
      setActiveDay(Math.max(1, deletedDay.day - 1));
    }
  };

  const handleUpdateDay = (updates: Partial<CadenceDay>) => {
    if (!currentDay) return;
    
    setLocalCadence(prev => prev.map(d => 
      d.day === activeDay ? { ...d, ...updates } : d
    ));
    setHasChanges(true);
  };

  const handleAddBlock = (type: string) => {
    if (!currentDay) return;

    const newBlock: CadenceBlock = {
      id: `block-${Date.now()}`,
      type: type as CadenceBlock['type'],
      variant: 'medium',
      content: '',
    };

    handleUpdateDay({
      blocks: [...currentDay.blocks, newBlock],
    });
  };

  const handleUpdateBlock = (blockId: string, updates: CadenceBlock) => {
    if (!currentDay) return;

    handleUpdateDay({
      blocks: currentDay.blocks.map(b => b.id === blockId ? updates : b),
    });
  };

  const handleDeleteBlock = (blockId: string) => {
    if (!currentDay) return;

    handleUpdateDay({
      blocks: currentDay.blocks.filter(b => b.id !== blockId),
    });
  };

  const handleOpenAIGenerator = (blockId: string) => {
    setCurrentBlockId(blockId);
    setAiGeneratorOpen(true);
  };

  const handleAIGenerated = (content: string) => {
    if (!currentBlockId || !currentDay) return;

    handleUpdateDay({
      blocks: currentDay.blocks.map(b => 
        b.id === currentBlockId ? { ...b, content } : b
      ),
    });
  };

  const handleSave = async () => {
    if (!currentDay) return;
    
    if (currentDay.id) {
      await updateDay.mutateAsync({
        id: currentDay.id,
        title: currentDay.title,
        trigger: currentDay.trigger,
        blocks: currentDay.blocks,
      });
    } else {
      await createDay.mutateAsync({
        productId,
        dayNumber: currentDay.day,
        title: currentDay.title,
        trigger: currentDay.trigger,
        blocks: currentDay.blocks,
      });
    }
    
    setHasChanges(false);
  };

  // Empty state
  if (localCadence.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
          <Calendar className="h-8 w-8 text-primary" />
        </div>
        <h3 className="text-lg font-semibold mb-2">Nenhuma cadência criada</h3>
        <p className="text-muted-foreground text-sm mb-6 max-w-sm">
          Crie dias de cadência com mensagens, mídias e CTAs para guiar suas vendas
        </p>
        <Button onClick={handleAddDay}>
          <Plus className="h-4 w-4 mr-2" />
          Criar Primeiro Dia
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">Cadência de Vendas</h2>
          <p className="text-sm text-muted-foreground">{productName}</p>
        </div>
        <div className="flex items-center gap-2">
          {hasChanges && (
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Save className="h-4 w-4 mr-2" />
              )}
              Salvar
            </Button>
          )}
          <Button variant="outline" onClick={handleAddDay}>
            <Plus className="h-4 w-4 mr-2" />
            Adicionar Dia
          </Button>
        </div>
      </div>

      {/* Day selector */}
      <ScrollArea className="w-full">
        <div className="flex gap-2 pb-2">
          {localCadence
            .sort((a, b) => a.day - b.day)
            .map((day) => (
              <Button
                key={day.day}
                variant={activeDay === day.day ? 'default' : 'outline'}
                className="flex-shrink-0 gap-2"
                onClick={() => setActiveDay(day.day)}
              >
                <Calendar className="h-4 w-4" />
                Dia {day.day}
                <Badge variant="secondary" className="ml-1">
                  {day.blocks.length}
                </Badge>
              </Button>
            ))}
        </div>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>

      {/* Day content */}
      {currentDay && (
        <Card>
          <CardHeader className="pb-4">
            <div className="flex items-start justify-between">
              <div className="flex-1 space-y-2">
                {editingTitle ? (
                  <Input
                    value={currentDay.title}
                    onChange={(e) => handleUpdateDay({ title: e.target.value })}
                    onBlur={() => setEditingTitle(false)}
                    onKeyDown={(e) => e.key === 'Enter' && setEditingTitle(false)}
                    autoFocus
                    className="text-lg font-semibold h-auto py-1"
                  />
                ) : (
                  <CardTitle 
                    className="cursor-pointer hover:text-primary flex items-center gap-2"
                    onClick={() => setEditingTitle(true)}
                  >
                    {currentDay.title}
                    <Edit2 className="h-4 w-4 opacity-50" />
                  </CardTitle>
                )}
                <Input
                  value={currentDay.trigger}
                  onChange={(e) => handleUpdateDay({ trigger: e.target.value })}
                  placeholder="Gatilho: Ex: Após cadastro, 2 dias sem resposta..."
                  className="text-sm"
                />
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="text-destructive hover:text-destructive"
                onClick={() => handleDeleteDay(currentDay.id)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </CardHeader>

          <CardContent className="space-y-4">
            {/* Blocks */}
            {currentDay.blocks.map((block) => (
              <CadenceBlockEditor
                key={block.id}
                block={block}
                productId={productId}
                onUpdate={(updated) => handleUpdateBlock(block.id, updated)}
                onDelete={() => handleDeleteBlock(block.id)}
                onGenerateAI={() => handleOpenAIGenerator(block.id)}
              />
            ))}

            {/* Add block */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="w-full border-dashed">
                  <Plus className="h-4 w-4 mr-2" />
                  Adicionar Bloco
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="center" className="w-48">
                {blockTypes.map(({ type, icon: Icon, label }) => (
                  <DropdownMenuItem 
                    key={type}
                    onClick={() => handleAddBlock(type)}
                    className="gap-2"
                  >
                    <Icon className="h-4 w-4" />
                    {label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Navigation */}
            <div className="flex justify-between pt-4">
              <Button
                variant="ghost"
                disabled={activeDay <= 1}
                onClick={() => setActiveDay(activeDay - 1)}
              >
                <ChevronLeft className="h-4 w-4 mr-2" />
                Dia anterior
              </Button>
              <Button
                variant="ghost"
                disabled={activeDay >= Math.max(...localCadence.map(d => d.day))}
                onClick={() => setActiveDay(activeDay + 1)}
              >
                Próximo dia
                <ChevronRight className="h-4 w-4 ml-2" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* AI Generator Modal */}
      <CadenceAIGenerator
        open={aiGeneratorOpen}
        onOpenChange={setAiGeneratorOpen}
        productId={productId}
        dayNumber={activeDay}
        blockType={currentBlockId ? currentDay?.blocks.find(b => b.id === currentBlockId)?.type || 'message' : 'message'}
        onGenerated={handleAIGenerated}
      />
    </div>
  );
}
