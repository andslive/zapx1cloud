import { useMemo } from 'react';
import { format, isSameDay, isToday, isTomorrow, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Clock, MapPin, User, Package, Trash2, Edit } from 'lucide-react';
import { CalendarEvent, useDeleteEvent } from '@/hooks/useCalendarEvents';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface CalendarListViewProps {
  events: CalendarEvent[];
  onEventClick: (event: CalendarEvent) => void;
}

const EVENT_TYPE_LABELS: Record<string, { label: string; emoji: string }> = {
  meeting: { label: 'Reunião', emoji: '🤝' },
  call: { label: 'Ligação', emoji: '📞' },
  demo: { label: 'Demo', emoji: '🎯' },
  follow_up: { label: 'Follow-up', emoji: '📋' },
  other: { label: 'Outro', emoji: '📌' },
};

export function CalendarListView({ events, onEventClick }: CalendarListViewProps) {
  const deleteEvent = useDeleteEvent();

  // Group events by date
  const groupedEvents = useMemo(() => {
    const groups: Record<string, CalendarEvent[]> = {};
    
    events.forEach((event) => {
      const dateKey = format(new Date(event.start_time), 'yyyy-MM-dd');
      if (!groups[dateKey]) {
        groups[dateKey] = [];
      }
      groups[dateKey].push(event);
    });

    // Sort events within each group
    Object.keys(groups).forEach((key) => {
      groups[key].sort((a, b) => 
        new Date(a.start_time).getTime() - new Date(b.start_time).getTime()
      );
    });

    return groups;
  }, [events]);

  const formatDateHeader = (dateStr: string) => {
    const date = parseISO(dateStr);
    if (isToday(date)) return 'Hoje';
    if (isTomorrow(date)) return 'Amanhã';
    return format(date, "EEEE, d 'de' MMMM", { locale: ptBR });
  };

  const sortedDates = Object.keys(groupedEvents).sort();

  if (events.length === 0) {
    return (
      <div className="bg-card rounded-lg border p-8 text-center">
        <div className="text-4xl mb-3">📅</div>
        <h3 className="font-medium text-lg">Nenhum evento encontrado</h3>
        <p className="text-sm text-muted-foreground">
          Não há eventos agendados para este período.
        </p>
      </div>
    );
  }

  return (
    <ScrollArea className="h-[600px]">
      <div className="space-y-6">
        {sortedDates.map((dateStr) => (
          <div key={dateStr}>
            {/* Date Header */}
            <div className="sticky top-0 bg-background/95 backdrop-blur z-10 py-2 mb-3">
              <h3 className={cn(
                "text-sm font-semibold capitalize",
                isToday(parseISO(dateStr)) && "text-primary"
              )}>
                {formatDateHeader(dateStr)}
              </h3>
            </div>

            {/* Events for this date */}
            <div className="space-y-3">
              {groupedEvents[dateStr].map((event) => {
                const typeInfo = EVENT_TYPE_LABELS[event.event_type] || EVENT_TYPE_LABELS.other;
                
                return (
                  <div
                    key={event.id}
                    className="bg-card rounded-lg border p-4 hover:shadow-md transition-shadow cursor-pointer"
                    onClick={() => onEventClick(event)}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        {/* Time and Type */}
                        <div className="flex items-center gap-2 mb-2">
                          <Clock className="h-4 w-4 text-muted-foreground" />
                          <span className="text-sm font-medium">
                            {format(new Date(event.start_time), 'HH:mm')} - {format(new Date(event.end_time), 'HH:mm')}
                          </span>
                          <Badge variant="secondary" className="text-xs">
                            {typeInfo.emoji} {typeInfo.label}
                          </Badge>
                        </div>

                        {/* Title */}
                        <h4 className="font-semibold text-lg mb-1">{event.title}</h4>

                        {/* Details */}
                        <div className="flex flex-wrap gap-3 text-sm text-muted-foreground">
                          {event.location && (
                            <div className="flex items-center gap-1">
                              <MapPin className="h-3.5 w-3.5" />
                              <span className="truncate max-w-[200px]">{event.location}</span>
                            </div>
                          )}
                          {event.lead && (
                            <div className="flex items-center gap-1">
                              <User className="h-3.5 w-3.5" />
                              <span>{event.lead.name}</span>
                            </div>
                          )}
                          {event.product && (
                            <div className="flex items-center gap-1">
                              <Package className="h-3.5 w-3.5" />
                              <span>{event.product.name}</span>
                            </div>
                          )}
                        </div>

                        {/* Description */}
                        {event.description && (
                          <p className="text-sm text-muted-foreground mt-2 line-clamp-2">
                            {event.description}
                          </p>
                        )}
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={(e) => {
                            e.stopPropagation();
                            onEventClick(event);
                          }}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-destructive hover:text-destructive"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent onClick={(e) => e.stopPropagation()}>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Excluir evento?</AlertDialogTitle>
                              <AlertDialogDescription>
                                Esta ação não pode ser desfeita. O evento "{event.title}" será removido permanentemente.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancelar</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => deleteEvent.mutate(event.id)}
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                              >
                                Excluir
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </ScrollArea>
  );
}
