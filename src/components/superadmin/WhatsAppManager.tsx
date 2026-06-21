import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Server, Smartphone, Eye, EyeOff, ExternalLink, CheckCircle2, XCircle, Loader2, Plus, Trash2, RefreshCw, Star, Monitor, Pencil, AlertCircle, Pause, LogOut, Settings2,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  usePlatformWhatsAppConfig,
  useUpdatePlatformWhatsAppConfig,
  useTestWhatsAppConnection,
  useAllWhatsAppInstancesAdmin,
  useCreateWhatsAppInstance,
  useImportWhatsAppInstance,
  useDeleteWhatsAppInstance,
  useSyncWhatsAppInstances,
  useSetDefaultWhatsAppInstance,
  useConnectWhatsAppInstance,
  useAssignWhatsAppInstance,
  useDisconnectWhatsAppInstance,
  useLogoutWhatsAppInstance,
  type WhatsAppInstanceWithOrg,
} from '@/hooks/useWhatsAppInstances';
import { useQuery } from '@tanstack/react-query';

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
    connected: { label: 'Conectado', variant: 'default' },
    qr_pending: { label: 'Aguardando QR', variant: 'secondary' },
    paired: { label: 'Pareado', variant: 'default' },
    disconnected: { label: 'Desconectado', variant: 'outline' },
  };
  const cfg = map[status] || { label: status, variant: 'outline' as const };
  return <Badge variant={cfg.variant}>{cfg.label}</Badge>;
}

function useOrganizations() {
  return useQuery({
    queryKey: ['superadmin-organizations-list'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('organizations')
        .select('id, name')
        .order('name', { ascending: true });
      if (error) throw error;
      return data || [];
    },
  });
}

