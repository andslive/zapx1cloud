import { useMemo } from 'react';
import { 
  startOfWeek, 
  endOfWeek, 
  eachDayOfInterval, 
  format, 
  isSameDay, 
  isToday,
  addHours,
  startOfDay,
} from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { CalendarEvent } from '@/hooks/useCalendarEvents';
import { cn } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';

interface CalendarWeekViewProps {
  currentDate: Date;
  events: CalendarEvent[];
  onDateClick: (date: Date) => void;
  onEventClick: (event: CalendarEvent) => void;
}

const EVENT_TYPE_COLORS: Record<string, string> = {
  meeting: 'bg-blue-500',
  call: 'bg-green-500',
  demo: 'bg-purple-500',
  follow_up: 'bg-orange-500',
  other: 'bg-gray-500',
};

const HOURS = Array.from({ length: 24 }, (_, i) => i);

export function CalendarWeekView({ 
  currentDate, 
  events, 
  onDateClick, 
  onEventClick 
}: CalendarWeekViewProps) {
  const weekDays = useMemo(() => {
    const weekStart = startOfWeek(currentDate, { locale: ptBR });
    const weekEnd = endOfWeek(currentDate, { locale: ptBR });
    return eachDayOfInterval({ start: weekStart, end: weekEnd });
  }, [currentDate]);

  const getEventsForDay = (day: Date) => {
    return events.filter((event) => isSameDay(new Date(event.start_time), day));
  };

  const getEventPosition = (event: CalendarEvent) => {
    const startTime = new Date(event.start_time);
    const endTime = new Date(event.end_time);
    const startHour = startTime.getHours() + startTime.getMinutes() / 60;
    const endHour = endTime.getHours() + endTime.getMinutes() / 60;
    const top = startHour * 60; // 60px per hour
    const height = Math.max((endHour - startHour) * 60, 30); // Minimum 30px
    return { top, height };
  };

  return (
    <div className="bg-card rounded-lg border overflow-hidden">
      {/* Header with days */}
      <div className="grid grid-cols-[60px_repeat(7,1fr)] border-b bg-muted/50 sticky top-0 z-10">
        <div className="p-2 text-center text-xs text-muted-foreground border-r">
          Hora
        </div>
        {weekDays.map((day) => (
          <div 
            key={day.toISOString()} 
            className={cn(
              "p-2 text-center border-r",
              isToday(day) && "bg-primary/10"
            )}
          >
            <div className="text-xs text-muted-foreground">
              {format(day, 'EEE', { locale: ptBR })}
            </div>
            <div className={cn(
              "text-lg font-semibold",
              isToday(day) && "text-primary"
            )}>
              {format(day, 'd')}
            </div>
          </div>
        ))}
      </div>

      {/* Time grid */}
      <ScrollArea className="h-[600px]">
        <div className="grid grid-cols-[60px_repeat(7,1fr)]">
          {/* Hours column */}
          <div className="border-r">
            {HOURS.map((hour) => (
              <div 
                key={hour} 
                className="h-[60px] border-b text-xs text-muted-foreground text-right pr-2 pt-1"
              >
                {hour.toString().padStart(2, '0')}:00
              </div>
            ))}
          </div>

          {/* Days columns */}
          {weekDays.map((day) => {
            const dayEvents = getEventsForDay(day);
            
            return (
              <div 
                key={day.toISOString()} 
                className="relative border-r"
                onClick={() => onDateClick(day)}
              >
                {/* Hour lines */}
                {HOURS.map((hour) => (
                  <div 
                    key={hour} 
                    className="h-[60px] border-b hover:bg-muted/30 cursor-pointer"
                  />
                ))}

                {/* Events */}
                {dayEvents.map((event) => {
                  const { top, height } = getEventPosition(event);
                  
                  return (
                    <div
                      key={event.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        onEventClick(event);
                      }}
                      className={cn(
                        "absolute left-1 right-1 px-2 py-1 rounded text-xs text-white cursor-pointer hover:opacity-90 transition-opacity overflow-hidden",
                        EVENT_TYPE_COLORS[event.event_type] || 'bg-gray-500'
                      )}
                      style={{ top: `${top}px`, height: `${height}px` }}
                      title={event.title}
                    >
                      <div className="font-medium truncate">{event.title}</div>
                      {height >= 45 && (
                        <div className="truncate opacity-80">
                          {format(new Date(event.start_time), 'HH:mm')} - {format(new Date(event.end_time), 'HH:mm')}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}
