import { useState } from 'react';
import { Pencil, Trash2, Trophy, XCircle, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { cn } from '@/lib/utils';

interface Stage {
  id: string;
  name: string;
  color: string | null;
  order_index: number;
  is_won: boolean | null;
  is_lost: boolean | null;
  description: string | null;
}

interface StageCardProps {
  stage: Stage;
  leadCount: number;
  onEdit: (stage: Stage) => void;
  onDelete: (stageId: string) => void;
  isDragging?: boolean;
}

export function StageCard({ stage, leadCount, onEdit, onDelete, isDragging }: StageCardProps) {
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);

  const handleDelete = () => {
    onDelete(stage.id);
    setIsDeleteDialogOpen(false);
  };

  return (
    <div
      className={cn(
        "group relative flex items-start gap-3 p-4 rounded-xl border bg-card transition-all duration-200",
        "hover:shadow-md hover:border-primary/30",
        isDragging && "opacity-50 scale-[0.98] shadow-lg"
      )}
    >

      {/* Color Indicator */}
      <div
        className="w-5 h-5 rounded-full shrink-0 mt-1 ring-2 ring-offset-2 ring-offset-background ring-current"
        style={{ 
          backgroundColor: stage.color || '#6b7280',
          color: stage.color || '#6b7280'
        }}
      />

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <h4 className="font-semibold text-foreground truncate">{stage.name}</h4>
          
          <Badge variant="outline" className="text-xs font-normal">
            Ordem: {stage.order_index}
          </Badge>

          {stage.is_won && (
            <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20 gap-1">
              <Trophy className="h-3 w-3" />
              Ganho
            </Badge>
          )}

          {stage.is_lost && (
            <Badge className="bg-destructive/10 text-destructive border-destructive/20 gap-1">
              <XCircle className="h-3 w-3" />
              Perdido
            </Badge>
          )}
        </div>

        {stage.description && (
          <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
            {stage.description}
          </p>
        )}

        <div className="flex items-center gap-1 mt-2 text-xs text-muted-foreground">
          <Users className="h-3.5 w-3.5" />
          <span>{leadCount} lead{leadCount !== 1 ? 's' : ''} nesta etapa</span>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => onEdit(stage)}
        >
          <Pencil className="h-4 w-4" />
        </Button>

        <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
          <AlertDialogTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Excluir etapa "{stage.name}"?</AlertDialogTitle>
              <AlertDialogDescription>
                {leadCount > 0 ? (
                  <>
                    <span className="text-destructive font-medium">
                      Atenção: {leadCount} lead{leadCount !== 1 ? 's' : ''} está{leadCount !== 1 ? 'ão' : ''} nesta etapa.
                    </span>
                    <br />
                    Ao excluir, esses leads ficarão sem etapa definida no pipeline.
                  </>
                ) : (
                  'Esta ação não pode ser desfeita.'
                )}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDelete}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Excluir
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}
