import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { MessageSquare, ArrowRight } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';

interface Props {
  leadId: string;
  onOpenConversation?: (conversationId: string) => void;
}

export function LeadConversationPreview({ leadId, onOpenConversation }: Props) {
  const { data, isLoading } = useQuery({
    queryKey: ['lead-conversation-preview', leadId],
    enabled: !!leadId,
    queryFn: async () => {
      const { data: convs } = await supabase
        .from('webchat_conversations')
        .select('id, channel, last_message_at, status')
        .eq('lead_id', leadId)
        .order('last_message_at', { ascending: false, nullsFirst: false })
        .limit(1);

      const conv = convs?.[0];
      if (!conv) return null;

      const { data: messages } = await supabase
        .from('webchat_messages')
        .select('id, direction, sender_type, content, created_at, content_type')
        .eq('conversation_id', conv.id)
        .eq('is_deleted', false)
        .order('created_at', { ascending: false })
        .limit(4);

      return { conv, messages: (messages || []).reverse() };
    },
  });

  if (isLoading) return null;
  if (!data) return null;

  return (
    <Card>
      <CardHeader className="pb-3 flex flex-row items-center justify-between">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <MessageSquare className="h-4 w-4" />
          Conversa recente
          <span className="text-xs text-muted-foreground font-normal capitalize">
            · {data.conv.channel}
          </span>
        </CardTitle>
        {onOpenConversation && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1"
            onClick={() => onOpenConversation(data.conv.id)}
          >
            Abrir <ArrowRight className="h-3 w-3" />
          </Button>
        )}
      </CardHeader>
      <CardContent className="pt-0 space-y-2">
        {data.messages.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sem mensagens</p>
        ) : (
          data.messages.map((m: any) => {
            const inbound = m.direction === 'inbound';
            return (
              <div
                key={m.id}
                className={cn('flex gap-2', inbound ? 'justify-start' : 'justify-end')}
              >
                <div
                  className={cn(
                    'max-w-[80%] rounded-lg px-3 py-1.5 text-sm',
                    inbound
                      ? 'bg-muted text-foreground'
                      : 'bg-primary/10 text-foreground border border-primary/20'
                  )}
                >
                  <p className="line-clamp-3 whitespace-pre-wrap">
                    {m.content_type && m.content_type !== 'text'
                      ? `[${m.content_type}] ${m.content || ''}`
                      : m.content}
                  </p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    {format(parseISO(m.created_at), "dd/MM HH:mm", { locale: ptBR })}
                  </p>
                </div>
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}
