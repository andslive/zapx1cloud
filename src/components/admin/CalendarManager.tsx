import { useState, useMemo } from 'react';
import { 
  addMonths, 
  subMonths, 
  addWeeks, 
  subWeeks, 
  addDays, 
  subDays,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  format
} from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { 
  CalendarDays, 
  Plus, 
  ChevronLeft, 
  ChevronRight, 
  List,
  LayoutGrid,
  Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent } from '@/components/ui/card';

import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { useIsMobile } from '@/hooks/use-mobile';
import { useCalendarEvents, CalendarEvent } from '@/hooks/useCalendarEvents';
import { useProducts } from '@/hooks/useProducts';
import { useTeamMembers } from '@/hooks/useTeam';
import { useAuth } from '@/hooks/useAuth';
import { CalendarMonthView } from '@/components/calendar/CalendarMonthView';
import { CalendarWeekView } from '@/components/calendar/CalendarWeekView';
import { CalendarDayView } from '@/components/calendar/CalendarDayView';
import { CalendarListView } from '@/components/calendar/CalendarListView';
import { EventModal } from '@/components/calendar/EventModal';
import { GoogleCalendarConnect } from '@/components/calendar/GoogleCalendarConnect';
import {
  BookingsManager,
  EventTypesManager,
  AvailabilityManager,
  TeamBookingLinks,
} from '@/components/admin/booking';

type ViewMode = 'month' | 'week' | 'day' | 'list';

/**
 * Visão de calendário (mês/semana/dia/lista) + Google Calendar.
 * Extraída em sub-componente para que CalendarManager seja só a casca de abas.
 */
