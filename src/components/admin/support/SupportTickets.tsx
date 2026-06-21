import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Plus, LifeBuoy, MessageSquare } from 'lucide-react';
import {
  useSupportTickets, SUPPORT_STATUS_LABELS, SUPPORT_PRIORITY_LABELS, type SupportTicket,
} from '@/hooks/useSupportTickets';
import { NewTicketDialog } from './NewTicketDialog';
import { TicketDetailDialog } from './TicketDetailDialog';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Skeleton } from '@/components/ui/skeleton';

const STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'outline'> = {
  open: 'default',
  in_progress: 'secondary',
  resolved: 'outline',
  closed: 'outline',
};

interface Props {
  scope?: 'admin' | 'super_admin';
}

export function SupportTickets({ scope = 'admin' }: Props) {
  const { data: tickets, isLoading } = useSupportTickets(scope);
  const [newOpen, setNewOpen] = useState(false);
  const [selected, setSelected] = useState<SupportTicket | null>(null);

  const isSuper = scope === 'super_admin';

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">{isSuper ? 'Suporte (todas as empresas)' : 'Suporte'}</h1>
          <p className="text-sm text-muted-foreground">
            {isSuper
              ? 'Chamados abertos pelos administradores das empresas.'
              : 'Abra chamados e converse diretamente com a equipe da plataforma.'}
          </p>
        </div>
        {!isSuper && (
          <Button onClick={() => setNewOpen(true)}>
            <Plus className="h-4 w-4 mr-2" /> Abrir chamado
          </Button>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <LifeBuoy className="h-4 w-4" /> Chamados
          </CardTitle>
          <CardDescription>
            {tickets?.length ?? 0} {tickets?.length === 1 ? 'chamado' : 'chamados'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {[1,2,3].map((i) => <Skeleton key={i} className="h-20 w-full" />)}
            </div>
          ) : !tickets || tickets.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <MessageSquare className="h-10 w-10 mx-auto mb-3 opacity-40" />
              <p>{isSuper ? 'Nenhum chamado aberto.' : 'Você ainda não abriu nenhum chamado.'}</p>
            </div>
          ) : (
            <div className="space-y-2">
              {tickets.map((t) => {
                const unread = isSuper ? t.unread_for_super_admin : t.unread_for_admin;
                return (
                  <button
                    key={t.id}
                    onClick={() => setSelected(t)}
                    className="w-full flex items-start gap-3 p-3 rounded-lg border border-border hover:bg-muted/40 transition-colors text-left"
                  >
                    {unread && <span className="h-2 w-2 rounded-full bg-primary mt-2 shrink-0" aria-label="Não lido" />}
                    {!unread && <span className="h-2 w-2 mt-2 shrink-0" />}
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium truncate">{t.subject}</span>
                        <Badge variant={STATUS_VARIANT[t.status] ?? 'secondary'} className="text-xs">
                          {SUPPORT_STATUS_LABELS[t.status]}
                        </Badge>
                        {t.priority !== 'normal' && (
                          <Badge variant="outline" className="text-xs">
                            {SUPPORT_PRIORITY_LABELS[t.priority]}
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {isSuper && t.organization?.name && <span className="font-medium text-foreground">{t.organization.name} · </span>}
                        Última mensagem {formatDistanceToNow(new Date(t.last_message_at), { addSuffix: true, locale: ptBR })}
                        {t.last_message_by_role === 'super_admin' && ' · suporte'}
                        {t.last_message_by_role === 'admin' && ' · você'}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <NewTicketDialog open={newOpen} onOpenChange={setNewOpen} />
      <TicketDetailDialog
        open={!!selected}
        onOpenChange={(o) => !o && setSelected(null)}
        ticket={selected}
        scope={scope}
      />
    </div>
  );
}
