import { useState } from 'react';
import { useWebhookHealthStats, useWebhookHealthLogs, useConnectionStatus } from '@/hooks/useWebhookHealth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { 
  Activity, 
  AlertTriangle, 
  CheckCircle2, 
  XCircle, 
  Clock, 
  RefreshCw, 
  Search,
  Eye,
  ArrowRight,
  ShieldAlert
} from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { supabase } from '@/integrations/supabase/client';


export function WebhookHealthDashboard() {
  const { data: stats, isLoading: statsLoading, refetch: refetchStats } = useWebhookHealthStats();
  const { data: logs, isLoading: logsLoading, refetch: refetchLogs } = useWebhookHealthLogs();
  const { data: connections } = useConnectionStatus();
  
  const [selectedLog, setSelectedLog] = useState<any>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [discrepancies, setDiscrepancies] = useState<any[]>([]);

  const checkDiscrepancies = async () => {
    const { data } = await supabase.rpc('check_webhook_health_discrepancies');
    if (data) setDiscrepancies(data);
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await Promise.all([refetchStats(), refetchLogs(), checkDiscrepancies()]);
    setIsRefreshing(false);
  };


  const downConnections = Object.entries(connections || {})
    .filter(([_, status]) => status.is_down)
    .map(([id]) => id);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold">Monitoramento de Webhooks</h2>
          <p className="text-sm text-muted-foreground">Auditoria em tempo real do processamento de mensagens</p>
        </div>
        <Button variant="outline" size="sm" onClick={handleRefresh} disabled={isRefreshing}>
          <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
          Atualizar
        </Button>
      </div>

      {downConnections.length > 0 && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Conexão Offline (CONNECTION_WEBHOOK_DOWN)</AlertTitle>
          <AlertDescription>
            As seguintes conexões não recebem webhooks há mais de 10 minutos: {downConnections.join(', ')}
          </AlertDescription>
        </Alert>
      )}

      {discrepancies.length > 0 && (
        <Alert className="border-orange-500 bg-orange-500/10 text-orange-700">
          <ShieldAlert className="h-4 w-4" />
          <AlertTitle>Mensagens com Processamento Interrompido (WEBHOOK_LOST)</AlertTitle>
          <AlertDescription>
            Detectamos {discrepancies.length} mensagens que chegaram ao servidor mas não completaram o fluxo no CRM.
          </AlertDescription>
        </Alert>
      )}


      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Recebidos Hoje</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.total_received || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Taxa de Sucesso</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <div className="text-2xl font-bold">{Math.round(stats?.success_rate || 100)}%</div>
              {Number(stats?.success_rate) < 95 ? (
                <Badge variant="destructive" className="animate-pulse">Baixa</Badge>
              ) : (
                <Badge variant="secondary" className="bg-green-500/10 text-green-600">Alta</Badge>
              )}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Mensagens Perdidas</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">{stats?.total_lost || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Pixels Enviados</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary">{stats?.total_pixel_sent || 0}</div>
          </CardContent>
        </Card>
      </div>

      {/* Logs Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Clock className="h-5 w-5 text-muted-foreground" />
            Logs Recentes
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Hora</TableHead>
                <TableHead>Telefone</TableHead>
                <TableHead>Instância</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Fluxo</TableHead>
                <TableHead>Pixel</TableHead>
                <TableHead className="w-10"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {logs?.map((log) => (
                <TableRow key={log.id} className="cursor-pointer hover:bg-muted/50" onClick={() => setSelectedLog(log)}>
                  <TableCell className="text-xs">
                    {format(new Date(log.created_at), 'HH:mm:ss', { locale: ptBR })}
                  </TableCell>
                  <TableCell className="font-mono text-xs">{log.phone || '—'}</TableCell>
                  <TableCell className="text-xs truncate max-w-[100px]">{log.connection_id}</TableCell>
                  <TableCell>
                    {log.error ? (
                      <Badge variant="destructive" className="gap-1">
                        <XCircle className="h-3 w-3" /> Erro
                      </Badge>
                    ) : log.processed ? (
                      <Badge variant="secondary" className="bg-green-500/10 text-green-600 gap-1">
                        <CheckCircle2 className="h-3 w-3" /> Processado
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="gap-1 animate-pulse">
                        <Clock className="h-3 w-3" /> Pendente
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    {log.flow_started ? (
                      <CheckCircle2 className="h-4 w-4 text-green-500" />
                    ) : (
                      <ArrowRight className="h-4 w-4 text-muted-foreground/30" />
                    )}
                  </TableCell>
                  <TableCell>
                    {log.pixel_sent ? (
                      <CheckCircle2 className="h-4 w-4 text-blue-500" />
                    ) : (
                      <ArrowRight className="h-4 w-4 text-muted-foreground/30" />
                    )}
                  </TableCell>
                  <TableCell>
                    <Button variant="ghost" size="icon" onClick={() => setSelectedLog(log)}>
                      <Eye className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Log Detail Dialog */}
      <Dialog open={!!selectedLog} onOpenChange={() => setSelectedLog(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Detalhes do Webhook</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground">ID da Mensagem</p>
                <p className="text-sm font-mono bg-muted p-1 rounded">{selectedLog?.message_id || '—'}</p>
              </div>
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground">Data/Hora</p>
                <p className="text-sm">
                  {selectedLog?.created_at && format(new Date(selectedLog.created_at), "dd/MM/yyyy 'às' HH:mm:ss", { locale: ptBR })}
                </p>
              </div>
            </div>

            {selectedLog?.error && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Erro no Processamento</AlertTitle>
                <AlertDescription className="font-mono text-xs">
                  {selectedLog.error}
                </AlertDescription>
              </Alert>
            )}

            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground">Payload Bruto (UAZAPI)</p>
              <ScrollArea className="h-[300px] w-full border rounded-md p-4 bg-muted/30">
                <pre className="text-[10px] leading-tight">
                  {JSON.stringify(selectedLog?.raw_payload, null, 2)}
                </pre>
              </ScrollArea>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