function AgendaCalendarView() {
  const { isAdmin, isManager } = useAuth();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<ViewMode>('month');
  const [selectedUserId, setSelectedUserId] = useState<string>('');
  const [selectedProductId, setSelectedProductId] = useState<string>('');
  const [selectedEventType, setSelectedEventType] = useState<string>('');
  const [isEventModalOpen, setIsEventModalOpen] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [clickedDate, setClickedDate] = useState<Date | undefined>();

  const { data: products } = useProducts();
  const { data: teamMembers } = useTeamMembers();

  const dateRange = useMemo(() => {
    switch (viewMode) {
      case 'month':
        return {
          startDate: startOfWeek(startOfMonth(currentDate), { locale: ptBR }),
          endDate: endOfWeek(endOfMonth(currentDate), { locale: ptBR }),
        };
      case 'week':
        return {
          startDate: startOfWeek(currentDate, { locale: ptBR }),
          endDate: endOfWeek(currentDate, { locale: ptBR }),
        };
      case 'day':
        return {
          startDate: new Date(currentDate.setHours(0, 0, 0, 0)),
          endDate: new Date(currentDate.setHours(23, 59, 59, 999)),
        };
      case 'list':
      default:
        return {
          startDate: new Date(),
          endDate: addMonths(new Date(), 1),
        };
    }
  }, [currentDate, viewMode]);

  const { data: events, isLoading } = useCalendarEvents({
    ...dateRange,
    userId: selectedUserId || undefined,
    productId: selectedProductId || undefined,
    eventType: selectedEventType || undefined,
  });

  const canViewAllUsers = isAdmin() || isManager();

  const navigatePrevious = () => {
    switch (viewMode) {
      case 'month': setCurrentDate(subMonths(currentDate, 1)); break;
      case 'week': setCurrentDate(subWeeks(currentDate, 1)); break;
      case 'day': setCurrentDate(subDays(currentDate, 1)); break;
    }
  };

  const navigateNext = () => {
    switch (viewMode) {
      case 'month': setCurrentDate(addMonths(currentDate, 1)); break;
      case 'week': setCurrentDate(addWeeks(currentDate, 1)); break;
      case 'day': setCurrentDate(addDays(currentDate, 1)); break;
    }
  };

  const goToToday = () => setCurrentDate(new Date());

  const handleDateClick = (date: Date) => {
    if (viewMode === 'month') {
      setClickedDate(date);
      setSelectedEvent(null);
      setIsEventModalOpen(true);
    } else if (viewMode === 'week') {
      setCurrentDate(date);
      setViewMode('day');
    }
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

  const getViewTitle = () => {
    switch (viewMode) {
      case 'month':
        return format(currentDate, 'MMMM yyyy', { locale: ptBR });
      case 'week': {
        const weekStart = startOfWeek(currentDate, { locale: ptBR });
        const weekEnd = endOfWeek(currentDate, { locale: ptBR });
        return `${format(weekStart, 'd', { locale: ptBR })} - ${format(weekEnd, 'd MMM yyyy', { locale: ptBR })}`;
      }
      case 'day':
        return format(currentDate, "EEEE, d 'de' MMMM yyyy", { locale: ptBR });
      default:
        return 'Próximos Eventos';
    }
  };

  const stats = useMemo(() => {
    if (!events) return { total: 0, today: 0, thisWeek: 0 };
    const today = new Date();
    const todayEvents = events.filter(e => 
      new Date(e.start_time).toDateString() === today.toDateString()
    );
    return {
      total: events.length,
      today: todayEvents.length,
      thisWeek: events.length,
    };
  }, [events]);

  return (
    <div className="space-y-4">
      {/* Barra compacta: stats inline + botão Novo Evento */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-muted/40">
            <CalendarDays className="h-4 w-4 text-primary" />
            <span className="text-xs text-muted-foreground">Hoje</span>
            <span className="text-sm font-semibold">{stats.today}</span>
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-muted/40">
            <LayoutGrid className="h-4 w-4 text-blue-500" />
            <span className="text-xs text-muted-foreground">No período</span>
            <span className="text-sm font-semibold">{stats.total}</span>
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-muted/40">
            <List className="h-4 w-4 text-green-500" />
            <span className="text-xs text-muted-foreground">Tipos</span>
            <span className="flex gap-0.5 text-sm">🤝 📞 🎯</span>
          </div>
        </div>
        <Button onClick={handleNewEvent} size="sm">
          <Plus className="h-4 w-4 mr-2" />
          Novo Evento
        </Button>
      </div>

      {/* Filtros + Google Calendar integrado */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-col lg:flex-row gap-4 lg:items-center">
            <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as ViewMode)}>
              <TabsList>
                <TabsTrigger value="month">Mês</TabsTrigger>
                <TabsTrigger value="week">Semana</TabsTrigger>
                <TabsTrigger value="day">Dia</TabsTrigger>
                <TabsTrigger value="list">Lista</TabsTrigger>
              </TabsList>
            </Tabs>

            <div className="flex-1" />

            <div className="flex flex-wrap gap-2 items-center">
              {canViewAllUsers && (
                <Select value={selectedUserId || 'all'} onValueChange={(v) => setSelectedUserId(v === 'all' ? '' : v)}>
                  <SelectTrigger className="w-[180px]">
                    <SelectValue placeholder="Todos vendedores" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos vendedores</SelectItem>
                    {teamMembers?.map((member) => (
                      <SelectItem key={member.id} value={member.id}>
                        {member.full_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}

              <Select value={selectedProductId || 'all'} onValueChange={(v) => setSelectedProductId(v === 'all' ? '' : v)}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Todos produtos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos produtos</SelectItem>
                  {products?.map((product) => (
                    <SelectItem key={product.id} value={product.id}>
                      {product.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={selectedEventType || 'all'} onValueChange={(v) => setSelectedEventType(v === 'all' ? '' : v)}>
                <SelectTrigger className="w-[150px]">
                  <SelectValue placeholder="Todos tipos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos tipos</SelectItem>
                  <SelectItem value="meeting">🤝 Reunião</SelectItem>
                  <SelectItem value="call">📞 Ligação</SelectItem>
                  <SelectItem value="demo">🎯 Demo</SelectItem>
                  <SelectItem value="follow_up">📋 Follow-up</SelectItem>
                  <SelectItem value="other">📌 Outro</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Google Calendar — bloco discreto, colapsável visualmente */}
      <details className="group">
        <summary className="cursor-pointer list-none">
          <div className="flex items-center justify-between gap-3 px-4 py-2.5 rounded-lg border bg-card hover:bg-muted/30 transition-colors">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <CalendarDays className="h-4 w-4" />
              <span className="font-medium text-foreground">Google Calendar</span>
              <span className="text-xs">(clique para gerenciar a sincronização)</span>
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-90" />
          </div>
        </summary>
        <div className="mt-2">
          <GoogleCalendarConnect />
        </div>
      </details>

      {/* Navegação */}
      {viewMode !== 'list' && (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" onClick={navigatePrevious}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="icon" onClick={navigateNext}>
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={goToToday}>
              Hoje
            </Button>
          </div>
          <h2 className="text-lg font-semibold capitalize">{getViewTitle()}</h2>
          <div className="w-[100px]" />
        </div>
      )}

      {/* Visualização */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          {viewMode === 'month' && (
            <CalendarMonthView
              currentDate={currentDate}
              events={events || []}
              onDateClick={handleDateClick}
              onEventClick={handleEventClick}
            />
          )}
          {viewMode === 'week' && (
            <CalendarWeekView
              currentDate={currentDate}
              events={events || []}
              onDateClick={handleDateClick}
              onEventClick={handleEventClick}
            />
          )}
          {viewMode === 'day' && (
            <CalendarDayView
              currentDate={currentDate}
              events={events || []}
              onEventClick={handleEventClick}
            />
          )}
          {viewMode === 'list' && (
            <CalendarListView
              events={events || []}
              onEventClick={handleEventClick}
            />
          )}
        </>
      )}

      <EventModal
        open={isEventModalOpen}
        onOpenChange={setIsEventModalOpen}
        event={selectedEvent}
        defaultDate={clickedDate}
      />
    </div>
  );
}

/**
 * Casca do módulo Agenda no Admin: agrupa em uma única tela
 *  - Agenda (calendário visual)
 *  - Reuniões (bookings recebidos)
 *  - Tipos de Evento (pré-configuração do admin)
 *  - Disponibilidade (horários)
 *  - Links da Equipe (centralização para o admin enviar links de cada vendedor)
 */
export function CalendarManager() {
  const { isAdmin, isManager } = useAuth();
  const isMobile = useIsMobile();
  const canViewAllUsers = isAdmin() || isManager();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <CalendarDays className="h-6 w-6" />
          Agenda & Agendamentos
        </h1>
        <p className="text-muted-foreground">
          {canViewAllUsers
            ? 'Visualize a agenda da equipe, configure tipos de reunião e compartilhe os links individuais dos vendedores'
            : 'Gerencie seus compromissos e reuniões'}
        </p>
      </div>

      <Tabs defaultValue="agenda" className="w-full">
        {isMobile ? (
          <ScrollArea className="w-full whitespace-nowrap">
            <TabsList className="inline-flex w-auto min-w-full justify-start gap-1 p-1">
              <TabsTrigger value="agenda" className="shrink-0">Agenda</TabsTrigger>
              <TabsTrigger value="bookings" className="shrink-0">Reuniões</TabsTrigger>
              <TabsTrigger value="event-types" className="shrink-0">Tipos de Evento</TabsTrigger>
              <TabsTrigger value="availability" className="shrink-0">Disponibilidade</TabsTrigger>
              <TabsTrigger value="team-links" className="shrink-0">Links da Equipe</TabsTrigger>
            </TabsList>
            <ScrollBar orientation="horizontal" />
          </ScrollArea>
        ) : (
          <TabsList className="grid w-full max-w-3xl grid-cols-5">
            <TabsTrigger value="agenda">Agenda</TabsTrigger>
            <TabsTrigger value="bookings">Reuniões</TabsTrigger>
            <TabsTrigger value="event-types">Tipos de Evento</TabsTrigger>
            <TabsTrigger value="availability">Disponibilidade</TabsTrigger>
            <TabsTrigger value="team-links">Links da Equipe</TabsTrigger>
          </TabsList>
        )}

        <TabsContent value="agenda" className="mt-6">
          <AgendaCalendarView />
        </TabsContent>

        <TabsContent value="bookings" className="mt-6">
          <BookingsManager />
        </TabsContent>

        <TabsContent value="event-types" className="mt-6">
          <EventTypesManager />
        </TabsContent>

        <TabsContent value="availability" className="mt-6">
          <AvailabilityManager />
        </TabsContent>

        <TabsContent value="team-links" className="mt-6">
          <TeamBookingLinks />
        </TabsContent>
      </Tabs>
    </div>
  );
}
