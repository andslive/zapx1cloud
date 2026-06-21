import { format, isToday, isTomorrow, differenceInMinutes } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { CalendarDays, Clock, MapPin, ChevronRight, Loader2, Video } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useUpcomingEvents, CalendarEvent } from '@/hooks/useCalendarEvents';
import { cn } from '@/lib/utils';

interface UpcomingEventsProps {
  onViewAll?: () => void;
  onEventClick?: (event: CalendarEvent) => void;
  maxEvents?: number;
}

const EVENT_TYPE_EMOJIS: Record<string, string> = {
  meeting: '🤝',
  call: '📞',
  demo: '🎯',
  follow_up: '📋',
  other: '📌',
};

export function UpcomingEvents({ onViewAll, onEventClick, maxEvents = 5 }: UpcomingEventsProps) {
  const { data: events, isLoading } = useUpcomingEvents(7);

  const getTimeLabel = (startTime: string) => {
    const date = new Date(startTime);
    const now = new Date();
    const minutesDiff = differenceInMinutes(date, now);

    if (minutesDiff <= 0) {
      return { label: 'Agora', color: 'text-red-500', bg: 'bg-red-500/10' };
    }
    if (minutesDiff <= 30) {
      return { label: `Em ${minutesDiff} min`, color: 'text-red-500', bg: 'bg-red-500/10' };
    }
    if (minutesDiff <= 60) {
      return { label: `Em ${minutesDiff} min`, color: 'text-orange-500', bg: 'bg-orange-500/10' };
    }
    if (isToday(date)) {
      return { label: `Hoje, ${format(date, 'HH:mm')}`, color: 'text-yellow-500', bg: 'bg-yellow-500/10' };
    }
    if (isTomorrow(date)) {
      return { label: `Amanhã, ${format(date, 'HH:mm')}`, color: 'text-green-500', bg: 'bg-green-500/10' };
    }
    return { 
      label: format(date, "EEE, d 'às' HH:mm", { locale: ptBR }), 
      color: 'text-muted-foreground',
      bg: 'bg-muted'
    };
  };

  const displayEvents = events?.slice(0, maxEvents) || [];

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <CalendarDays className="h-4 w-4" />
            Próximos Compromissos
          </CardTitle>
          {onViewAll && (
            <Button variant="ghost" size="sm" onClick={onViewAll} className="text-xs">
              Ver Agenda
              <ChevronRight className="h-3 w-3 ml-1" />
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : displayEvents.length === 0 ? (
          <div className="text-center py-6">
            <CalendarDays className="h-8 w-8 mx-auto text-muted-foreground/50 mb-2" />
            <p className="text-sm text-muted-foreground">
              Nenhum evento agendado para os próximos dias
            </p>
          </div>
        ) : (
          <>
            {displayEvents.map((event) => {
              const timeInfo = getTimeLabel(event.start_time);
              const emoji = EVENT_TYPE_EMOJIS[event.event_type] || '📌';

              return (
                <div 
                  key={event.id}
                  onClick={() => onEventClick?.(event)}
                  className="flex items-start gap-3 p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors cursor-pointer"
                >
                  <div className={cn(
                    "flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center text-lg",
                    timeInfo.bg
                  )}>
                    {emoji}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className={cn("text-xs font-medium mb-0.5", timeInfo.color)}>
                      {timeInfo.label}
                    </div>
                    <h4 className="font-medium text-sm truncate">{event.title}</h4>
                    <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {format(new Date(event.start_time), 'HH:mm')} - {format(new Date(event.end_time), 'HH:mm')}
                      </span>
                      {event.lead && (
                        <span className="truncate">👤 {event.lead.name}</span>
                      )}
                    </div>
                    {event.meet_link && (
                      <a 
                        href={event.meet_link} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="inline-flex items-center gap-1 mt-1 text-xs text-primary hover:underline"
                      >
                        <Video className="h-3 w-3" />
                        Entrar na reunião
                      </a>
                    )}
                    {event.location && !event.meet_link && (
                      <div className="flex items-center gap-1 mt-1 text-xs text-muted-foreground truncate">
                        <MapPin className="h-3 w-3" />
                        {event.location}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}

            {events && events.length > maxEvents && (
              <div className="text-center pt-2">
                <Button variant="ghost" size="sm" onClick={onViewAll} className="text-xs">
                  +{events.length - maxEvents} outros eventos
                </Button>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
