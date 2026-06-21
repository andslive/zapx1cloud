import { useState } from 'react';
import { LayoutGrid, Settings2, TrendingUp, Users, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { useProducts } from '@/hooks/useProducts';
import { useKanbanFilters } from '@/hooks/useKanbanFilters';
import { useKanbanData } from '@/hooks/useKanbanData';
import { useMoveLead } from '@/hooks/useLeads';
import { KanbanFilters } from './KanbanFilters';
import { KanbanColumn } from './KanbanColumn';
import { StageManagerDialog } from './StageManagerDialog';
import { LeadDetailPage } from '@/components/lead/LeadDetailPage';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { VisuallyHidden } from '@radix-ui/react-visually-hidden';
import { toast } from 'sonner';
export function KanbanBoard() {
  const { data: products, isLoading: productsLoading } = useProducts();
  const [selectedProductId, setSelectedProductId] = useState<string>('');
  const [stageManagerOpen, setStageManagerOpen] = useState(false);
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [draggedLeadId, setDraggedLeadId] = useState<string | null>(null);

  const { filters, updateFilter, clearFilters, hasActiveFilters } = useKanbanFilters();
  const { stages, team, totalPipelineValue, totalLeads, isLoading, refetch } = useKanbanData(selectedProductId, filters);
  const moveLead = useMoveLead();

  const handleDropOnStage = async (stageId: string) => {
    if (!draggedLeadId) return;
    const id = draggedLeadId;
    setDraggedLeadId(null);
    try {
      await moveLead.mutateAsync({ leadId: id, stageId });
      toast.success('Lead movido');
      refetch();
    } catch (e) {
      toast.error('Erro ao mover lead');
    }
  };

  // Auto-select first product
  if (products?.length && !selectedProductId) {
    setSelectedProductId(products[0].id);
  }

  const formatCurrency = (value: number) => {
    if (value >= 1000000) {
      return `R$ ${(value / 1000000).toFixed(2)}M`;
    }
    if (value >= 1000) {
      return `R$ ${(value / 1000).toFixed(0)}k`;
    }
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
      minimumFractionDigits: 0,
    }).format(value);
  };

  if (productsLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!products?.length) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center">
        <LayoutGrid className="h-12 w-12 text-muted-foreground mb-4" />
        <h3 className="text-lg font-medium mb-2">Nenhum produto encontrado</h3>
        <p className="text-muted-foreground">Crie um produto para começar a gerenciar seu pipeline.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-7rem)] gap-4 -mb-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <LayoutGrid className="h-6 w-6" />
            Pipeline de Vendas
          </h1>
          <p className="text-muted-foreground">Gestão visual de oportunidades</p>
        </div>

        <div className="flex items-center gap-3">
          {/* Product Selector */}
          <Select value={selectedProductId} onValueChange={setSelectedProductId}>
            <SelectTrigger className="w-[220px]">
              <SelectValue placeholder="Selecionar produto" />
            </SelectTrigger>
            <SelectContent>
              {products?.map((product) => (
                <SelectItem key={product.id} value={product.id}>
                  {product.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Stage Manager */}
          <Button variant="outline" onClick={() => setStageManagerOpen(true)}>
            <Settings2 className="h-4 w-4 mr-2" />
            Gerenciar Etapas
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-card border rounded-lg p-4">
          <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
            <TrendingUp className="h-4 w-4" />
            Valor Total
          </div>
          <div className="text-2xl font-bold text-primary">
            {formatCurrency(totalPipelineValue)}
          </div>
        </div>
        <div className="bg-card border rounded-lg p-4">
          <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
            <Users className="h-4 w-4" />
            Total de Leads
          </div>
          <div className="text-2xl font-bold">
            {totalLeads}
          </div>
        </div>
        <div className="bg-card border rounded-lg p-4">
          <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
            <LayoutGrid className="h-4 w-4" />
            Etapas
          </div>
          <div className="text-2xl font-bold">
            {stages.filter(s => s.id !== 'unassigned').length}
          </div>
        </div>
        <div className="bg-card border rounded-lg p-4">
          <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
            Ticket Médio
          </div>
          <div className="text-2xl font-bold">
            {totalLeads > 0 ? formatCurrency(totalPipelineValue / totalLeads) : 'R$ 0'}
          </div>
        </div>
      </div>

      {/* Filters */}
      {selectedProductId && (
        <KanbanFilters
          filters={filters}
          onFilterChange={updateFilter}
          onClearFilters={clearFilters}
          hasActiveFilters={hasActiveFilters}
          team={team}
        />
      )}

      {/* Kanban Board */}
      {isLoading ? (
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <ScrollArea className="flex-1 min-h-0">
          <div className="flex gap-4 h-full min-h-[400px]">
            {stages.map((stage) => (
              <KanbanColumn
                key={stage.id}
                stage={stage}
                onViewLead={setSelectedLeadId}
                draggedLeadId={draggedLeadId}
                onDragStartLead={setDraggedLeadId}
                onDropLead={handleDropOnStage}
              />

            ))}
          </div>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>
      )}

      {/* Stage Manager Dialog */}
      <StageManagerDialog
        open={stageManagerOpen}
        onOpenChange={setStageManagerOpen}
        stages={stages}
        productId={selectedProductId}
        productName={products?.find(p => p.id === selectedProductId)?.name}
        onRefresh={refetch}
      />

      {/* Lead Detail Modal */}
      <Dialog open={!!selectedLeadId} onOpenChange={() => setSelectedLeadId(null)}>
        <DialogContent className="max-w-4xl h-[90vh] flex flex-col overflow-hidden p-0">
          <VisuallyHidden>
            <DialogTitle>Detalhes do Lead</DialogTitle>
          </VisuallyHidden>
          {selectedLeadId && (
            <LeadDetailPage 
              leadId={selectedLeadId} 
              onBack={() => setSelectedLeadId(null)}
              isAdminView={true}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
