import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { 
  Plus, 
  Copy, 
  Check, 
  Trash2, 
  ExternalLink, 
  ArrowRight,
  RefreshCw,
  AlertCircle,
  CheckCircle,
  Clock,
  Zap,
  Pencil
} from 'lucide-react';

import { toast } from 'sonner';
import { useProducts } from '@/hooks/useProducts';
import { useTeamMembers } from '@/hooks/useTeam';
import { useSquads } from '@/hooks/useSquads';
import { 
  useFacebookLeadIntegrations, 
  useFacebookLeadLogs,
  useCreateFacebookIntegration,
  useUpdateFacebookIntegration,
  useDeleteFacebookIntegration,
  FacebookLeadIntegration
} from '@/hooks/useFacebookLeads';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const WEBHOOK_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/facebook-leads-webhook`;

const DEFAULT_FIELD_MAPPING: Record<string, string> = {
  full_name: 'name',
  email: 'email',
  phone_number: 'phone',
  company: 'company'
};

const CRM_FIELDS = [
  { value: 'name', label: 'Nome' },
  { value: 'email', label: 'Email' },
  { value: 'phone', label: 'Telefone' },
  { value: 'company', label: 'Empresa' }
];

export function FacebookLeadsConfig() {
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [showLogsDialog, setShowLogsDialog] = useState(false);
  const [selectedIntegration, setSelectedIntegration] = useState<FacebookLeadIntegration | null>(null);

  const [copiedField, setCopiedField] = useState<string | null>(null);
  
  // Form state
  const [productId, setProductId] = useState('');
  const [pageId, setPageId] = useState('');
  const [pageName, setPageName] = useState('');
  const [accessToken, setAccessToken] = useState('');
  const [fieldMapping, setFieldMapping] = useState<Record<string, string>>(DEFAULT_FIELD_MAPPING);
  const [distributionRule, setDistributionRule] = useState('manual');
  const [assignedUserId, setAssignedUserId] = useState('');
  const [assignedSquadId, setAssignedSquadId] = useState('');
  const [defaultTemperature, setDefaultTemperature] = useState('hot');
  const [pixelName, setPixelName] = useState('');
  const [pixelId, setPixelId] = useState('');
  const [pixelAccessToken, setPixelAccessToken] = useState('');

  
  const { data: integrations, isLoading } = useFacebookLeadIntegrations();
  const { data: logs } = useFacebookLeadLogs(selectedIntegration?.id);
  const { data: products } = useProducts();
  const { data: teamMembers } = useTeamMembers();
  const { data: squads } = useSquads();
  
  const createMutation = useCreateFacebookIntegration();
  const updateMutation = useUpdateFacebookIntegration();
  const deleteMutation = useDeleteFacebookIntegration();
  
  const handleCopy = async (text: string, field: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedField(field);
    toast.success('Copiado!');
    setTimeout(() => setCopiedField(null), 2000);
  };
  
  const handleCreateOrUpdate = async () => {
    if (!productId || !pageId || !accessToken) {
      toast.error('Preencha todos os campos obrigatórios');
      return;
    }
    
    const payload = {
      product_id: productId,
      page_id: pageId,
      page_name: pageName || undefined,
      page_access_token: accessToken,
      field_mapping: fieldMapping,
      distribution_rule: distributionRule,
      assigned_user_id: distributionRule === 'user' ? assignedUserId : undefined,
      assigned_squad_id: distributionRule === 'squad' ? assignedSquadId : undefined,
      default_temperature: defaultTemperature,
      pixel_name: pixelName || undefined,
      pixel_id: pixelId || undefined,
      pixel_access_token: pixelAccessToken || undefined
    };

    if (isEditing && selectedIntegration) {
      await updateMutation.mutateAsync({
        id: selectedIntegration.id,
        ...payload
      });
    } else {
      await createMutation.mutateAsync(payload);
    }

    
    // Reset form
    setProductId('');
    setPageId('');
    setPageName('');
    setAccessToken('');
    setPixelName('');
    setPixelId('');
    setPixelAccessToken('');
    setFieldMapping(DEFAULT_FIELD_MAPPING);
    setDistributionRule('manual');
    setAssignedUserId('');
    setAssignedSquadId('');
    setDefaultTemperature('hot');
    setShowAddDialog(false);
    setIsEditing(false);
    setSelectedIntegration(null);
  };

  const handleEdit = (integration: FacebookLeadIntegration) => {
    setSelectedIntegration(integration);
    setIsEditing(true);
    setProductId(integration.product_id);
    setPageId(integration.page_id);
    setPageName(integration.page_name || '');
    setAccessToken(integration.page_access_token);
    setFieldMapping(integration.field_mapping || DEFAULT_FIELD_MAPPING);
    setDistributionRule(integration.distribution_rule);
    setAssignedUserId(integration.assigned_user_id || '');
    setAssignedSquadId(integration.assigned_squad_id || '');
    setDefaultTemperature(integration.default_temperature);
    setPixelName(integration.pixel_name || '');
    setPixelId(integration.pixel_id || '');
    setPixelAccessToken(integration.pixel_access_token || '');
    setShowAddDialog(true);
  };

  
  const handleToggleActive = async (integration: FacebookLeadIntegration) => {
    await updateMutation.mutateAsync({
      id: integration.id,
      is_active: !integration.is_active
    });
  };
  
  const handleDelete = async (id: string) => {
    if (confirm('Tem certeza que deseja remover esta integração?')) {
      await deleteMutation.mutateAsync(id);
    }
  };
  
  const handleViewLogs = (integration: FacebookLeadIntegration) => {
    setSelectedIntegration(integration);
    setShowLogsDialog(true);
  };
  
  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'processed':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'error':
        return <AlertCircle className="h-4 w-4 text-destructive" />;
      default:
        return <Clock className="h-4 w-4 text-muted-foreground" />;
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-blue-600 flex items-center justify-center">
                <svg viewBox="0 0 24 24" className="h-6 w-6 text-white" fill="currentColor">
                  <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                </svg>
              </div>
              <div>
                <CardTitle>Facebook Lead Ads</CardTitle>
                <CardDescription>
                  Receba leads dos formulários nativos de anúncios do Facebook e Instagram
                </CardDescription>
              </div>
            </div>
            <Button onClick={() => {
              setIsEditing(false);
              setSelectedIntegration(null);
              setProductId('');
              setPageId('');
              setPageName('');
              setAccessToken('');
              setPixelName('');
              setPixelId('');
              setPixelAccessToken('');
              setFieldMapping(DEFAULT_FIELD_MAPPING);
              setDistributionRule('manual');
              setAssignedUserId('');
              setAssignedSquadId('');
              setDefaultTemperature('hot');
              setShowAddDialog(true);
            }}>

              <Plus className="h-4 w-4 mr-2" />
              Adicionar Página
            </Button>
          </div>
        </CardHeader>
        
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">Carregando...</div>
          ) : integrations?.length === 0 ? (
            <div className="text-center py-8 border-2 border-dashed rounded-lg">
              <p className="text-muted-foreground mb-4">
                Nenhuma integração configurada
              </p>
              <Button variant="outline" onClick={() => setShowAddDialog(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Configurar primeira integração
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              {integrations?.map((integration) => (
                <Card key={integration.id} className="bg-muted/30">
                  <CardContent className="pt-4">
                    <div className="flex items-start justify-between">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <h4 className="font-semibold">
                            {integration.page_name || `Página ${integration.page_id}`}
                          </h4>
                          <Badge variant={integration.is_active ? 'default' : 'secondary'}>
                            {integration.is_active ? 'Ativo' : 'Inativo'}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          Produto: {integration.products?.name}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {integration.leads_count} leads recebidos
                          {integration.last_lead_received_at && (
                            <> • Último: {format(new Date(integration.last_lead_received_at), "dd/MM 'às' HH:mm", { locale: ptBR })}</>
                          )}
                        </p>
                        {integration.pixel_id && (
                          <div className="flex items-center gap-2 mt-2">
                            <Badge variant="outline" className="text-xs bg-purple-500/10 text-purple-600 border-purple-500/30">
                              <Zap className="h-3 w-3 mr-1" />
                              Pixel: {integration.pixel_name || integration.pixel_id}
                            </Badge>
                          </div>
                        )}
                      </div>

                      
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={integration.is_active}
                          onCheckedChange={() => handleToggleActive(integration)}
                        />
                        <Button 
                          variant="outline" 
                          size="icon"
                          onClick={() => handleEdit(integration)}
                          title="Editar"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => handleViewLogs(integration)}
                        >
                          <RefreshCw className="h-4 w-4 mr-1" />
                          Logs
                        </Button>

                        <Button 
                          variant="ghost" 
                          size="icon"
                          className="text-destructive hover:text-destructive"
                          onClick={() => handleDelete(integration.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                    
                    <Accordion type="single" collapsible className="mt-4">
                      <AccordionItem value="setup" className="border-none">
                        <AccordionTrigger className="text-sm py-2 hover:no-underline">
                          Ver instruções de configuração
                        </AccordionTrigger>
                        <AccordionContent>
                          <div className="space-y-3 pt-2">
                            <div>
                              <Label className="text-xs text-muted-foreground">URL do Webhook</Label>
                              <div className="flex items-center gap-2 mt-1">
                                <code className="flex-1 p-2 bg-background rounded text-xs font-mono break-all">
                                  {WEBHOOK_URL}
                                </code>
                                <Button 
                                  size="icon" 
                                  variant="ghost"
                                  onClick={() => handleCopy(WEBHOOK_URL, 'url')}
                                >
                                  {copiedField === 'url' ? (
                                    <Check className="h-4 w-4 text-green-500" />
                                  ) : (
                                    <Copy className="h-4 w-4" />
                                  )}
                                </Button>
                              </div>
                            </div>
                            
                            <div>
                              <Label className="text-xs text-muted-foreground">Verify Token</Label>
                              <div className="flex items-center gap-2 mt-1">
                                <code className="flex-1 p-2 bg-background rounded text-xs font-mono">
                                  {integration.verify_token}
                                </code>
                                <Button 
                                  size="icon" 
                                  variant="ghost"
                                  onClick={() => handleCopy(integration.verify_token, `token-${integration.id}`)}
                                >
                                  {copiedField === `token-${integration.id}` ? (
                                    <Check className="h-4 w-4 text-green-500" />
                                  ) : (
                                    <Copy className="h-4 w-4" />
                                  )}
                                </Button>
                              </div>
                            </div>
                            
                            <div className="pt-2 flex gap-2">
                              <Button 
                                variant="outline" 
                                size="sm" 
                                asChild
                              >
                                <a 
                                  href="https://developers.facebook.com/apps" 
                                  target="_blank" 
                                  rel="noopener noreferrer"
                                >
                                  <ExternalLink className="h-4 w-4 mr-1" />
                                  Abrir Facebook Developers
                                </a>
                              </Button>
                            </div>
                          </div>
                        </AccordionContent>
                      </AccordionItem>
                    </Accordion>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
      
      {/* Add Integration Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{isEditing ? 'Editar Integração' : 'Conectar Página do Facebook'}</DialogTitle>
            <DialogDescription>
              {isEditing 
                ? 'Atualize as configurações da sua integração'
                : 'Configure a integração para receber leads de anúncios do Facebook/Instagram'
              }
            </DialogDescription>
          </DialogHeader>

          
          <Tabs defaultValue="credentials" className="mt-4">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="credentials">Credenciais</TabsTrigger>
              <TabsTrigger value="mapping">Mapeamento</TabsTrigger>
              <TabsTrigger value="distribution">Distribuição</TabsTrigger>
            </TabsList>
            
            <TabsContent value="credentials" className="space-y-4 mt-4">
              <div>
                <Label>Produto destino *</Label>
                <Select value={productId} onValueChange={setProductId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o produto" />
                  </SelectTrigger>
                  <SelectContent>
                    {products?.map(p => (
                      <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              <div>
                <Label>Page ID *</Label>
                <Input 
                  placeholder="123456789012345" 
                  value={pageId}
                  onChange={e => setPageId(e.target.value)}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  ID numérico da sua página do Facebook
                </p>
              </div>
              
              <div>
                <Label>Nome da Página</Label>
                <Input 
                  placeholder="Minha Empresa" 
                  value={pageName}
                  onChange={e => setPageName(e.target.value)}
                />
              </div>
              
              <div>
                <Label>Page Access Token *</Label>
                <Input 
                  type="password"
                  placeholder="EAAxxxxxx..." 
                  value={accessToken}
                  onChange={e => setAccessToken(e.target.value)}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Obtenha em Facebook Developers → Seu App → Ferramentas → Graph API Explorer
                </p>
              </div>

              <div className="pt-4 border-t">
                <h4 className="text-sm font-medium mb-3">Facebook Pixel (Conversões WhatsApp)</h4>
                <div className="space-y-4">
                  <div>
                    <Label>Nome do Pixel</Label>
                    <Input 
                      placeholder="Ex: Meu Pixel Principal" 
                      value={pixelName}
                      onChange={e => setPixelName(e.target.value)}
                    />
                  </div>
                  <div>
                    <Label>ID do Pixel</Label>
                    <Input 
                      placeholder="Ex: 1234567890" 
                      value={pixelId}
                      onChange={e => setPixelId(e.target.value)}
                    />
                  </div>
                  <div>
                    <Label>Access Token PIXEL</Label>
                    <Input 
                      type="password"
                      placeholder="EAAYxxxxxx..." 
                      value={pixelAccessToken}
                      onChange={e => setPixelAccessToken(e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      Token de acesso para a API de Conversões do Facebook
                    </p>
                  </div>
                </div>
              </div>
            </TabsContent>

            
            <TabsContent value="mapping" className="space-y-4 mt-4">
              <p className="text-sm text-muted-foreground">
                Mapeie os campos do formulário do Facebook para os campos do CRM
              </p>
              
              {Object.entries(DEFAULT_FIELD_MAPPING).map(([fbField]) => (
                <div key={fbField} className="flex items-center gap-3">
                  <span className="w-32 text-sm font-mono bg-muted px-2 py-1 rounded">
                    {fbField}
                  </span>
                  <ArrowRight className="h-4 w-4 text-muted-foreground" />
                  <Select 
                    value={fieldMapping[fbField] || ''} 
                    onValueChange={v => setFieldMapping(prev => ({ ...prev, [fbField]: v }))}
                  >
                    <SelectTrigger className="w-40">
                      <SelectValue placeholder="Selecione" />
                    </SelectTrigger>
                    <SelectContent>
                      {CRM_FIELDS.map(f => (
                        <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </TabsContent>
            
            <TabsContent value="distribution" className="space-y-4 mt-4">
              <div>
                <Label>Distribuição de Leads</Label>
                <Select value={distributionRule} onValueChange={setDistributionRule}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="manual">Sem atribuição automática</SelectItem>
                    <SelectItem value="user">Atribuir a vendedor específico</SelectItem>
                    <SelectItem value="squad">Atribuir a squad</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              {distributionRule === 'user' && (
                <div>
                  <Label>Vendedor</Label>
                  <Select value={assignedUserId} onValueChange={setAssignedUserId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione o vendedor" />
                    </SelectTrigger>
                    <SelectContent>
                      {teamMembers?.map(m => (
                        <SelectItem key={m.id} value={m.id}>{m.full_name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              
              {distributionRule === 'squad' && (
                <div>
                  <Label>Squad</Label>
                  <Select value={assignedSquadId} onValueChange={setAssignedSquadId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione o squad" />
                    </SelectTrigger>
                    <SelectContent>
                      {squads?.map(s => (
                        <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              
              <div>
                <Label>Temperatura padrão</Label>
                <Select value={defaultTemperature} onValueChange={setDefaultTemperature}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="hot">🔥 Quente</SelectItem>
                    <SelectItem value="warm">☀️ Morno</SelectItem>
                    <SelectItem value="cold">❄️ Frio</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </TabsContent>
          </Tabs>
          
          <DialogFooter className="mt-6">
            <Button variant="outline" onClick={() => setShowAddDialog(false)}>
              Cancelar
            </Button>
            <Button 
              onClick={handleCreateOrUpdate}
              disabled={createMutation.isPending || updateMutation.isPending}
            >
              {createMutation.isPending || updateMutation.isPending 
                ? 'Salvando...' 
                : isEditing ? 'Atualizar Integração' : 'Criar Integração'
              }
            </Button>

          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* Logs Dialog */}
      <Dialog open={showLogsDialog} onOpenChange={setShowLogsDialog}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Logs de Leads Recebidos</DialogTitle>
            <DialogDescription>
              {selectedIntegration?.page_name || `Página ${selectedIntegration?.page_id}`}
            </DialogDescription>
          </DialogHeader>
          
          {logs?.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              Nenhum lead recebido ainda
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Status</TableHead>
                  <TableHead>Lead ID</TableHead>
                  <TableHead>Recebido em</TableHead>
                  <TableHead>Processado em</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs?.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {getStatusIcon(log.status)}
                        <span className="text-sm capitalize">{log.status}</span>
                      </div>
                      {log.error_message && (
                        <p className="text-xs text-destructive mt-1">{log.error_message}</p>
                      )}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {log.leadgen_id.substring(0, 12)}...
                    </TableCell>
                    <TableCell className="text-sm">
                      {format(new Date(log.created_at), "dd/MM/yy HH:mm", { locale: ptBR })}
                    </TableCell>
                    <TableCell className="text-sm">
                      {log.processed_at 
                        ? format(new Date(log.processed_at), "dd/MM/yy HH:mm", { locale: ptBR })
                        : '-'
                      }
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
