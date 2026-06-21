import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
import { 
  Plus, 
  Search, 
  MoreVertical, 
  Edit, 
  Copy, 
  Archive,
  Trash2,
  Zap,
  MessageSquare,
  FileText,
  Globe,
  Eye,
  Users,
  Loader2,
  TrendingUp,
  Clock,
  Wand2
} from 'lucide-react';
import { toast } from 'sonner';
import { useFunnels, useCreateFunnel, useDeleteFunnel, useDuplicateFunnel, useUpdateFunnelStatus, useSaveFlowBlocks } from '@/hooks/useFunnels';
import { useProducts } from '@/hooks/useProducts';
import { Funnel, FunnelStatus, FunnelBlock } from '@/types/funnel';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { FunnelBuilder } from './FunnelBuilder';
import { FunnelAIGenerator } from './FunnelAIGenerator';

// Status badge config
const statusConfig: Record<FunnelStatus, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  draft: { label: 'Rascunho', variant: 'secondary' },
  active: { label: 'Ativo', variant: 'default' },
  paused: { label: 'Pausado', variant: 'outline' },
  archived: { label: 'Arquivado', variant: 'destructive' },
};

export function CaptureManager() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [productFilter, setProductFilter] = useState<string>('all');
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [selectedFunnelId, setSelectedFunnelId] = useState<string | null>(null);
  const [isAIGeneratorOpen, setIsAIGeneratorOpen] = useState(false);

  // Form state for new funnel
  const [newFunnelName, setNewFunnelName] = useState('');
  const [newFunnelDescription, setNewFunnelDescription] = useState('');
  const [newFunnelProductId, setNewFunnelProductId] = useState('');

  const { data: funnels, isLoading } = useFunnels();
  const { data: products } = useProducts();
  const createFunnel = useCreateFunnel();
  const deleteFunnel = useDeleteFunnel();
  const duplicateFunnel = useDuplicateFunnel();
  const updateStatus = useUpdateFunnelStatus();
  const saveFlowBlocks = useSaveFlowBlocks();

  // Sincroniza tab da URL -> fecha editor se houver navegação explícita pelo menu
  useEffect(() => {
    const tab = searchParams.get('tab');
    const timestamp = searchParams.get('t');
    if (tab === 'capture' && timestamp) {
      setSelectedFunnelId(null);
    }
  }, [searchParams]);

  // Handle action=new in URL
  useEffect(() => {
    if (searchParams.get('action') === 'new' && !isCreateDialogOpen && !selectedFunnelId) {
      setIsCreateDialogOpen(true);
      // Remove the action from URL to avoid re-opening if user navigates back
      const next = new URLSearchParams(searchParams);
      next.delete('action');
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, isCreateDialogOpen, selectedFunnelId, setSearchParams]);

  // Auto-select product if only one exists
  useEffect(() => {
    if (products?.length === 1 && !newFunnelProductId) {
      setNewFunnelProductId(products[0].id);
    }
  }, [products, newFunnelProductId]);

  // Filter funnels
  const filteredFunnels = funnels?.filter(funnel => {
    const matchesSearch = funnel.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === 'all' || funnel.status === statusFilter;
    const matchesProduct = productFilter === 'all' || funnel.product_id === productFilter;
    return matchesSearch && matchesStatus && matchesProduct;
  }) || [];

  const handleCreateFunnel = async () => {
    if (!newFunnelName.trim() || !newFunnelProductId) {
      if (!newFunnelProductId) {
        toast.error('Selecione um produto para continuar');
      } else if (!newFunnelName.trim()) {
        toast.error('Informe o nome do funil');
      }
      return;
    }

    try {
      const result = await createFunnel.mutateAsync({
        name: newFunnelName.trim(),
        description: newFunnelDescription.trim() || undefined,
        product_id: newFunnelProductId,
      });

      setIsCreateDialogOpen(false);
      setNewFunnelName('');
      setNewFunnelDescription('');
      setNewFunnelProductId('');
      
      // Open builder for new funnel
      setSelectedFunnelId(result.id);
    } catch (error) {
      console.error('Error creating funnel:', error);
    }
  };

  const handleAIGenerated = async (blocks: FunnelBlock[], startBlockId: string, suggestedName: string) => {
    if (!newFunnelProductId) return;

    try {
      // 1. Create the funnel
      const funnel = await createFunnel.mutateAsync({
        name: suggestedName,
        product_id: newFunnelProductId,
      });

      // 2. Save the generated blocks
      await saveFlowBlocks.mutateAsync({
        id: funnel.id,
        flow_blocks: blocks,
        start_block_id: startBlockId,
      });

      // 3. Open the builder
      setSelectedFunnelId(funnel.id);
      setIsAIGeneratorOpen(false);
    } catch (error) {
      console.error('Error saving AI generated funnel:', error);
    }
  };

  const handleDeleteFunnel = async () => {
    if (!deleteConfirmId) return;
    await deleteFunnel.mutateAsync(deleteConfirmId);
    setDeleteConfirmId(null);
  };

  const handleDuplicateFunnel = async (funnelId: string) => {
    await duplicateFunnel.mutateAsync(funnelId);
  };

  const handleArchiveFunnel = async (funnelId: string) => {
    await updateStatus.mutateAsync({ id: funnelId, status: 'archived' });
  };

  const getChannelIcons = (funnel: Funnel) => {
    const icons = [];
    if (funnel.channels.chat?.enabled) {
      icons.push({ icon: MessageSquare, label: 'Chat', active: true });
    } else {
      icons.push({ icon: MessageSquare, label: 'Chat', active: false });
    }
    if (funnel.channels.form?.enabled) {
      icons.push({ icon: FileText, label: 'Form', active: true });
    } else {
      icons.push({ icon: FileText, label: 'Form', active: false });
    }
    if (funnel.channels.widget?.enabled) {
      icons.push({ icon: Globe, label: 'Widget', active: true });
    } else {
      icons.push({ icon: Globe, label: 'Widget', active: false });
    }
    return icons;
  };

  const formatViews = (views: number) => {
    if (views >= 1000) {
      return `${(views / 1000).toFixed(1)}k`;
    }
    return views.toString();
  };

  const getConversionRate = (funnel: Funnel) => {
    if (funnel.total_views === 0) return '--';
    const rate = (funnel.total_leads / funnel.total_views) * 100;
    return `${rate.toFixed(1)}%`;
  };

  // If a funnel is selected, show the builder
  if (selectedFunnelId) {
    return (
      <FunnelBuilder 
        funnelId={selectedFunnelId} 
        onBack={() => setSelectedFunnelId(null)} 
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Zap className="h-6 w-6 text-primary" />
            Funil
          </h1>
          <p className="text-muted-foreground mt-1">
            Centralize toda a captação de leads em funis inteligentes
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => {
            if (!products?.length) {
              toast.error('Crie um produto antes de gerar com IA');
              return;
            }
            if (!newFunnelProductId) {
              // Try to select the first product if none selected
              setNewFunnelProductId(products[0].id);
            }
            setIsAIGeneratorOpen(true);
          }} className="gap-2">
            <Wand2 className="h-4 w-4" />
            Criar com IA
          </Button>
          <Button onClick={() => setIsCreateDialogOpen(true)} className="gap-2">
            <Plus className="h-4 w-4" />
            Novo Funil
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar funis..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={productFilter} onValueChange={setProductFilter}>
          <SelectTrigger className="w-full sm:w-[200px]">
            <SelectValue placeholder="Produto" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os produtos</SelectItem>
            {products?.map(product => (
              <SelectItem key={product.id} value={product.id}>
                {product.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full sm:w-[160px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os status</SelectItem>
            <SelectItem value="draft">Rascunho</SelectItem>
            <SelectItem value="active">Ativo</SelectItem>
            <SelectItem value="paused">Pausado</SelectItem>
            <SelectItem value="archived">Arquivado</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Funnels List */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : filteredFunnels.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
              <Zap className="h-8 w-8 text-primary" />
            </div>
            <h3 className="text-lg font-semibold mb-2">Nenhum funil encontrado</h3>
            <p className="text-muted-foreground text-center mb-4 max-w-md">
              {searchQuery || statusFilter !== 'all' || productFilter !== 'all'
                ? 'Nenhum funil corresponde aos filtros selecionados.'
                : 'Crie seu primeiro funil de captação para começar a converter visitantes em leads.'}
            </p>
            {!searchQuery && statusFilter === 'all' && productFilter === 'all' && (
              <Button onClick={() => setIsCreateDialogOpen(true)} className="gap-2">
                <Plus className="h-4 w-4" />
                Criar Primeiro Funil
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {filteredFunnels.map(funnel => (
            <Card 
              key={funnel.id} 
              className="hover:border-primary/50 transition-colors cursor-pointer"
              onClick={() => setSelectedFunnelId(funnel.id)}
            >
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-4">
                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-1">
                      <h3 className="font-semibold text-foreground truncate">
                        {funnel.name}
                      </h3>
                      <Badge variant={statusConfig[funnel.status].variant}>
                        {statusConfig[funnel.status].label}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground mb-3">
                      {funnel.products?.name || 'Produto não definido'}
                    </p>

                    {/* Channels */}
                    <div className="flex items-center gap-4 mb-3">
                      <span className="text-xs text-muted-foreground">Canais:</span>
                      <div className="flex items-center gap-2">
                        {getChannelIcons(funnel).map(({ icon: Icon, label, active }) => (
                          <div 
                            key={label}
                            className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs ${
                              active 
                                ? 'bg-primary/10 text-primary' 
                                : 'bg-muted text-muted-foreground'
                            }`}
                          >
                            <Icon className="h-3 w-3" />
                            <span className="hidden sm:inline">{label}</span>
                            {active && <span className="text-[10px]">✓</span>}
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Metrics */}
                    <div className="flex items-center gap-6 text-sm">
                      <div className="flex items-center gap-1.5 text-muted-foreground">
                        <Eye className="h-4 w-4" />
                        <span>{formatViews(funnel.total_views)} views</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-muted-foreground">
                        <Users className="h-4 w-4" />
                        <span>{funnel.total_leads} leads</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-muted-foreground">
                        <TrendingUp className="h-4 w-4" />
                        <span>{getConversionRate(funnel)}</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-muted-foreground">
                        <Clock className="h-4 w-4" />
                        <span>
                          {formatDistanceToNow(new Date(funnel.updated_at), { 
                            addSuffix: true, 
                            locale: ptBR 
                          })}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={(e) => {
                        e.stopPropagation();
                        setSelectedFunnelId(funnel.id);
                      }}>
                        <Edit className="h-4 w-4 mr-2" />
                        Editar
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={(e) => {
                        e.stopPropagation();
                        handleDuplicateFunnel(funnel.id);
                      }}>
                        <Copy className="h-4 w-4 mr-2" />
                        Duplicar
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      {funnel.status !== 'archived' && (
                        <DropdownMenuItem onClick={(e) => {
                          e.stopPropagation();
                          handleArchiveFunnel(funnel.id);
                        }}>
                          <Archive className="h-4 w-4 mr-2" />
                          Arquivar
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem 
                        className="text-destructive"
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeleteConfirmId(funnel.id);
                        }}
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Excluir
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create Dialog */}
      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Novo Funil</DialogTitle>
            <DialogDescription>
              Crie um novo funil para capturar leads. Você poderá publicá-lo em múltiplos canais.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="product">Produto *</Label>
              <Select value={newFunnelProductId} onValueChange={setNewFunnelProductId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o produto" />
                </SelectTrigger>
                <SelectContent>
                  {products?.map(product => (
                    <SelectItem key={product.id} value={product.id}>
                      {product.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="name">Nome do Funil *</Label>
              <Input
                id="name"
                placeholder="Ex: Qualificação de Leads"
                value={newFunnelName}
                onChange={(e) => setNewFunnelName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Descrição (opcional)</Label>
              <Textarea
                id="description"
                placeholder="Descreva o objetivo deste funil..."
                value={newFunnelDescription}
                onChange={(e) => setNewFunnelDescription(e.target.value)}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
              Cancelar
            </Button>
            <Button 
              onClick={handleCreateFunnel}
              disabled={createFunnel.isPending}
            >
              {createFunnel.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Criando...
                </>
              ) : (
                'Criar Funil'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteConfirmId} onOpenChange={(open) => !open && setDeleteConfirmId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Funil</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir este funil? Esta ação não pode ser desfeita e todos os dados de analytics serão perdidos.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleDeleteFunnel}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* AI Generator */}
      {isAIGeneratorOpen && products && (
        <FunnelAIGenerator 
          open={isAIGeneratorOpen}
          onOpenChange={setIsAIGeneratorOpen}
          productId={newFunnelProductId || products[0]?.id}
          productName={products.find(p => p.id === (newFunnelProductId || products[0]?.id))?.name || ''}
          onGenerated={handleAIGenerated}
        />
      )}
    </div>
  );
}