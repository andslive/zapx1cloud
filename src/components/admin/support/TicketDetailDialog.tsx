import { useEffect, useState, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Send, Loader2 } from 'lucide-react';
import {
  useSupportMessages, useSendTicketMessage, useUpdateTicket, useMarkTicketRead,
  SUPPORT_STATUS_LABELS, type SupportTicket, type SupportStatus,
} from '@/hooks/useSupportTickets';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useAuth } from '@/hooks/useAuth';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ticket: SupportTicket | null;
  scope: 'admin' | 'super_admin';
}

export function TicketDetailDialog({ open, onOpenChange, ticket, scope }: Props) {
  const { user, isSuperAdmin } = useAuth();
  const { data: messages } = useSupportMessages(ticket?.id ?? null);
  const send = useSendTicketMessage();
  const update = useUpdateTicket();
  const markRead = useMarkTicketRead();
  const [text, setText] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open && ticket) {
      const unread = scope === 'super_admin' ? ticket.unread_for_super_admin : ticket.unread_for_admin;
      if (unread) markRead.mutate(ticket.id);
    }
  }, [open, ticket?.id]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  if (!ticket) return null;

  const handleSend = async () => {
    if (!text.trim()) return;
    try {
      await send.mutateAsync({ ticketId: ticket.id, content: text });
      setText('');
    } catch {}
  };

  const handleStatusChange = (status: SupportStatus) => {
    update.mutate({ id: ticket.id, status });
  };

  const myRole: 'admin' | 'super_admin' = isSuperAdmin() ? 'super_admin' : 'admin';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 flex-wrap">
            <span className="truncate">{ticket.subject}</span>
            <Badge variant="outline" className="text-xs">
              {SUPPORT_STATUS_LABELS[ticket.status]}
            </Badge>
          </DialogTitle>
          <DialogDescription>
            {scope === 'super_admin' && ticket.organization?.name && (
              <span className="font-medium">{ticket.organization.name} · </span>
            )}
            Aberto por {ticket.creator?.full_name || ticket.creator?.email || '—'} em{' '}
            {format(new Date(ticket.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
          </DialogDescription>
        </DialogHeader>

        {scope === 'super_admin' && (
          <div className="flex items-center gap-2 pb-2 border-b border-border">
            <span className="text-xs text-muted-foreground">Status:</span>
            <Select value={ticket.status} onValueChange={(v) => handleStatusChange(v as SupportStatus)}>
              <SelectTrigger className="h-8 w-[180px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(SUPPORT_STATUS_LABELS).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <div ref={scrollRef} className="flex-1 overflow-y-auto py-3 space-y-3">
          {messages?.map((m) => {
            const mine = m.author_id === user?.id;
            const isSupportSide = m.author_role === 'super_admin';
            return (
              <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 ${mine ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}>
                  <div className="text-xs opacity-70 mb-1">
                    {isSupportSide ? '🛟 Suporte X1ZAP' : (m.author?.full_name || m.author?.email || 'Você')}
                    {' · '}
                    {format(new Date(m.created_at), 'HH:mm', { locale: ptBR })}
                  </div>
                  <p className="text-sm whitespace-pre-wrap break-words">{m.content}</p>
                </div>
              </div>
            );
          })}
        </div>

        <div className="border-t border-border pt-3 space-y-2">
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={scope === 'super_admin' ? 'Responder...' : 'Escreva sua mensagem...'}
            rows={3}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleSend();
            }}
          />
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-muted-foreground">Cmd/Ctrl+Enter para enviar</span>
            <div className="flex gap-2">
              {scope === 'admin' && ticket.status !== 'resolved' && ticket.status !== 'closed' && (
                <Button variant="outline" size="sm" onClick={() => handleStatusChange('resolved')}>
                  Marcar como resolvido
                </Button>
              )}
              <Button onClick={handleSend} disabled={!text.trim() || send.isPending}>
                {send.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
