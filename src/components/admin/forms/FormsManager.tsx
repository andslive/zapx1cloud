import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Plus, Search, MoreVertical, FileEdit, Eye, Copy, Trash2, 
  Play, Pause, Archive, ExternalLink, Code, BarChart3, 
  FileText, Sparkles, LayoutTemplate
} from 'lucide-react';
import { useForms, useCreateForm, useDeleteForm, useDuplicateForm, useToggleFormStatus, useFormTemplates } from '@/hooks/useForms';
import { useProducts } from '@/hooks/useProducts';
import { Form, FormStatus, FormTemplate, FormBlock } from '@/types/forms';
import { FormBuilder } from './FormBuilder';
import { FormAIGenerator } from './FormAIGenerator';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const statusConfig: Record<FormStatus, { label: string; variant: 'default' | 'secondary' | 'outline' | 'destructive' }> = {
  draft: { label: 'Rascunho', variant: 'secondary' },
  active: { label: 'Ativo', variant: 'default' },
  paused: { label: 'Pausado', variant: 'outline' },
  archived: { label: 'Arquivado', variant: 'destructive' },
};

export function FormsManager() {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedProductFilter, setSelectedProductFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<FormStatus | 'all'>('all');
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isAIGeneratorOpen, setIsAIGeneratorOpen] = useState(false);
  const [aiGeneratedBlocks, setAIGeneratedBlocks] = useState<FormBlock[] | null>(null);
  const [aiSuggestedName, setAISuggestedName] = useState('');
  const [selectedForm, setSelectedForm] = useState<Form | null>(null);
  const [isBuilderOpen, setIsBuilderOpen] = useState(false);
  
  // Create form state
  const [newFormName, setNewFormName] = useState('');
  const [newFormDescription, setNewFormDescription] = useState('');
  const [newFormProductId, setNewFormProductId] = useState('');
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [createMethod, setCreateMethod] = useState<'manual' | 'template' | 'ai'>('manual');
  
  const { data: forms, isLoading } = useForms();
  const { data: products } = useProducts();
  const { data: templates } = useFormTemplates();
  const createForm = useCreateForm();
  const deleteForm = useDeleteForm();
  const duplicateForm = useDuplicateForm();
  const toggleStatus = useToggleFormStatus();
  
  // Filter forms
  const filteredForms = forms?.filter(form => {
    const matchesSearch = form.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         form.description?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesProduct = selectedProductFilter === 'all' || form.product_id === selectedProductFilter;
    const matchesStatus = statusFilter === 'all' || form.status === statusFilter;
    return matchesSearch && matchesProduct && matchesStatus;
  }) || [];
  
  const handleCreateForm = async () => {
    if (!newFormName.trim() || !newFormProductId) return;
    
    const newForm = await createForm.mutateAsync({
      productId: newFormProductId,
      name: newFormName.trim(),
      description: newFormDescription.trim() || undefined,
      templateId: selectedTemplateId || undefined,
      aiBlocks: aiGeneratedBlocks?.map((block, index) => ({
        block_type: block.block_type,
        label: block.label,
        description: block.description || undefined,
        placeholder: block.placeholder || undefined,
        required: block.required,
        options: block.options,
        maps_to: block.maps_to || undefined,
        order_index: index,
      })) || undefined,
    });
    
    // If AI generated blocks, open the builder immediately
    if (aiGeneratedBlocks && aiGeneratedBlocks.length > 0 && newForm) {
      setSelectedForm(newForm);
      setIsBuilderOpen(true);
    }
    
    // Reset and close
    setNewFormName('');
    setNewFormDescription('');
    setNewFormProductId('');
    setSelectedTemplateId(null);
    setCreateMethod('manual');
    setAIGeneratedBlocks(null);
    setAISuggestedName('');
    setIsCreateDialogOpen(false);
  };
  
  const handleEditForm = (form: Form) => {
    setSelectedForm(form);
    setIsBuilderOpen(true);
  };
  
  const handleDeleteForm = async (formId: string) => {
    if (confirm('Tem certeza que deseja excluir este formulário? Esta ação não pode ser desfeita.')) {
      await deleteForm.mutateAsync(formId);
    }
  };
  
  const getConversionRate = (form: Form) => {
    if (form.views_count === 0) return '0%';
    return `${((form.submissions_count / form.views_count) * 100).toFixed(1)}%`;
  };
  
  const getPublicUrl = (form: Form) => {
    // This would be the actual public URL in production
    return `${window.location.origin}/f/${form.slug}`;
  };
  
  const copyEmbedCode = (form: Form) => {
    const embedCode = `<iframe src="${getPublicUrl(form)}" width="100%" height="600" frameborder="0"></iframe>`;
    navigator.clipboard.writeText(embedCode);
  };
  
  if (isBuilderOpen && selectedForm) {
    return (
      <FormBuilder 
        formId={selectedForm.id} 
        onClose={() => {
          setIsBuilderOpen(false);
          setSelectedForm(null);
        }} 
      />
    );
  }
  
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Formulários</h1>
          <p className="text-muted-foreground">Capture leads qualificados com formulários inteligentes</p>
        </div>
        <Button onClick={() => setIsCreateDialogOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Novo Formulário
        </Button>
      </div>
      
      {/* Filters */}
      <div className="flex flex-wrap gap-4">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar formulários..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        
        <Select value={selectedProductFilter} onValueChange={setSelectedProductFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Produto" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os produtos</SelectItem>
            {products?.map(product => (
              <SelectItem key={product.id} value={product.id}>{product.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as FormStatus | 'all')}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="active">Ativos</SelectItem>
            <SelectItem value="draft">Rascunhos</SelectItem>
            <SelectItem value="paused">Pausados</SelectItem>
            <SelectItem value="archived">Arquivados</SelectItem>
          </SelectContent>
        </Select>
      </div>
      
      {/* Forms Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map(i => (
            <Card key={i} className="animate-pulse">
              <CardHeader className="space-y-2">
                <div className="h-5 bg-muted rounded w-3/4" />
                <div className="h-4 bg-muted rounded w-1/2" />
              </CardHeader>
              <CardContent>
                <div className="h-20 bg-muted rounded" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : filteredForms.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <FileEdit className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">Nenhum formulário encontrado</h3>
            <p className="text-muted-foreground text-center mb-4">
              {searchQuery || selectedProductFilter !== 'all' || statusFilter !== 'all'
                ? 'Tente ajustar os filtros de busca'
                : 'Crie seu primeiro formulário para começar a captar leads'}
            </p>
            {!searchQuery && selectedProductFilter === 'all' && statusFilter === 'all' && (
              <Button onClick={() => setIsCreateDialogOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Criar Formulário
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredForms.map(form => (
            <Card key={form.id} className="group hover:shadow-md transition-shadow">
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <CardTitle className="text-base truncate">{form.name}</CardTitle>
                    <CardDescription className="truncate">
                      {form.products?.name || 'Produto'}
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={statusConfig[form.status].variant}>
                      {statusConfig[form.status].label}
                    </Badge>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => handleEditForm(form)}>
                          <FileEdit className="h-4 w-4 mr-2" />
                          Editar
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => window.open(getPublicUrl(form), '_blank')}>
                          <Eye className="h-4 w-4 mr-2" />
                          Visualizar
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => duplicateForm.mutate(form.id)}>
                          <Copy className="h-4 w-4 mr-2" />
                          Duplicar
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => navigator.clipboard.writeText(getPublicUrl(form))}>
                          <ExternalLink className="h-4 w-4 mr-2" />
                          Copiar Link
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => copyEmbedCode(form)}>
                          <Code className="h-4 w-4 mr-2" />
                          Copiar Embed
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        {form.status === 'active' ? (
                          <DropdownMenuItem onClick={() => toggleStatus.mutate({ formId: form.id, status: 'paused' })}>
                            <Pause className="h-4 w-4 mr-2" />
                            Pausar
                          </DropdownMenuItem>
                        ) : form.status !== 'archived' ? (
                          <DropdownMenuItem onClick={() => toggleStatus.mutate({ formId: form.id, status: 'active' })}>
                            <Play className="h-4 w-4 mr-2" />
                            Ativar
                          </DropdownMenuItem>
                        ) : null}
                        {form.status !== 'archived' && (
                          <DropdownMenuItem onClick={() => toggleStatus.mutate({ formId: form.id, status: 'archived' })}>
                            <Archive className="h-4 w-4 mr-2" />
                            Arquivar
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuSeparator />
                        <DropdownMenuItem 
                          onClick={() => handleDeleteForm(form.id)}
                          className="text-destructive focus:text-destructive"
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Excluir
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {form.description && (
                  <p className="text-sm text-muted-foreground mb-3 line-clamp-2">
                    {form.description}
                  </p>
                )}
                
                {/* Stats */}
                <div className="grid grid-cols-3 gap-2 text-center py-3 bg-muted/50 rounded-lg">
                  <div>
                    <p className="text-lg font-semibold">{form.views_count}</p>
                    <p className="text-xs text-muted-foreground">Visualizações</p>
                  </div>
                  <div>
                    <p className="text-lg font-semibold">{form.submissions_count}</p>
                    <p className="text-xs text-muted-foreground">Respostas</p>
                  </div>
                  <div>
                    <p className="text-lg font-semibold">{getConversionRate(form)}</p>
                    <p className="text-xs text-muted-foreground">Conversão</p>
                  </div>
                </div>
                
                <p className="text-xs text-muted-foreground mt-3">
                  Atualizado {format(new Date(form.updated_at), "d 'de' MMM", { locale: ptBR })}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      
      {/* Create Dialog */}
      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>Novo Formulário</DialogTitle>
            <DialogDescription>
              Crie um formulário para captar leads qualificados
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            {/* Product Selection */}
            <div className="space-y-2">
              <Label>Produto *</Label>
              <Select value={newFormProductId} onValueChange={setNewFormProductId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o produto" />
                </SelectTrigger>
                <SelectContent>
                  {products?.map(product => (
                    <SelectItem key={product.id} value={product.id}>{product.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                O formulário herdará o pipeline, ICP e cérebro do produto
              </p>
            </div>
            
            {/* Creation Method */}
            <div className="space-y-2">
              <Label>Como você quer criar?</Label>
              <div className="grid grid-cols-3 gap-2">
                <Button
                  type="button"
                  variant={createMethod === 'manual' ? 'default' : 'outline'}
                  className="h-auto py-4 flex-col"
                  onClick={() => setCreateMethod('manual')}
                >
                  <FileEdit className="h-5 w-5 mb-1" />
                  <span className="text-xs">Do Zero</span>
                </Button>
                <Button
                  type="button"
                  variant={createMethod === 'template' ? 'default' : 'outline'}
                  className="h-auto py-4 flex-col"
                  onClick={() => setCreateMethod('template')}
                >
                  <LayoutTemplate className="h-5 w-5 mb-1" />
                  <span className="text-xs">Template</span>
                </Button>
                <Button
                  type="button"
                  variant={createMethod === 'ai' ? 'default' : 'outline'}
                  className="h-auto py-4 flex-col"
                  onClick={() => {
                    if (newFormProductId) {
                      setCreateMethod('ai');
                      setIsCreateDialogOpen(false);
                      setIsAIGeneratorOpen(true);
                    }
                  }}
                  disabled={!newFormProductId}
                >
                  <Sparkles className="h-5 w-5 mb-1" />
                  <span className="text-xs">Com IA</span>
                </Button>
              </div>
            </div>
            
            {/* Template Selection */}
            {createMethod === 'template' && (
              <div className="space-y-2">
                <Label>Escolha um template</Label>
                <div className="grid grid-cols-1 gap-2 max-h-[200px] overflow-y-auto">
                  {templates?.map(template => (
                    <button
                      key={template.id}
                      type="button"
                      onClick={() => setSelectedTemplateId(template.id)}
                      className={`p-3 rounded-lg border text-left transition-colors ${
                        selectedTemplateId === template.id 
                          ? 'border-primary bg-primary/5' 
                          : 'border-border hover:border-primary/50'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4 text-primary" />
                        <span className="font-medium text-sm">{template.name}</span>
                        <Badge variant="secondary" className="ml-auto text-xs">
                          {template.category}
                        </Badge>
                      </div>
                      {template.description && (
                        <p className="text-xs text-muted-foreground mt-1">{template.description}</p>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}
            
            {/* Form Details */}
            <div className="space-y-2">
              <Label htmlFor="form-name">Nome do formulário *</Label>
              <Input
                id="form-name"
                value={newFormName}
                onChange={(e) => setNewFormName(e.target.value)}
                placeholder="Ex: Qualificação de Leads"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="form-description">Descrição (opcional)</Label>
              <Textarea
                id="form-description"
                value={newFormDescription}
                onChange={(e) => setNewFormDescription(e.target.value)}
                placeholder="Descreva o objetivo do formulário..."
                rows={2}
              />
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
              Cancelar
            </Button>
            <Button 
              onClick={handleCreateForm}
              disabled={!newFormName.trim() || !newFormProductId || createForm.isPending}
            >
              {createForm.isPending ? 'Criando...' : 'Criar Formulário'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* AI Generator Dialog */}
      <FormAIGenerator
        open={isAIGeneratorOpen}
        onOpenChange={setIsAIGeneratorOpen}
        productId={newFormProductId}
        productName={products?.find(p => p.id === newFormProductId)?.name || ''}
        onGenerated={async (blocks, suggestedName) => {
          // Create form DIRECTLY with the AI-generated blocks
          try {
            const newForm = await createForm.mutateAsync({
              productId: newFormProductId,
              name: suggestedName,
              description: newFormDescription.trim() || undefined,
              aiBlocks: blocks.map((block, index) => ({
                block_type: block.block_type,
                label: block.label,
                description: block.description || undefined,
                placeholder: block.placeholder || undefined,
                required: block.required,
                options: block.options,
                maps_to: block.maps_to || undefined,
                order_index: index,
              })),
            });
            
            // Open FormBuilder immediately with the new form
            if (newForm) {
              setSelectedForm(newForm);
              setIsBuilderOpen(true);
            }
            
            // Reset state
            setNewFormProductId('');
            setNewFormDescription('');
            setCreateMethod('manual');
            setIsAIGeneratorOpen(false);
          } catch (error) {
            console.error('Error creating form with AI blocks:', error);
            // Fallback: store blocks and open manual dialog
            setAIGeneratedBlocks(blocks);
            setAISuggestedName(suggestedName);
            setNewFormName(suggestedName);
            setIsCreateDialogOpen(true);
          }
        }}
      />
    </div>
  );
}
