import { useState, useMemo } from 'react';
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, addMonths, subMonths, addWeeks, subWeeks, addDays, subDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { CalendarDays, ChevronLeft, ChevronRight, Plus, List, Calendar, Grid3X3 } from 'lucide-react';
import { GoogleCalendarConnect } from '@/components/calendar/GoogleCalendarConnect';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useCalendarEvents, CalendarEvent } from '@/hooks/useCalendarEvents';
import { CalendarMonthView } from '@/components/calendar/CalendarMonthView';
import { CalendarWeekView } from '@/components/calendar/CalendarWeekView';
import { CalendarDayView } from '@/components/calendar/CalendarDayView';
import { CalendarListView } from '@/components/calendar/CalendarListView';
import { UpcomingEvents } from '@/components/calendar/UpcomingEvents';
import { EventModal } from '@/components/calendar/EventModal';

type ViewMode = 'month' | 'week' | 'day' | 'list';

const EVENT_TYPES = [
  { value: 'all', label: 'Todos os tipos' },
  { value: 'meeting', label: 'Reunião' },
  { value: 'call', label: 'Ligação' },
  { value: 'demo', label: 'Demonstração' },
  { value: 'follow_up', label: 'Follow-up' },
  { value: 'task', label: 'Tarefa' },
  { value: 'other', label: 'Outro' },
];

interface SellerCalendarProps {
  userId: string;
  productId: string;
}

