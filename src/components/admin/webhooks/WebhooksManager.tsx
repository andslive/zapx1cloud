import { useState } from 'react';
import { useWebhooks, useCreateWebhook, useDeleteWebhook } from '@/hooks/useWebhooks';
import { useProducts } from '@/hooks/useProducts';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Plus, 
  Search, 
  MoreVertical, 
  Webhook, 
  Edit, 
  Trash2,
  Copy,
  ExternalLink,
  Activity,
  HeartPulse
} from 'lucide-react';
import { WebhookEditor } from './WebhookEditor';
import { WebhookHealthDashboard } from './WebhookHealthDashboard';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';


export function WebhooksManager() {
  const { data: webhooks, isLoading } = useWebhooks();
  const { data: products } = useProducts();
  const createWebhook = useCreateWebhook();
  const deleteWebhook = useDeleteWebhook();

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedWebhookId, setSelectedWebhookId] = useState<string | null>(null);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [newWebhook, setNewWebhook] = useState({ name: '', description: '', product_id: '' });

  const filteredWebhooks = webhooks?.filter(w =>
    w.name.toLowerCase().includes(searchTerm.toLowerCase())
  ) || [];

  const totalRequestsThisMonth = webhooks?.reduce((sum, w) => sum + (w.requests_this_month || 0), 0) || 0;

  const handleCreate = async () => {
    if (!newWebhook.name.trim()) {
      toast.error('Nome é obrigatório');
      return;
    }
    
    await createWebhook.mutateAsync({
      name: newWebhook.name,
      description: newWebhook.description,
      product_id: newWebhook.product_id || undefined
    });
    setIsCreateDialogOpen(false);
    setNewWebhook({ name: '', description: '', product_id: '' });
  };

  const handleDelete = async () => {
    if (!deleteConfirmId) return;
    await deleteWebhook.mutateAsync(deleteConfirmId);
    setDeleteConfirmId(null);
  };

  const getWebhookUrl = (webhookId: string) => {
    return `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/webhook-receiver/${webhookId}`;
  };

  const copyUrl = (webhookId: string) => {
    navigator.clipboard.writeText(getWebhookUrl(webhookId));
    toast.success('URL copiada!');
  };

  // If a webhook is selected, show the editor
  if (selectedWebhookId) {
    return (
      <WebhookEditor
        webhookId={selectedWebhookId}
        onBack={() => setSelectedWebhookId(null)}
      />
    );
  }

  return (
    <div className="space-y-6">
      <Tabs defaultValue="list" className="w-full">
        <div className="flex items-center justify-between mb-4">
          <TabsList>
            <TabsTrigger value="list" className="gap-2">
              <Webhook className="h-4 w-4" />
              Webhooks
            </TabsTrigger>
            <TabsTrigger value="health" className="gap-2">
              <HeartPulse className="h-4 w-4" />
              Monitoramento
            </TabsTrigger>
          </TabsList>
          
          <TabsContent value="list" className="m-0">
            <Button onClick={() => setIsCreateDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Criar Webhook
            </Button>
          </TabsContent>
        </div>

        <TabsContent value="list" className="space-y-6 mt-0">
          {/* Stats Card */}
          <Card>
            <CardContent className="py-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-primary/10">
                    <Activity className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Requisições este mês</p>
                    <p className="text-2xl font-bold">{totalRequestsThisMonth.toLocaleString()}</p>
                  </div>
                </div>
                <Badge variant="secondary" className="text-sm">
                  {webhooks?.length || 0} webhooks configurados
                </Badge>
              </div>
            </CardContent>
          </Card>

          {/* Search */}
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar webhooks..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>

          {/* Table */}
          <Card>
            <CardContent className="p-0">
              {isLoading ? (
                <div className="p-6 space-y-4">
                  {[1, 2, 3].map(i => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : filteredWebhooks.length === 0 ? (
                <div className="p-12 text-center">
                  <Webhook className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <h3 className="text-lg font-medium mb-2">Nenhum webhook encontrado</h3>
                  <p className="text-muted-foreground mb-4">
                    Crie seu primeiro webhook para receber dados externos
                  </p>
                  <Button onClick={() => setIsCreateDialogOpen(true)}>
                    <Plus className="h-4 w-4 mr-2" />
                    Criar Webhook
                  </Button>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nome</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-center">Req. Mês</TableHead>
                      <TableHead className="text-center">Req. Total</TableHead>
                      <TableHead>Última Requisição</TableHead>
                      <TableHead className="w-12"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredWebhooks.map((webhook) => (
                      <TableRow 
                        key={webhook.id}
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => setSelectedWebhookId(webhook.id)}
                      >
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <div className="p-2 rounded-lg bg-primary/10">
                              <Webhook className="h-4 w-4 text-primary" />
                            </div>
                            <div>
                              <p className="font-medium">{webhook.name}</p>
                              {webhook.description && (
                                <p className="text-xs text-muted-foreground line-clamp-1">
                                  {webhook.description}
                                </p>
                              )}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <div className="flex gap-2">
                            {webhook.is_active ? (
                              <Badge className="bg-green-500/10 text-green-600 border-green-500/20">
                                Ativo
                              </Badge>
                            ) : (
                              <Badge variant="secondary">Inativo</Badge>
                            )}
                            {webhook.is_test_mode && (
                              <Badge variant="outline" className="text-orange-600 border-orange-500/30">
                                Teste
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-center font-medium">
                          {webhook.requests_this_month || 0}
                        </TableCell>
                        <TableCell className="text-center text-muted-foreground">
                          {webhook.requests_count || 0}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {webhook.last_request_at ? (
                            format(new Date(webhook.last_request_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })
                          ) : (
                            '—'
                          )}
                        </TableCell>
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon">
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => setSelectedWebhookId(webhook.id)}>
                                <Edit className="h-4 w-4 mr-2" />
                                Editar
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => copyUrl(webhook.id)}>
                                <Copy className="h-4 w-4 mr-2" />
                                Copiar URL
                              </DropdownMenuItem>
                              <DropdownMenuItem 
                                onClick={() => window.open(getWebhookUrl(webhook.id), '_blank')}
                              >
                                <ExternalLink className="h-4 w-4 mr-2" />
                                Testar URL
                              </DropdownMenuItem>
                              <DropdownMenuItem 
                                onClick={() => setDeleteConfirmId(webhook.id)}
                                className="text-destructive"
                              >
                                <Trash2 className="h-4 w-4 mr-2" />
                                Excluir
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="health" className="mt-0">
          <WebhookHealthDashboard />
        </TabsContent>
      </Tabs>


      {/* Create Dialog */}
      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Criar Novo Webhook</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">Nome *</Label>
              <Input
                id="name"
                placeholder="Ex: Vendas Hotmart"
                value={newWebhook.name}
                onChange={(e) => setNewWebhook(prev => ({ ...prev, name: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Descrição</Label>
              <Textarea
                id="description"
                placeholder="Descreva o propósito deste webhook..."
                value={newWebhook.description}
                onChange={(e) => setNewWebhook(prev => ({ ...prev, description: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="product">Produto (opcional)</Label>
              <Select
                value={newWebhook.product_id}
                onValueChange={(value) => 
                  setNewWebhook(prev => ({ 
                    ...prev, 
                    product_id: value === 'none' ? '' : value 
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione um produto..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Nenhum produto</SelectItem>
                  {products?.map(product => (
                    <SelectItem key={product.id} value={product.id}>
                      {product.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Leads criados por este webhook serão vinculados automaticamente ao produto selecionado
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
              Cancelar
            </Button>
            <Button 
              onClick={handleCreate}
              disabled={createWebhook.isPending}
            >
              {createWebhook.isPending ? 'Criando...' : 'Criar Webhook'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteConfirmId} onOpenChange={() => setDeleteConfirmId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Webhook?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. Todos os logs e configurações serão perdidos.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
