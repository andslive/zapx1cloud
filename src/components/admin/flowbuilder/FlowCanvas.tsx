import { useState, useRef, useCallback, useEffect } from 'react';
import { FlowBlock, FlowBlockType, DEFAULT_BLOCK_DATA } from '@/types/chatFlow';
import { FlowBlockNode } from './FlowBlockNode';
import { cn } from '@/lib/utils';

interface FlowCanvasProps {
  blocks: FlowBlock[];
  startBlockId: string | null;
  selectedBlockId: string | null;
  onSelectBlock: (id: string | null) => void;
  onUpdateBlock: (block: FlowBlock) => void;
  onDeleteBlock: (id: string) => void;
  onAddBlock: (type: FlowBlockType, position: { x: number; y: number }) => void;
  onConnectBlocks: (fromId: string, toId: string) => void;
}

export function FlowCanvas({
  blocks,
  startBlockId,
  selectedBlockId,
  onSelectBlock,
  onUpdateBlock,
  onDeleteBlock,
  onAddBlock,
  onConnectBlocks,
}: FlowCanvasProps) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const [draggingBlockId, setDraggingBlockId] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [connectingFromId, setConnectingFromId] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);

  // Handle block drag start
  const handleBlockDragStart = useCallback((blockId: string, e: React.MouseEvent) => {
    const block = blocks.find(b => b.id === blockId);
    if (!block) return;
    
    setDraggingBlockId(blockId);
    setDragOffset({
      x: e.clientX - block.position.x,
      y: e.clientY - block.position.y,
    });
  }, [blocks]);

  // Handle mouse move for dragging blocks
  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!draggingBlockId || !canvasRef.current) return;
    
    const block = blocks.find(b => b.id === draggingBlockId);
    if (!block) return;
    
    const rect = canvasRef.current.getBoundingClientRect();
    const newX = (e.clientX - dragOffset.x);
    const newY = (e.clientY - dragOffset.y);
    
    onUpdateBlock({
      ...block,
      position: {
        x: Math.max(0, newX),
        y: Math.max(0, newY),
      },
    });
  }, [draggingBlockId, dragOffset, blocks, onUpdateBlock]);

  // Handle mouse up to end dragging
  const handleMouseUp = useCallback(() => {
    setDraggingBlockId(null);
  }, []);

  // Handle drag over for new blocks from palette
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  }, []);

  // Handle drop for new blocks from palette
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const blockType = e.dataTransfer.getData('blockType') as FlowBlockType;
    
    if (blockType && canvasRef.current) {
      const rect = canvasRef.current.getBoundingClientRect();
      const x = (e.clientX - rect.left) / zoom;
      const y = (e.clientY - rect.top) / zoom;
      
      onAddBlock(blockType, { x: Math.max(0, x - 128), y: Math.max(0, y - 40) });
    }
  }, [zoom, onAddBlock]);

  // Handle canvas click to deselect
  const handleCanvasClick = useCallback((e: React.MouseEvent) => {
    if (e.target === canvasRef.current) {
      onSelectBlock(null);
      setConnectingFromId(null);
    }
  }, [onSelectBlock]);

  // Handle block connection
  const handleConnect = useCallback((fromId: string) => {
    if (connectingFromId) {
      if (connectingFromId !== fromId) {
        onConnectBlocks(connectingFromId, fromId);
      }
      setConnectingFromId(null);
    } else {
      setConnectingFromId(fromId);
    }
  }, [connectingFromId, onConnectBlocks]);

  // Draw connection lines
  const renderConnections = () => {
    return blocks.map((block) => {
      if (!block.next_block_id) return null;
      
      const targetBlock = blocks.find(b => b.id === block.next_block_id);
      if (!targetBlock) return null;

      const fromX = block.position.x + 128; // Center of block (256px width / 2)
      const fromY = block.position.y + 100; // Bottom of block
      const toX = targetBlock.position.x + 128;
      const toY = targetBlock.position.y;

      const midY = (fromY + toY) / 2;

      return (
        <svg
          key={`conn-${block.id}-${block.next_block_id}`}
          className="absolute top-0 left-0 w-full h-full pointer-events-none"
          style={{ zIndex: 0 }}
        >
          <path
            d={`M ${fromX} ${fromY} C ${fromX} ${midY}, ${toX} ${midY}, ${toX} ${toY}`}
            fill="none"
            stroke="hsl(var(--primary))"
            strokeWidth="2"
            strokeDasharray={block.type === 'buttons' ? "5,5" : undefined}
            opacity={0.6}
          />
          <circle cx={toX} cy={toY} r="4" fill="hsl(var(--primary))" />
        </svg>
      );
    });
  };

  // Render button connections
  const renderButtonConnections = () => {
    return blocks.flatMap((block) => {
      if (block.type !== 'buttons' || !block.data.buttons) return [];
      
      return block.data.buttons.map((btn, idx) => {
        if (!btn.next_block_id) return null;
        
        const targetBlock = blocks.find(b => b.id === btn.next_block_id);
        if (!targetBlock) return null;

        const fromX = block.position.x + 128;
        const fromY = block.position.y + 100 + (idx * 10);
        const toX = targetBlock.position.x + 128;
        const toY = targetBlock.position.y;

        const midY = (fromY + toY) / 2;

        return (
          <svg
            key={`btn-conn-${block.id}-${btn.id}`}
            className="absolute top-0 left-0 w-full h-full pointer-events-none"
            style={{ zIndex: 0 }}
          >
            <path
              d={`M ${fromX} ${fromY} C ${fromX} ${midY}, ${toX} ${midY}, ${toX} ${toY}`}
              fill="none"
              stroke="hsl(var(--muted-foreground))"
              strokeWidth="1.5"
              strokeDasharray="4,4"
              opacity={0.4}
            />
          </svg>
        );
      });
    });
  };

  return (
    <div className="flex-1 overflow-hidden bg-muted/30 relative">
      {/* Zoom controls */}
      <div className="absolute top-4 right-4 z-10 flex gap-2 bg-card rounded-lg shadow p-2">
        <button 
          className="w-8 h-8 flex items-center justify-center hover:bg-muted rounded"
          onClick={() => setZoom(z => Math.max(0.5, z - 0.1))}
        >
          −
        </button>
        <span className="w-12 text-center text-sm leading-8">
          {Math.round(zoom * 100)}%
        </span>
        <button 
          className="w-8 h-8 flex items-center justify-center hover:bg-muted rounded"
          onClick={() => setZoom(z => Math.min(1.5, z + 0.1))}
        >
          +
        </button>
      </div>

      {/* Connection mode indicator */}
      {connectingFromId && (
        <div className="absolute top-4 left-4 z-10 bg-primary text-primary-foreground px-3 py-1.5 rounded-lg text-sm">
          Clique no bloco destino para conectar
        </div>
      )}

      {/* Canvas */}
      <div
        ref={canvasRef}
        className={cn(
          "w-full h-full relative overflow-auto",
          "bg-[linear-gradient(to_right,hsl(var(--border))_1px,transparent_1px),linear-gradient(to_bottom,hsl(var(--border))_1px,transparent_1px)]",
          "bg-[size:20px_20px]",
          draggingBlockId && "cursor-grabbing"
        )}
        style={{
          transform: `scale(${zoom})`,
          transformOrigin: 'top left',
          minWidth: '2000px',
          minHeight: '1500px',
        }}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        onClick={handleCanvasClick}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        {/* Connections */}
        {renderConnections()}
        {renderButtonConnections()}
        
        {/* Blocks */}
        {blocks.map((block) => (
          <FlowBlockNode
            key={block.id}
            block={block}
            isSelected={selectedBlockId === block.id}
            isStart={startBlockId === block.id}
            onSelect={onSelectBlock}
            onDelete={onDeleteBlock}
            onConnect={handleConnect}
            onDragStart={handleBlockDragStart}
          />
        ))}
        
        {/* Empty state */}
        {blocks.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="text-center text-muted-foreground">
              <p className="text-lg font-medium mb-2">Canvas vazio</p>
              <p className="text-sm">Arraste blocos da paleta para começar</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
