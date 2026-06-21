import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { EventTypesManager } from './EventTypesManager';
import { AvailabilityManager } from './AvailabilityManager';
import { BookingsManager } from './BookingsManager';
import { CalendarManager } from '../CalendarManager';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { useIsMobile } from '@/hooks/use-mobile';

export function BookingManager() {
  const isMobile = useIsMobile();

  return (
    <div className="space-y-6">
      <Tabs defaultValue="agenda" className="w-full">
        {isMobile ? (
          <ScrollArea className="w-full whitespace-nowrap">
            <TabsList className="inline-flex w-auto min-w-full justify-start gap-1 p-1">
              <TabsTrigger value="agenda" className="shrink-0">Agenda</TabsTrigger>
              <TabsTrigger value="bookings" className="shrink-0">Reuniões</TabsTrigger>
              <TabsTrigger value="event-types" className="shrink-0">Tipos de Evento</TabsTrigger>
              <TabsTrigger value="availability" className="shrink-0">Disponibilidade</TabsTrigger>
            </TabsList>
            <ScrollBar orientation="horizontal" />
          </ScrollArea>
        ) : (
          <TabsList className="grid w-full max-w-lg grid-cols-4">
            <TabsTrigger value="agenda">Agenda</TabsTrigger>
            <TabsTrigger value="bookings">Reuniões</TabsTrigger>
            <TabsTrigger value="event-types">Tipos de Evento</TabsTrigger>
            <TabsTrigger value="availability">Disponibilidade</TabsTrigger>
          </TabsList>
        )}

        <TabsContent value="agenda" className="mt-6">
          <CalendarManager />
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
      </Tabs>
    </div>
  );
}
