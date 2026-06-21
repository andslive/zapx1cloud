import { useState, useMemo } from 'react';
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, addMonths, subMonths, isToday, isSameMonth, eachDayOfInterval, isSameDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { CalendarDays, ChevronLeft, ChevronRight, Plus, Clock, MapPin, User } from 'lucide-react';
import { GoogleCalendarConnect } from '@/components/calendar/GoogleCalendarConnect';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { motion, AnimatePresence } from 'framer-motion';
import { useCalendarEvents, CalendarEvent } from '@/hooks/useCalendarEvents';
import { EventModal } from '@/components/calendar/EventModal';
import { useHaptics } from '@/hooks/useHaptics';
import { cn } from '@/lib/utils';

const EVENT_TYPE_COLORS: Record<string, string> = {
  meeting: 'bg-blue-500',
  call: 'bg-green-500',
  demo: 'bg-purple-500',
  follow_up: 'bg-amber-500',
  task: 'bg-cyan-500',
  other: 'bg-gray-500',
};

const EVENT_TYPE_LABELS: Record<string, string> = {
  meeting: 'Reunião',
  call: 'Ligação',
  demo: 'Demo',
  follow_up: 'Follow-up',
  task: 'Tarefa',
  other: 'Outro',
};

interface MobileSellerCalendarProps {
  userId: string;
  productId: string;
}

