import { useState, useCallback } from 'react';
import { FormBlock, FormBlockType, createFormBlock } from '@/types/forms';
import { FormBlockNode } from './FormBlockNode';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Plus, Hand, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';

interface FormCanvasProps {
  formId: string;
  blocks: FormBlock[];
  selectedBlockId: string | null;
  onSelectBlock: (id: string | null) => void;
  onUpdateBlocks: (blocks: FormBlock[]) => void;
  onAddBlock: (type: FormBlockType) => void;
  onDeleteBlock: (id: string) => void;
}

export function FormCanvas({
  formId,
  blocks,
  selectedBlockId,
  onSelectBlock,
  onUpdateBlocks,
  onAddBlock,
  onDeleteBlock,
}: FormCanvasProps) {
  const [draggedBlockId, setDraggedBlockId] = useState<string | null>(null);
  const [dragOverBlockId, setDragOverBlockId] = useState<string | null>(null);

  const handleMoveUp = useCallback((blockId: string) => {
    const index = blocks.findIndex(b => b.id === blockId);
    if (index <= 0) return;
    
    const newBlocks = [...blocks];
    [newBlocks[index], newBlocks[index - 1]] = [newBlocks[index - 1], newBlocks[index]];
    onUpdateBlocks(newBlocks.map((b, i) => ({ ...b, order_index: i })));
  }, [blocks, onUpdateBlocks]);

  const handleMoveDown = useCallback((blockId: string) => {
    const index = blocks.findIndex(b => b.id === blockId);
    if (index === -1 || index >= blocks.length - 1) return;
    
    const newBlocks = [...blocks];
    [newBlocks[index], newBlocks[index + 1]] = [newBlocks[index + 1], newBlocks[index]];
    onUpdateBlocks(newBlocks.map((b, i) => ({ ...b, order_index: i })));
  }, [blocks, onUpdateBlocks]);

  const handleDragStart = useCallback((blockId: string, e: React.DragEvent) => {
    e.dataTransfer.setData('draggedBlockId', blockId);
    setDraggedBlockId(blockId);
  }, []);

  const handleDragOver = useCallback((blockId: string, e: React.DragEvent) => {
    e.preventDefault();
    if (draggedBlockId && draggedBlockId !== blockId) {
      setDragOverBlockId(blockId);
    }
  }, [draggedBlockId]);

  const handleDrop = useCallback((targetBlockId: string, e: React.DragEvent) => {
    e.preventDefault();
    
    const draggedId = e.dataTransfer.getData('draggedBlockId');
    const newBlockType = e.dataTransfer.getData('blockType') as FormBlockType;
    
    if (newBlockType && !draggedId) {
      // Dropping a new block from palette
      const targetIndex = blocks.findIndex(b => b.id === targetBlockId);
      const newBlock = createFormBlock(newBlockType, formId, targetIndex + 1);
      const newBlocks = [...blocks];
      newBlocks.splice(targetIndex + 1, 0, newBlock);
      onUpdateBlocks(newBlocks.map((b, i) => ({ ...b, order_index: i })));
      onSelectBlock(newBlock.id);
    } else if (draggedId && draggedId !== targetBlockId) {
      // Reordering existing block
      const draggedIndex = blocks.findIndex(b => b.id === draggedId);
      const targetIndex = blocks.findIndex(b => b.id === targetBlockId);
      
      if (draggedIndex !== -1 && targetIndex !== -1) {
        const newBlocks = [...blocks];
        const [removed] = newBlocks.splice(draggedIndex, 1);
        newBlocks.splice(targetIndex, 0, removed);
        onUpdateBlocks(newBlocks.map((b, i) => ({ ...b, order_index: i })));
      }
    }
    
    setDraggedBlockId(null);
    setDragOverBlockId(null);
  }, [blocks, formId, onUpdateBlocks, onSelectBlock]);

  const handleCanvasDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const newBlockType = e.dataTransfer.getData('blockType') as FormBlockType;
    
    if (newBlockType) {
      onAddBlock(newBlockType);
    }
    
    setDraggedBlockId(null);
    setDragOverBlockId(null);
  }, [onAddBlock]);

  const handleCanvasDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  }, []);

  const handleCanvasClick = useCallback((e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onSelectBlock(null);
    }
  }, [onSelectBlock]);

  return (
    <div 
      className="flex-1 bg-muted/30 overflow-hidden"
      onDragOver={handleCanvasDragOver}
      onDrop={handleCanvasDrop}
      onClick={handleCanvasClick}
    >
      <ScrollArea className="h-full">
        <div className="p-6 min-h-full">
          {blocks.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-[500px] text-center">
              <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center mb-6">
                <Plus className="h-10 w-10 text-primary" />
              </div>
              <h3 className="text-xl font-semibold mb-2">Comece a criar seu formulário</h3>
              <p className="text-muted-foreground mb-6 max-w-md">
                Arraste blocos da paleta ao lado ou use os atalhos abaixo para adicionar perguntas
              </p>
              <div className="flex gap-3">
                <Button 
                  variant="outline" 
                  onClick={() => onAddBlock('welcome_screen')}
                  className="gap-2"
                >
                  <Hand className="h-4 w-4" />
                  Tela de Boas-vindas
                </Button>
                <Button 
                  onClick={() => onAddBlock('text')}
                  className="gap-2"
                >
                  <Plus className="h-4 w-4" />
                  Primeira Pergunta
                </Button>
              </div>
            </div>
          ) : (
            <div className="max-w-2xl mx-auto space-y-3">
              {blocks.map((block, index) => (
                <div key={block.id} className="relative">
                  {/* Drop indicator */}
                  {dragOverBlockId === block.id && draggedBlockId && (
                    <div className="absolute -top-1.5 left-0 right-0 h-1 bg-primary rounded-full z-10" />
                  )}
                  
                  <FormBlockNode
                    block={block}
                    index={index}
                    totalBlocks={blocks.length}
                    isSelected={selectedBlockId === block.id}
                    onSelect={onSelectBlock}
                    onDelete={onDeleteBlock}
                    onMoveUp={handleMoveUp}
                    onMoveDown={handleMoveDown}
                    onDragStart={handleDragStart}
                    onDragOver={handleDragOver}
                    onDrop={handleDrop}
                  />
                </div>
              ))}
              
              {/* Add block button */}
              <button
                onClick={() => onAddBlock('text')}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = 'copy';
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  const newBlockType = e.dataTransfer.getData('blockType') as FormBlockType;
                  if (newBlockType) {
                    onAddBlock(newBlockType);
                  }
                }}
                className={cn(
                  "w-full py-6 border-2 border-dashed rounded-xl",
                  "text-muted-foreground hover:text-primary hover:border-primary",
                  "transition-all hover:bg-primary/5",
                  "flex flex-col items-center gap-2"
                )}
              >
                <Plus className="h-6 w-6" />
                <span className="text-sm font-medium">Adicionar pergunta</span>
              </button>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