export function SellerCalendar({ userId, productId }: SellerCalendarProps) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<ViewMode>('week');
  const [selectedEventType, setSelectedEventType] = useState<string>('all');
  
  // Modal state
  const [isEventModalOpen, setIsEventModalOpen] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [clickedDate, setClickedDate] = useState<Date | undefined>();

  // Calculate date range based on view mode
  const dateRange = useMemo(() => {
    switch (viewMode) {
      case 'month':
        const monthStart = startOfMonth(currentDate);
        const monthEnd = endOfMonth(currentDate);
        return {
          startDate: startOfWeek(monthStart, { locale: ptBR }),
          endDate: endOfWeek(monthEnd, { locale: ptBR }),
        };
      case 'week':
        return {
          startDate: startOfWeek(currentDate, { locale: ptBR }),
          endDate: endOfWeek(currentDate, { locale: ptBR }),
        };
      case 'day':
        return {
          startDate: currentDate,
          endDate: currentDate,
        };
      case 'list':
      default:
        const listStart = startOfMonth(currentDate);
        const listEnd = endOfMonth(currentDate);
        return {
          startDate: listStart,
          endDate: listEnd,
        };
    }
  }, [currentDate, viewMode]);

  // Fetch events - filtered to current user only
  const { data: events = [], isLoading } = useCalendarEvents({
    ...dateRange,
    userId,
    productId,
    eventType: selectedEventType !== 'all' ? selectedEventType : undefined,
  });

  // Navigation
  const navigatePrevious = () => {
    switch (viewMode) {
      case 'month':
        setCurrentDate(prev => subMonths(prev, 1));
        break;
      case 'week':
        setCurrentDate(prev => subWeeks(prev, 1));
        break;
      case 'day':
        setCurrentDate(prev => subDays(prev, 1));
        break;
    }
  };

  const navigateNext = () => {
    switch (viewMode) {
      case 'month':
        setCurrentDate(prev => addMonths(prev, 1));
        break;
      case 'week':
        setCurrentDate(prev => addWeeks(prev, 1));
        break;
      case 'day':
        setCurrentDate(prev => addDays(prev, 1));
        break;
    }
  };

  const goToToday = () => setCurrentDate(new Date());

  const handleDateClick = (date: Date) => {
    setClickedDate(date);
    setSelectedEvent(null);
    setIsEventModalOpen(true);
  };

  const handleEventClick = (event: CalendarEvent) => {
    setSelectedEvent(event);
    setClickedDate(undefined);
    setIsEventModalOpen(true);
  };

  const handleNewEvent = () => {
    setSelectedEvent(null);
    setClickedDate(new Date());
    setIsEventModalOpen(true);
  };

  const getCurrentTitle = () => {
    switch (viewMode) {
      case 'month':
        return format(currentDate, 'MMMM yyyy', { locale: ptBR });
      case 'week':
        const weekStart = startOfWeek(currentDate, { locale: ptBR });
        const weekEnd = endOfWeek(currentDate, { locale: ptBR });
        return `${format(weekStart, 'd', { locale: ptBR })} - ${format(weekEnd, 'd MMM yyyy', { locale: ptBR })}`;
      case 'day':
        return format(currentDate, "EEEE, d 'de' MMMM", { locale: ptBR });
      default:
        return format(currentDate, 'MMMM yyyy', { locale: ptBR });
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <CalendarDays className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h2 className="text-xl font-semibold text-foreground">Minha Agenda</h2>
            <p className="text-sm text-muted-foreground">
              {events.length} evento{events.length !== 1 ? 's' : ''} no período
            </p>
          </div>
        </div>
        <Button onClick={handleNewEvent} className="gap-2">
          <Plus className="h-4 w-4" />
          Novo Evento
        </Button>
      </div>

      {/* Upcoming Events Widget */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          {/* View Tabs & Filters */}
          <Card>
            <CardContent className="p-4">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as ViewMode)}>
                  <TabsList>
                    <TabsTrigger value="month" className="gap-2">
                      <Grid3X3 className="h-4 w-4" />
                      <span className="hidden sm:inline">Mês</span>
                    </TabsTrigger>
                    <TabsTrigger value="week" className="gap-2">
                      <Calendar className="h-4 w-4" />
                      <span className="hidden sm:inline">Semana</span>
                    </TabsTrigger>
                    <TabsTrigger value="day" className="gap-2">
                      <CalendarDays className="h-4 w-4" />
                      <span className="hidden sm:inline">Dia</span>
                    </TabsTrigger>
                    <TabsTrigger value="list" className="gap-2">
                      <List className="h-4 w-4" />
                      <span className="hidden sm:inline">Lista</span>
                    </TabsTrigger>
                  </TabsList>
                </Tabs>

                <Select value={selectedEventType} onValueChange={setSelectedEventType}>
                  <SelectTrigger className="w-[180px]">
                    <SelectValue placeholder="Tipo de evento" />
                  </SelectTrigger>
                  <SelectContent>
                    {EVENT_TYPES.map((type) => (
                      <SelectItem key={type.value} value={type.value}>
                        {type.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {/* Navigation (hidden for list view) */}
          {viewMode !== 'list' && (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Button variant="outline" size="icon" onClick={navigatePrevious}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="icon" onClick={navigateNext}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="sm" onClick={goToToday}>
                  Hoje
                </Button>
              </div>
              <h3 className="text-lg font-medium capitalize">{getCurrentTitle()}</h3>
            </div>
          )}

          {/* Calendar View */}
          <Card>
            <CardContent className="p-0">
              {isLoading ? (
                <div className="h-96 flex items-center justify-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
                </div>
              ) : (
                <>
                  {viewMode === 'month' && (
                    <CalendarMonthView
                      currentDate={currentDate}
                      events={events}
                      onDateClick={handleDateClick}
                      onEventClick={handleEventClick}
                    />
                  )}
                  {viewMode === 'week' && (
                    <CalendarWeekView
                      currentDate={currentDate}
                      events={events}
                      onDateClick={handleDateClick}
                      onEventClick={handleEventClick}
                    />
                  )}
                  {viewMode === 'day' && (
                    <CalendarDayView
                      currentDate={currentDate}
                      events={events}
                      onEventClick={handleEventClick}
                    />
                  )}
                  {viewMode === 'list' && (
                    <CalendarListView
                      events={events}
                      onEventClick={handleEventClick}
                    />
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Sidebar - Google Calendar + Upcoming Events */}
        <div className="lg:col-span-1 space-y-4">
          <GoogleCalendarConnect />
          <UpcomingEvents maxEvents={5} onEventClick={handleEventClick} />
        </div>
      </div>

      {/* Event Modal */}
      <EventModal
        open={isEventModalOpen}
        onOpenChange={setIsEventModalOpen}
        event={selectedEvent}
        defaultDate={clickedDate}
        defaultProductId={productId}
      />
    </div>
  );
}
