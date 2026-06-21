import { useState, useEffect, useImperativeHandle, forwardRef } from 'react';
import { X, Trophy, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
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

export interface StageEditFormRef {
  getData: () => Partial<Stage> & { id?: string };
  isValid: () => boolean;
}

interface StageEditFormProps {
  stage: Stage | null;
  isNew?: boolean;
  onCancel: () => void;
  nextOrderIndex?: number;
}

const STAGE_COLORS = [
  '#3b82f6', // blue
  '#8b5cf6', // purple
  '#f59e0b', // amber
  '#ec4899', // pink
  '#14b8a6', // teal
  '#22c55e', // green
  '#ef4444', // red
  '#f97316', // orange
  '#06b6d4', // cyan
  '#6366f1', // indigo
];

export const StageEditForm = forwardRef<StageEditFormRef, StageEditFormProps>(({ 
  stage, 
  isNew = false, 
  onCancel, 
  nextOrderIndex = 1
}, ref) => {
  const [name, setName] = useState(stage?.name || '');
  const [description, setDescription] = useState(stage?.description || '');
  const [color, setColor] = useState(stage?.color || STAGE_COLORS[0]);
  const [isWon, setIsWon] = useState(stage?.is_won || false);
  const [isLost, setIsLost] = useState(stage?.is_lost || false);

  useEffect(() => {
    if (stage) {
      setName(stage.name);
      setDescription(stage.description || '');
      setColor(stage.color || STAGE_COLORS[0]);
      setIsWon(stage.is_won || false);
      setIsLost(stage.is_lost || false);
    } else {
      setName('');
      setDescription('');
      setColor(STAGE_COLORS[0]);
      setIsWon(false);
      setIsLost(false);
    }
  }, [stage]);

  useImperativeHandle(ref, () => ({
    getData: () => {
      const data: Partial<Stage> & { id?: string } = {
        name: name.trim(),
        description: description.trim() || null,
        color,
        is_won: isWon,
        is_lost: isLost,
      };

      if (isNew) {
        data.order_index = nextOrderIndex;
      } else if (stage) {
        data.id = stage.id;
      }

      return data;
    },
    isValid: () => !!name.trim(),
  }));

  const handleWonChange = (checked: boolean) => {
    setIsWon(checked);
    if (checked) setIsLost(false);
  };

  const handleLostChange = (checked: boolean) => {
    setIsLost(checked);
    if (checked) setIsWon(false);
  };

  return (
    <div className="rounded-xl border bg-card/50 flex flex-col">
      <div className="flex items-center justify-between p-3 sm:p-4 border-b shrink-0">
        <h4 className="font-semibold text-foreground text-sm sm:text-base">
          {isNew ? 'Nova Etapa' : 'Editar Etapa'}
        </h4>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={onCancel}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="p-3 sm:p-4 space-y-3">
        <div className="space-y-1.5 sm:space-y-2">
          <Label htmlFor="stage-name" className="text-sm">Nome da etapa *</Label>
          <Input
            id="stage-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ex: Qualificação"
            required
            autoFocus
            className="h-9 sm:h-10"
          />
        </div>

        <div className="space-y-1.5 sm:space-y-2">
          <Label htmlFor="stage-description" className="text-sm">Descrição</Label>
          <Textarea
            id="stage-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Descreva o objetivo desta etapa..."
            rows={2}
            className="min-h-[60px] sm:min-h-[80px]"
          />
        </div>

        <div className="space-y-1.5 sm:space-y-2">
          <Label className="text-sm">Cor da etapa</Label>
          <div className="flex flex-wrap gap-1.5 sm:gap-2">
            {STAGE_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                className={cn(
                  "w-7 h-7 sm:w-8 sm:h-8 rounded-full transition-all duration-200 ring-offset-2 ring-offset-background",
                  color === c && "ring-2 ring-primary scale-110"
                )}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-4 pt-2">
          <div className="flex items-center justify-between p-2.5 sm:p-3 rounded-lg border bg-emerald-500/5 border-emerald-500/20">
            <div className="flex items-center gap-2">
              <Trophy className="h-4 w-4 text-emerald-600 shrink-0" />
              <Label htmlFor="is-won" className="text-xs sm:text-sm font-normal cursor-pointer">
                Ganho
              </Label>
            </div>
            <Switch
              id="is-won"
              checked={isWon}
              onCheckedChange={handleWonChange}
            />
          </div>

          <div className="flex items-center justify-between p-2.5 sm:p-3 rounded-lg border bg-destructive/5 border-destructive/20">
            <div className="flex items-center gap-2">
              <XCircle className="h-4 w-4 text-destructive shrink-0" />
              <Label htmlFor="is-lost" className="text-xs sm:text-sm font-normal cursor-pointer">
                Perda
              </Label>
            </div>
            <Switch
              id="is-lost"
              checked={isLost}
              onCheckedChange={handleLostChange}
            />
          </div>
        </div>
      </div>
    </div>
  );
});

StageEditForm.displayName = 'StageEditForm';
