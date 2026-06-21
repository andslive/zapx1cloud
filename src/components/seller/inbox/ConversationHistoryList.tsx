import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, Globe, Phone, Instagram, Mail } from 'lucide-react';
import { useVisitorHistory } from '@/hooks/useVisitorHistory';
import { formatMessageTime, previewWithMedia } from '@/lib/messageFormat';

interface ConversationHistoryListProps {
  currentConversationId: string;
  leadId?: string | null;
  visitorPhone?: string | null;
  onSelectConversation?: (id: string) => void;
}

const channelIcon: Record<string, any> = {
  webchat: Globe,
  whatsapp: Phone,
  instagram: Instagram,
  email: Mail,
};

const statusLabel: Record<string, string> = {
  bot_active: 'Bot',
  waiting_human: 'Em fila',
  human_active: 'Atendendo',
  closed: 'Encerrado',
};

export function ConversationHistoryList({
  currentConversationId,
  leadId,
  visitorPhone,
  onSelectConversation,
}: ConversationHistoryListProps) {
  const { data, isLoading } = useVisitorHistory({
    currentConversationId,
    leadId,
    visitorPhone,
  });

  if (isLoading) {
    return (
      <div className="flex justify-center py-6">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!data?.length) {
    return (
      <p className="text-xs text-muted-foreground text-center py-4">
        Nenhum atendimento anterior deste contato.
      </p>
    );
  }

  return (
    <ul className="space-y-2">
      {data.map((c) => {
        const Icon = channelIcon[c.channel] || Globe;
        return (
          <li key={c.id}>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onSelectConversation?.(c.id)}
              className="w-full h-auto justify-start text-left p-2 hover:bg-muted/50"
            >
              <div className="flex items-start gap-2 w-full">
                <div className="h-7 w-7 rounded-full bg-muted/60 flex items-center justify-center flex-shrink-0">
                  <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] text-muted-foreground">
                      {formatMessageTime(c.last_message_at || c.created_at, 'full')}
                    </span>
                    <Badge variant="outline" className="h-4 px-1.5 text-[9px] uppercase">
                      {statusLabel[c.status] || c.status}
                    </Badge>
                  </div>
                  <p className="text-xs text-foreground/90 truncate mt-0.5">
                    {previewWithMedia(c.last_message, (c as any).last_message_metadata, 70) || 'Sem mensagens'}
                  </p>
                </div>
              </div>
            </Button>
          </li>
        );
      })}
    </ul>
  );
}
