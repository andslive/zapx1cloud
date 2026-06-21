import { useState } from 'react';
import { Phone, Mail, MessageCircle, ChevronRight, Flame, ThermometerSun, Snowflake, Loader2 } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useLeads, usePipelineStages, useUpdateLead } from '@/hooks/useLeads';
import { useInteractions } from '@/hooks/useInteractions';
import { Tables } from '@/integrations/supabase/types';
import { AnimatePresence, motion } from 'framer-motion';
import { LeadDetailPage } from '@/components/lead/LeadDetailPage';

type Lead = Tables<'leads'>;

interface MobileLeadsListProps {
  productId: string;
  productName: string;
  organizationId: string;
}

export function MobileLeadsList({ productId, productName, organizationId }: MobileLeadsListProps) {
  const { data: leadsData, isLoading: loadingLeads } = useLeads(productId);
  const { data: stages = [], isLoading: loadingStages } = usePipelineStages(productId);
  const [selectedStage, setSelectedStage] = useState<string>('all');
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const leads = leadsData || [];
  const sortedStages = [...stages].sort((a, b) => a.order_index - b.order_index);
  const isLoading = loadingLeads || loadingStages;

  const filteredLeads = selectedStage === 'all' 
    ? leads 
    : leads.filter(lead => lead.current_stage_id === selectedStage);

  const getTemperatureIcon = (temp: string | null) => {
    switch (temp) {
      case 'hot': return <Flame size={14} className="text-red-500" />;
      case 'warm': return <ThermometerSun size={14} className="text-yellow-500" />;
      case 'cold': return <Snowflake size={14} className="text-blue-400" />;
      default: return null;
    }
  };

  const getStageName = (stageId: string | null) => {
    const stage = stages.find(s => s.id === stageId);
    return stage?.name || 'Sem estágio';
  };

  const getStageColor = (stageId: string | null) => {
    const stage = stages.find(s => s.id === stageId);
    return stage?.color || '#666';
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Stage Filter Tabs */}
      <div className="py-3 overflow-x-auto hide-scrollbar -mx-4 px-4">
        <Tabs value={selectedStage} onValueChange={setSelectedStage}>
          <TabsList className="h-9 p-1 bg-muted/50 w-auto inline-flex gap-1">
            <TabsTrigger 
              value="all" 
              className="text-xs px-3 h-7 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
            >
              Todos ({leads.length})
            </TabsTrigger>
            {sortedStages.map((stage) => {
              const count = leads.filter(l => l.current_stage_id === stage.id).length;
              return (
                <TabsTrigger 
                  key={stage.id} 
                  value={stage.id}
                  className="text-xs px-3 h-7 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground whitespace-nowrap"
                >
                  {stage.name} ({count})
                </TabsTrigger>
              );
            })}
          </TabsList>
        </Tabs>
      </div>

      {/* Leads List */}
      <div className="flex-1 overflow-auto space-y-3">
        {filteredLeads.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <p className="text-sm">Nenhum lead encontrado</p>
          </div>
        ) : (
          filteredLeads.map((lead) => (
            <Card 
              key={lead.id}
              className="p-4 bg-card border-border active:scale-[0.98] transition-transform touch-manipulation cursor-pointer"
              onClick={() => setSelectedLeadId(lead.id)}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    {getTemperatureIcon(lead.temperature)}
                    <span className="font-medium text-foreground truncate">
                      {lead.name}
                    </span>
                  </div>
                  
                  {lead.company && (
                    <p className="text-sm text-muted-foreground truncate">
                      {lead.company}
                    </p>
                  )}
                  
                  <div className="flex items-center gap-2 mt-2">
                    <Badge 
                      variant="outline" 
                      className="text-[10px] h-5"
                      style={{ 
                        borderColor: getStageColor(lead.current_stage_id),
                        color: getStageColor(lead.current_stage_id)
                      }}
                    >
                      {getStageName(lead.current_stage_id)}
                    </Badge>
                    
                    {lead.last_contact_at && (
                      <span className="text-[10px] text-muted-foreground">
                        Contato: {new Date(lead.last_contact_at).toLocaleDateString('pt-BR')}
                      </span>
                    )}
                  </div>
                </div>

                <ChevronRight size={20} className="text-muted-foreground shrink-0" />
              </div>

              {/* Quick Actions */}
              <div className="flex items-center gap-2 mt-3 pt-3 border-t border-border">
                {lead.phone && (
                  <Button 
                    variant="ghost" 
                    size="sm"
                    className="h-8 px-3 text-xs"
                    onClick={(e) => {
                      e.stopPropagation();
                      window.open(`tel:${lead.phone}`, '_self');
                    }}
                  >
                    <Phone size={14} className="mr-1" />
                    Ligar
                  </Button>
                )}
                {lead.email && (
                  <Button 
                    variant="ghost" 
                    size="sm"
                    className="h-8 px-3 text-xs"
                    onClick={(e) => {
                      e.stopPropagation();
                      window.open(`mailto:${lead.email}`, '_self');
                    }}
                  >
                    <Mail size={14} className="mr-1" />
                    Email
                  </Button>
                )}
                {lead.phone && (
                  <Button 
                    variant="ghost" 
                    size="sm"
                    className="h-8 px-3 text-xs"
                    onClick={(e) => {
                      e.stopPropagation();
                      window.open(`https://wa.me/${lead.phone.replace(/\D/g, '')}`, '_blank');
                    }}
                  >
                    <MessageCircle size={14} className="mr-1" />
                    WhatsApp
                  </Button>
                )}
              </div>
            </Card>
          ))
        )}
      </div>

      {/* Lead Detail Full-Screen */}
      <AnimatePresence>
        {selectedLeadId && (
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="fixed inset-0 z-50 bg-background overflow-auto"
          >
            <LeadDetailPage
              leadId={selectedLeadId}
              onBack={() => setSelectedLeadId(null)}
              isAdminView={false}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
