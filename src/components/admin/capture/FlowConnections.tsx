import { memo, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { FunnelBlock } from '@/types/funnel';
import { cn } from '@/lib/utils';
import { getOptionColor } from './FlowBlockNode';

interface FlowConnectionsProps {
  blocks: FunnelBlock[];
  zoom: number;
  onDeleteConnection?: (sourceId: string, connectionType: 'normal' | 'condition_true' | 'condition_false' | 'option', optionIndex?: number) => void;
  // Drag-to-connect temporary line
  temporaryConnection?: {
    startPos: { x: number; y: number };
    endPos: { x: number; y: number };
    type: 'normal' | 'condition_true' | 'condition_false' | 'option';
  } | null;
}

const NODE_WIDTH = 220;
const NODE_HEIGHT = 90;

interface Connection {
  sourceId: string;
  targetId: string;
  type: 'normal' | 'condition_true' | 'condition_false' | 'fallback' | 'option';
  optionIndex?: number;
}

function calculateBezierPath(
  sourceX: number,
  sourceY: number,
  targetX: number,
  targetY: number,
  sourceYOffset?: number
): string {
  // Source is from the right side of the block (output)
  const startX = sourceX + NODE_WIDTH;
  const startY = sourceYOffset != null ? sourceYOffset : sourceY + NODE_HEIGHT / 2;
  
  // Target is the left side of the block (input)
  const endX = targetX;
  const endY = targetY + NODE_HEIGHT / 2;
  
  // Calculate control points for smooth curve
  const deltaX = Math.abs(endX - startX);
  
  const controlOffset = Math.max(50, Math.min(150, deltaX * 0.4));
  
  // If target is to the left of source, curve around
  if (endX < startX) {
    const midY = (startY + endY) / 2;
    return `M ${startX} ${startY} 
            C ${startX + controlOffset} ${startY}, 
              ${startX + controlOffset} ${midY}, 
              ${(startX + endX) / 2} ${midY}
            C ${endX - controlOffset} ${midY},
              ${endX - controlOffset} ${endY},
              ${endX} ${endY}`;
  }
  
  return `M ${startX} ${startY} 
          C ${startX + controlOffset} ${startY}, 
            ${endX - controlOffset} ${endY}, 
            ${endX} ${endY}`;
}

// Calculate the Y position of the nth option dot on a buttons block
function getOptionDotY(block: FunnelBlock, optionIndex: number): number {
  const totalOptions = block.data.options?.length || 1;
  const dotSpacing = 22; // matches gap-1.5 + h-4
  const totalHeight = (totalOptions - 1) * dotSpacing;
  const centerY = block.position.y + NODE_HEIGHT / 2;
  return centerY - totalHeight / 2 + optionIndex * dotSpacing;
}

// Calculate midpoint of a Bezier curve
function getPathMidpoint(
  sourceX: number,
  sourceY: number,
  targetX: number,
  targetY: number
): { x: number; y: number } {
  const startX = sourceX + NODE_WIDTH;
  const startY = sourceY + NODE_HEIGHT / 2;
  const endX = targetX;
  const endY = targetY + NODE_HEIGHT / 2;
  
  // Approximate midpoint
  return {
    x: (startX + endX) / 2,
    y: (startY + endY) / 2,
  };
}

export const FlowConnections = memo(function FlowConnections({ 
  blocks, 
  zoom,
  onDeleteConnection,
  temporaryConnection,
}: FlowConnectionsProps) {
  const [selectedConnection, setSelectedConnection] = useState<string | null>(null);
  const [hoveredConnection, setHoveredConnection] = useState<string | null>(null);

  const connections = useMemo(() => {
    const result: (Connection & { path: string; midpoint: { x: number; y: number } })[] = [];
    
    blocks.forEach(block => {
      // Normal connection
      if (block.next_block_id) {
        const target = blocks.find(b => b.id === block.next_block_id);
        if (target) {
          result.push({
            sourceId: block.id,
            targetId: target.id,
            type: 'normal',
            path: calculateBezierPath(
              block.position.x,
              block.position.y,
              target.position.x,
              target.position.y
            ),
            midpoint: getPathMidpoint(
              block.position.x,
              block.position.y,
              target.position.x,
              target.position.y
            ),
          });
        }
      }
      
      // Condition true/false/timeout branches (Unification of Pergunta/Input and IA Pergunta)
      if (block.type === 'condition' || block.type === 'ai_receipt' || block.type === 'input' || block.type === 'ia_pergunta' || block.type === 'wait_response') {
        const trueTargetId = block.data.sim_next_block_id || block.data.true_next_block_id;
        if (trueTargetId) {
          const trueTarget = blocks.find(b => b.id === trueTargetId);
          if (trueTarget) {
            result.push({
              sourceId: block.id,
              targetId: trueTarget.id,
              type: 'condition_true',
              path: calculateBezierPath(
                block.position.x,
                block.position.y,
                trueTarget.position.x,
                trueTarget.position.y
              ),
              midpoint: getPathMidpoint(
                block.position.x,
                block.position.y,
                trueTarget.position.x,
                trueTarget.position.y
              ),
            });
          }
        }
        const falseTargetId = block.data.nao_next_block_id || block.data.false_next_block_id;
        if (falseTargetId) {
          const falseTarget = blocks.find(b => b.id === falseTargetId);
          if (falseTarget) {
            result.push({
              sourceId: block.id,
              targetId: falseTarget.id,
              type: 'condition_false',
              path: calculateBezierPath(
                block.position.x,
                block.position.y,
                falseTarget.position.x,
                falseTarget.position.y
              ),
              midpoint: getPathMidpoint(
                block.position.x,
                block.position.y,
                falseTarget.position.x,
                falseTarget.position.y
              ),
            });
          }
        }
        const timeoutTargetId = block.data.timeout_next_block_id;
        if (timeoutTargetId) {
          const timeoutTarget = blocks.find(b => b.id === timeoutTargetId);
          if (timeoutTarget) {
            result.push({
              sourceId: block.id,
              targetId: timeoutTarget.id,
              type: 'option',
              optionIndex: 999, // Special index for timeout
              path: calculateBezierPath(
                block.position.x,
                block.position.y,
                timeoutTarget.position.x,
                timeoutTarget.position.y
              ),
              midpoint: getPathMidpoint(
                block.position.x,
                block.position.y,
                timeoutTarget.position.x,
                timeoutTarget.position.y
              ),
            });
          }
        }
      }

      
      // AI Decide outputs
      if (block.type === 'ai_decide' && block.data.ai_outputs) {
        block.data.ai_outputs.forEach((output, index) => {
          if (output.next_block_id) {
            const target = blocks.find(b => b.id === output.next_block_id);
            if (target) {
              result.push({
                sourceId: block.id,
                targetId: target.id,
                type: 'option',
                optionIndex: index,
                path: calculateBezierPath(
                  block.position.x,
                  block.position.y,
                  target.position.x,
                  target.position.y
                ),
                midpoint: getPathMidpoint(
                  block.position.x,
                  block.position.y,
                  target.position.x,
                  target.position.y
                ),
              });
            }
          }
        });
      }
      
      // Button options
      if (block.type === 'buttons' && block.data.options) {
        block.data.options.forEach((option, index) => {
          if (option.next_block_id) {
            const target = blocks.find(b => b.id === option.next_block_id);
            if (target) {
              const dotY = getOptionDotY(block, index);
              result.push({
                sourceId: block.id,
                targetId: target.id,
                type: 'option',
                optionIndex: index,
                path: calculateBezierPath(
                  block.position.x,
                  block.position.y,
                  target.position.x,
                  target.position.y,
                  dotY
                ),
                midpoint: getPathMidpoint(
                  block.position.x,
                  block.position.y,
                  target.position.x,
                  target.position.y
                ),
              });
            }
          }
        });
      }
    });
    
    return result;
  }, [blocks]);

  const getStrokeColor = (type: Connection['type'], optionIndex?: number) => {
    if (type === 'option' && optionIndex === 999) return 'hsl(var(--muted-foreground))';
    switch (type) {
      case 'condition_true':
        return 'hsl(142, 76%, 36%)'; // Green
      case 'condition_false':
        return 'hsl(0, 84%, 60%)'; // Red
      case 'fallback':
        return 'hsl(38, 92%, 50%)'; // Orange
      case 'option':
        return optionIndex != null ? getOptionColor(optionIndex) : 'hsl(var(--muted-foreground))';
      default:
        return 'hsl(var(--muted-foreground))';
    }
  };

  const getStrokeDasharray = (type: Connection['type']) => {
    switch (type) {
      case 'condition_true':
      case 'condition_false':
        return '6,4';
      case 'fallback':
        return '4,4';
      default:
        return undefined;
    }
  };


  const getConnectionKey = (conn: Connection) => 
    `${conn.sourceId}-${conn.targetId}-${conn.type}-${conn.optionIndex ?? ''}`;

  const handleConnectionClick = (conn: Connection, e: React.MouseEvent) => {
    e.stopPropagation();
    const key = getConnectionKey(conn);
    setSelectedConnection(prev => prev === key ? null : key);
  };

  const handleDeleteClick = (conn: Connection, e: React.MouseEvent) => {
    e.stopPropagation();
    if (onDeleteConnection) {
      onDeleteConnection(conn.sourceId, conn.type as 'normal' | 'condition_true' | 'condition_false' | 'option', conn.optionIndex);
    }
    setSelectedConnection(null);
  };

  return (
    <svg 
      className="absolute inset-0 overflow-visible"
      style={{ width: '100%', height: '100%' }}
    >
      <defs>
        <marker
          id="arrowhead"
          markerWidth="10"
          markerHeight="7"
          refX="9"
          refY="3.5"
          orient="auto"
        >
          <polygon
            points="0 0, 10 3.5, 0 7"
            fill="hsl(var(--muted-foreground))"
          />
        </marker>
        <marker
          id="arrowhead-green"
          markerWidth="10"
          markerHeight="7"
          refX="9"
          refY="3.5"
          orient="auto"
        >
          <polygon
            points="0 0, 10 3.5, 0 7"
            fill="hsl(142, 76%, 36%)"
          />
        </marker>
        <marker
          id="arrowhead-red"
          markerWidth="10"
          markerHeight="7"
          refX="9"
          refY="3.5"
          orient="auto"
        >
          <polygon
            points="0 0, 10 3.5, 0 7"
            fill="hsl(0, 84%, 60%)"
          />
        </marker>
      </defs>
      
      {connections.map((conn) => {
        const key = getConnectionKey(conn);
        const isSelected = selectedConnection === key;
        const isHovered = hoveredConnection === key;
        
        return (
          <g key={key}>
            {/* Hit area - invisible but clickable */}
            <path
              d={conn.path}
              stroke="transparent"
              strokeWidth={16 / zoom}
              fill="none"
              className="cursor-pointer"
              onClick={(e) => handleConnectionClick(conn, e)}
              onMouseEnter={() => setHoveredConnection(key)}
              onMouseLeave={() => setHoveredConnection(null)}
            />
            
            {/* Hover/selected highlight */}
            {(isHovered || isSelected) && (
              <path
                d={conn.path}
                stroke={getStrokeColor(conn.type, conn.optionIndex)}
                strokeWidth={6 / zoom}
                strokeOpacity={0.3}
                fill="none"
                className="pointer-events-none"
              />
            )}
            
            {/* Visual path */}
            <path
              d={conn.path}
              stroke={getStrokeColor(conn.type, conn.optionIndex)}
              strokeWidth={2 / zoom}
              strokeDasharray={getStrokeDasharray(conn.type)}
              fill="none"
              markerEnd={
                conn.type === 'condition_true' ? 'url(#arrowhead-green)' :
                conn.type === 'condition_false' ? 'url(#arrowhead-red)' :
                'url(#arrowhead)'
              }
              className="pointer-events-none transition-all duration-200"
            />
            
            {/* Delete button on selection */}
            {isSelected && onDeleteConnection && (
              <foreignObject
                x={conn.midpoint.x - 12}
                y={conn.midpoint.y - 12}
                width={24}
                height={24}
                className="overflow-visible"
              >
                <button
                  onClick={(e) => handleDeleteClick(conn, e)}
                  className={cn(
                    "w-6 h-6 rounded-full bg-destructive text-destructive-foreground",
                    "flex items-center justify-center shadow-lg",
                    "hover:bg-destructive/90 transition-colors",
                    "border-2 border-background"
                  )}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </foreignObject>
            )}
          </g>
        );
      })}
      
      {/* Temporary connection line while dragging */}
      {temporaryConnection && (
        <path
          d={`M ${temporaryConnection.startPos.x} ${temporaryConnection.startPos.y} 
              C ${temporaryConnection.startPos.x + 80} ${temporaryConnection.startPos.y}, 
                ${temporaryConnection.endPos.x - 80} ${temporaryConnection.endPos.y}, 
                ${temporaryConnection.endPos.x} ${temporaryConnection.endPos.y}`}
          stroke={
            temporaryConnection.type === 'condition_true' ? 'hsl(142, 76%, 36%)' :
            temporaryConnection.type === 'condition_false' ? 'hsl(0, 84%, 60%)' :
            'hsl(var(--primary))'
          }
          strokeWidth={2.5 / zoom}
          strokeDasharray="8,4"
          fill="none"
          className="pointer-events-none animate-pulse"
          opacity={0.8}
        />
      )}
    </svg>
  );
});
