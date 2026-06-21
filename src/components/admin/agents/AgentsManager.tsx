import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAutoNotificationSettings } from '@/hooks/useAutoNotificationSettings';
import { useProducts } from '@/hooks/useProducts';
import {
  useAllAgents,
  useCreateAgent,
  useUpdateAgent,
  useDeleteAgent,
  useSetDefaultAgent,
  useToggleAgentStatus,
  type AgentWithProduct,
} from '@/hooks/useProductAgents';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
import { Bot, Globe, LayoutGrid, Network, Package, Plus, Search, Sparkles, Upload } from 'lucide-react';
import { AgentImportModal } from '@/components/admin/agents/AgentImportModal';
import { AgentCard } from '@/components/admin/agents/AgentCard';
import { AgentEditor } from '@/components/admin/agents/AgentEditor';
import { AgentHierarchyView } from '@/components/admin/agents/AgentHierarchyView';
import { AgentSupervisorPanel } from '@/components/admin/agents/AgentSupervisorPanel';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { GitBranch } from 'lucide-react';
import { AGENT_TYPE_LABELS, type AgentType, type ProductAgent } from '@/types/agents';

export function AgentsManager() {
  const { data: products, isLoading: productsLoading } = useProducts();
  const { data: agents, isLoading: agentsLoading } = useAllAgents();
  const createAgent = useCreateAgent();
  const updateAgent = useUpdateAgent();
  const deleteAgent = useDeleteAgent();
  const setDefaultAgent = useSetDefaultAgent();
  const toggleStatus = useToggleAgentStatus();

  const [editorOpen, setEditorOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [editingAgent, setEditingAgent] = useState<AgentWithProduct | null>(null);
  const [deletingAgent, setDeletingAgent] = useState<AgentWithProduct | null>(null);
  const [openOnExecutiveTab, setOpenOnExecutiveTab] = useState(false);

  const [searchParams, setSearchParams] = useSearchParams();
  const { data: notifSettings } = useAutoNotificationSettings();

  // Identifies the executive agent (admin global with admin_agent_enabled=true)
  const executiveAgentId = useMemo(() => {
    if (!agents || !notifSettings?.admin_agent_enabled) return null;
    const adminGlobals = agents.filter((a) => a.agent_type === 'admin' && !a.product_id && a.is_active);
    const def = adminGlobals.find((a) => a.is_default);
    return (def ?? adminGlobals[0])?.id ?? null;
  }, [agents, notifSettings?.admin_agent_enabled]);

  // Handle deep-link params: ?open=executive opens executive agent on its tab
  // ?create=orchestrator opens the create dialog for an admin agent
  useEffect(() => {
    if (!agents) return;
    const open = searchParams.get('open');
    const create = searchParams.get('create');

    if (open === 'executive') {
      const adminGlobals = agents.filter((a) => a.agent_type === 'admin' && !a.product_id);
      const target =
        adminGlobals.find((a) => a.id === executiveAgentId) ||
        adminGlobals.find((a) => a.is_default) ||
        adminGlobals[0] ||
        null;
      if (target) {
        setEditingAgent(target);
        setOpenOnExecutiveTab(true);
        setEditorOpen(true);
      } else {
        // No admin agent yet — open create with type=admin pre-filled
        setEditingAgent(null);
        setOpenOnExecutiveTab(true);
        setEditorOpen(true);
      }
      const next = new URLSearchParams(searchParams);
      next.delete('open');
      setSearchParams(next, { replace: true });
    } else if (create === 'orchestrator') {
      setEditingAgent(null);
      setOpenOnExecutiveTab(true);
      setEditorOpen(true);
      const next = new URLSearchParams(searchParams);
      next.delete('create');
      setSearchParams(next, { replace: true });
    }
  }, [agents, searchParams, setSearchParams, executiveAgentId]);

  const [productFilter, setProductFilter] = useState<string>('all'); // 'all' | 'global' | productId
  const [typeFilter, setTypeFilter] = useState<string>('all'); // 'all' | AgentType
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState<'tree' | 'list'>('tree');
  const [supervisorOpen, setSupervisorOpen] = useState(false);

  const filtered = useMemo(() => {
    if (!agents) return [];
    return agents.filter((a) => {
      if (productFilter === 'global' && a.product_id) return false;
      if (productFilter !== 'all' && productFilter !== 'global' && a.product_id !== productFilter) return false;
      if (typeFilter !== 'all' && a.agent_type !== typeFilter) return false;
      if (search.trim() && !a.name.toLowerCase().includes(search.toLowerCase().trim())) return false;
      return true;
    });
  }, [agents, productFilter, typeFilter, search]);

  const grouped = useMemo(() => {
    const globals: AgentWithProduct[] = [];
    const byProduct = new Map<string, { product: { id: string; name: string }; agents: AgentWithProduct[] }>();

    for (const a of filtered) {
      if (!a.product_id) {
        globals.push(a);
      } else {
        const key = a.product_id;
        const productInfo = a.product || products?.find((p) => p.id === key) || { id: key, name: 'Produto' };
        if (!byProduct.has(key)) {
          byProduct.set(key, { product: productInfo as { id: string; name: string }, agents: [] });
        }
        byProduct.get(key)!.agents.push(a);
      }
    }

    return { globals, byProduct: Array.from(byProduct.values()) };
  }, [filtered, products]);

  const handleCreate = () => {
    setEditingAgent(null);
    setOpenOnExecutiveTab(false);
    setEditorOpen(true);
  };

  const handleEdit = (agent: ProductAgent) => {
    setEditingAgent(agent as AgentWithProduct);
    setOpenOnExecutiveTab(false);
    setEditorOpen(true);
  };

  const handleOpenExecutiveTab = (agent: ProductAgent) => {
    setEditingAgent(agent as AgentWithProduct);
    setOpenOnExecutiveTab(true);
    setEditorOpen(true);
  };

  const handleSave = (data: Partial<ProductAgent>) => {
    if (editingAgent && editingAgent.id) {
      updateAgent.mutate(
        { id: editingAgent.id, ...data },
        { onSuccess: () => setEditorOpen(false) }
      );
    } else {
      createAgent.mutate(data, { onSuccess: () => setEditorOpen(false) });
    }
  };

  const handleDelete = (agent: ProductAgent) => setDeletingAgent(agent as AgentWithProduct);

  const confirmDelete = () => {
    if (deletingAgent) {
      deleteAgent.mutate(
        { id: deletingAgent.id, productId: deletingAgent.product_id },
        { onSuccess: () => setDeletingAgent(null) }
      );
    }
  };

  const handleSetDefault = (agent: ProductAgent) => {
    if (!agent.product_id) return;
    setDefaultAgent.mutate({ id: agent.id, productId: agent.product_id });
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

  const isLoading = productsLoading || agentsLoading;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 rounded-xl gradient-primary flex items-center justify-center">
            <Bot className="h-6 w-6 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Agentes de IA</h1>
            <p className="text-muted-foreground text-sm">
              Gerencie todos os agentes da sua organização — globais e por produto
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-lg border bg-muted/40 p-0.5">
            <button
              type="button"
              onClick={() => setViewMode('tree')}
              className={
                'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ' +
                (viewMode === 'tree'
                  ? 'bg-background shadow-sm text-foreground'
                  : 'text-muted-foreground hover:text-foreground')
              }
            >
              <Network className="h-3.5 w-3.5" />
              Hierarquia
            </button>
            <button
              type="button"
              onClick={() => setViewMode('list')}
              className={
                'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ' +
                (viewMode === 'list'
                  ? 'bg-background shadow-sm text-foreground'
                  : 'text-muted-foreground hover:text-foreground')
              }
            >
              <LayoutGrid className="h-3.5 w-3.5" />
              Lista
            </button>
          </div>
          <Button variant="outline" onClick={() => setSupervisorOpen(true)} size="lg">
            <GitBranch className="h-4 w-4 mr-2" />
            Supervisor
          </Button>
          <Button variant="outline" onClick={() => setImportOpen(true)} size="lg">
            <Upload className="h-4 w-4 mr-2" />
            Importar
          </Button>
          <Button onClick={handleCreate} size="lg">
            <Plus className="h-4 w-4 mr-2" />
            Criar Agente
          </Button>
        </div>
      </div>

      <Sheet open={supervisorOpen} onOpenChange={setSupervisorOpen}>
        <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Supervisor Multi-agente</SheetTitle>
            <SheetDescription>
              Configure especialistas e regras de roteamento. Quando nenhuma regra bater, o supervisor IA decide.
            </SheetDescription>
          </SheetHeader>
          <div className="mt-4">
            <AgentSupervisorPanel />
          </div>
        </SheetContent>
      </Sheet>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-2">
        <Select value={productFilter} onValueChange={setProductFilter}>
          <SelectTrigger className="sm:w-[200px]">
            <SelectValue placeholder="Vínculo" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os vínculos</SelectItem>
            <SelectItem value="global">
              <div className="flex items-center gap-2">
                <Globe className="h-3.5 w-3.5" />
                Globais
              </div>
            </SelectItem>
            {products?.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                <div className="flex items-center gap-2">
                  <Package className="h-3.5 w-3.5" />
                  {p.name}
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="sm:w-[180px]">
            <SelectValue placeholder="Tipo" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os tipos</SelectItem>
            {(Object.keys(AGENT_TYPE_LABELS) as AgentType[]).map((t) => (
              <SelectItem key={t} value={t}>
                {AGENT_TYPE_LABELS[t]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nome..."
            className="pl-9"
          />
        </div>
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!isLoading && filtered.length === 0 && (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
              <Sparkles className="h-8 w-8 text-primary" />
            </div>
            <h3 className="text-lg font-semibold mb-2">Nenhum agente encontrado</h3>
            <p className="text-muted-foreground text-center max-w-md mb-4">
              {agents && agents.length > 0
                ? 'Nenhum agente bate com os filtros aplicados. Tente ajustar a busca.'
                : 'Crie seu primeiro agente. Você pode criar agentes globais (Orquestrador, Suporte) ou específicos de um produto (SDR, Closer).'}
            </p>
            <Button onClick={handleCreate}>
              <Plus className="h-4 w-4 mr-2" />
              Criar Agente
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Hierarquia (tree) */}
      {!isLoading && filtered.length > 0 && viewMode === 'tree' && (
        <Card className="p-4 sm:p-6 bg-muted/20">
          <AgentHierarchyView
            agents={filtered}
            products={products || []}
            executiveAgentId={executiveAgentId}
            onEdit={handleEdit}
            onDelete={handleDelete}
            onSetDefault={handleSetDefault}
            onDuplicate={handleDuplicate}
            onToggleStatus={handleToggleStatus}
            onOpenExecutiveTab={handleOpenExecutiveTab}
          />
        </Card>
      )}

      {/* Lista — Globais */}
      {!isLoading && viewMode === 'list' && grouped.globals.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <Globe className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Globais (sem produto)
            </h2>
            <span className="text-xs text-muted-foreground">· {grouped.globals.length}</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {grouped.globals.map((agent) => (
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
        </section>
      )}

      {/* Lista — Por produto */}
      {!isLoading && viewMode === 'list' &&
        grouped.byProduct.map(({ product, agents: list }) => (
          <section key={product.id} className="space-y-3">
            <div className="flex items-center gap-2">
              <Package className="h-4 w-4 text-primary" />
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                {product.name}
              </h2>
              <span className="text-xs text-muted-foreground">· {list.length}</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {list.map((agent) => (
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
          </section>
        ))}

      {/* Editor */}
      <AgentEditor
        open={editorOpen}
        onOpenChange={(o) => {
          setEditorOpen(o);
          if (!o) setOpenOnExecutiveTab(false);
        }}
        agent={editingAgent}
        productId={editingAgent?.product_id ?? null}
        onSave={handleSave}
        openOnExecutiveTab={openOnExecutiveTab}
        isLoading={createAgent.isPending || updateAgent.isPending}
      />

      {/* Import */}
      <AgentImportModal
        open={importOpen}
        onOpenChange={setImportOpen}
        onDraftReady={(draft, pid) => {
          setEditingAgent({ ...(draft as AgentWithProduct), product_id: pid });
          setOpenOnExecutiveTab(false);
          setEditorOpen(true);
        }}
      />

      {/* Delete confirmation */}
      <AlertDialog open={!!deletingAgent} onOpenChange={() => setDeletingAgent(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir agente?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. O agente "{deletingAgent?.name}" será removido permanentemente.
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
