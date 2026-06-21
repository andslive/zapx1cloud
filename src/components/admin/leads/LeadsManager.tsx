import { useState } from 'react';
import { useLeadsManager } from '@/hooks/useLeadsManager';
import { useSquads } from '@/hooks/useSquads';
import { useProducts } from '@/hooks/useProducts';
import { useTeamMembers } from '@/hooks/useTeam';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { LeadsKPICards } from './LeadsKPICards';
import { LeadsTabs } from './LeadsTabs';
import { LeadsFilters } from './LeadsFilters';
import { LeadsTable } from './LeadsTable';
import { BulkActionsBar } from './BulkActionsBar';
import { CreateLeadDialog } from './CreateLeadDialog';
import { BulkTransferDialog } from './BulkTransferDialog';
import { ImportLeadsDialog } from './ImportLeadsDialog';
import { BulkTagPopover } from './BulkTagPopover';
import { LeadDetailPage } from '@/components/lead/LeadDetailPage';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Pagination, PaginationContent, PaginationItem, PaginationLink,
  PaginationNext, PaginationPrevious, PaginationEllipsis,
} from '@/components/ui/pagination';
import { Plus, Upload, Download, Target, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { leadsToCsv, downloadCsv, type ExportableLead } from '@/lib/leadsExport';
import { format } from 'date-fns';

export function LeadsManager() {
  const {
    leads,
    total,
    totalPages,
    stats,
    isLoading,
    page,
    setPage,
    filters,
    updateFilter,
    clearFilters,
    sort,
    updateSort,
    selectedLeads,
    toggleSelectLead,
    toggleSelectAll,
    clearSelection,
    activeTab,
    setActiveTab,
    createLead,
    bulkTransfer,
    bulkDelete,
  } = useLeadsManager();

  const { data: squads = [] } = useSquads();
  const { data: products = [] } = useProducts();
  const { data: teamMembers = [] } = useTeamMembers();

  const { profile } = useAuth();
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [transferDialogOpen, setTransferDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [leadDetailOpen, setLeadDetailOpen] = useState(false);
  const [leadsToDelete, setLeadsToDelete] = useState<string[]>([]);

  // Get stages from first product (simplified - in real app you'd handle this differently)
  const stages: { id: string; name: string }[] = [];

  const handleViewLead = (leadId: string) => {
    setSelectedLeadId(leadId);
    setLeadDetailOpen(true);
  };

  const handleTransferLead = (leadId: string) => {
    toggleSelectLead(leadId);
    setTransferDialogOpen(true);
  };

  const handleDeleteLead = (leadId: string) => {
    setLeadsToDelete([leadId]);
    setDeleteDialogOpen(true);
  };

  const handleBulkDelete = () => {
    setLeadsToDelete(selectedLeads);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = async () => {
    await bulkDelete.mutateAsync(leadsToDelete);
    setDeleteDialogOpen(false);
    setLeadsToDelete([]);
  };

  const handleCreateLead = async (data: any) => {
    await createLead.mutateAsync({
      name: data.name,
      email: data.email || null,
      phone: data.phone || null,
      company: data.company || null,
      position: data.position || null,
      temperature: data.temperature,
      lead_origin: data.lead_origin || null,
      lead_channel: data.lead_channel || null,
      product_id: data.product_id || null,
      assigned_to: data.assigned_to || null,
      squad_id: data.squad_id || null,
      notes: data.notes || null,
    } as any);
    setCreateDialogOpen(false);
  };

  const handleBulkTransfer = async (data: { 
    assignedTo: string | null; 
    squadId: string | null; 
    reason?: string 
  }) => {
    await bulkTransfer.mutateAsync({
      leadIds: selectedLeads,
      assignedTo: data.assignedTo === 'unassigned' ? null : data.assignedTo,
      squadId: data.squadId === 'unassigned' ? null : data.squadId,
      reason: data.reason,
    });
    setTransferDialogOpen(false);
  };

  const handleExport = async (onlySelected = false) => {
    if (!profile?.organization_id) return;
    setExporting(true);
    try {
      const targetIds = onlySelected ? selectedLeads : null;
      let q = supabase.from('leads')
        .select('*, pipeline_stages(name)')
        .eq('organization_id', profile.organization_id)
        .order('created_at', { ascending: false })
        .limit(5000);
      if (targetIds && targetIds.length > 0) q = q.in('id', targetIds);
      const { data, error } = await q;
      if (error) throw error;
      const leads = (data || []) as unknown as ExportableLead[];

      const teamMap: Record<string, string> = {};
      teamMembers.forEach((m: any) => { teamMap[m.id] = m.full_name || m.email || ''; });
      const squadMap: Record<string, string> = {};
      squads.forEach((s) => { squadMap[s.id] = s.name; });
      const productMap: Record<string, string> = {};
      products.forEach((p) => { productMap[p.id] = p.name; });

      const tagsByLead: Record<string, string[]> = {};
      const ids = leads.map((l) => l.id);
      if (ids.length > 0) {
        const { data: tagData } = await supabase
          .from('lead_tag_assignments')
          .select('lead_id, lead_tags(name)')
          .in('lead_id', ids);
        (tagData || []).forEach((t: any) => {
          const name = t.lead_tags?.name;
          if (!name) return;
          (tagsByLead[t.lead_id] ||= []).push(name);
        });
      }

      const csv = leadsToCsv(leads, { teamMap, squadMap, productMap, tagsByLead });
      downloadCsv(`leads-${format(new Date(), 'yyyy-MM-dd-HHmm')}.csv`, csv);
      toast.success(`${leads.length} leads exportados`);
    } catch (e: any) {
      toast.error('Erro ao exportar: ' + (e.message || ''));
    } finally {
      setExporting(false);
    }
  };

  // Pagination helpers
  const renderPaginationItems = () => {
    const items = [];
    const maxVisible = 5;
    let start = Math.max(1, page - Math.floor(maxVisible / 2));
    let end = Math.min(totalPages, start + maxVisible - 1);
    
    if (end - start + 1 < maxVisible) {
      start = Math.max(1, end - maxVisible + 1);
    }

    if (start > 1) {
      items.push(
        <PaginationItem key={1}>
          <PaginationLink onClick={() => setPage(1)}>1</PaginationLink>
        </PaginationItem>
      );
      if (start > 2) {
        items.push(
          <PaginationItem key="ellipsis-start">
            <PaginationEllipsis />
          </PaginationItem>
        );
      }
    }

    for (let i = start; i <= end; i++) {
      items.push(
        <PaginationItem key={i}>
          <PaginationLink 
            onClick={() => setPage(i)} 
            isActive={page === i}
          >
            {i}
          </PaginationLink>
        </PaginationItem>
      );
    }

    if (end < totalPages) {
      if (end < totalPages - 1) {
        items.push(
          <PaginationItem key="ellipsis-end">
            <PaginationEllipsis />
          </PaginationItem>
        );
      }
      items.push(
        <PaginationItem key={totalPages}>
          <PaginationLink onClick={() => setPage(totalPages)}>
            {totalPages}
          </PaginationLink>
        </PaginationItem>
      );
    }

    return items;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-foreground flex items-center gap-2">
            <Target className="h-7 w-7 text-primary" />
            Central de Leads
          </h1>
          <p className="text-muted-foreground mt-1">
            Gerencie todos os leads da sua operação
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => handleExport(false)} disabled={exporting}>
            <Download className="h-4 w-4 mr-1" />
            Exportar
          </Button>
          <Button variant="outline" size="sm">
            <Upload className="h-4 w-4 mr-1" />
            Importar
          </Button>
          <Button onClick={() => setCreateDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-1" />
            Novo Lead
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <LeadsKPICards stats={stats} isLoading={isLoading} />

      {/* Tabs */}
      <LeadsTabs 
        activeTab={activeTab} 
        onTabChange={setActiveTab}
        stats={stats}
      />

      {/* Filters */}
      <LeadsFilters
        filters={filters}
        onFilterChange={updateFilter}
        onClearFilters={clearFilters}
        squads={squads.map(s => ({ id: s.id, name: s.name }))}
        products={products.map(p => ({ id: p.id, name: p.name }))}
        stages={stages}
      />

      {/* Table */}
      <LeadsTable
        leads={leads}
        selectedLeads={selectedLeads}
        onToggleSelect={toggleSelectLead}
        onToggleSelectAll={toggleSelectAll}
        onViewLead={handleViewLead}
        onTransferLead={handleTransferLead}
        onDeleteLead={handleDeleteLead}
        sort={sort}
        onSort={updateSort}
        isLoading={isLoading}
      />

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Mostrando {((page - 1) * 20) + 1}-{Math.min(page * 20, total)} de {total} leads
          </p>
          <Pagination>
            <PaginationContent>
              <PaginationItem>
                <PaginationPrevious 
                  onClick={() => setPage(Math.max(1, page - 1))}
                  className={page === 1 ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
                />
              </PaginationItem>
              {renderPaginationItems()}
              <PaginationItem>
                <PaginationNext 
                  onClick={() => setPage(Math.min(totalPages, page + 1))}
                  className={page === totalPages ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
                />
              </PaginationItem>
            </PaginationContent>
          </Pagination>
        </div>
      )}

      {/* Bulk Actions Bar */}
      <BulkActionsBar
        selectedCount={selectedLeads.length}
        onTransfer={() => setTransferDialogOpen(true)}
        onExport={() => handleExport(true)}
        onTag={() => { /* handled via BulkTagPopover */ }}
        onDelete={handleBulkDelete}
        onClearSelection={clearSelection}
      />

      {/* Create Lead Dialog */}
      <CreateLeadDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        onSubmit={handleCreateLead}
        isLoading={createLead.isPending}
        products={products.map(p => ({ id: p.id, name: p.name }))}
        teamMembers={teamMembers.map(m => ({ id: m.id, full_name: m.full_name }))}
        squads={squads.map(s => ({ id: s.id, name: s.name }))}
      />

      {/* Bulk Transfer Dialog */}
      <BulkTransferDialog
        open={transferDialogOpen}
        onOpenChange={setTransferDialogOpen}
        selectedCount={selectedLeads.length}
        onTransfer={handleBulkTransfer}
        isLoading={bulkTransfer.isPending}
        teamMembers={teamMembers.map(m => ({ id: m.id, full_name: m.full_name }))}
        squads={squads.map(s => ({ id: s.id, name: s.name }))}
      />

      {/* Delete Confirmation */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir leads</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir {leadsToDelete.length} lead
              {leadsToDelete.length > 1 ? 's' : ''}? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {bulkDelete.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Lead Detail Dialog */}
      <Dialog open={leadDetailOpen} onOpenChange={setLeadDetailOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto p-0">
          {selectedLeadId && (
            <LeadDetailPage
              leadId={selectedLeadId}
              onBack={() => setLeadDetailOpen(false)}
              isAdminView={true}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
