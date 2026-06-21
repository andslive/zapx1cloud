import { useState, useCallback, useRef, useEffect } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { FunnelBlock, FunnelBlockType, createDefaultBlock } from '@/types/funnel';
import { FlowBlockNode } from './FlowBlockNode';
import { FlowConnections } from './FlowConnections';
import { FlowToolbar } from './FlowToolbar';
import { useFlowViewport } from './useFlowViewport';
import { cn } from '@/lib/utils';

interface FlowCanvasProps {
  blocks: FunnelBlock[];
  selectedBlockId: string | null;
  startBlockId: string | null;
  isDirty: boolean;
  isSaving: boolean;
  onSelectBlock: (id: string | null) => void;
  onAddBlock: (type: FunnelBlockType, position?: { x: number; y: number }) => void;
  onUpdateBlock: (id: string, updates: Partial<FunnelBlock>) => void;
  onDeleteBlock: (id: string) => void;
  onDuplicateBlock?: (id: string) => void;
  onSetStartBlock: (id: string) => void;
  onDeleteConnection?: (sourceId: string, connectionType: 'normal' | 'condition_true' | 'condition_false' | 'option', optionIndex?: number) => void;
  onSave: () => void;
  onAutoDetectStart?: () => boolean;
}

export function FlowCanvas({
  blocks,
  selectedBlockId,
  startBlockId,
  isDirty,
  isSaving,
  onSelectBlock,
  onAddBlock,
  onUpdateBlock,
  onDeleteBlock,
  onDuplicateBlock,
  onSetStartBlock,
  onDeleteConnection,
  onSave,
  onAutoDetectStart,
}: FlowCanvasProps) {
  const {
    viewport,
    containerRef,
    handleMouseDown: handleViewportMouseDown,
    handleMouseMove: handleViewportMouseMove,
    handleMouseUp: handleViewportMouseUp,
    zoomIn,
    zoomOut,
    fitView,
    screenToCanvas,
  } = useFlowViewport();

  const [draggedBlockId, setDraggedBlockId] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [isDraggingFromPalette, setIsDraggingFromPalette] = useState(false);
  
  // Drag-to-connect states
  const [connectingFrom, setConnectingFrom] = useState<{
    blockId: string;
    outputType: 'normal' | 'condition_true' | 'condition_false' | 'option';
    optionIndex?: number;
    startPos: { x: number; y: number };
  } | null>(null);
  const [mousePos, setMousePos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  // Handle block drag start
  const handleBlockDragStart = useCallback((blockId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const block = blocks.find(b => b.id === blockId);
    if (!block) return;

    const canvasPos = screenToCanvas(e.clientX, e.clientY);
    setDraggedBlockId(blockId);
    setDragOffset({
      x: canvasPos.x - block.position.x,
      y: canvasPos.y - block.position.y,
    });
  }, [blocks, screenToCanvas]);

  // Handle connection drag start from output point
  const handleConnectionDragStart = useCallback((
    blockId: string,
    outputType: 'normal' | 'condition_true' | 'condition_false' | 'option',
    e: React.MouseEvent,
    optionIndex?: number
  ) => {
    e.stopPropagation();
    e.preventDefault();
    const block = blocks.find(b => b.id === blockId);
    if (!block) return;

    // Calculate start position (right side of block)
    const NODE_WIDTH = 220;
    const NODE_HEIGHT = 90;
    
    let startY = block.position.y + NODE_HEIGHT / 2;
    
    // For buttons block per-option dots, calculate the correct Y
    if (outputType === 'option' && block.type === 'buttons' && optionIndex != null) {
      const totalOptions = block.data.options?.length || 1;
      const dotSpacing = 22;
      const totalHeight = (totalOptions - 1) * dotSpacing;
      const centerY = block.position.y + NODE_HEIGHT / 2;
      startY = centerY - totalHeight / 2 + optionIndex * dotSpacing;
    }
    
    const startPos = {
      x: block.position.x + NODE_WIDTH,
      y: startY,
    };
    
    const canvasPos = screenToCanvas(e.clientX, e.clientY);
    setMousePos(canvasPos);
    setConnectingFrom({
      blockId,
      outputType,
      optionIndex,
      startPos,
    });
  }, [blocks, screenToCanvas]);

  // Handle connection drop on input point
  const handleConnectionDrop = useCallback((targetBlockId: string) => {
    if (!connectingFrom || connectingFrom.blockId === targetBlockId) {
      setConnectingFrom(null);
      return;
    }

    const sourceBlock = blocks.find(b => b.id === connectingFrom.blockId);
    if (!sourceBlock) {
      setConnectingFrom(null);
      return;
    }

    // Create connection based on output type
    switch (connectingFrom.outputType) {
      case 'normal':
        onUpdateBlock(connectingFrom.blockId, { next_block_id: targetBlockId });
        break;
      case 'condition_true':
        onUpdateBlock(connectingFrom.blockId, {
          next_block_id: (sourceBlock.type === 'input' || sourceBlock.type === 'ia_pergunta') ? null : (sourceBlock.next_block_id || null),
          data: { 
            ...sourceBlock.data, 
            true_next_block_id: targetBlockId,
            sim_next_block_id: targetBlockId,
            ...(sourceBlock.type === 'input' ? { success_next_block_id: targetBlockId } : {})
          }
        });
        break;
      case 'condition_false':
        onUpdateBlock(connectingFrom.blockId, {
          data: { 
            ...sourceBlock.data, 
            false_next_block_id: targetBlockId,
            nao_next_block_id: targetBlockId
          }
        });
        break;
      case 'option':
        // Handle timeout for input blocks (index 999)
        if ((sourceBlock.type === 'input' || sourceBlock.type === 'wait_response' || sourceBlock.type === 'ai_receipt' || sourceBlock.type === 'ia_pergunta') && connectingFrom.optionIndex === 999) {
          onUpdateBlock(connectingFrom.blockId, {
            data: { ...sourceBlock.data, timeout_next_block_id: targetBlockId }
          });
        }
        // Handle button/ai_decide option connections
        else if (sourceBlock.type === 'buttons' && sourceBlock.data.options && connectingFrom.optionIndex !== undefined) {

          const options = [...sourceBlock.data.options];
          if (options[connectingFrom.optionIndex]) {
            options[connectingFrom.optionIndex] = {
              ...options[connectingFrom.optionIndex],
              next_block_id: targetBlockId
            };
            onUpdateBlock(connectingFrom.blockId, {
              data: { ...sourceBlock.data, options }
            });
          }
        } else if (sourceBlock.type === 'ai_decide' && sourceBlock.data.ai_outputs && connectingFrom.optionIndex !== undefined) {
          const outputs = [...sourceBlock.data.ai_outputs];
          if (outputs[connectingFrom.optionIndex]) {
            outputs[connectingFrom.optionIndex] = {
              ...outputs[connectingFrom.optionIndex],
              next_block_id: targetBlockId
            };
            onUpdateBlock(connectingFrom.blockId, {
              data: { ...sourceBlock.data, ai_outputs: outputs }
            });
          }
        }
        break;
    }

    setConnectingFrom(null);
  }, [connectingFrom, blocks, onUpdateBlock]);

  // Handle mouse move for block dragging, connection dragging, or viewport panning
  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    // Connection dragging takes priority
    if (connectingFrom) {
      const canvasPos = screenToCanvas(e.clientX, e.clientY);
      setMousePos(canvasPos);
      return;
    }
    
    if (draggedBlockId) {
      // Block dragging takes priority - move the block
      const canvasPos = screenToCanvas(e.clientX, e.clientY);
      onUpdateBlock(draggedBlockId, {
        position: {
          x: Math.max(0, canvasPos.x - dragOffset.x),
          y: Math.max(0, canvasPos.y - dragOffset.y),
        },
      });
    } else {
      // Otherwise, let viewport handle panning
      handleViewportMouseMove(e);
    }
  }, [connectingFrom, draggedBlockId, dragOffset, handleViewportMouseMove, onUpdateBlock, screenToCanvas]);

  // Handle mouse up
  const handleMouseUp = useCallback((e: React.MouseEvent) => {
    handleViewportMouseUp();
    setDraggedBlockId(null);
    setConnectingFrom(null);
  }, [handleViewportMouseUp]);

  // Handle drop from palette
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const blockType = e.dataTransfer.getData('block-type') as FunnelBlockType;
    if (!blockType) return;

    const canvasPos = screenToCanvas(e.clientX, e.clientY);
    onAddBlock(blockType, canvasPos);
    setIsDraggingFromPalette(false);
  }, [onAddBlock, screenToCanvas]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    setIsDraggingFromPalette(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setIsDraggingFromPalette(false);
  }, []);

  // Click on empty canvas to deselect
  const handleCanvasClick = useCallback((e: React.MouseEvent) => {
    if (e.target === e.currentTarget || (e.target as HTMLElement).classList.contains('canvas-inner')) {
      onSelectBlock(null);
    }
  }, [onSelectBlock]);

  // Auto-layout function
  const handleAutoLayout = useCallback(() => {
    const HORIZONTAL_GAP = 280;
    const VERTICAL_GAP = 150;
    const START_X = 100;
    const START_Y = 100;

    // Simple grid layout
    blocks.forEach((block, index) => {
      const col = index % 3;
      const row = Math.floor(index / 3);
      onUpdateBlock(block.id, {
        position: {
          x: START_X + col * HORIZONTAL_GAP,
          y: START_Y + row * VERTICAL_GAP,
        },
      });
    });
  }, [blocks, onUpdateBlock]);

  // Empty state
  if (blocks.length === 0) {
    return (
      <div 
        ref={containerRef}
        className="h-full flex flex-col items-center justify-center text-center p-8"
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
      >
        <div className={cn(
          "w-full max-w-md p-8 rounded-xl border-2 border-dashed transition-colors",
          isDraggingFromPalette ? "border-primary bg-primary/5" : "border-muted-foreground/20"
        )}>
          <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
            <Plus className="h-8 w-8 text-primary" />
          </div>
          <h3 className="text-lg font-semibold mb-2">Comece seu fluxo</h3>
          <p className="text-muted-foreground text-sm mb-4">
            Arraste um bloco da paleta à esquerda ou clique para adicionar.
          </p>
          <Button
            variant="outline"
            onClick={() => onAddBlock('message', { x: 200, y: 100 })}
            className="gap-2"
          >
            <Plus className="h-4 w-4" />
            Adicionar mensagem inicial
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div 
      ref={containerRef}
      className={cn(
        "h-full w-full overflow-hidden relative bg-[radial-gradient(hsl(var(--border))_1px,transparent_1px)] [background-size:20px_20px]",
        isDraggingFromPalette && "ring-2 ring-primary/50 ring-inset"
      )}
      onMouseDown={handleViewportMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onClick={handleCanvasClick}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
    >
      {/* Toolbar */}
      <FlowToolbar
        zoom={viewport.zoom}
        isDirty={isDirty}
        isSaving={isSaving}
        onZoomIn={zoomIn}
        onZoomOut={zoomOut}
        onFitView={fitView}
        onAutoLayout={handleAutoLayout}
        onSave={onSave}
        onAutoDetectStart={onAutoDetectStart}
      />

      {/* Canvas content with transform */}
      <div
        className="canvas-inner absolute inset-0 origin-top-left"
        style={{
          transform: `translate(${viewport.panX}px, ${viewport.panY}px) scale(${viewport.zoom})`,
        }}
      >
        {/* Connections */}
        <FlowConnections 
          blocks={blocks} 
          zoom={viewport.zoom} 
          onDeleteConnection={onDeleteConnection}
          temporaryConnection={connectingFrom ? {
            startPos: connectingFrom.startPos,
            endPos: mousePos,
            type: connectingFrom.outputType,
          } : null}
        />

        {/* Blocks */}
        {blocks.map((block) => (
          <FlowBlockNode
            key={block.id}
            block={block}
            isStart={block.id === startBlockId}
            isSelected={block.id === selectedBlockId}
            onSelect={() => onSelectBlock(block.id)}
            onDelete={() => onDeleteBlock(block.id)}
            onDuplicate={onDuplicateBlock ? () => onDuplicateBlock(block.id) : undefined}
            onSetStart={() => onSetStartBlock(block.id)}
            onDragStart={(e) => handleBlockDragStart(block.id, e)}
            zoom={viewport.zoom}
            onConnectionDragStart={handleConnectionDragStart}
            onConnectionDrop={handleConnectionDrop}
            isConnectionTarget={!!connectingFrom && connectingFrom.blockId !== block.id}
          />
        ))}
      </div>

      {/* Zoom indicator */}
      <div className="absolute bottom-3 right-3 text-xs text-muted-foreground bg-background/80 px-2 py-1 rounded">
        {Math.round(viewport.zoom * 100)}%
      </div>
    </div>
  );
}
