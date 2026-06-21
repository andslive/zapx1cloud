import { useState, useCallback, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  ArrowLeft, Save, Eye, Smartphone, Monitor, Moon, Sun, Play, Layers, Inbox
} from 'lucide-react';
import { useForm, useFormBlocks, useSaveFormBlocks, useUpdateForm } from '@/hooks/useForms';
import { FormBlock, FormBlockType, createFormBlock } from '@/types/forms';
import { toast } from 'sonner';
import { FormBlockPalette } from './FormBlockPalette';
import { FormCanvas } from './FormCanvas';
import { FormBlockEditor } from './FormBlockEditor';
import { FormPreview } from './FormPreview';
import { FormLivePreview } from './FormLivePreview';
import { FormSettings } from './FormSettings';
import { FormPublish } from './FormPublish';
import { FormResponses } from './FormResponses';
import { cn } from '@/lib/utils';

interface FormBuilderProps {
  formId: string;
  onClose: () => void;
}

export function FormBuilder({ formId, onClose }: FormBuilderProps) {
  const { data: form, isLoading: isLoadingForm } = useForm(formId);
  const { data: existingBlocks, isLoading: isLoadingBlocks } = useFormBlocks(formId);
  const saveBlocks = useSaveFormBlocks();
  const updateForm = useUpdateForm();
  
  const [blocks, setBlocks] = useState<FormBlock[]>([]);
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('build');
  const [hasChanges, setHasChanges] = useState(false);
  const [previewMode, setPreviewMode] = useState<'desktop' | 'mobile'>('desktop');
  const [previewTheme, setPreviewTheme] = useState<'light' | 'dark'>('light');
  const [previewType, setPreviewType] = useState<'static' | 'live'>('live');
  
  // Initialize blocks from existing data
  useEffect(() => {
    if (existingBlocks && existingBlocks.length > 0 && blocks.length === 0) {
      setBlocks(existingBlocks);
    }
  }, [existingBlocks, blocks.length]);
  
  const selectedBlock = blocks.find(b => b.id === selectedBlockId);
  
  const handleAddBlock = useCallback((type: FormBlockType) => {
    const newBlock = createFormBlock(type, formId, blocks.length);
    setBlocks(prev => [...prev, newBlock]);
    setSelectedBlockId(newBlock.id);
    setHasChanges(true);
  }, [formId, blocks.length]);
  
  const handleDeleteBlock = useCallback((blockId: string) => {
    setBlocks(prev => prev.filter(b => b.id !== blockId));
    if (selectedBlockId === blockId) {
      setSelectedBlockId(null);
    }
    setHasChanges(true);
  }, [selectedBlockId]);
  
  const handleUpdateBlocks = useCallback((newBlocks: FormBlock[]) => {
    setBlocks(newBlocks);
    setHasChanges(true);
  }, []);

  const handleUpdateBlock = useCallback((updatedBlock: FormBlock) => {
    setBlocks(prev => prev.map(b => 
      b.id === updatedBlock.id ? updatedBlock : b
    ));
    setHasChanges(true);
  }, []);
  
  const handleSave = async () => {
    try {
      await saveBlocks.mutateAsync({
        formId,
        blocks: blocks.map((b, i) => ({ ...b, order_index: i })),
      });
      setHasChanges(false);
      toast.success('Formulário salvo!');
    } catch (error) {
      toast.error('Erro ao salvar formulário');
    }
  };
  
  const handlePublish = async () => {
    await handleSave();
    await updateForm.mutateAsync({
      formId,
      updates: { status: 'active' },
    });
    toast.success('Formulário publicado!');
  };
  
  if (isLoadingForm || isLoadingBlocks) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-200px)]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }
  
  if (!form) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Formulário não encontrado</p>
        <Button variant="link" onClick={onClose}>Voltar</Button>
      </div>
    );
  }
  
  return (
    <div className="h-full min-h-0 flex flex-col bg-background rounded-lg border overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b bg-card">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={onClose}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-lg font-bold">{form.name}</h1>
            <p className="text-sm text-muted-foreground">
              {form.products?.name} • {blocks.length} {blocks.length === 1 ? 'bloco' : 'blocos'}
            </p>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          {hasChanges && (
            <Badge variant="secondary" className="animate-pulse">
              Alterações não salvas
            </Badge>
          )}
          <Button 
            variant="outline" 
            size="sm" 
            onClick={handleSave} 
            disabled={saveBlocks.isPending || !hasChanges}
          >
            <Save className="h-4 w-4 mr-2" />
            {saveBlocks.isPending ? 'Salvando...' : 'Salvar'}
          </Button>
          <Button 
            size="sm" 
            onClick={handlePublish} 
            disabled={form.status === 'active' || saveBlocks.isPending}
          >
            <Eye className="h-4 w-4 mr-2" />
            {form.status === 'active' ? 'Publicado' : 'Publicar'}
          </Button>
        </div>
      </div>
      
      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col overflow-hidden">
        <div className="px-4 border-b bg-card">
          <TabsList className="h-12 bg-transparent p-0 gap-6">
            <TabsTrigger 
              value="build" 
              className="data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:shadow-none rounded-none h-12 px-0"
            >
              Construir
            </TabsTrigger>
            <TabsTrigger 
              value="preview" 
              className="data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:shadow-none rounded-none h-12 px-0"
            >
              Visualizar
            </TabsTrigger>
            <TabsTrigger 
              value="settings" 
              className="data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:shadow-none rounded-none h-12 px-0"
            >
              Configurar
            </TabsTrigger>
            <TabsTrigger 
              value="share" 
              className="data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:shadow-none rounded-none h-12 px-0"
            >
              Publicar
            </TabsTrigger>
            <TabsTrigger 
              value="responses" 
              className="data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:shadow-none rounded-none h-12 px-0 gap-2"
            >
              <Inbox className="h-4 w-4" />
              Respostas
              {(form.submissions_count || 0) > 0 && (
                <Badge variant="secondary" className="h-5 px-1.5 text-xs">
                  {form.submissions_count}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>
        </div>
        
        {/* Build Tab */}
        <TabsContent value="build" className="flex-1 min-h-0 flex overflow-hidden m-0 data-[state=inactive]:hidden">
          <FormBlockPalette 
            onDragStart={() => {}} 
            onBlockClick={handleAddBlock}
          />
          
          <FormCanvas
            formId={formId}
            blocks={blocks}
            selectedBlockId={selectedBlockId}
            onSelectBlock={setSelectedBlockId}
            onUpdateBlocks={handleUpdateBlocks}
            onAddBlock={handleAddBlock}
            onDeleteBlock={handleDeleteBlock}
          />
          
          <FormBlockEditor
            block={selectedBlock || null}
            allBlocks={blocks}
            onUpdate={handleUpdateBlock}
            onClose={() => setSelectedBlockId(null)}
          />
        </TabsContent>
        
        {/* Preview Tab */}
        <TabsContent value="preview" className="flex-1 flex flex-col overflow-hidden m-0 data-[state=inactive]:hidden">
          <div className="flex-shrink-0 flex items-center justify-center gap-4 py-3 border-b bg-muted/30">
            {/* Preview Type Toggle */}
            <div className="flex items-center gap-1 bg-card rounded-lg p-1 border">
              <Button
                variant={previewType === 'live' ? 'secondary' : 'ghost'}
                size="sm"
                onClick={() => setPreviewType('live')}
                className="gap-2"
              >
                <Play className="h-4 w-4" />
                <span className="hidden sm:inline">Interativo</span>
              </Button>
              <Button
                variant={previewType === 'static' ? 'secondary' : 'ghost'}
                size="sm"
                onClick={() => setPreviewType('static')}
                className="gap-2"
              >
                <Layers className="h-4 w-4" />
                <span className="hidden sm:inline">Todos</span>
              </Button>
            </div>
            
            {/* Device Toggle */}
            <div className="flex items-center gap-1 bg-card rounded-lg p-1 border">
              <Button
                variant={previewMode === 'desktop' ? 'secondary' : 'ghost'}
                size="sm"
                onClick={() => setPreviewMode('desktop')}
              >
                <Monitor className="h-4 w-4" />
              </Button>
              <Button
                variant={previewMode === 'mobile' ? 'secondary' : 'ghost'}
                size="sm"
                onClick={() => setPreviewMode('mobile')}
              >
                <Smartphone className="h-4 w-4" />
              </Button>
            </div>
            
            {/* Theme Toggle */}
            <div className="flex items-center gap-1 bg-card rounded-lg p-1 border">
              <Button
                variant={previewTheme === 'light' ? 'secondary' : 'ghost'}
                size="sm"
                onClick={() => setPreviewTheme('light')}
              >
                <Sun className="h-4 w-4" />
              </Button>
              <Button
                variant={previewTheme === 'dark' ? 'secondary' : 'ghost'}
                size="sm"
                onClick={() => setPreviewTheme('dark')}
              >
                <Moon className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <div className="flex-1 min-h-0 overflow-auto bg-muted/50 flex items-start justify-center p-6">
            <div className={cn(
              "bg-card rounded-xl shadow-2xl overflow-hidden transition-all",
              previewMode === 'mobile' ? 'w-[375px]' : 'w-full max-w-2xl',
              previewType === 'live' && 'min-h-[500px]',
              previewTheme === 'dark' && 'dark'
            )}>
              {previewType === 'live' ? (
                <FormLivePreview 
                  key={blocks.map(b => b.id).join('-')} // Reset on block changes
                  form={form} 
                  blocks={blocks} 
                  theme={previewTheme}
                />
              ) : (
                <FormPreview 
                  form={form} 
                  blocks={blocks} 
                  theme={previewTheme}
                />
              )}
            </div>
          </div>
        </TabsContent>
        
        {/* Settings Tab */}
        <TabsContent value="settings" className="flex-1 min-h-0 overflow-auto m-0 data-[state=inactive]:hidden">
          <FormSettings form={form} onUpdate={(updates) => {
            updateForm.mutate({ formId, updates });
          }} />
        </TabsContent>
        
        {/* Share Tab */}
        <TabsContent value="share" className="flex-1 min-h-0 overflow-auto m-0 data-[state=inactive]:hidden">
          <FormPublish form={form} />
        </TabsContent>

        {/* Responses Tab */}
        <TabsContent value="responses" className="flex-1 min-h-0 overflow-auto m-0 data-[state=inactive]:hidden">
          <FormResponses formId={formId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
