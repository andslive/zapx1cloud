import { useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  LayoutDashboard, 
  ClipboardCheck,
  Clock, 
  Route, 
  Globe, 
  Wallet, 
  FileText,
  Loader2
} from 'lucide-react';
import { useLead, usePipelineStages, useUpdateLead } from '@/hooks/useLeads';
import { useInteractions } from '@/hooks/useInteractions';
import { useAuth } from '@/hooks/useAuth';
import { useTeamMembers } from '@/hooks/useTeam';
import { LeadHeader } from './LeadHeader';
import { LeadSummaryTab } from './LeadSummaryTab';
import { LeadTimeline } from './LeadTimeline';
import { LeadJourneyTab } from './LeadJourneyTab';
import { LeadOriginTab } from './LeadOriginTab';
import { LeadWalletTab } from './LeadWalletTab';
import { LeadBANTTab } from './LeadBANTTab';
import { LeadNotesTab } from './LeadNotesTab';
import { LeadTransferModal } from './LeadTransferModal';
import { LeadEditModal } from './LeadEditModal';

interface LeadDetailPageProps {
  leadId: string;
  onBack: () => void;
  isAdminView?: boolean;
  onWhatsApp?: (phone: string, leadId: string, leadName: string) => void;
}

export function LeadDetailPage({ leadId, onBack, isAdminView = false, onWhatsApp }: LeadDetailPageProps) {
  const [activeTab, setActiveTab] = useState('summary');
  const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  
  const { isAdmin } = useAuth();
  const { data: lead, isLoading, refetch } = useLead(leadId);
  const { data: stages } = usePipelineStages(lead?.product_id || '');
  const { data: interactions } = useInteractions(leadId);
  const updateLead = useUpdateLead();
  const { data: teamMembers } = useTeamMembers();

  // Admin controls only for certain actions like delete
  const showAdminControls = isAdminView || (typeof isAdmin === 'boolean' ? isAdmin : false);
  
  // All users can transfer and edit leads
  const canTransfer = true;
  const canEdit = true;

  const handleUpdateLead = async (updates: Record<string, any>) => {
    await updateLead.mutateAsync({ id: leadId, ...updates });
    refetch();
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!lead) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
        <p>Lead não encontrado</p>
      </div>
    );
  }

  // Use related data from the query if available, fallback to placeholder
  const formattedLead = {
    ...lead,
    assignee: (lead as any).assignee || (lead.assigned_to ? {
      id: lead.assigned_to,
      full_name: 'Carregando...',
      avatar_url: null as string | null,
      email: undefined as string | undefined
    } : null),
    squad: (lead as any).squad || (lead.squad_id ? {
      id: lead.squad_id,
      name: 'Carregando...',
      color: null as string | null
    } : null),
    sdr: (lead as any).sdr || null,
    closer: (lead as any).closer || null,
  };

  const teamMembersForSelect = (teamMembers || []).map(m => ({
    id: m.id,
    full_name: m.full_name || m.email || 'Sem nome',
    avatar_url: m.avatar_url,
    email: m.email,
  }));

  const leadForNotes = {
    id: lead.id,
    notes: lead.notes,
    product_id: lead.product_id,
    sdr_id: (lead as any).sdr_id || null,
    closer_id: (lead as any).closer_id || null,
    metadata: lead.metadata as { tags?: string[] } | null
  };

  return (
    <div className="flex flex-col h-full min-h-0 bg-background">
      {/* Header */}
      <div className="flex-shrink-0">
        <LeadHeader
          lead={formattedLead}
          onBack={onBack}
          onTransfer={canTransfer ? () => setIsTransferModalOpen(true) : undefined}
          onEdit={canEdit ? () => setIsEditModalOpen(true) : undefined}
          onWhatsApp={onWhatsApp && formattedLead.phone ? () => onWhatsApp(formattedLead.phone!, lead.id, lead.name) : undefined}
          isAdmin={showAdminControls}
        />
      </div>

      {/* Tabs */}
      <div className="flex-1 min-h-0 overflow-hidden">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="h-full flex flex-col">
          <div className="border-b border-border px-4 md:px-6 overflow-x-auto">
            <TabsList className="h-12 bg-transparent gap-2 w-max md:w-auto">
              <TabsTrigger value="summary" className="gap-2 data-[state=active]:bg-primary/10">
                <LayoutDashboard className="h-4 w-4" />
                <span className="hidden sm:inline">Resumo</span>
              </TabsTrigger>
              <TabsTrigger value="bant" className="gap-2 data-[state=active]:bg-primary/10">
                <ClipboardCheck className="h-4 w-4" />
                <span className="hidden sm:inline">BANT</span>
              </TabsTrigger>
              <TabsTrigger value="timeline" className="gap-2 data-[state=active]:bg-primary/10">
                <Clock className="h-4 w-4" />
                <span className="hidden sm:inline">Timeline</span>
              </TabsTrigger>
              <TabsTrigger value="journey" className="gap-2 data-[state=active]:bg-primary/10">
                <Route className="h-4 w-4" />
                <span className="hidden sm:inline">Jornada</span>
              </TabsTrigger>
              <TabsTrigger value="origin" className="gap-2 data-[state=active]:bg-primary/10">
                <Globe className="h-4 w-4" />
                <span className="hidden sm:inline">Origem</span>
              </TabsTrigger>
              <TabsTrigger value="wallet" className="gap-2 data-[state=active]:bg-primary/10">
                <Wallet className="h-4 w-4" />
                <span className="hidden sm:inline">Carteira</span>
              </TabsTrigger>
              <TabsTrigger value="notes" className="gap-2 data-[state=active]:bg-primary/10">
                <FileText className="h-4 w-4" />
                <span className="hidden sm:inline">Notas</span>
              </TabsTrigger>
            </TabsList>
          </div>

          <div className="flex-1 overflow-y-auto p-4 md:p-6">
            <TabsContent value="summary" className="mt-0">
              <LeadSummaryTab 
                lead={lead}
                stagesCount={stages?.length || 7}
                interactionsCount={interactions?.length || 0}
                onUpdateLead={handleUpdateLead}
                onNavigateTab={setActiveTab}
              />
            </TabsContent>
            <TabsContent value="bant" className="mt-0">
              <LeadBANTTab lead={lead} onUpdateLead={handleUpdateLead} />
            </TabsContent>
            <TabsContent value="timeline" className="mt-0">
              <LeadTimeline leadId={leadId} />
            </TabsContent>
            <TabsContent value="journey" className="mt-0">
              <LeadJourneyTab leadId={leadId} currentStageId={lead.current_stage_id} stages={stages || []} />
            </TabsContent>
            <TabsContent value="origin" className="mt-0">
              <LeadOriginTab leadId={leadId} />
            </TabsContent>
            <TabsContent value="wallet" className="mt-0">
              <LeadWalletTab 
                lead={lead}
                assignee={formattedLead.assignee}
                squad={formattedLead.squad}
                sdr={formattedLead.sdr}
                closer={formattedLead.closer}
                isAdmin={true}
                onTransferSuccess={() => refetch()}
                onUpdateLead={handleUpdateLead}
                teamMembers={teamMembersForSelect}
              />
            </TabsContent>
            <TabsContent value="notes" className="mt-0">
              <LeadNotesTab lead={leadForNotes} isAdmin={showAdminControls} teamMembers={teamMembersForSelect} />
            </TabsContent>
          </div>
        </Tabs>
      </div>

      {/* Transfer Modal - available for all users */}
      <LeadTransferModal
        isOpen={isTransferModalOpen}
        onClose={() => setIsTransferModalOpen(false)}
        lead={lead}
        currentAssignee={formattedLead.assignee}
        currentSquad={formattedLead.squad}
        onSuccess={() => {
          setIsTransferModalOpen(false);
          refetch();
        }}
      />

      {/* Edit Modal - available for all users */}
      <LeadEditModal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        lead={lead}
        onSave={handleUpdateLead}
      />
    </div>
  );
}