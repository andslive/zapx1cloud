import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Calendar } from '@/components/ui/calendar';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Plus, X, Copy, Trash2, Clock } from 'lucide-react';
import { useUserAvailability, DAY_NAMES, DAY_ABBREVIATIONS } from '@/hooks/useUserAvailability';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { CopyDayDialog } from './CopyDayDialog';
import { AddTimeSlotDialog } from './AddTimeSlotDialog';
import { ScrollArea } from '@/components/ui/scroll-area';

const TIME_OPTIONS = Array.from({ length: 48 }, (_, i) => {
  const hours = Math.floor(i / 2);
  const minutes = i % 2 === 0 ? '00' : '30';
  return `${hours.toString().padStart(2, '0')}:${minutes}`;
});

export function AvailabilityManager() {
  const { 
    availability,
    availabilityByDay, 
    overrides, 
    isLoading, 
    addTimeSlot, 
    removeTimeSlot, 
    updateTimeSlot,
    addOverride,
    removeOverride,
  } = useUserAvailability();

  const [selectedDate, setSelectedDate] = useState<Date | undefined>();
  const [overrideDialogOpen, setOverrideDialogOpen] = useState(false);
  const [copyDialogOpen, setCopyDialogOpen] = useState(false);
  const [addSlotDialogOpen, setAddSlotDialogOpen] = useState(false);
  const [selectedDay, setSelectedDay] = useState<number>(0);
  const [isCopying, setIsCopying] = useState(false);
  const [overrideForm, setOverrideForm] = useState({
    is_available: false,
    start_time: '09:00',
    end_time: '17:00',
    reason: '',
  });

  const handleOpenCopyDialog = (day: number) => {
    setSelectedDay(day);
    setCopyDialogOpen(true);
  };

  const handleOpenAddSlotDialog = (day: number) => {
    setSelectedDay(day);
    setAddSlotDialogOpen(true);
  };

  const handleCopyToMultipleDays = async (toDays: number[]) => {
    setIsCopying(true);
    try {
      const fromSlots = availability.filter(s => s.day_of_week === selectedDay);
      
      for (const toDay of toDays) {
        // First, remove existing slots for target day
        const existingSlots = availability.filter(s => s.day_of_week === toDay);
        for (const slot of existingSlots) {
          await removeTimeSlot.mutateAsync(slot.id);
        }
        
        // Then add new slots
        for (const slot of fromSlots) {
          await addTimeSlot.mutateAsync({
            day_of_week: toDay,
            start_time: slot.start_time,
            end_time: slot.end_time,
          });
        }
      }
      
      toast.success(`Horários copiados para ${toDays.length} dia${toDays.length !== 1 ? 's' : ''}`);
      setCopyDialogOpen(false);
    } catch (error) {
      toast.error('Erro ao copiar horários');
    } finally {
      setIsCopying(false);
    }
  };

  const handleAddMultipleSlots = async (slots: { start_time: string; end_time: string }[]) => {
    try {
      for (const slot of slots) {
        await addTimeSlot.mutateAsync({
          day_of_week: selectedDay,
          start_time: slot.start_time,
          end_time: slot.end_time,
        });
      }
      toast.success(`${slots.length} horário${slots.length !== 1 ? 's' : ''} adicionado${slots.length !== 1 ? 's' : ''}`);
      setAddSlotDialogOpen(false);
    } catch (error) {
      toast.error('Erro ao adicionar horários');
    }
  };

  const handleQuickAddSlot = (day: number) => {
    const existingSlots = availabilityByDay[day] || [];
    let startTime = '09:00';
    let endTime = '17:00';
    
    if (existingSlots.length > 0) {
      // Find a gap or add after the last slot
      const lastSlot = existingSlots[existingSlots.length - 1];
      startTime = lastSlot.end_time;
      const endTimeIndex = TIME_OPTIONS.indexOf(startTime) + 2;
      endTime = TIME_OPTIONS[endTimeIndex] || '18:00';
    }
    
    addTimeSlot.mutate({
      day_of_week: day,
      start_time: startTime,
      end_time: endTime,
    });
  };

  const handleOpenOverrideDialog = (date: Date) => {
    setSelectedDate(date);
    const existingOverride = overrides.find(o => o.date === format(date, 'yyyy-MM-dd'));
    if (existingOverride) {
      setOverrideForm({
        is_available: existingOverride.is_available,
        start_time: existingOverride.start_time || '09:00',
        end_time: existingOverride.end_time || '17:00',
        reason: existingOverride.reason || '',
      });
    } else {
      setOverrideForm({
        is_available: false,
        start_time: '09:00',
        end_time: '17:00',
        reason: '',
      });
    }
    setOverrideDialogOpen(true);
  };

  const handleSaveOverride = () => {
    if (!selectedDate) return;
    
    addOverride.mutate({
      date: format(selectedDate, 'yyyy-MM-dd'),
      is_available: overrideForm.is_available,
      start_time: overrideForm.is_available ? overrideForm.start_time : null,
      end_time: overrideForm.is_available ? overrideForm.end_time : null,
      reason: overrideForm.reason || null,
    });
    setOverrideDialogOpen(false);
  };

  const overrideDates = overrides.reduce((acc, o) => {
    acc[o.date] = o.is_available;
    return acc;
  }, {} as Record<string, boolean>);

  // Count total configured days
  const configuredDays = Object.keys(availabilityByDay).filter(
    day => (availabilityByDay[Number(day)] || []).length > 0
  ).length;

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid gap-4">
          {[1, 2, 3, 4, 5, 6, 7].map((i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold">Disponibilidade</h2>
          <p className="text-muted-foreground">
            Configure quando você está disponível para reuniões
          </p>
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted/50 rounded-lg px-3 py-2">
          <Clock className="h-4 w-4" />
          <span>{configuredDays} dia{configuredDays !== 1 ? 's' : ''} configurado{configuredDays !== 1 ? 's' : ''}</span>
        </div>
      </div>

      {/* Main Content */}
      <div className="grid lg:grid-cols-5 gap-6">
        {/* Weekly Schedule - Takes more space */}
        <div className="lg:col-span-3">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Horários Semanais</CardTitle>
              <CardDescription>
                Defina sua disponibilidade padrão para cada dia da semana
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {[1, 2, 3, 4, 5, 6, 0].map((day) => {
                const slots = availabilityByDay[day] || [];
                const hasSlots = slots.length > 0;
                
                return (
                  <div 
                    key={day} 
                    className={cn(
                      "rounded-lg border p-3 transition-colors",
                      hasSlots ? "bg-background" : "bg-muted/30"
                    )}
                  >
                    <div className="flex items-start gap-3">
                      {/* Day Label */}
                      <div className="flex items-center gap-2 min-w-[100px] shrink-0">
                        <div className={cn(
                          'w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium',
                          hasSlots 
                            ? 'bg-primary text-primary-foreground' 
                            : 'bg-muted text-muted-foreground'
                        )}>
                          {DAY_ABBREVIATIONS[day]}
                        </div>
                        <span className="text-sm font-medium hidden sm:inline">
                          {DAY_NAMES[day]}
                        </span>
                      </div>

                      {/* Slots */}
                      <div className="flex-1 space-y-2 min-w-0">
                        {!hasSlots ? (
                          <span className="text-sm text-muted-foreground">Indisponível</span>
                        ) : (
                          slots.map((slot) => (
                            <div key={slot.id} className="flex items-center gap-2 flex-wrap">
                              <Select
                                value={slot.start_time}
                                onValueChange={(v) => updateTimeSlot.mutate({ 
                                  id: slot.id, 
                                  start_time: v, 
                                  end_time: slot.end_time 
                                })}
                              >
                                <SelectTrigger className="w-[90px] h-8 text-xs">
                                  <SelectValue placeholder={slot.start_time} />
                                </SelectTrigger>
                                <SelectContent className="z-50 bg-popover">
                                  {TIME_OPTIONS.map((t) => (
                                    <SelectItem key={t} value={t}>{t}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <span className="text-muted-foreground text-xs">-</span>
                              <Select
                                value={slot.end_time}
                                onValueChange={(v) => updateTimeSlot.mutate({ 
                                  id: slot.id, 
                                  start_time: slot.start_time, 
                                  end_time: v 
                                })}
                              >
                                <SelectTrigger className="w-[90px] h-8 text-xs">
                                  <SelectValue placeholder={slot.end_time} />
                                </SelectTrigger>
                                <SelectContent className="z-50 bg-popover">
                                  {TIME_OPTIONS.map((t) => (
                                    <SelectItem key={t} value={t}>{t}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 shrink-0"
                                onClick={() => removeTimeSlot.mutate(slot.id)}
                              >
                                <X className="h-3 w-3" />
                              </Button>
                            </div>
                          ))
                        )}
                      </div>

                      {/* Actions */}
                      <div className="flex gap-1 shrink-0">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => handleQuickAddSlot(day)}
                          title="Adicionar horário rápido"
                        >
                          <Plus className="h-4 w-4" />
                        </Button>
                        {hasSlots && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => handleOpenCopyDialog(day)}
                            title="Copiar para outros dias"
                          >
                            <Copy className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}

              {/* Quick Actions */}
              <div className="pt-4 border-t flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleOpenAddSlotDialog(1)}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Adicionar múltiplos horários
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Specific Dates */}
        <div className="lg:col-span-2">
          <Card className="h-fit">
            <CardHeader>
              <CardTitle className="text-lg">Datas Específicas</CardTitle>
              <CardDescription>
                Ajuste horários para datas específicas
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Calendar
                mode="single"
                selected={selectedDate}
                onSelect={handleOpenOverrideDialog}
                disabled={(date) => date < new Date()}
                modifiers={{
                  blocked: Object.entries(overrideDates)
                    .filter(([_, available]) => !available)
                    .map(([date]) => new Date(date)),
                  available: Object.entries(overrideDates)
                    .filter(([_, available]) => available)
                    .map(([date]) => new Date(date)),
                }}
                modifiersStyles={{
                  blocked: { backgroundColor: 'hsl(var(--destructive) / 0.2)' },
                  available: { backgroundColor: 'hsl(var(--primary) / 0.2)' },
                }}
                locale={ptBR}
                className="rounded-md border pointer-events-auto w-full"
              />

              {/* Active Exceptions */}
              {overrides.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-sm font-medium">Exceções ativas</h4>
                  <ScrollArea className="h-[180px]">
                    <div className="space-y-2 pr-4">
                      {overrides.map((override) => (
                        <div 
                          key={override.id} 
                          className="flex items-center justify-between rounded-lg border p-2 text-sm"
                        >
                          <div>
                            <p className="font-medium">
                              {format(new Date(override.date), "dd 'de' MMM", { locale: ptBR })}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {override.is_available 
                                ? `${override.start_time} - ${override.end_time}`
                                : override.reason || 'Bloqueado'
                              }
                            </p>
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => removeOverride.mutate(override.id)}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Copy Day Dialog */}
      <CopyDayDialog
        open={copyDialogOpen}
        onOpenChange={setCopyDialogOpen}
        fromDay={selectedDay}
        slots={availability}
        onCopy={handleCopyToMultipleDays}
        isLoading={isCopying}
      />

      {/* Add Time Slot Dialog */}
      <AddTimeSlotDialog
        open={addSlotDialogOpen}
        onOpenChange={setAddSlotDialogOpen}
        dayOfWeek={selectedDay}
        onAdd={handleAddMultipleSlots}
        isLoading={addTimeSlot.isPending}
      />

      {/* Override Dialog */}
      <Dialog open={overrideDialogOpen} onOpenChange={setOverrideDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {selectedDate && format(selectedDate, "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
            </DialogTitle>
            <DialogDescription>
              Configure a disponibilidade para esta data específica
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="flex gap-4">
              <Button
                type="button"
                variant={!overrideForm.is_available ? 'default' : 'outline'}
                className="flex-1"
                onClick={() => setOverrideForm(prev => ({ ...prev, is_available: false }))}
              >
                Bloquear dia
              </Button>
              <Button
                type="button"
                variant={overrideForm.is_available ? 'default' : 'outline'}
                className="flex-1"
                onClick={() => setOverrideForm(prev => ({ ...prev, is_available: true }))}
              >
                Definir horários
              </Button>
            </div>

            {overrideForm.is_available ? (
              <div className="flex items-center gap-2">
                <Select
                  value={overrideForm.start_time}
                  onValueChange={(v) => setOverrideForm(prev => ({ ...prev, start_time: v }))}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TIME_OPTIONS.map((t) => (
                      <SelectItem key={t} value={t}>{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <span className="shrink-0">até</span>
                <Select
                  value={overrideForm.end_time}
                  onValueChange={(v) => setOverrideForm(prev => ({ ...prev, end_time: v }))}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TIME_OPTIONS.map((t) => (
                      <SelectItem key={t} value={t}>{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <div className="space-y-2">
                <Label htmlFor="reason">Motivo (opcional)</Label>
                <Textarea
                  id="reason"
                  value={overrideForm.reason}
                  onChange={(e) => setOverrideForm(prev => ({ ...prev, reason: e.target.value }))}
                  placeholder="Ex: Férias, consulta médica..."
                />
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOverrideDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSaveOverride} disabled={addOverride.isPending}>
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