export function MobileSellerCalendar({ userId, productId }: MobileSellerCalendarProps) {
  const haptics = useHaptics();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(new Date());
  
  // Modal state
  const [isEventModalOpen, setIsEventModalOpen] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);

  // Calculate month range for calendar
  const monthRange = useMemo(() => {
    const monthStart = startOfMonth(currentDate);
    const monthEnd = endOfMonth(currentDate);
    return {
      startDate: startOfWeek(monthStart, { locale: ptBR }),
      endDate: endOfWeek(monthEnd, { locale: ptBR }),
    };
  }, [currentDate]);

  // Fetch events
  const { data: events = [], isLoading } = useCalendarEvents({
    ...monthRange,
    userId,
    productId,
  });

  // Calendar days for the month view
  const calendarDays = useMemo(() => {
    return eachDayOfInterval({
      start: monthRange.startDate,
      end: monthRange.endDate,
    });
  }, [monthRange]);

  // Events for selected date
  const selectedDateEvents = useMemo(() => {
    return events.filter(event => 
      isSameDay(new Date(event.start_time), selectedDate)
    ).sort((a, b) => 
      new Date(a.start_time).getTime() - new Date(b.start_time).getTime()
    );
  }, [events, selectedDate]);

  // Check if a day has events
  const dayHasEvents = (day: Date) => {
    return events.some(event => isSameDay(new Date(event.start_time), day));
  };

  // Navigation
  const navigatePrevious = () => {
    haptics.light();
    setCurrentDate(prev => subMonths(prev, 1));
  };

  const navigateNext = () => {
    haptics.light();
    setCurrentDate(prev => addMonths(prev, 1));
  };

  const handleDayClick = (day: Date) => {
    haptics.selection();
    setSelectedDate(day);
  };

  const handleEventClick = (event: CalendarEvent) => {
    haptics.light();
    setSelectedEvent(event);
    setIsEventModalOpen(true);
  };

  const handleNewEvent = () => {
    haptics.medium();
    setSelectedEvent(null);
    setIsEventModalOpen(true);
  };

  const weekDays = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];

  return (
    <div className="space-y-4 pb-20">
      {/* Google Calendar Integration */}
      <GoogleCalendarConnect />

      {/* Mini Month Calendar */}
      <Card>
        <CardContent className="p-4">
          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <Button variant="ghost" size="icon" onClick={navigatePrevious}>
              <ChevronLeft className="h-5 w-5" />
            </Button>
            <h2 className="text-lg font-semibold capitalize">
              {format(currentDate, 'MMMM yyyy', { locale: ptBR })}
            </h2>
            <Button variant="ghost" size="icon" onClick={navigateNext}>
              <ChevronRight className="h-5 w-5" />
            </Button>
          </div>

          {/* Weekday headers */}
          <div className="grid grid-cols-7 gap-1 mb-2">
            {weekDays.map((day, i) => (
              <div key={i} className="text-center text-xs font-medium text-muted-foreground py-1">
                {day}
              </div>
            ))}
          </div>

          {/* Calendar grid */}
          <div className="grid grid-cols-7 gap-1">
            {calendarDays.map((day, i) => {
              const isCurrentMonth = isSameMonth(day, currentDate);
              const isSelected = isSameDay(day, selectedDate);
              const hasEvents = dayHasEvents(day);
              
              return (
                <motion.button
                  key={i}
                  whileTap={{ scale: 0.9 }}
                  onClick={() => handleDayClick(day)}
                  className={cn(
                    "relative aspect-square flex flex-col items-center justify-center rounded-lg text-sm transition-colors",
                    !isCurrentMonth && "text-muted-foreground/50",
                    isToday(day) && !isSelected && "bg-primary/10 text-primary font-semibold",
                    isSelected && "bg-primary text-primary-foreground",
                    !isSelected && isCurrentMonth && "hover:bg-muted"
                  )}
                >
                  {format(day, 'd')}
                  {hasEvents && (
                    <div className={cn(
                      "absolute bottom-1 h-1.5 w-1.5 rounded-full",
                      isSelected ? "bg-primary-foreground" : "bg-primary"
                    )} />
                  )}
                </motion.button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Selected Date Events */}
      <div className="space-y-3">
        <div className="flex items-center justify-between px-1">
          <div>
            <h3 className="font-semibold capitalize">
              {isToday(selectedDate) ? 'Hoje' : format(selectedDate, "EEEE, d 'de' MMMM", { locale: ptBR })}
            </h3>
            <p className="text-sm text-muted-foreground">
              {selectedDateEvents.length} evento{selectedDateEvents.length !== 1 ? 's' : ''}
            </p>
          </div>
        </div>

        {isLoading ? (
          <Card>
            <CardContent className="py-8 flex items-center justify-center">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
            </CardContent>
          </Card>
        ) : selectedDateEvents.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center">
              <CalendarDays className="h-10 w-10 text-muted-foreground/50 mx-auto mb-3" />
              <p className="text-muted-foreground">Nenhum evento neste dia</p>
              <Button variant="ghost" size="sm" onClick={handleNewEvent} className="mt-2">
                <Plus className="h-4 w-4 mr-1" />
                Agendar
              </Button>
            </CardContent>
          </Card>
        ) : (
          <ScrollArea className="h-auto max-h-[400px]">
            <AnimatePresence mode="popLayout">
              {selectedDateEvents.map((event, index) => (
                <motion.div
                  key={event.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ delay: index * 0.05 }}
                >
                  <Card 
                    className="mb-3 cursor-pointer hover:bg-muted/50 transition-colors"
                    onClick={() => handleEventClick(event)}
                  >
                    <CardContent className="p-4">
                      <div className="flex gap-3">
                        {/* Time indicator */}
                        <div className={cn(
                          "w-1 rounded-full flex-shrink-0",
                          EVENT_TYPE_COLORS[event.event_type] || 'bg-gray-400'
                        )} />
                        
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <h4 className="font-medium truncate">{event.title}</h4>
                            <Badge variant="secondary" className="text-xs flex-shrink-0">
                              {EVENT_TYPE_LABELS[event.event_type] || event.event_type}
                            </Badge>
                          </div>
                          
                          <div className="flex items-center gap-1 text-sm text-muted-foreground mt-1">
                            <Clock className="h-3.5 w-3.5" />
                            <span>
                              {format(new Date(event.start_time), 'HH:mm', { locale: ptBR })}
                              {' - '}
                              {format(new Date(event.end_time), 'HH:mm', { locale: ptBR })}
                            </span>
                          </div>

                          {event.lead && (
                            <div className="flex items-center gap-1 text-sm text-muted-foreground mt-1">
                              <User className="h-3.5 w-3.5" />
                              <span className="truncate">{event.lead.name}</span>
                            </div>
                          )}

                          {event.location && (
                            <div className="flex items-center gap-1 text-sm text-muted-foreground mt-1">
                              <MapPin className="h-3.5 w-3.5" />
                              <span className="truncate">{event.location}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </AnimatePresence>
          </ScrollArea>
        )}
      </div>

      {/* FAB for new event */}
      <motion.button
        onClick={handleNewEvent}
        whileTap={{ scale: 0.9 }}
        className="fixed bottom-20 right-4 z-40 h-14 w-14 rounded-full bg-gradient-to-br from-primary to-primary/80 flex items-center justify-center shadow-lg"
      >
        <Plus className="h-6 w-6 text-primary-foreground" />
      </motion.button>

      {/* Event Modal */}
      <EventModal
        open={isEventModalOpen}
        onOpenChange={setIsEventModalOpen}
        event={selectedEvent}
        defaultDate={selectedDate}
        defaultProductId={productId}
      />
    </div>
  );
}
