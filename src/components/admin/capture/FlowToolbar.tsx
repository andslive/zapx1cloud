import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { 
  ZoomIn, 
  ZoomOut, 
  Maximize2, 
  LayoutGrid,
  Save,
  Loader2,
  Undo2,
  Play,
  Target,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface FlowToolbarProps {
  zoom: number;
  isDirty: boolean;
  isSaving: boolean;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFitView: () => void;
  onAutoLayout?: () => void;
  onSave: () => void;
  onReset?: () => void;
  onTest?: () => void;
  onAutoDetectStart?: () => boolean;
}

export function FlowToolbar({
  zoom,
  isDirty,
  isSaving,
  onZoomIn,
  onZoomOut,
  onFitView,
  onAutoLayout,
  onSave,
  onReset,
  onTest,
  onAutoDetectStart,
}: FlowToolbarProps) {
  const handleAutoDetect = () => {
    if (onAutoDetectStart) {
      const changed = onAutoDetectStart();
      if (changed) {
        toast.success('Bloco inicial detectado automaticamente!');
      } else {
        toast.info('O bloco inicial já está correto.');
      }
    }
  };
  return (
    <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10 flex items-center gap-1 bg-background/95 backdrop-blur-sm border rounded-lg shadow-lg p-1">
      {/* Zoom controls */}
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={onZoomOut}
          title="Zoom out"
        >
          <ZoomOut className="h-4 w-4" />
        </Button>
        
        <span className="text-xs font-medium w-12 text-center tabular-nums">
          {Math.round(zoom * 100)}%
        </span>
        
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={onZoomIn}
          title="Zoom in"
        >
          <ZoomIn className="h-4 w-4" />
        </Button>
        
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={onFitView}
          title="Ajustar à tela"
        >
          <Maximize2 className="h-4 w-4" />
        </Button>
      </div>

      <Separator orientation="vertical" className="h-6" />
      
      {/* Layout controls */}
      {onAutoLayout && (
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={onAutoLayout}
          title="Auto-organizar"
        >
          <LayoutGrid className="h-4 w-4" />
        </Button>
      )}
      
      {onReset && (
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={onReset}
          title="Desfazer alterações"
        >
          <Undo2 className="h-4 w-4" />
        </Button>
      )}

      {onAutoDetectStart && (
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={handleAutoDetect}
          title="Auto-detectar início"
        >
          <Target className="h-4 w-4" />
        </Button>
      )}

      <Separator orientation="vertical" className="h-6" />

      {/* Actions */}
      {onTest && (
        <Button
          variant="ghost"
          size="sm"
          className="h-8 gap-1.5"
          onClick={onTest}
        >
          <Play className="h-4 w-4" />
          <span className="text-xs">Testar</span>
        </Button>
      )}
      
      <Button
        size="sm"
        className={cn(
          "h-8 gap-1.5",
          isDirty && "ring-2 ring-orange-400/50"
        )}
        onClick={onSave}
        disabled={!isDirty || isSaving}
      >
        {isSaving ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Save className="h-4 w-4" />
        )}
        <span className="text-xs">Salvar</span>
        {isDirty && (
          <span className="w-1.5 h-1.5 rounded-full bg-orange-400" />
        )}
      </Button>
    </div>
  );
}
