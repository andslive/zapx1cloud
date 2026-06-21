import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
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
import { Bot, Plus, Sparkles, Upload } from 'lucide-react';
import { AgentImportModal } from '@/components/admin/agents/AgentImportModal';
import { 
  useProductAgents, 
  useCreateAgent, 
  useUpdateAgent, 
  useDeleteAgent,
  useSetDefaultAgent,
  useToggleAgentStatus,
} from '@/hooks/useProductAgents';
import { AgentCard } from '@/components/admin/agents/AgentCard';
import { AgentEditor } from '@/components/admin/agents/AgentEditor';
import { ProductAgent } from '@/types/agents';

interface AgentsTabProps {
  productId: string;
}

export function AgentsTab({ productId }: AgentsTabProps) {
  const { data: agents, isLoading } = useProductAgents(productId);
  const createAgent = useCreateAgent();
  const updateAgent = useUpdateAgent();
  const deleteAgent = useDeleteAgent();
  const setDefaultAgent = useSetDefaultAgent();
  const toggleStatus = useToggleAgentStatus();

  const [editorOpen, setEditorOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [editingAgent, setEditingAgent] = useState<ProductAgent | null>(null);
  const [deletingAgent, setDeletingAgent] = useState<ProductAgent | null>(null);

  const handleCreate = () => {
    setEditingAgent(null);
    setEditorOpen(true);
  };

  const handleEdit = (agent: ProductAgent) => {
    setEditingAgent(agent);
    setEditorOpen(true);
  };

  const handleSave = (agentData: Partial<ProductAgent>) => {
    if (editingAgent && editingAgent.id) {
      updateAgent.mutate(
        { id: editingAgent.id, ...agentData },
        { onSuccess: () => setEditorOpen(false) }
      );
    } else {
      createAgent.mutate(
        { ...agentData, product_id: productId },
        { onSuccess: () => setEditorOpen(false) }
      );
    }
  };

  const handleDelete = (agent: ProductAgent) => {
    setDeletingAgent(agent);
  };

  const confirmDelete = () => {
    if (deletingAgent) {
      deleteAgent.mutate(
        { id: deletingAgent.id, productId },
        { onSuccess: () => setDeletingAgent(null) }
      );
    }
  };

  const handleSetDefault = (agent: ProductAgent) => {
    setDefaultAgent.mutate({ id: agent.id, productId });
  };

  const handleDuplicate = (agent: ProductAgent) => {
    const { id, created_at, updated_at, created_by, is_default, ...rest } = agent;
    createAgent.mutate({
      ...rest,
      name: `${agent.name} (cópia)`,
      is_default: false,
    });
  };

  const handleToggleStatus = (agent: ProductAgent, isActive: boolean) => {
    toggleStatus.mutate({ id: agent.id, isActive });
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-10 w-32" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      </div>
    );
  }

  const hasAgents = agents && agents.length > 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Bot className="h-5 w-5 text-primary" />
            Agentes de IA
          </h2>
          <p className="text-sm text-muted-foreground">
            Gerencie os agentes especializados deste produto
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setImportOpen(true)}>
            <Upload className="h-4 w-4 mr-2" />
            Importar
          </Button>
          <Button onClick={handleCreate}>
            <Plus className="h-4 w-4 mr-2" />
            Criar Agente
          </Button>
        </div>
      </div>

      {/* Agents Grid or Empty State */}
      {hasAgents ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {agents.map((agent) => (
            <AgentCard
              key={agent.id}
              agent={agent}
              onEdit={handleEdit}
              onDelete={handleDelete}
              onSetDefault={handleSetDefault}
              onDuplicate={handleDuplicate}
              onToggleStatus={handleToggleStatus}
            />
          ))}
        </div>
      ) : (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
              <Sparkles className="h-8 w-8 text-primary" />
            </div>
            <CardTitle className="text-lg mb-2">Nenhum agente configurado</CardTitle>
            <CardDescription className="text-center max-w-sm mb-4">
              Crie agentes especializados para atender seus leads de forma automatizada.
              Cada agente usa o Cérebro do Produto com comportamentos específicos.
            </CardDescription>
            <Button onClick={handleCreate}>
              <Plus className="h-4 w-4 mr-2" />
              Criar Primeiro Agente
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Info Card */}
      {hasAgents && (
        <Card className="bg-muted/30">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              Como funciona
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground space-y-2">
            <p>
              • Todos os agentes usam o mesmo <strong>Cérebro do Produto</strong> como base de conhecimento
            </p>
            <p>
              • Cada agente tem seu próprio <strong>papel, tom de voz e regras</strong>
            </p>
            <p>
              • O agente <strong>Padrão</strong> é usado automaticamente quando nenhum outro é especificado
            </p>
            <p>
              • Use o bloco <strong>"Trocar Agente"</strong> nos fluxos para alternar entre agentes
            </p>
          </CardContent>
        </Card>
      )}

      {/* Editor Dialog */}
      <AgentEditor
        open={editorOpen}
        onOpenChange={setEditorOpen}
        agent={editingAgent}
        productId={productId}
        onSave={handleSave}
        isLoading={createAgent.isPending || updateAgent.isPending}
      />

      {/* Import Modal */}
      <AgentImportModal
        open={importOpen}
        onOpenChange={setImportOpen}
        fixedProductId={productId}
        onDraftReady={(draft) => {
          setEditingAgent({ ...(draft as ProductAgent), product_id: productId });
          setEditorOpen(true);
        }}
      />

      {/* Delete Confirmation */}
      <AlertDialog open={!!deletingAgent} onOpenChange={() => setDeletingAgent(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir agente?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. O agente "{deletingAgent?.name}" será 
              removido permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive hover:bg-destructive/90"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
