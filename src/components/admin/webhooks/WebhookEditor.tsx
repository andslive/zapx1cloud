import { useState } from 'react';
import { useWebhook, useUpdateWebhook, useWebhookSamples } from '@/hooks/useWebhooks';
import { useSquads } from '@/hooks/useSquads';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { 
  ArrowLeft, 
  Copy, 
  Settings, 
  Activity,
  FlaskConical,
  Check,
  Users,
  X
} from 'lucide-react';
import { WebhookActionsPanel } from './WebhookActionsPanel';
import { WebhookRequestsPanel } from './WebhookRequestsPanel';
import { WebhookLogsTab } from './WebhookLogsTab';
import { toast } from 'sonner';
import type { WebhookAction } from '@/types/webhook';


interface WebhookEditorProps {
  webhookId: string;
  onBack: () => void;
}

export function WebhookEditor({ webhookId, onBack }: WebhookEditorProps) {
  const { data: webhook, isLoading } = useWebhook(webhookId);
  const { data: samples } = useWebhookSamples(webhookId);
  const { data: squads } = useSquads();
  const updateWebhook = useUpdateWebhook();
  
  const [activeTab, setActiveTab] = useState('config');
  const [copied, setCopied] = useState(false);


  const webhookUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/webhook-receiver/${webhookId}`;

  const copyUrl = () => {
    navigator.clipboard.writeText(webhookUrl);
    setCopied(true);
    toast.success('URL copiada!');
    setTimeout(() => setCopied(false), 2000);
  };

  const handleToggleActive = async (checked: boolean) => {
    await updateWebhook.mutateAsync({
      id: webhookId,
      is_active: checked
    });
    toast.success(checked ? 'Webhook ativado!' : 'Webhook desativado');
  };

  const handleToggleTestMode = async (checked: boolean) => {
    await updateWebhook.mutateAsync({
      id: webhookId,
      is_test_mode: checked
    });
    toast.success(checked ? 'Modo teste ativado' : 'Modo teste desativado');
  };

  const handleActionsChange = async (actions: WebhookAction[]) => {
    await updateWebhook.mutateAsync({
      id: webhookId,
      actions
    });
  };

  const handleSquadChange = async (squadId: string | null) => {
    await updateWebhook.mutateAsync({
      id: webhookId,
      squad_id: squadId || undefined
    });
    toast.success(squadId ? 'Squad de destino configurado!' : 'Squad removido');
  };


  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (!webhook) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Webhook não encontrado</p>
        <Button variant="outline" onClick={onBack} className="mt-4">
          Voltar
        </Button>
      </div>
    );
  }

  // Get the first sample's fields for mapping
  const availableFields = samples?.[0]?.extracted_fields || {};

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <Button variant="ghost" size="icon" onClick={onBack} className="flex-shrink-0">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold text-foreground truncate">{webhook.name}</h1>
            {webhook.description && (
              <p className="text-sm text-muted-foreground truncate">{webhook.description}</p>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3 sm:gap-3 sm:ml-auto">
          <div className="flex items-center gap-2">
            <FlaskConical className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">Modo Teste</span>
            <Switch
              checked={webhook.is_test_mode}
              onCheckedChange={handleToggleTestMode}
            />
          </div>
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">Ativo</span>
            <Switch
              checked={webhook.is_active}
              onCheckedChange={handleToggleActive}
            />
          </div>
        </div>
      </div>

      {/* URL Card */}
      <Card>
        <CardContent className="py-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2 mb-1">
                <p className="text-xs text-muted-foreground">URL do Webhook</p>
                <div className="flex gap-2 sm:hidden">
                  {webhook.is_active ? (
                    <Badge className="bg-primary/10 text-primary border-primary/20">Ativo</Badge>
                  ) : (
                    <Badge variant="secondary">Inativo</Badge>
                  )}
                  {webhook.is_test_mode && (
                    <Badge variant="outline" className="text-warning border-warning/30">Teste</Badge>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <code className="flex-1 min-w-0 px-3 py-2 bg-muted rounded-md text-xs sm:text-sm font-mono truncate">
                  {webhookUrl}
                </code>
                <Button variant="outline" size="sm" onClick={copyUrl} className="flex-shrink-0">
                  {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
            </div>
            <div className="hidden sm:flex gap-2">
              {webhook.is_active ? (
                <Badge className="bg-primary/10 text-primary border-primary/20">
                  Ativo
                </Badge>
              ) : (
                <Badge variant="secondary">Inativo</Badge>
              )}
              {webhook.is_test_mode && (
                <Badge variant="outline" className="text-warning border-warning/30">
                  Modo Teste
                </Badge>
              )}
            </div>
          </div>
          {webhook.is_test_mode && (
            <p className="text-xs text-warning mt-2">
              ⚠️ Em modo teste, as requisições são logadas mas as ações não são executadas.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Squad Dispatch Config Card */}
      <Card>
        <CardContent className="py-4">
          <div className="flex items-start gap-3">
            <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
              <Users className="h-5 w-5 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-foreground">Auto Dispatch por Squad</p>
              <p className="text-xs text-muted-foreground mb-3">
                Quando um lead é criado, ele será distribuído automaticamente para um membro online do squad selecionado. Se nenhum membro estiver disponível, o lead entra na fila.
              </p>
              <div className="flex items-center gap-2">
                <Select
                  value={webhook.squad_id || 'none'}
                  onValueChange={(val) => handleSquadChange(val === 'none' ? null : val)}
                >
                  <SelectTrigger className="flex-1 sm:max-w-xs">
                    <SelectValue placeholder="Selecionar squad..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">
                      <span className="text-muted-foreground">Sem squad (sem Auto Dispatch)</span>
                    </SelectItem>
                    {squads?.map((squad) => (
                      <SelectItem key={squad.id} value={squad.id}>
                        <div className="flex items-center gap-2">
                          <div 
                            className="h-2.5 w-2.5 rounded-full flex-shrink-0"
                            style={{ background: squad.color || '#6b7280' }}
                          />
                          {squad.name}
                          {squad.members_count !== undefined && (
                            <span className="text-muted-foreground text-xs">({squad.members_count} membros)</span>
                          )}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {webhook.squad_id && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9 text-muted-foreground hover:text-destructive"
                    onClick={() => handleSquadChange(null)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>
              {webhook.squad_id && (
                <p className="text-xs text-primary mt-2 flex items-center gap-1">
                  ✅ Auto Dispatch ativado — leads serão distribuídos para o squad selecionado
                </p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Product Warning */}
      {webhook.is_active && !webhook.product_id && (
        <Card className="border-destructive/50 bg-destructive/5">
          <CardContent className="py-4">
            <p className="text-sm font-semibold text-destructive">⚠️ Webhook sem produto vinculado</p>
            <p className="text-xs text-muted-foreground mt-1">
              Leads criados por este webhook não terão pipeline stage, não aparecerão no Kanban e ações como "Agente IA" não funcionarão. 
              Configure um produto nas ações de "Criar Lead" ou vincule um produto ao webhook.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="config" className="gap-2">
            <Settings className="h-4 w-4" />
            Configuração
          </TabsTrigger>
          <TabsTrigger value="logs" className="gap-2">
            <Activity className="h-4 w-4" />
            Histórico
            {webhook.requests_count > 0 && (
              <Badge variant="secondary" className="ml-1">
                {webhook.requests_count}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="config" className="mt-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Left: Sample Requests */}
            <WebhookRequestsPanel
              webhookId={webhookId}
              samples={samples || []}
            />

            {/* Right: Actions */}
            <WebhookActionsPanel
              actions={webhook.actions}
              availableFields={availableFields}
              productId={webhook.product_id}
              onChange={handleActionsChange}
            />
          </div>
        </TabsContent>

        <TabsContent value="logs" className="mt-6">
          <WebhookLogsTab webhookId={webhookId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
