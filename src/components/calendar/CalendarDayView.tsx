import { useMemo } from 'react';
import { format, isSameDay, isToday } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { CalendarEvent } from '@/hooks/useCalendarEvents';
import { cn } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';

interface CalendarDayViewProps {
  currentDate: Date;
  events: CalendarEvent[];
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

export function CalendarDayView({ currentDate, events, onEventClick }: CalendarDayViewProps) {
  const dayEvents = useMemo(() => {
    return events.filter((event) => isSameDay(new Date(event.start_time), currentDate));
  }, [events, currentDate]);

  const getEventPosition = (event: CalendarEvent) => {
    const startTime = new Date(event.start_time);
    const endTime = new Date(event.end_time);
    const startHour = startTime.getHours() + startTime.getMinutes() / 60;
    const endHour = endTime.getHours() + endTime.getMinutes() / 60;
    const top = startHour * 80; // 80px per hour
    const height = Math.max((endHour - startHour) * 80, 40); // Minimum 40px
    return { top, height };
  };

  return (
    <div className="bg-card rounded-lg border overflow-hidden">
      {/* Header */}
      <div className={cn(
        "p-4 border-b text-center",
        isToday(currentDate) && "bg-primary/10"
      )}>
        <div className="text-sm text-muted-foreground">
          {format(currentDate, 'EEEE', { locale: ptBR })}
        </div>
        <div className={cn(
          "text-3xl font-bold",
          isToday(currentDate) && "text-primary"
        )}>
          {format(currentDate, 'd')}
        </div>
        <div className="text-sm text-muted-foreground">
          {format(currentDate, 'MMMM yyyy', { locale: ptBR })}
        </div>
      </div>

      {/* Time grid */}
      <ScrollArea className="h-[600px]">
        <div className="grid grid-cols-[80px_1fr]">
          {/* Hours column */}
          <div className="border-r">
            {HOURS.map((hour) => (
              <div 
                key={hour} 
                className="h-[80px] border-b text-sm text-muted-foreground text-right pr-3 pt-2"
              >
                {hour.toString().padStart(2, '0')}:00
              </div>
            ))}
          </div>

          {/* Events column */}
          <div className="relative">
            {/* Hour lines */}
            {HOURS.map((hour) => (
              <div 
                key={hour} 
                className="h-[80px] border-b hover:bg-muted/30"
              />
            ))}

            {/* Events */}
            {dayEvents.map((event) => {
              const { top, height } = getEventPosition(event);
              
              return (
                <div
                  key={event.id}
                  onClick={() => onEventClick(event)}
                  className={cn(
                    "absolute left-2 right-2 px-3 py-2 rounded-lg text-white cursor-pointer hover:opacity-90 transition-opacity shadow-sm",
                    EVENT_TYPE_COLORS[event.event_type] || 'bg-gray-500'
                  )}
                  style={{ top: `${top}px`, height: `${height}px` }}
                >
                  <div className="font-medium">{event.title}</div>
                  <div className="text-sm opacity-80">
                    {format(new Date(event.start_time), 'HH:mm')} - {format(new Date(event.end_time), 'HH:mm')}
                  </div>
                  {height >= 80 && event.location && (
                    <div className="text-sm opacity-70 mt-1 truncate">
                      📍 {event.location}
                    </div>
                  )}
                  {height >= 100 && event.lead && (
                    <div className="text-sm opacity-70 truncate">
                      👤 {event.lead.name}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}
