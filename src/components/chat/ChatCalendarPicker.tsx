import { useState, useEffect } from 'react';
import { format, addDays, isBefore, isAfter, startOfDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { motion } from 'framer-motion';
import { Calendar as CalendarIcon, Clock, Globe, Loader2 } from 'lucide-react';
import { Calendar } from '@/components/ui/calendar';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';

interface TimeSlot {
  time: string;
  available: boolean;
}

interface ChatCalendarPickerProps {
  eventTypeId: string;
  primaryColor: string;
  onSelect: (date: Date, slot: { start: string; end: string }) => void;
  className?: string;
}

export function ChatCalendarPicker({
  eventTypeId,
  primaryColor,
  onSelect,
  className,
}: ChatCalendarPickerProps) {
  const [selectedDate, setSelectedDate] = useState<Date>();
  const [slots, setSlots] = useState<TimeSlot[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);

  // Fetch available slots when date is selected
  useEffect(() => {
    if (!selectedDate || !eventTypeId) return;

    const fetchSlots = async () => {
      setLoading(true);
      setSlots([]);
      setSelectedSlot(null);

      try {
        const { data, error } = await supabase.functions.invoke('booking-availability', {
          body: {
            eventTypeId,
            date: format(selectedDate, 'yyyy-MM-dd'),
            timezone: 'America/Sao_Paulo',
          },
        });

        if (error) {
          console.error('Error fetching slots:', error);
          setSlots([]);
          return;
        }

        setSlots(data?.slots || []);
      } catch (err) {
        console.error('Error fetching availability:', err);
        setSlots([]);
      } finally {
        setLoading(false);
      }
    };

    fetchSlots();
  }, [selectedDate, eventTypeId]);

  const handleSlotClick = (slot: TimeSlot) => {
    if (!slot.available || !selectedDate) return;
    setSelectedSlot(slot.time);
  };

  const handleConfirm = () => {
    if (!selectedDate || !selectedSlot) return;
    
    // Calculate end time (assuming 30min duration by default - will be overridden by event type)
    const [hours, minutes] = selectedSlot.split(':').map(Number);
    const endHours = hours + Math.floor((minutes + 30) / 60);
    const endMinutes = (minutes + 30) % 60;
    const endTime = `${String(endHours).padStart(2, '0')}:${String(endMinutes).padStart(2, '0')}`;

    onSelect(selectedDate, { start: selectedSlot, end: endTime });
  };

  const availableSlots = slots.filter((s) => s.available);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn('w-full', className)}
    >
      <Card className="overflow-hidden border-0 shadow-lg">
        <CardContent className="p-0">
          {/* Header */}
          <div 
            className="p-4 text-white"
            style={{ backgroundColor: primaryColor }}
          >
            <div className="flex items-center gap-2 text-sm font-medium">
              <CalendarIcon className="h-4 w-4" />
              <span>Selecione a data e horário</span>
            </div>
            <div className="flex items-center gap-1 text-xs opacity-80 mt-1">
              <Globe className="h-3 w-3" />
              <span>Fuso: America/Sao_Paulo</span>
            </div>
          </div>

          <div className="p-4 space-y-4">
            {/* Calendar */}
            <Calendar
              mode="single"
              selected={selectedDate}
              onSelect={setSelectedDate}
              disabled={(date) =>
                isBefore(startOfDay(date), startOfDay(new Date())) ||
                isAfter(date, addDays(new Date(), 60))
              }
              locale={ptBR}
              className="rounded-lg border mx-auto"
              classNames={{
                day_selected: 'text-white',
              }}
              modifiersStyles={{
                selected: { backgroundColor: primaryColor },
              }}
            />

            {/* Time Slots */}
            {selectedDate && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="pt-4 border-t"
              >
                <div className="flex items-center gap-2 mb-3">
                  <Clock className="h-4 w-4" style={{ color: primaryColor }} />
                  <span className="text-sm font-medium">
                    Horários - {format(selectedDate, 'dd/MM', { locale: ptBR })}
                  </span>
                </div>

                {loading ? (
                  <div className="flex justify-center py-6">
                    <Loader2 
                      className="h-6 w-6 animate-spin" 
                      style={{ color: primaryColor }} 
                    />
                  </div>
                ) : availableSlots.length === 0 ? (
                  <div className="text-center py-6">
                    <p className="text-sm text-muted-foreground">
                      Sem horários disponíveis nesta data
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Selecione outra data
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-3 gap-2 max-h-48 overflow-y-auto">
                      {availableSlots.map((slot) => (
                        <motion.button
                          key={slot.time}
                          whileHover={{ scale: 1.02 }}
                          whileTap={{ scale: 0.98 }}
                          onClick={() => handleSlotClick(slot)}
                          className={cn(
                            'p-2.5 rounded-lg text-sm font-medium transition-all',
                            selectedSlot === slot.time
                              ? 'text-white shadow-md'
                              : 'border hover:border-primary/50 bg-background'
                          )}
                          style={{
                            backgroundColor: selectedSlot === slot.time ? primaryColor : undefined,
                            borderColor: selectedSlot === slot.time ? primaryColor : undefined,
                          }}
                        >
                          {slot.time}
                        </motion.button>
                      ))}
                    </div>

                    {/* Confirm Button */}
                    {selectedSlot && (
                      <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="mt-4"
                      >
                        <Button
                          onClick={handleConfirm}
                          className="w-full text-white"
                          style={{ backgroundColor: primaryColor }}
                        >
                          Confirmar {format(selectedDate, 'dd/MM')} às {selectedSlot}
                        </Button>
                      </motion.div>
                    )}
                  </>
                )}
              </motion.div>
            )}
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
