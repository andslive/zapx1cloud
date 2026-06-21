import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ArrowRight, UserPlus, UserMinus, Repeat, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useConversationJourney, type JourneyEvent } from '@/hooks/useConversationJourney';

interface JourneyTimelineProps {
  conversationId: string;
}

const actionLabels: Record<string, { label: string; icon: any }> = {
  assigned: { label: 'Assumiu o atendimento', icon: UserPlus },
  auto_assigned: { label: 'Atribuído automaticamente', icon: UserPlus },
  unassigned: { label: 'Devolvido à fila', icon: UserMinus },
  transferred: { label: 'Transferiu', icon: Repeat },
};

export function JourneyTimeline({ conversationId }: JourneyTimelineProps) {
  const { data: events, isLoading } = useConversationJourney(conversationId);

  if (isLoading) {
    return (
      <div className="flex justify-center py-6">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!events?.length) {
    return (
      <p className="text-xs text-muted-foreground text-center py-4">
        Sem eventos de transferência ainda.
      </p>
    );
  }

  return (
    <ol className="space-y-3 relative">
      <span className="absolute left-3 top-2 bottom-2 w-px bg-border" aria-hidden />
      {events.map((ev) => (
        <JourneyRow key={ev.id} event={ev} />
      ))}
    </ol>
  );
}

function JourneyRow({ event }: { event: JourneyEvent }) {
  const meta = actionLabels[event.action] || { label: event.action, icon: Repeat };
  const Icon = meta.icon;
  const fromName = event.from_user?.full_name;
  const toName = event.to_user?.full_name;

  return (
    <li className="flex gap-3 relative">
      <div className="flex-shrink-0 z-10 h-6 w-6 rounded-full bg-background border border-border flex items-center justify-center">
        <Icon className="h-3 w-3 text-muted-foreground" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-xs flex items-center gap-1.5 flex-wrap">
          {fromName && (
            <>
              <Avatar className="h-4 w-4">
                {event.from_user?.avatar_url && (
                  <AvatarImage src={event.from_user.avatar_url} alt={fromName} />
                )}
                <AvatarFallback className="text-[8px]">{fromName[0]}</AvatarFallback>
              </Avatar>
              <span className="font-medium truncate">{fromName}</span>
              <ArrowRight className="h-3 w-3 text-muted-foreground" />
            </>
          )}
          {toName ? (
            <>
              <Avatar className="h-4 w-4">
                {event.to_user?.avatar_url && (
                  <AvatarImage src={event.to_user.avatar_url} alt={toName} />
                )}
                <AvatarFallback className="text-[8px]">{toName[0]}</AvatarFallback>
              </Avatar>
              <span className="font-medium truncate">{toName}</span>
            </>
          ) : (
            <span className="text-muted-foreground">{meta.label}</span>
          )}
        </div>
        <p className="text-[10px] text-muted-foreground mt-0.5">
          {format(new Date(event.created_at), "d 'de' MMM 'às' HH:mm", { locale: ptBR })}
        </p>
        {event.internal_note && (
          <p className="text-[11px] mt-1 px-2 py-1 bg-muted/50 rounded italic">
            "{event.internal_note}"
          </p>
        )}
      </div>
    </li>
  );
}
