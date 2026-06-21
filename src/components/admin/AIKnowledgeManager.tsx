import { useState } from 'react';
import { useProducts } from '@/hooks/useProducts';
import { useAIKnowledgeBase, useCreateAIKnowledge, useUpdateAIKnowledge, useDeleteAIKnowledge } from '@/hooks/useAIKnowledge';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Plus, Pencil, Trash2, Brain, BookOpen, MessageSquare, HelpCircle, Lightbulb, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Tables } from '@/integrations/supabase/types';

type AIKnowledge = Tables<'ai_knowledge_base'>;

const categoryConfig: Record<string, { label: string; icon: typeof Brain; color: string }> = {
  general: { label: 'Geral', icon: BookOpen, color: 'bg-blue-500/10 text-blue-600' },
  faq: { label: 'FAQ', icon: HelpCircle, color: 'bg-violet-500/10 text-violet-600' },
  objection: { label: 'Objeção', icon: MessageSquare, color: 'bg-amber-500/10 text-amber-600' },
  script: { label: 'Script', icon: Lightbulb, color: 'bg-emerald-500/10 text-emerald-600' },
  product: { label: 'Produto', icon: Brain, color: 'bg-red-500/10 text-red-600' },
};

export function AIKnowledgeManager() {
  const { profile } = useAuth();
  const { data: products } = useProducts();
  const { data: knowledge, isLoading } = useAIKnowledgeBase();
  
  const createKnowledge = useCreateAIKnowledge();
  const updateKnowledge = useUpdateAIKnowledge();
  const deleteKnowledge = useDeleteAIKnowledge();

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<AIKnowledge | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<string>('all');
  
  const [formData, setFormData] = useState({
    title: '',
    content: '',
    category: 'general',
    tags: '',
    product_id: '',
  });

  const resetForm = () => {
    setFormData({
      title: '',
      content: '',
      category: 'general',
      tags: '',
      product_id: '',
    });
    setEditingItem(null);
  };

  const openCreateDialog = () => {
    resetForm();
    setIsDialogOpen(true);
  };

  const openEditDialog = (item: AIKnowledge) => {
    setEditingItem(item);
    setFormData({
      title: item.title,
      content: item.content,
      category: item.category,
      tags: (item.tags || []).join(', '),
      product_id: item.product_id,
    });
    setIsDialogOpen(true);
  };

  const handleSubmit = async () => {
    if (!formData.title.trim() || !formData.content.trim() || !formData.product_id) {
      toast.error('Título, conteúdo e produto são obrigatórios');
      return;
    }

    const data = {
      title: formData.title,
      content: formData.content,
      category: formData.category,
      tags: formData.tags.split(',').map(t => t.trim()).filter(Boolean),
      product_id: formData.product_id,
      organization_id: profile?.organization_id || '',
      is_active: true,
    };

    try {
      if (editingItem) {
        await updateKnowledge.mutateAsync({ id: editingItem.id, ...data });
        toast.success('Conhecimento atualizado!');
      } else {
        await createKnowledge.mutateAsync(data);
        toast.success('Conhecimento criado!');
      }
      setIsDialogOpen(false);
      resetForm();
    } catch (error) {
      toast.error('Erro ao salvar');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteKnowledge.mutateAsync(id);
      toast.success('Conhecimento excluído!');
    } catch (error) {
      toast.error('Erro ao excluir');
    }
  };

  const filteredKnowledge = knowledge?.filter(k => 
    selectedProduct === 'all' || k.product_id === selectedProduct
  ) || [];

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
          <h2 className="text-xl font-semibold text-foreground">Base de Conhecimento da IA</h2>
          <p className="text-sm text-muted-foreground">
            Treine a IA com informações específicas de cada produto
          </p>
        </div>
        <Button onClick={openCreateDialog}>
          <Plus className="mr-2 h-4 w-4" />
          Novo Conhecimento
        </Button>
      </div>

      <Tabs value={selectedProduct} onValueChange={setSelectedProduct}>
        <TabsList>
          <TabsTrigger value="all">Todos</TabsTrigger>
          {products?.map(p => (
            <TabsTrigger key={p.id} value={p.id}>{p.name}</TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <div className="grid gap-4 md:grid-cols-2">
        {filteredKnowledge.map((item) => {
          const config = categoryConfig[item.category] || categoryConfig.general;
          const Icon = config.icon;
          const product = products?.find(p => p.id === item.product_id);
          
          return (
            <Card key={item.id} className="bg-card">
              <CardContent className="p-5">
                <div className="flex items-start gap-3 mb-3">
                  <div className={`h-10 w-10 rounded-lg ${config.color} flex items-center justify-center shrink-0`}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-medium text-foreground">{item.title}</h3>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge variant="outline" className="text-xs">
                        {config.label}
                      </Badge>
                      {product && (
                        <Badge variant="secondary" className="text-xs">
                          {product.name}
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>

                <p className="text-sm text-muted-foreground mb-3 line-clamp-3">
                  {item.content}
                </p>

                <div className="flex flex-wrap gap-1 mb-3">
                  {item.tags?.slice(0, 3).map(tag => (
                    <Badge key={tag} variant="outline" className="text-xs bg-muted/50">
                      {tag}
                    </Badge>
                  ))}
                  {(item.tags?.length || 0) > 3 && (
                    <Badge variant="outline" className="text-xs">
                      +{(item.tags?.length || 0) - 3}
                    </Badge>
                  )}
                </div>

                <div className="flex items-center gap-2 pt-3 border-t border-border">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    onClick={() => openEditDialog(item)}
                  >
                    <Pencil className="mr-1 h-3 w-3" />
                    Editar
                  </Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Excluir conhecimento?</AlertDialogTitle>
                        <AlertDialogDescription>
                          Esta ação não pode ser desfeita.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => handleDelete(item.id)}
                          className="bg-destructive text-destructive-foreground"
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

        {filteredKnowledge.length === 0 && (
          <Card className="col-span-full bg-card">
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Brain className="h-12 w-12 text-muted-foreground/50 mb-4" />
              <h3 className="text-lg font-medium text-foreground mb-1">Nenhum conhecimento</h3>
              <p className="text-sm text-muted-foreground mb-4 text-center">
                Adicione FAQs, scripts e informações para treinar a IA
              </p>
              <Button onClick={openCreateDialog}>
                <Plus className="mr-2 h-4 w-4" />
                Adicionar Conhecimento
              </Button>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Dialog de Criar/Editar */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {editingItem ? 'Editar Conhecimento' : 'Novo Conhecimento'}
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="title">Título *</Label>
              <Input
                id="title"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                placeholder="Ex: Como responder sobre prazo de implementação"
              />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Produto *</Label>
                <Select
                  value={formData.product_id}
                  onValueChange={(v) => setFormData({ ...formData, product_id: v })}
                >
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

              <div className="space-y-2">
                <Label>Categoria</Label>
                <Select
                  value={formData.category}
                  onValueChange={(v) => setFormData({ ...formData, category: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(categoryConfig).map(([key, config]) => (
                      <SelectItem key={key} value={key}>
                        <div className="flex items-center gap-2">
                          <config.icon className="h-4 w-4" />
                          {config.label}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="content">Conteúdo *</Label>
              <Textarea
                id="content"
                value={formData.content}
                onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                placeholder="Escreva o conhecimento detalhado que a IA deve usar..."
                rows={6}
              />
              <p className="text-xs text-muted-foreground">
                Seja específico. Inclua exemplos, números e casos de uso reais.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="tags">Tags (separadas por vírgula)</Label>
              <Input
                id="tags"
                value={formData.tags}
                onChange={(e) => setFormData({ ...formData, tags: e.target.value })}
                placeholder="implementação, prazo, onboarding"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSubmit} disabled={createKnowledge.isPending || updateKnowledge.isPending}>
              {(createKnowledge.isPending || updateKnowledge.isPending) && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              {editingItem ? 'Salvar' : 'Criar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
