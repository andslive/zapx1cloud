import { useState } from 'react';
import { Tables } from '@/integrations/supabase/types';
import { useProducts, useUpdateProduct, useDeleteProduct } from '@/hooks/useProducts';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Plus, Pencil, Trash2, Package, Loader2, Brain, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { ProductOnboarding } from '@/components/product/ProductOnboarding';
import { AIOptimizeButton } from '@/components/product/AIOptimizeButton';
import { useOptimizeField } from '@/hooks/useOptimizeField';

type DBProduct = Tables<'products'>;

interface ProductManagerProps {
  onNavigateToBrain?: (productId: string) => void;
}

const statusOptions = [
  { value: 'draft', label: 'Rascunho', color: 'bg-muted text-muted-foreground' },
  { value: 'review', label: 'Em Revisão', color: 'bg-amber-500/10 text-amber-600' },
  { value: 'published', label: 'Publicado', color: 'bg-emerald-500/10 text-emerald-600' },
];

export function ProductManager({ onNavigateToBrain }: ProductManagerProps) {
  const { profile } = useAuth();
  const { data: products, isLoading } = useProducts();
  const updateProduct = useUpdateProduct();
  const deleteProduct = useDeleteProduct();
  const { isOptimizing, optimize } = useOptimizeField();
  
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<DBProduct | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    pitch_15s: '',
    pitch_30s: '',
    pitch_2min: '',
    icp: '',
    differentials: '',
    status: 'draft' as 'draft' | 'review' | 'published',
  });

  const resetForm = () => {
    setFormData({
      name: '',
      description: '',
      pitch_15s: '',
      pitch_30s: '',
      pitch_2min: '',
      icp: '',
      differentials: '',
      status: 'draft',
    });
    setEditingProduct(null);
  };

  const openCreateDialog = () => {
    setShowOnboarding(true);
  };

  const handleOnboardingComplete = (productId: string) => {
    setShowOnboarding(false);
    if (onNavigateToBrain) {
      onNavigateToBrain(productId);
    }
  };

  const openEditDialog = (product: DBProduct) => {
    setEditingProduct(product);
    setFormData({
      name: product.name,
      description: product.description || '',
      pitch_15s: product.pitch_15s || '',
      pitch_30s: product.pitch_30s || '',
      pitch_2min: product.pitch_2min || '',
      icp: product.icp || '',
      differentials: (product.differentials || []).join('\n'),
      status: (product.status as 'draft' | 'review' | 'published') || 'draft',
    });
    setIsDialogOpen(true);
  };

  const handleOptimizeField = async (field: string) => {
    const value = formData[field as keyof typeof formData];
    if (typeof value !== 'string' || !value.trim()) return;
    
    const result = await optimize(field, value, formData);
    if (result?.optimized) {
      setFormData(prev => ({ ...prev, [field]: result.optimized }));
      toast.success('Campo otimizado com IA!');
    }
  };

  const handleSubmit = async () => {
    if (!formData.name.trim()) {
      toast.error('Nome do produto é obrigatório');
      return;
    }

    if (!editingProduct) return;

    const productData = {
      name: formData.name,
      description: formData.description || null,
      pitch_15s: formData.pitch_15s || null,
      pitch_30s: formData.pitch_30s || null,
      pitch_2min: formData.pitch_2min || null,
      icp: formData.icp || null,
      differentials: formData.differentials.split('\n').filter(d => d.trim()),
      status: formData.status,
      organization_id: profile?.organization_id || '',
    };

    try {
      await updateProduct.mutateAsync({ id: editingProduct.id, ...productData });
      toast.success('Produto atualizado!');
      setIsDialogOpen(false);
      resetForm();
    } catch (error) {
      toast.error('Erro ao salvar produto');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteProduct.mutateAsync(id);
      toast.success('Produto excluído!');
    } catch (error) {
      toast.error('Erro ao excluir produto');
    }
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
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-foreground">Produtos</h2>
          <p className="text-sm text-muted-foreground">Gerencie os produtos da sua organização</p>
        </div>
        <Button onClick={openCreateDialog}>
          <Plus className="mr-2 h-4 w-4" />
          Novo Produto
        </Button>
      </div>

      {/* Edit Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar Produto</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="name">Nome *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Ex: PoupeJá"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="status">Status</Label>
                <Select
                  value={formData.status}
                  onValueChange={(value: 'draft' | 'review' | 'published') => 
                    setFormData({ ...formData, status: value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {statusOptions.map(opt => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="description">Descrição</Label>
                <AIOptimizeButton
                  onOptimize={() => handleOptimizeField('description')}
                  isOptimizing={isOptimizing}
                  disabled={!formData.description.trim()}
                />
              </div>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Descreva o produto brevemente..."
                rows={2}
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="pitch_15s">Pitch 15 segundos</Label>
                <AIOptimizeButton
                  onOptimize={() => handleOptimizeField('pitch_15s')}
                  isOptimizing={isOptimizing}
                  disabled={!formData.pitch_15s.trim()}
                />
              </div>
              <Textarea
                id="pitch_15s"
                value={formData.pitch_15s}
                onChange={(e) => setFormData({ ...formData, pitch_15s: e.target.value })}
                placeholder="Elevator pitch curto..."
                rows={2}
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="pitch_30s">Pitch 30 segundos</Label>
                <AIOptimizeButton
                  onOptimize={() => handleOptimizeField('pitch_30s')}
                  isOptimizing={isOptimizing}
                  disabled={!formData.pitch_30s.trim()}
                />
              </div>
              <Textarea
                id="pitch_30s"
                value={formData.pitch_30s}
                onChange={(e) => setFormData({ ...formData, pitch_30s: e.target.value })}
                placeholder="Pitch mais elaborado..."
                rows={3}
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="pitch_2min">Pitch 2 minutos</Label>
                <AIOptimizeButton
                  onOptimize={() => handleOptimizeField('pitch_2min')}
                  isOptimizing={isOptimizing}
                  disabled={!formData.pitch_2min.trim()}
                />
              </div>
              <Textarea
                id="pitch_2min"
                value={formData.pitch_2min}
                onChange={(e) => setFormData({ ...formData, pitch_2min: e.target.value })}
                placeholder="Apresentação completa..."
                rows={4}
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="icp">ICP (Perfil de Cliente Ideal)</Label>
                <AIOptimizeButton
                  onOptimize={() => handleOptimizeField('icp')}
                  isOptimizing={isOptimizing}
                  disabled={!formData.icp.trim()}
                />
              </div>
              <Textarea
                id="icp"
                value={formData.icp}
                onChange={(e) => setFormData({ ...formData, icp: e.target.value })}
                placeholder="Descreva o cliente ideal..."
                rows={3}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="differentials">Diferenciais (um por linha)</Label>
              <Textarea
                id="differentials"
                value={formData.differentials}
                onChange={(e) => setFormData({ ...formData, differentials: e.target.value })}
                placeholder="Diferencial 1&#10;Diferencial 2&#10;Diferencial 3"
                rows={4}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
              Cancelar
            </Button>
            <Button 
              onClick={handleSubmit}
              disabled={updateProduct.isPending}
            >
              {updateProduct.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Products Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {products?.map((product) => {
          const status = statusOptions.find(s => s.value === product.status) || statusOptions[0];
          
          return (
            <Card key={product.id} className="bg-card">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                      <Package className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <CardTitle className="text-base">{product.name}</CardTitle>
                      <Badge variant="outline" className={status.color}>
                        {status.label}
                      </Badge>
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {product.description && (
                  <p className="text-sm text-muted-foreground line-clamp-2">
                    {product.description}
                  </p>
                )}
                
                <div className="flex items-center gap-2 pt-2 flex-wrap">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => openEditDialog(product)}
                  >
                    <Pencil className="mr-1 h-3 w-3" />
                    Editar
                  </Button>
                  {onNavigateToBrain && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onNavigateToBrain(product.id)}
                    >
                      <Brain className="mr-1 h-3 w-3" />
                      Cérebro
                    </Button>
                  )}
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="outline" size="sm" className="text-destructive">
                        <Trash2 className="mr-1 h-3 w-3" />
                        Excluir
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Excluir produto?</AlertDialogTitle>
                        <AlertDialogDescription>
                          Esta ação não pode ser desfeita. Isso excluirá permanentemente 
                          o produto "{product.name}" e todos os dados associados.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => handleDelete(product.id)}
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                          Excluir
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </CardContent>
            </Card>
          );
        })}

        {(!products || products.length === 0) && (
          <Card className="col-span-full bg-card">
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Package className="h-12 w-12 text-muted-foreground/50 mb-4" />
              <h3 className="text-lg font-medium text-foreground mb-1">Nenhum produto</h3>
              <p className="text-sm text-muted-foreground mb-4">Crie seu primeiro produto para começar</p>
              <Button onClick={openCreateDialog}>
                <Sparkles className="mr-2 h-4 w-4" />
                Criar Produto
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