export function WhatsAppManager() {
  const { data: config, isLoading: cfgLoading } = usePlatformWhatsAppConfig();
  const updateCfg = useUpdatePlatformWhatsAppConfig();
  const testMut = useTestWhatsAppConnection();

  const [provider, setProvider] = useState<'evolution' | 'uazapi'>('uazapi');
  const [url, setUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null);

  useEffect(() => {
    if (config) {
      setProvider(config.whatsapp_provider || 'uazapi');
      if (config.whatsapp_provider === 'uazapi') {
        setUrl(config.uazapi_url || '');
        setApiKey(config.uazapi_admin_token || '');
      } else {
        setUrl(config.evolution_go_url || '');
        setApiKey(config.evolution_go_global_api_key || '');
      }
    }
  }, [config]);

  const cleanUrl = url.replace(/\/$/, '');
  const isConfigured = provider === 'uazapi' 
    ? !!(config?.uazapi_url && config?.uazapi_admin_token)
    : !!(config?.evolution_go_url && config?.evolution_go_global_api_key);

  const handleTest = () => {
    setTestResult(null);
    testMut.mutate({ url: cleanUrl, globalApiKey: apiKey }, {
      onSuccess: (data: any) => setTestResult({ ok: !!data?.ok, msg: data?.message || 'OK' }),
      onError: (e: any) => setTestResult({ ok: false, msg: e.message }),
    });
  };

  const handleSave = () => {
    const updatePayload: any = { whatsapp_provider: provider };
    if (provider === 'uazapi') {
      updatePayload.uazapi_url = cleanUrl;
      updatePayload.uazapi_admin_token = apiKey;
    } else {
      updatePayload.evolution_go_url = cleanUrl;
      updatePayload.evolution_go_global_api_key = apiKey;
    }
    updateCfg.mutate(updatePayload);
  };

  const handleProviderChange = (newProvider: 'evolution' | 'uazapi') => {
    setProvider(newProvider);
    if (newProvider === 'uazapi') {
      setUrl(config?.uazapi_url || '');
      setApiKey(config?.uazapi_admin_token || '');
    } else {
      setUrl(config?.evolution_go_url || '');
      setApiKey(config?.evolution_go_global_api_key || '');
    }
    setTestResult(null);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">WhatsApp Manager</h1>
          <p className="text-muted-foreground mt-1">
            Configure o servidor Uazapi e gerencie as instâncias de cada empresa.
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-green-500/10 flex items-center justify-center">
                <Server className="h-5 w-5 text-green-500" />
              </div>
              <div>
                <CardTitle className="text-lg">Configuração Uazapi</CardTitle>
                <CardDescription>Servidor global uazapiGO usado por todas as empresas</CardDescription>
              </div>
            </div>
            <Badge variant={isConfigured ? 'default' : 'outline'}>
              {isConfigured ? 'Configurado' : 'Não configurado'}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="server">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="server" className="gap-2"><Settings2 className="h-4 w-4" /> Servidor</TabsTrigger>
              <TabsTrigger value="instances" className="gap-2" disabled={!isConfigured}>
                <Smartphone className="h-4 w-4" /> Instâncias
              </TabsTrigger>
            </TabsList>

            <TabsContent value="server" className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label htmlFor="evo-url">URL da API Uazapi</Label>
                <Input
                  id="evo-url"
                  placeholder="https://free.uazapi.com"
                  value={url}
                  onChange={(e) => {
                    setUrl(e.target.value);
                  }}
                  disabled={cfgLoading}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="evo-key">Admin Token</Label>
                <div className="relative">
                  <Input
                    id="evo-key"
                    type={showKey ? 'text' : 'password'}
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    disabled={cfgLoading}
                    className="pr-10"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8 p-0"
                    onClick={() => setShowKey((s) => !s)}
                  >
                    {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
              </div>

              {testResult && (
                <div className={`flex items-start gap-2 rounded-md border p-3 text-sm ${
                  testResult.ok
                    ? 'border-green-500/30 bg-green-500/10 text-green-700 dark:text-green-400'
                    : 'border-destructive/30 bg-destructive/10 text-destructive'
                }`}>
                  {testResult.ok ? <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" /> : <XCircle className="h-4 w-4 mt-0.5 shrink-0" />}
                  <span className="break-all">{testResult.msg}</span>
                </div>
              )}

              <div className="flex gap-2">
                <Button variant="outline" onClick={handleTest} disabled={testMut.isPending || !cleanUrl || !apiKey}>
                  {testMut.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                  Testar Conexão
                </Button>
                <Button onClick={handleSave} disabled={updateCfg.isPending || !cleanUrl || !apiKey}>
                  {updateCfg.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                  Salvar Configuração
                </Button>
              </div>
            </TabsContent>

            <TabsContent value="instances" className="mt-4">
              <InstancesTable provider={provider} />
            </TabsContent>

          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}

function InstancesTable({ provider }: { provider: 'evolution' | 'uazapi' }) {
  const { data: instances, isLoading } = useAllWhatsAppInstancesAdmin();
  const { data: orgs } = useOrganizations();
  const createMut = useCreateWhatsAppInstance();
  const importMut = useImportWhatsAppInstance();
  const deleteMut = useDeleteWhatsAppInstance();
  const syncMut = useSyncWhatsAppInstances();
  const setDefaultMut = useSetDefaultWhatsAppInstance();
  const connectMut = useConnectWhatsAppInstance();
  const disconnectMut = useDisconnectWhatsAppInstance();
  const logoutMut = useLogoutWhatsAppInstance();
 
  const [openCreate, setOpenCreate] = useState(false);
  const [openImport, setOpenImport] = useState(false);
  const [newName, setNewName] = useState('');
  const [newOrgId, setNewOrgId] = useState('');
  const [importToken, setImportToken] = useState('');
  const [filterOrgId, setFilterOrgId] = useState<string>('all');
  const [editing, setEditing] = useState<WhatsAppInstanceWithOrg | null>(null);
  const [pausing, setPausing] = useState<WhatsAppInstanceWithOrg | null>(null);
  const [unlinking, setUnlinking] = useState<WhatsAppInstanceWithOrg | null>(null);
  const [connectStartTime, setConnectStartTime] = useState(0);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    let timer: number;
    if (connectMut.isPending) {
      timer = window.setInterval(() => {
        const seconds = Math.floor((Date.now() - connectStartTime) / 1000);
        setElapsed(seconds);
      }, 1000);
    } else {
      setElapsed(0);
    }
    return () => clearInterval(timer);
  }, [connectMut.isPending, connectStartTime]);

  const handleConnect = (inst: WhatsAppInstanceWithOrg) => {
    setEditing(inst);
    setConnectStartTime(Date.now());
    connectMut.mutate(inst.id);
  };

  const isQrAvailable = !!(editing?.qr_code || connectMut.data?.qr_code || connectMut.data?.data?.qrcode || connectMut.data?.data?.qr);
  const showError = connectMut.isError || (connectMut.isPending && elapsed >= 15 && !isQrAvailable);


  const isLinked = (s: string) => s === 'connected' || s === 'paired';

  const filtered = instances?.filter((i) => {
    if (filterOrgId === 'all') return true;
    if (filterOrgId === 'orphan') return !i.organization_id;
    return i.organization_id === filterOrgId;
  }) || [];

  const orphanCount = instances?.filter((i) => !i.organization_id).length || 0;

  const handleCreate = () => {
    if (!newName.trim() || !newOrgId) return;
    createMut.mutate({ name: newName.trim(), organization_id: newOrgId }, {
      onSuccess: () => {
        setOpenCreate(false);
        setNewName('');
        setNewOrgId('');
      },
    });
  };

  const handleImport = () => {
    if (!newName.trim() || !newOrgId || !importToken.trim()) return;
    importMut.mutate({ name: newName.trim(), organization_id: newOrgId, instance_token: importToken.trim() }, {
      onSuccess: () => {
        setOpenImport(false);
        setNewName('');
        setNewOrgId('');
        setImportToken('');
      },
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <Label className="text-sm">Filtrar:</Label>
          <Select value={filterOrgId} onValueChange={setFilterOrgId}>
            <SelectTrigger className="w-[240px]">
              <SelectValue placeholder="Todas as empresas" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as empresas</SelectItem>
              <SelectItem value="orphan">
                Sem empresa{orphanCount > 0 ? ` (${orphanCount})` : ''}
              </SelectItem>
              {orgs?.map((o) => (
                <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => syncMut.mutate(undefined)}
            disabled={syncMut.isPending}
            title={`Importa instâncias do servidor Uazapi. Novas chegam sem empresa atrelada — atribua manualmente depois.`}
          >
            {syncMut.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
            Sincronizar
          </Button>

          <Dialog open={openImport} onOpenChange={setOpenImport}>
            <DialogTrigger asChild>
              <Button variant="outline"><Plus className="h-4 w-4 mr-2" /> Importar Existente</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Importar instância existente</DialogTitle>
                <DialogDescription>
                  Se você já criou a instância manualmente no painel da Uazapi, informe os dados abaixo.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>Nome da instância (como está no Uazapi)</Label>
                  <Input
                    placeholder="ex: minha-instancia"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Token da instância (gerado pelo Uazapi)</Label>
                  <Input
                    placeholder="Cole o token da instância aqui"
                    value={importToken}
                    onChange={(e) => setImportToken(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Empresa</Label>
                  <Select value={newOrgId} onValueChange={setNewOrgId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione a empresa" />
                    </SelectTrigger>
                    <SelectContent>
                      {orgs?.map((o) => (
                        <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpenImport(false)}>Cancelar</Button>
                <Button onClick={handleImport} disabled={importMut.isPending || !newName.trim() || !newOrgId || !importToken.trim()}>
                  {importMut.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Importar
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          <Dialog open={openCreate} onOpenChange={setOpenCreate}>
            <DialogTrigger asChild>
              <Button><Plus className="h-4 w-4 mr-2" /> Nova Instância</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Criar nova instância</DialogTitle>
                <DialogDescription>
                  A instância será criada no servidor Uazapi e atrelada à empresa escolhida.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>Nome da instância</Label>
                  <Input
                    placeholder="ex: empresa-x-vendas"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">Apenas letras, números e hífens. Sem espaços.</p>
                </div>
                <div className="space-y-2">
                  <Label>Empresa</Label>
                  <Select value={newOrgId} onValueChange={setNewOrgId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione a empresa" />
                    </SelectTrigger>
                    <SelectContent>
                      {orgs?.map((o) => (
                        <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpenCreate(false)}>Cancelar</Button>
                <Button onClick={handleCreate} disabled={createMut.isPending || !newName.trim() || !newOrgId}>
                  {createMut.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Criar
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {orphanCount > 0 && filterOrgId === 'all' && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm flex items-start gap-2">
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0 text-amber-600" />
          <p className="text-amber-700 dark:text-amber-400">
            <strong>{orphanCount}</strong> instância(s) sem empresa atrelada. Clique no ícone de editar para atribuir.
          </p>
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : !filtered.length ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Smartphone className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
            <p className="text-muted-foreground">Nenhuma instância encontrada.</p>
            <p className="text-sm text-muted-foreground mt-1">
              Clique em <strong>Nova Instância</strong> para criar uma.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Empresa</TableHead>
                <TableHead>Telefone</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Webhook</TableHead>
                <TableHead>Padrão</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((inst) => (
                <TableRow key={inst.id} className={!inst.organization_id ? 'bg-amber-500/5' : ''}>
                  <TableCell className="font-medium">{inst.name}</TableCell>
                  <TableCell className="text-sm">
                    {inst.organization?.name ? (
                      inst.organization.name
                    ) : (
                      <Badge variant="outline" className="text-amber-600 border-amber-500/40 gap-1">
                        <AlertCircle className="h-3 w-3" /> Sem empresa
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-sm">{inst.phone_number ? `+${inst.phone_number}` : '—'}</TableCell>
                  <TableCell><StatusBadge status={inst.status} /></TableCell>
                  <TableCell>
                    {inst.webhook_subscribed ? (
                      <Badge variant="default" className="gap-1"><CheckCircle2 className="h-3 w-3" /> OK</Badge>
                    ) : (
                      <Badge variant="outline" className="text-amber-600 border-amber-500/40">Pendente</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    {inst.is_default ? (
                      <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                    ) : inst.organization_id ? (
                      <Button variant="ghost" size="sm" onClick={() => setDefaultMut.mutate(inst.id)}>
                        <Star className="h-4 w-4" />
                      </Button>
                    ) : (
                      <span className="text-muted-foreground text-xs">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                       {inst.status !== 'connected' && inst.status !== 'paired' && inst.status === 'qr_pending' && (
                        <Button variant="outline" size="sm" onClick={() => setEditing(inst)}>
                          <Eye className="h-4 w-4 mr-2" /> QR Code
                        </Button>
                      )}
                      {inst.status !== 'connected' && inst.status !== 'paired' && inst.status === 'disconnected' && (
                        <Button 
                          variant="outline" 
                          size="sm" 
                          onClick={() => handleConnect(inst)}
                          disabled={connectMut.isPending}
                        >
                          {connectMut.isPending && editing?.id === inst.id ? (
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          ) : (
                            <RefreshCw className="h-4 w-4 mr-2" />
                          )}
                          Conectar
                        </Button>
                      )}

                      {(inst.status === 'connected' || inst.status === 'paired') && (
                        <>
                          <Button variant="ghost" size="sm" onClick={() => setPausing(inst)} title="Pausar sessão">
                            <Pause className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => setUnlinking(inst)} title="Desvincular número">
                            <LogOut className="h-4 w-4" />
                          </Button>
                        </>
                      )}
                      <Button variant="ghost" size="sm" onClick={() => setEditing(inst)} title="Editar / Atribuir">
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => deleteMut.mutate(inst.id)} title="Excluir">
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Dialogs for QR, Editing, etc */}
      {editing && (
        <Dialog open={!!editing} onOpenChange={() => setEditing(null)}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>{(editing.status === 'connected' || editing.status === 'paired') ? 'Configurações' : 'Conectar WhatsApp'}</DialogTitle>
              <DialogDescription>
                {(editing.status === 'connected' || editing.status === 'paired') ? 'Gerencie a instância' : 'Escaneie o QR Code abaixo'}
              </DialogDescription>
            </DialogHeader>
             <div className="flex flex-col items-center justify-center space-y-4 py-4 min-h-[250px]">
              {isQrAvailable && editing.status !== 'connected' && editing.status !== 'paired' && (
                <div className="bg-white p-4 rounded-lg shadow-sm">
                  <img 
                    src={(editing.qr_code || connectMut.data?.qr_code || connectMut.data?.data?.qrcode || connectMut.data?.data?.qr).startsWith('data:') 
                      ? (editing.qr_code || connectMut.data?.qr_code || connectMut.data?.data?.qrcode || connectMut.data?.data?.qr) 
                      : `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(editing.qr_code || connectMut.data?.qr_code || connectMut.data?.data?.qrcode || connectMut.data?.data?.qr)}`} 
                    alt="QR Code" 
                    className="w-48 h-48"
                  />
                </div>
              )}
              
              {connectMut.isPending && !isQrAvailable && (
                <div className="flex flex-col items-center justify-center p-8 space-y-3">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  <div className="text-center">
                    <p className="text-sm font-medium">Gerando QR Code Chromium...</p>
                    <p className="text-xs text-muted-foreground">Aguardando resposta ({elapsed}s / 15s)</p>
                  </div>
                </div>
              )}

              {showError && !isQrAvailable && (
                <div className="flex flex-col items-center justify-center p-8 space-y-3 text-destructive">
                  <AlertCircle className="h-8 w-8" />
                  <div className="text-center">
                    <p className="text-sm font-medium">Falha na geração</p>
                    <p className="text-xs">{connectMut.error?.message || "O servidor demorou muito para responder (Timeout de 15s)."}</p>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => handleConnect(editing)}>Tentar novamente</Button>
                </div>
              )}


              <div className="w-full space-y-4">
                <div className="space-y-2">
                  <Label>Atribuir à Empresa</Label>
                  <Select 
                    value={editing.organization_id || 'orphan'} 
                    onValueChange={(v) => useAssignWhatsAppInstance().mutate({ id: editing.id, organization_id: v === 'orphan' ? null : v })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="orphan">Sem empresa</SelectItem>
                      {orgs?.map(o => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button onClick={() => setEditing(null)}>Fechar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      <AlertDialog open={!!pausing} onOpenChange={() => setPausing(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Pausar sessão?</AlertDialogTitle>
            <AlertDialogDescription>
              A instância será desconectada mas o pareamento continua salvo.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => { disconnectMut.mutate(pausing!.id); setPausing(null); }}>
              Pausar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!unlinking} onOpenChange={() => setUnlinking(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Desvincular número?</AlertDialogTitle>
            <AlertDialogDescription>
              Iso fará o logout completo da conta do WhatsApp desta instância.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction 
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => { logoutMut.mutate(unlinking!.id); setUnlinking(null); }}
            >
              Desvincular
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
