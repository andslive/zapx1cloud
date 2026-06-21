import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { DAY_NAMES, DAY_ABBREVIATIONS, type UserAvailability } from '@/hooks/useUserAvailability';

interface CopyDayDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fromDay: number;
  slots: UserAvailability[];
  onCopy: (toDays: number[]) => void;
  isLoading?: boolean;
}

export function CopyDayDialog({ 
  open, 
  onOpenChange, 
  fromDay, 
  slots,
  onCopy,
  isLoading 
}: CopyDayDialogProps) {
  const [selectedDays, setSelectedDays] = useState<number[]>([]);

  const fromSlots = slots.filter(s => s.day_of_week === fromDay);

  const handleToggleDay = (day: number) => {
    setSelectedDays(prev => 
      prev.includes(day) 
        ? prev.filter(d => d !== day)
        : [...prev, day]
    );
  };

  const handleSelectWeekdays = () => {
    setSelectedDays([1, 2, 3, 4, 5].filter(d => d !== fromDay));
  };

  const handleSelectAll = () => {
    setSelectedDays([0, 1, 2, 3, 4, 5, 6].filter(d => d !== fromDay));
  };

  const handleClear = () => {
    setSelectedDays([]);
  };

  const handleCopy = () => {
    onCopy(selectedDays);
    setSelectedDays([]);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Copiar horários de {DAY_NAMES[fromDay]}</DialogTitle>
          <DialogDescription>
            Selecione os dias para onde deseja copiar os horários
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Preview of slots being copied */}
          <div className="bg-muted/50 rounded-lg p-3 space-y-1">
            <p className="text-sm font-medium">Horários a copiar:</p>
            {fromSlots.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum horário configurado</p>
            ) : (
              fromSlots.map((slot, i) => (
                <p key={i} className="text-sm text-muted-foreground">
                  {slot.start_time} - {slot.end_time}
                </p>
              ))
            )}
          </div>

          {/* Quick selection buttons */}
          <div className="flex gap-2 flex-wrap">
            <Button 
              type="button" 
              variant="outline" 
              size="sm"
              onClick={handleSelectWeekdays}
            >
              Dias úteis
            </Button>
            <Button 
              type="button" 
              variant="outline" 
              size="sm"
              onClick={handleSelectAll}
            >
              Todos
            </Button>
            <Button 
              type="button" 
              variant="ghost" 
              size="sm"
              onClick={handleClear}
            >
              Limpar
            </Button>
          </div>

          {/* Day selector */}
          <div className="flex justify-center gap-2">
            {[0, 1, 2, 3, 4, 5, 6].map(day => (
              <Button
                key={day}
                type="button"
                variant={selectedDays.includes(day) ? 'default' : 'outline'}
                className={cn(
                  'h-12 w-12 rounded-full p-0',
                  day === fromDay && 'opacity-50 cursor-not-allowed'
                )}
                onClick={() => day !== fromDay && handleToggleDay(day)}
                disabled={day === fromDay}
                title={DAY_NAMES[day]}
              >
                {DAY_ABBREVIATIONS[day]}
              </Button>
            ))}
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button 
            type="button" 
            variant="outline" 
            onClick={() => onOpenChange(false)}
          >
            Cancelar
          </Button>
          <Button 
            onClick={handleCopy} 
            disabled={selectedDays.length === 0 || fromSlots.length === 0 || isLoading}
          >
            {isLoading ? 'Copiando...' : `Copiar para ${selectedDays.length} dia${selectedDays.length !== 1 ? 's' : ''}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
