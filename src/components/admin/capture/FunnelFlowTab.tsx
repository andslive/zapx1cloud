import { useState, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { MousePointerClick } from 'lucide-react';
import { Funnel, FunnelBlock, FunnelBlockType, createDefaultBlock } from '@/types/funnel';
import { useSaveFlowBlocks } from '@/hooks/useFunnels';
import { FunnelBlockEditor } from './FunnelBlockEditor';
import { FlowBlockPalette } from './FlowBlockPalette';
import { FlowCanvas } from './FlowCanvas';

interface FunnelFlowTabProps {
  funnel: Funnel;
}

// Helper to find the best start block
function findBestStartBlock(blocks: FunnelBlock[], currentStartId: string | null): string | null {
  // If current start exists in blocks, keep it
  if (currentStartId && blocks.some(b => b.id === currentStartId)) {
    return currentStartId;
  }
  
  if (blocks.length === 0) return null;
  
  // Find orphan blocks (not targeted by any connection)
  const targetedIds = new Set(
    blocks.flatMap(b => [
      b.next_block_id,
      b.data.true_next_block_id,
      b.data.false_next_block_id,
      b.data.sim_next_block_id,
      b.data.nao_next_block_id,
      b.data.timeout_next_block_id,
      b.data.success_next_block_id,
      ...(b.data.options?.map(o => o.next_block_id) || []),
      ...(b.data.ai_outputs?.map(o => o.next_block_id) || []),
    ].filter(Boolean))
  );
  
  const orphans = blocks.filter(b => !targetedIds.has(b.id));
  
  if (orphans.length === 1) {
    return orphans[0].id;
  } else if (orphans.length > 1) {
    // Pick topmost-leftmost
    const sorted = [...orphans].sort((a, b) => 
      a.position.y - b.position.y || a.position.x - b.position.x
    );
    return sorted[0].id;
  }
  
  // Fallback to position-based
  const sorted = [...blocks].sort((a, b) => 
    a.position.y - b.position.y || a.position.x - b.position.x
  );
  return sorted[0]?.id || null;
}

export function FunnelFlowTab({ funnel }: FunnelFlowTabProps) {
  const [blocks, setBlocks] = useState<FunnelBlock[]>(funnel.flow_blocks || []);
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [startBlockId, setStartBlockId] = useState<string | null>(() => 
    findBestStartBlock(funnel.flow_blocks || [], funnel.start_block_id || null)
  );
  const [isDirty, setIsDirty] = useState(false);

  const saveFlowBlocks = useSaveFlowBlocks();
  const selectedBlock = blocks.find(b => b.id === selectedBlockId);

  const handleAddBlock = useCallback((type: FunnelBlockType, position?: { x: number; y: number }) => {
    const pos = position || { 
      x: 100 + (blocks.length % 3) * 280, 
      y: 100 + Math.floor(blocks.length / 3) * 150 
    };
    const newBlock = createDefaultBlock(type, pos);
    
    // Add block without auto-connecting to previous block (neutral)
    setBlocks(prev => [...prev, newBlock]);
    
    setSelectedBlockId(newBlock.id);
    setIsDirty(true);

    // If this is the first block, set it as start
    if (blocks.length === 0) {
      setStartBlockId(newBlock.id);
    }
  }, [blocks.length]);

  const handleUpdateBlock = useCallback((blockId: string, updates: Partial<FunnelBlock> | ((block: FunnelBlock) => Partial<FunnelBlock>)) => {
    setBlocks(prev => prev.map(block => {
      if (block.id !== blockId) return block;
      const resolvedUpdates = typeof updates === 'function' ? updates(block) : updates;
      return { ...block, ...resolvedUpdates };
    }));
    setIsDirty(true);
  }, []);

  const handleDeleteBlock = useCallback((blockId: string) => {
    setBlocks(prev => {
      // Find the block being deleted
      const deletedBlock = prev.find(b => b.id === blockId);
      
      // Update connections: blocks pointing to deleted block should point to deleted block's next
      const updated = prev
        .filter(b => b.id !== blockId)
        .map(b => {
          if (b.next_block_id === blockId) {
            return { ...b, next_block_id: deletedBlock?.next_block_id || null };
          }
          return b;
        });
      
      return updated;
    });
    
    if (selectedBlockId === blockId) {
      setSelectedBlockId(null);
    }
    
    // If deleting the start block, find a new one intelligently
    if (startBlockId === blockId) {
      const remaining = blocks.filter(b => b.id !== blockId);
      setStartBlockId(findBestStartBlock(remaining, null));
    }
    setIsDirty(true);
  }, [selectedBlockId, startBlockId, blocks]);

  const handleDuplicateBlock = useCallback((blockId: string) => {
    const block = blocks.find(b => b.id === blockId);
    if (!block) return;

    const newBlock = createDefaultBlock(block.type, {
      x: block.position.x + 30,
      y: block.position.y + 30,
    });
    newBlock.data = { ...block.data };

    setBlocks(prev => [...prev, newBlock]);
    setSelectedBlockId(newBlock.id);
    setIsDirty(true);
  }, [blocks]);

  const handleSetStartBlock = useCallback((blockId: string) => {
    setStartBlockId(blockId);
    setIsDirty(true);
  }, []);

  const handleConnectBlocks = useCallback((sourceId: string, targetId: string | null) => {
    setBlocks(prev => prev.map(block => {
      if (block.id !== sourceId) return block;
      
      const updates: Partial<FunnelBlock> = { next_block_id: targetId };
      
      // For input blocks, we also update true_next_block_id to stay in sync
      if (block.type === 'input' || block.type === 'ai_receipt' || block.type === 'condition') {
        updates.data = { ...block.data, true_next_block_id: targetId || undefined, success_next_block_id: targetId || undefined };
      }
      
      return { ...block, ...updates };
    }));
    setIsDirty(true);
  }, []);

  const handleDeleteConnection = useCallback((
    sourceId: string, 
    connectionType: 'normal' | 'condition_true' | 'condition_false' | 'option',
    optionIndex?: number
  ) => {
    setBlocks(prev => prev.map(block => {
      if (block.id !== sourceId) return block;
      
      switch (connectionType) {
        case 'normal':
          return { ...block, next_block_id: null };
        case 'condition_true':
          return { 
            ...block, 
            next_block_id: (block.type === 'input' || block.type === 'ia_pergunta') ? null : block.next_block_id, 
            data: { 
              ...block.data, 
              true_next_block_id: null,
              sim_next_block_id: null,
              success_next_block_id: null
            } 
          };
        case 'condition_false':
          return { 
            ...block, 
            data: { 
              ...block.data, 
              false_next_block_id: null, 
              nao_next_block_id: null,
              timeout_next_block_id: (block.type === 'input' || block.type === 'ia_pergunta') ? null : (block.data.timeout_next_block_id || undefined) 
            } 
          };
        case 'option':
          if (block.type === 'input' && optionIndex === 999) {
            return { ...block, data: { ...block.data, timeout_next_block_id: null } };
          }
          if (block.type === 'buttons' && block.data.options && optionIndex !== undefined) {
            const newOptions = [...block.data.options];
            newOptions[optionIndex] = { ...newOptions[optionIndex], next_block_id: null };
            return { ...block, data: { ...block.data, options: newOptions } };
          }
          if (block.type === 'ai_decide' && block.data.ai_outputs && optionIndex !== undefined) {
            const newOutputs = [...block.data.ai_outputs];
            newOutputs[optionIndex] = { ...newOutputs[optionIndex], next_block_id: null };
            return { ...block, data: { ...block.data, ai_outputs: newOutputs } };
          }
          return block;

        default:
          return block;
      }
    }));
    setIsDirty(true);
  }, []);

  const handleAutoDetectStart = useCallback(() => {
    const detectedStart = findBestStartBlock(blocks, null);
    if (detectedStart && detectedStart !== startBlockId) {
      setStartBlockId(detectedStart);
      setIsDirty(true);
      return true;
    }
    return false;
  }, [blocks, startBlockId]);

  const handleSave = async () => {
    // Validate start_block_id before saving
    let validStart = startBlockId;
    if (!validStart || !blocks.some(b => b.id === validStart)) {
      validStart = findBestStartBlock(blocks, null);
      if (validStart) {
        setStartBlockId(validStart);
      }
    }
    
    await saveFlowBlocks.mutateAsync({
      id: funnel.id,
      flow_blocks: blocks,
      start_block_id: validStart,
    });
    setIsDirty(false);
  };

  return (
    <div className="h-[calc(100vh-200px)] flex gap-4">
      {/* Palette */}
      <Card className="w-56 flex-shrink-0 overflow-hidden">
        <FlowBlockPalette onAddBlock={handleAddBlock} />
      </Card>

      {/* Canvas */}
      <Card className="flex-1 relative overflow-hidden">
        <CardContent className="p-0 h-full">
          <FlowCanvas
            blocks={blocks}
            selectedBlockId={selectedBlockId}
            startBlockId={startBlockId}
            isDirty={isDirty}
            isSaving={saveFlowBlocks.isPending}
            onSelectBlock={setSelectedBlockId}
            onAddBlock={handleAddBlock}
            onUpdateBlock={handleUpdateBlock}
            onDeleteBlock={handleDeleteBlock}
            onDuplicateBlock={handleDuplicateBlock}
            onSetStartBlock={handleSetStartBlock}
            onDeleteConnection={handleDeleteConnection}
            onSave={handleSave}
            onAutoDetectStart={handleAutoDetectStart}
          />
        </CardContent>
      </Card>

      {/* Editor Panel */}
      <Card className="w-72 flex-shrink-0">
        <CardContent className="p-4 h-full">
          {selectedBlock ? (
            <FunnelBlockEditor
              key={selectedBlock.id}
              block={selectedBlock}
              blocks={blocks}
              productId={funnel.product_id}
              onUpdate={(updates) => handleUpdateBlock(selectedBlock.id, updates)}
              onConnect={(targetId) => handleConnectBlocks(selectedBlock.id, targetId)}
            />
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-3">
                <MousePointerClick className="h-5 w-5 text-muted-foreground" />
              </div>
              <p className="text-sm text-muted-foreground">
                Selecione um bloco para editar suas propriedades
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
