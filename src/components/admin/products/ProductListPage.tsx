import { useState } from 'react';
import { useProducts, useCreateProduct, useUpdateProduct, useDeleteProduct } from '@/hooks/useProducts';
import { useLeads } from '@/hooks/useLeads';
import { useDeals } from '@/hooks/useDeals';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuTrigger,
  DropdownMenuSeparator
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2, Package, Plus, Search, Users, TrendingUp, DollarSign, MoreHorizontal, Pencil, Copy, Trash2 } from 'lucide-react';
import { ProductOnboarding } from '@/components/product/ProductOnboarding';
import { Tables } from '@/integrations/supabase/types';
import { toast } from 'sonner';

type Product = Tables<'products'>;

interface ProductListPageProps {
  onProductSelect: (productId: string) => void;
}

const statusOptions = [
  { value: 'draft', label: 'Rascunho', color: 'bg-muted text-muted-foreground' },
  { value: 'review', label: 'Em Revisão', color: 'bg-warning/10 text-warning' },
  { value: 'published', label: 'Publicado', color: 'bg-success/10 text-success' },
];

export function ProductListPage({ onProductSelect }: ProductListPageProps) {
  const { data: products, isLoading } = useProducts();
  const { data: leads } = useLeads();
  const { data: deals } = useDeals();
  const { profile } = useAuth();
  const createProduct = useCreateProduct();
  const updateProduct = useUpdateProduct();
  const deleteProduct = useDeleteProduct();
  
  const [searchTerm, setSearchTerm] = useState('');
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [editForm, setEditForm] = useState({ name: '', description: '', status: 'draft' });

  const handleEdit = (product: Product) => {
    setSelectedProduct(product);
    setEditForm({ 
      name: product.name, 
      description: product.description || '',
      status: product.status || 'draft'
    });
    setEditDialogOpen(true);
  };

  const handleSaveEdit = async () => {
    if (!selectedProduct) return;
    try {
      await updateProduct.mutateAsync({ 
        id: selectedProduct.id, 
        name: editForm.name,
        description: editForm.description,
        status: editForm.status as 'draft' | 'review' | 'published'
      });
      toast.success('Produto atualizado!');
      setEditDialogOpen(false);
    } catch (error) {
      toast.error('Erro ao atualizar produto');
    }
  };

  const handleClone = async (product: Product) => {
    try {
      await createProduct.mutateAsync({
        name: `${product.name} (Cópia)`,
        description: product.description,
        short_description: product.short_description,
        pitch_15s: product.pitch_15s,
        pitch_30s: product.pitch_30s,
        pitch_2min: product.pitch_2min,
        icp: product.icp,
        differentials: product.differentials,
        status: 'draft',
        organization_id: profile?.organization_id || '',
      });
      toast.success('Produto clonado!');
    } catch (error) {
      toast.error('Erro ao clonar produto');
    }
  };

  const handleDelete = async () => {
    if (!selectedProduct) return;
    try {
      await deleteProduct.mutateAsync(selectedProduct.id);
      toast.success('Produto excluído!');
      setDeleteDialogOpen(false);
    } catch (error) {
      toast.error('Erro ao excluir produto');
    }
  };

  const getProductStats = (productId: string) => {
    const productLeads = leads?.filter(l => l.product_id === productId) || [];
    const productDeals = deals?.filter(d => d.product_id === productId && d.status === 'won') || [];
    const totalValue = productDeals.reduce((sum, d) => sum + (d.deal_value || 0), 0);
    
    return {
      activeLeads: productLeads.filter(l => !l.current_stage_id || !productLeads.find(pl => pl.id === l.id)).length,
      totalLeads: productLeads.length,
      mrr: totalValue,
      sellers: new Set(productLeads.map(l => l.assigned_to).filter(Boolean)).size,
    };
  };

  const filteredProducts = products?.filter(p => 
    p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.description?.toLowerCase().includes(searchTerm.toLowerCase())
  ) || [];

  const handleOnboardingComplete = (productId: string) => {
    setShowOnboarding(false);
    onProductSelect(productId);
  };

  if (showOnboarding) {
    return (
      <ProductOnboarding
        onComplete={handleOnboardingComplete}
        onCancel={() => setShowOnboarding(false)}
      />
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Produtos</h1>
          <p className="text-muted-foreground">
            Gerencie seus produtos e acesse todas as configurações
          </p>
        </div>
        <Button onClick={() => setShowOnboarding(true)} size="lg">
          <Plus className="mr-2 h-4 w-4" />
          Novo Produto
        </Button>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Buscar produto..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Products Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {filteredProducts.map((product) => {
          const stats = getProductStats(product.id);
          const status = statusOptions.find(s => s.value === product.status) || statusOptions[0];

          return (
            <Card 
              key={product.id} 
              className="bg-card hover:border-primary/50 transition-all cursor-pointer group relative"
              onClick={() => onProductSelect(product.id)}
            >
              <CardContent className="p-5">
                {/* Menu de ações */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="absolute top-3 right-3 h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity z-10"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="bg-popover">
                    <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleEdit(product); }}>
                      <Pencil className="mr-2 h-4 w-4" /> Editar
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleClone(product); }}>
                      <Copy className="mr-2 h-4 w-4" /> Clonar
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem 
                      className="text-destructive focus:text-destructive" 
                      onClick={(e) => { 
                        e.stopPropagation(); 
                        setSelectedProduct(product); 
                        setDeleteDialogOpen(true); 
                      }}
                    >
                      <Trash2 className="mr-2 h-4 w-4" /> Excluir
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>

                <div className="flex items-start gap-4">
                  {/* Product Icon */}
                  <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0 group-hover:bg-primary/20 transition-colors">
                    {product.logo_url ? (
                      <img 
                        src={product.logo_url} 
                        alt={product.name} 
                        className="h-8 w-8 rounded-lg object-cover"
                      />
                    ) : (
                      <Package className="h-6 w-6 text-primary" />
                    )}
                  </div>

                  {/* Product Info */}
                  <div className="flex-1 min-w-0 pr-8">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-semibold text-foreground truncate group-hover:text-primary transition-colors">
                        {product.name}
                      </h3>
                      <Badge variant="outline" className={status.color}>
                        {status.label}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground line-clamp-2">
                      {product.short_description || product.description || 'Sem descrição'}
                    </p>
                  </div>
                </div>

                {/* Stats */}
                <div className="grid grid-cols-3 gap-4 mt-4 pt-4 border-t border-border">
                  <div className="text-center">
                    <div className="flex items-center justify-center gap-1 text-muted-foreground mb-1">
                      <TrendingUp className="h-3.5 w-3.5" />
                    </div>
                    <p className="text-lg font-semibold text-foreground">{stats.totalLeads}</p>
                    <p className="text-xs text-muted-foreground">Leads</p>
                  </div>
                  <div className="text-center">
                    <div className="flex items-center justify-center gap-1 text-muted-foreground mb-1">
                      <Users className="h-3.5 w-3.5" />
                    </div>
                    <p className="text-lg font-semibold text-foreground">{stats.sellers}</p>
                    <p className="text-xs text-muted-foreground">Vendedores</p>
                  </div>
                  <div className="text-center">
                    <div className="flex items-center justify-center gap-1 text-muted-foreground mb-1">
                      <DollarSign className="h-3.5 w-3.5" />
                    </div>
                    <p className="text-lg font-semibold text-foreground">
                      {new Intl.NumberFormat('pt-BR', { 
                        notation: 'compact',
                        compactDisplay: 'short'
                      }).format(stats.mrr)}
                    </p>
                    <p className="text-xs text-muted-foreground">Vendas</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}

        {/* Empty State */}
        {filteredProducts.length === 0 && (
          <Card className="col-span-full bg-card">
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Package className="h-12 w-12 text-muted-foreground/50 mb-4" />
              <h3 className="text-lg font-medium text-foreground mb-1">
                {searchTerm ? 'Nenhum produto encontrado' : 'Nenhum produto'}
              </h3>
              <p className="text-sm text-muted-foreground mb-4">
                {searchTerm 
                  ? 'Tente buscar com outros termos' 
                  : 'Crie seu primeiro produto para começar'}
              </p>
              {!searchTerm && (
                <Button onClick={() => setShowOnboarding(true)}>
                  <Plus className="mr-2 h-4 w-4" />
                  Criar Produto
                </Button>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      {/* Dialog de Edição */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Produto</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Nome</Label>
              <Input 
                value={editForm.name} 
                onChange={(e) => setEditForm({...editForm, name: e.target.value})} 
              />
            </div>
            <div className="space-y-2">
              <Label>Descrição</Label>
              <Textarea 
                value={editForm.description} 
                onChange={(e) => setEditForm({...editForm, description: e.target.value})}
                rows={3}
              />
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <Select 
                value={editForm.status} 
                onValueChange={(v) => setEditForm({...editForm, status: v})}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">Rascunho</SelectItem>
                  <SelectItem value="review">Em Revisão</SelectItem>
                  <SelectItem value="published">Publicado</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSaveEdit} disabled={updateProduct.isPending}>
              {updateProduct.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog de Confirmação de Exclusão */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Produto</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir "{selectedProduct?.name}"? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleDelete} 
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteProduct.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
