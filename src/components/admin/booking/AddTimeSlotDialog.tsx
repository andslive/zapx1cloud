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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { DAY_NAMES } from '@/hooks/useUserAvailability';
import { Plus, X } from 'lucide-react';

// Generate time options in 30-minute increments
const TIME_OPTIONS = Array.from({ length: 48 }, (_, i) => {
  const hours = Math.floor(i / 2);
  const minutes = i % 2 === 0 ? '00' : '30';
  return `${hours.toString().padStart(2, '0')}:${minutes}`;
});

interface TimeSlot {
  start_time: string;
  end_time: string;
}

interface AddTimeSlotDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dayOfWeek: number;
  onAdd: (slots: TimeSlot[]) => void;
  isLoading?: boolean;
}

export function AddTimeSlotDialog({ 
  open, 
  onOpenChange, 
  dayOfWeek, 
  onAdd,
  isLoading 
}: AddTimeSlotDialogProps) {
  const [slots, setSlots] = useState<TimeSlot[]>([
    { start_time: '09:00', end_time: '12:00' },
  ]);

  const handleAddSlot = () => {
    const lastSlot = slots[slots.length - 1];
    // Try to set the next slot starting from where the last one ended
    const newStartTime = lastSlot.end_time;
    const newEndTimeIndex = TIME_OPTIONS.indexOf(newStartTime) + 2;
    const newEndTime = TIME_OPTIONS[newEndTimeIndex] || '18:00';
    
    setSlots([...slots, { start_time: newStartTime, end_time: newEndTime }]);
  };

  const handleRemoveSlot = (index: number) => {
    setSlots(slots.filter((_, i) => i !== index));
  };

  const handleUpdateSlot = (index: number, field: keyof TimeSlot, value: string) => {
    setSlots(slots.map((slot, i) => 
      i === index ? { ...slot, [field]: value } : slot
    ));
  };

  const handleSave = () => {
    // Validate that end times are after start times
    const validSlots = slots.filter(slot => slot.start_time < slot.end_time);
    if (validSlots.length > 0) {
      onAdd(validSlots);
      setSlots([{ start_time: '09:00', end_time: '12:00' }]);
    }
  };

  const handleClose = () => {
    onOpenChange(false);
    setSlots([{ start_time: '09:00', end_time: '12:00' }]);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Adicionar horários - {DAY_NAMES[dayOfWeek]}</DialogTitle>
          <DialogDescription>
            Defina os intervalos de disponibilidade para este dia
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-4">
          {slots.map((slot, index) => (
            <div key={index} className="flex items-center gap-2">
              <Select
                value={slot.start_time}
                onValueChange={(v) => handleUpdateSlot(index, 'start_time', v)}
              >
                <SelectTrigger className="flex-1">
                  <SelectValue placeholder="Início" />
                </SelectTrigger>
                <SelectContent>
                  {TIME_OPTIONS.map((t) => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              
              <span className="text-muted-foreground shrink-0">até</span>
              
              <Select
                value={slot.end_time}
                onValueChange={(v) => handleUpdateSlot(index, 'end_time', v)}
              >
                <SelectTrigger className="flex-1">
                  <SelectValue placeholder="Fim" />
                </SelectTrigger>
                <SelectContent>
                  {TIME_OPTIONS.map((t) => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {slots.length > 1 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => handleRemoveSlot(index)}
                  className="shrink-0"
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
          ))}

          {/* Validation warnings */}
          {slots.some(slot => slot.start_time >= slot.end_time) && (
            <p className="text-sm text-destructive">
              O horário de término deve ser após o início
            </p>
          )}

          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={handleAddSlot}
          >
            <Plus className="h-4 w-4 mr-2" />
            Adicionar outro intervalo
          </Button>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={handleClose}>
            Cancelar
          </Button>
          <Button 
            onClick={handleSave} 
            disabled={slots.length === 0 || slots.some(s => s.start_time >= s.end_time) || isLoading}
          >
            {isLoading ? 'Salvando...' : 'Salvar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
