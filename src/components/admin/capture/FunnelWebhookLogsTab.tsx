import { useState } from 'react';
import { useFunnelWebhookLogs } from '@/hooks/useFunnelWebhookLogs';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { CheckCircle2, XCircle, Loader2, RefreshCw, ChevronRight, Clock } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface FunnelWebhookLogsTabProps {
  funnelId: string;
}

export function FunnelWebhookLogsTab({ funnelId }: FunnelWebhookLogsTabProps) {
  const { data: logs, isLoading, refetch, isFetching } = useFunnelWebhookLogs(funnelId);
  const [filter, setFilter] = useState<'all' | 'success' | 'error'>('all');

  const filtered = (logs || []).filter((l) => {
    if (filter === 'success') return l.success;
    if (filter === 'error') return !l.success;
    return true;
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col p-4 gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Logs de Webhook</h2>
          <p className="text-sm text-muted-foreground">
            Histórico dos disparos automáticos deste funil
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant={filter === 'all' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilter('all')}
          >
            Todos ({logs?.length || 0})
          </Button>
          <Button
            variant={filter === 'success' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilter('success')}
          >
            Sucesso
          </Button>
          <Button
            variant={filter === 'error' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilter('error')}
          >
            Erro
          </Button>
          <Button variant="ghost" size="icon" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      <ScrollArea className="flex-1">
        {filtered.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <p>Nenhum disparo registrado ainda.</p>
            <p className="text-xs mt-1">
              Os logs aparecem automaticamente quando um lead passa por um bloco de Webhook.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((log) => (
              <Collapsible key={log.id}>
                <Card>
                  <CollapsibleTrigger className="w-full">
                    <CardContent className="p-3 flex items-center gap-3">
                      {log.success ? (
                        <CheckCircle2 className="h-5 w-5 text-emerald-500 flex-shrink-0" />
                      ) : (
                        <XCircle className="h-5 w-5 text-destructive flex-shrink-0" />
                      )}
                      <div className="flex-1 text-left min-w-0">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-[10px]">
                            {log.request_method}
                          </Badge>
                          {log.response_status && (
                            <Badge
                              variant={log.success ? 'default' : 'destructive'}
                              className="text-[10px]"
                            >
                              {log.response_status}
                            </Badge>
                          )}
                          <Badge variant="secondary" className="text-[10px]">
                            {log.trigger_source}
                          </Badge>
                          <span className="text-xs text-muted-foreground flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {log.duration_ms ?? '?'}ms
                          </span>
                        </div>
                        <p className="text-xs truncate mt-0.5 font-mono text-muted-foreground">
                          {log.request_url}
                        </p>
                        {log.error_message && (
                          <p className="text-xs text-destructive truncate mt-0.5">
                            {log.error_message}
                          </p>
                        )}
                      </div>
                      <span className="text-xs text-muted-foreground flex-shrink-0">
                        {formatDistanceToNow(new Date(log.created_at), {
                          addSuffix: true,
                          locale: ptBR,
                        })}
                      </span>
                      <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    </CardContent>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="px-3 pb-3 space-y-3 border-t pt-3 text-xs">
                      <div>
                        <p className="font-semibold mb-1">Headers enviados:</p>
                        <pre className="bg-muted p-2 rounded overflow-auto max-h-32">
                          {JSON.stringify(log.request_headers, null, 2)}
                        </pre>
                      </div>
                      {log.request_body && (
                        <div>
                          <p className="font-semibold mb-1">Body enviado:</p>
                          <pre className="bg-muted p-2 rounded overflow-auto max-h-48">
                            {JSON.stringify(log.request_body, null, 2)}
                          </pre>
                        </div>
                      )}
                      {log.response_body && (
                        <div>
                          <p className="font-semibold mb-1">Resposta recebida:</p>
                          <pre className="bg-muted p-2 rounded overflow-auto max-h-48 whitespace-pre-wrap">
                            {log.response_body}
                          </pre>
                        </div>
                      )}
                    </div>
                  </CollapsibleContent>
                </Card>
              </Collapsible>
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
