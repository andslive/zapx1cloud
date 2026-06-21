import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, Building2, Eye, EyeOff, RefreshCw, CheckCircle2, XCircle, Clock, ExternalLink } from 'lucide-react';
import { 
  useSankhyaConfig, 
  useUpdateSankhyaConfig, 
  useSankhyaSyncLogs, 
  useTestSankhyaConnection,
  useSankhyaSync,
  useLastSyncByType
} from '@/hooks/useSankhya';
import { formatDistanceToNow, format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export function SankhyaConfigManager() {
  const { data: configData, isLoading } = useSankhyaConfig();
  const { data: syncLogs } = useSankhyaSyncLogs();
  const { data: lastSync } = useLastSyncByType();
  const updateConfig = useUpdateSankhyaConfig();
  const testConnection = useTestSankhyaConnection();
  const syncMutation = useSankhyaSync();

  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [xToken, setXToken] = useState('');
  const [showSecrets, setShowSecrets] = useState(false);
  const [autoSync, setAutoSync] = useState(false);
  const [syncInterval, setSyncInterval] = useState<'1h' | '6h' | '12h' | '24h'>('24h');

  // Initialize form when data loads
  useState(() => {
    if (configData?.config) {
      setClientId(configData.config.client_id || '');
      setClientSecret(configData.config.client_secret || '');
      setXToken(configData.config.x_token || '');
      setAutoSync(configData.config.auto_sync_enabled || false);
      setSyncInterval(configData.config.sync_interval || '24h');
    }
  });

  const handleSaveCredentials = async () => {
    await updateConfig.mutateAsync({
      client_id: clientId,
      client_secret: clientSecret,
      x_token: xToken,
      auto_sync_enabled: autoSync,
      sync_interval: syncInterval
    });
  };

  const handleTestConnection = async () => {
    await testConnection.mutateAsync({
      client_id: clientId || configData?.config.client_id || '',
      client_secret: clientSecret || configData?.config.client_secret || '',
      x_token: xToken || configData?.config.x_token || ''
    });
  };

  const handleSync = async (entityType: 'clients' | 'products') => {
    await syncMutation.mutateAsync({ entityType });
  };

  const handleAutoSyncChange = async (enabled: boolean) => {
    setAutoSync(enabled);
    await updateConfig.mutateAsync({
      auto_sync_enabled: enabled,
      sync_interval: syncInterval
    });
  };

  const handleIntervalChange = async (interval: '1h' | '6h' | '12h' | '24h') => {
    setSyncInterval(interval);
    await updateConfig.mutateAsync({
      auto_sync_enabled: autoSync,
      sync_interval: interval
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return <Badge variant="outline" className="bg-green-500/10 text-green-500 border-green-500/20"><CheckCircle2 className="h-3 w-3 mr-1" /> Concluído</Badge>;
      case 'failed':
        return <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/20"><XCircle className="h-3 w-3 mr-1" /> Erro</Badge>;
      case 'running':
        return <Badge variant="outline" className="bg-blue-500/10 text-blue-500 border-blue-500/20"><Loader2 className="h-3 w-3 mr-1 animate-spin" /> Em andamento</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <Building2 className="h-6 w-6 text-primary" />
            </div>
            <div className="flex-1">
              <CardTitle className="flex items-center gap-2">
                Sankhya ERP
                {configData?.isConfigured && (
                  <Badge variant="outline" className="bg-green-500/10 text-green-500 border-green-500/20">
                    Configurado
                  </Badge>
                )}
              </CardTitle>
              <CardDescription>
                Integração com o ERP Sankhya para sincronização de clientes, produtos e pedidos
              </CardDescription>
            </div>
            <Button variant="outline" size="sm" asChild>
              <a href="https://developer.sankhya.com.br" target="_blank" rel="noopener noreferrer">
                <ExternalLink className="h-4 w-4 mr-2" />
                Documentação
              </a>
            </Button>
          </div>
        </CardHeader>
      </Card>

      {/* Credentials */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Credenciais de API</CardTitle>
          <CardDescription>
            Configure as credenciais da sua aplicação Sankhya. Obtenha na Área do Desenvolvedor.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="client-id">Client ID</Label>
              <div className="relative">
                <Input
                  id="client-id"
                  type={showSecrets ? 'text' : 'password'}
                  placeholder="Seu Client ID"
                  value={clientId}
                  onChange={(e) => setClientId(e.target.value)}
                />
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="client-secret">Client Secret</Label>
              <Input
                id="client-secret"
                type={showSecrets ? 'text' : 'password'}
                placeholder="Seu Client Secret"
                value={clientSecret}
                onChange={(e) => setClientSecret(e.target.value)}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="x-token">X-Token</Label>
              <Input
                id="x-token"
                type={showSecrets ? 'text' : 'password'}
                placeholder="Token gerado no SankhyaOm"
                value={xToken}
                onChange={(e) => setXToken(e.target.value)}
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowSecrets(!showSecrets)}
            >
              {showSecrets ? <EyeOff className="h-4 w-4 mr-2" /> : <Eye className="h-4 w-4 mr-2" />}
              {showSecrets ? 'Ocultar' : 'Mostrar'}
            </Button>
          </div>

          <div className="flex gap-3 pt-2">
            <Button
              variant="outline"
              onClick={handleTestConnection}
              disabled={testConnection.isPending || (!clientId && !configData?.config.client_id)}
            >
              {testConnection.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-2" />
              )}
              Testar Conexão
            </Button>
            <Button
              onClick={handleSaveCredentials}
              disabled={updateConfig.isPending}
            >
              {updateConfig.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : null}
              Salvar Credenciais
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Sync Controls */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Sincronização</CardTitle>
          <CardDescription>
            Sincronize dados entre o SalesFlow e o Sankhya ERP
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2">
            {/* Clients Sync */}
            <div className="p-4 border rounded-lg space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-medium">Clientes / Parceiros</h4>
                  <p className="text-sm text-muted-foreground">
                    Sincronizar tabela TGFPAR
                  </p>
                </div>
              </div>
              {lastSync?.clients && (
                <div className="text-sm text-muted-foreground flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  Última sync: {formatDistanceToNow(new Date(lastSync.clients.finished_at!), { addSuffix: true, locale: ptBR })}
                  <span className="text-foreground ml-1">
                    ({lastSync.clients.records_success} registros)
                  </span>
                </div>
              )}
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                onClick={() => handleSync('clients')}
                disabled={syncMutation.isPending || !configData?.isConfigured}
              >
                {syncMutation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4 mr-2" />
                )}
                Sincronizar Clientes
              </Button>
            </div>

            {/* Products Sync */}
            <div className="p-4 border rounded-lg space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-medium">Produtos</h4>
                  <p className="text-sm text-muted-foreground">
                    Sincronizar tabela TGFPRO
                  </p>
                </div>
              </div>
              {lastSync?.products && (
                <div className="text-sm text-muted-foreground flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  Última sync: {formatDistanceToNow(new Date(lastSync.products.finished_at!), { addSuffix: true, locale: ptBR })}
                  <span className="text-foreground ml-1">
                    ({lastSync.products.records_success} registros)
                  </span>
                </div>
              )}
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                onClick={() => handleSync('products')}
                disabled={syncMutation.isPending || !configData?.isConfigured}
              >
                {syncMutation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4 mr-2" />
                )}
                Sincronizar Produtos
              </Button>
            </div>
          </div>

          {/* Auto Sync Settings */}
          <div className="p-4 border rounded-lg space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="font-medium">Sincronização Automática</h4>
                <p className="text-sm text-muted-foreground">
                  Sincronizar dados automaticamente em intervalos regulares
                </p>
              </div>
              <Switch
                checked={autoSync}
                onCheckedChange={handleAutoSyncChange}
                disabled={!configData?.isConfigured}
              />
            </div>

            {autoSync && (
              <div className="flex items-center gap-4">
                <Label htmlFor="interval">Intervalo:</Label>
                <Select value={syncInterval} onValueChange={handleIntervalChange}>
                  <SelectTrigger className="w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1h">1 hora</SelectItem>
                    <SelectItem value="6h">6 horas</SelectItem>
                    <SelectItem value="12h">12 horas</SelectItem>
                    <SelectItem value="24h">24 horas</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Sync History */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Histórico de Sincronizações</CardTitle>
          <CardDescription>
            Últimas 20 sincronizações realizadas
          </CardDescription>
        </CardHeader>
        <CardContent>
          {syncLogs && syncLogs.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data/Hora</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Entidade</TableHead>
                  <TableHead className="text-center">Registros</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {syncLogs.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="font-medium">
                      {format(new Date(log.started_at), 'dd/MM/yyyy HH:mm', { locale: ptBR })}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="capitalize">
                        {log.sync_type}
                      </Badge>
                    </TableCell>
                    <TableCell className="capitalize">
                      {log.entity_type === 'clients' ? 'Clientes' : 'Produtos'}
                    </TableCell>
                    <TableCell className="text-center">
                      <span className="text-green-500">{log.records_success}</span>
                      {log.records_failed > 0 && (
                        <span className="text-destructive ml-1">/ {log.records_failed} erros</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {getStatusBadge(log.status)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              Nenhuma sincronização realizada ainda
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
