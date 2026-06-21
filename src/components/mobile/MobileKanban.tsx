import { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus, Search, Loader2, User, Building2, Phone, Mail,
  Flame, ThermometerSun, Snowflake, DollarSign, X,
  ChevronRight, ArrowRight, Eye, Calendar
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useLeads, usePipelineStages, useMoveLead, useCreateLead } from '@/hooks/useLeads';
import { useAuth } from '@/hooks/useAuth';
import { LeadDetailPage } from '@/components/lead/LeadDetailPage';

import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { Tables } from '@/integrations/supabase/types';

type PipelineStage = Tables<'pipeline_stages'>;

interface MobileKanbanProps {
  productId: string;
  productName: string;
  organizationId: string;
}

const formatCurrency = (value: number) => {
  if (value >= 1000000) return `R$ ${(value / 1000000).toFixed(1)}M`;
  if (value >= 1000) return `R$ ${(value / 1000).toFixed(0)}k`;
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 0 }).format(value);
};

const TemperatureIcon = ({ temp }: { temp: string | null }) => {
  if (temp === 'hot') return <Flame size={13} className="text-red-500" />;
  if (temp === 'warm') return <ThermometerSun size={13} className="text-amber-500" />;
  if (temp === 'cold') return <Snowflake size={13} className="text-blue-400" />;
  return null;
};

export function MobileKanban({ productId, productName, organizationId }: MobileKanbanProps) {
  const { user, profile } = useAuth();
  const { data: leads, isLoading: leadsLoading } = useLeads(productId);
  const { data: stages, isLoading: stagesLoading } = usePipelineStages(productId);
  const moveLead = useMoveLead();
  const createLead = useCreateLead();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [addLeadOpen, setAddLeadOpen] = useState(false);
  const [newLead, setNewLead] = useState({ name: '', company: '', email: '', phone: '' });
  const [activeStageIndex, setActiveStageIndex] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  const isLoading = leadsLoading || stagesLoading;
  const sortedStages = [...(stages || [])].sort((a, b) => a.order_index - b.order_index);

  const filteredLeads = (leads || []).filter(lead =>
    !searchQuery ||
    lead.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    lead.company?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getLeadsByStage = (stageId: string) =>
    filteredLeads.filter(l => l.current_stage_id === stageId);

  const getStageTotal = (stageId: string) =>
    getLeadsByStage(stageId).reduce((sum, l) => sum + (l.deal_value || 0), 0);

  const handleAddLead = async () => {
    if (!newLead.name.trim()) { toast.error('Nome é obrigatório'); return; }
    try {
      await createLead.mutateAsync({
        name: newLead.name,
        company: newLead.company || null,
        email: newLead.email || null,
        phone: newLead.phone || null,
        product_id: productId,
        assigned_to: user?.id,
        organization_id: profile?.organization_id || '',
        current_stage_id: sortedStages[0]?.id || null,
      });
      toast.success('Lead criado!');
      setNewLead({ name: '', company: '', email: '', phone: '' });
      setAddLeadOpen(false);
    } catch {
      toast.error('Erro ao criar lead');
    }
  };

  const handleMoveStage = async (leadId: string, stageId: string) => {
    try {
      await moveLead.mutateAsync({ leadId, stageId });
      toast.success('Etapa atualizada!');
    } catch {
      toast.error('Erro ao mover lead');
    }
  };

  const scrollToStage = (index: number) => {
    setActiveStageIndex(index);
    if (scrollRef.current) {
      const colWidth = scrollRef.current.scrollWidth / sortedStages.length;
      scrollRef.current.scrollTo({ left: colWidth * index, behavior: 'smooth' });
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!sortedStages.length) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center px-6">
        <div className="h-16 w-16 rounded-xl bg-primary/10 flex items-center justify-center mb-4">
          <Calendar size={32} className="text-primary" />
        </div>
        <h3 className="text-lg font-semibold text-foreground mb-2">Pipeline não configurado</h3>
        <p className="text-sm text-muted-foreground">Um administrador precisa configurar as etapas do pipeline.</p>
      </div>
    );
  }

  const activeStage = sortedStages[activeStageIndex];
  const activeLeads = activeStage ? getLeadsByStage(activeStage.id) : [];

  return (
    <div className="flex flex-col h-full">
      {/* Top Bar: Search + Add */}
      <div className="flex items-center gap-2 mb-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar lead..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="pl-9 h-10 bg-card border-border"
          />
          {searchQuery && (
            <button className="absolute right-3 top-1/2 -translate-y-1/2" onClick={() => setSearchQuery('')}>
              <X size={14} className="text-muted-foreground" />
            </button>
          )}
        </div>
        <Button size="sm" className="h-10 shrink-0" onClick={() => setAddLeadOpen(true)}>
          <Plus size={16} className="mr-1" />
          Novo
        </Button>
      </div>

      {/* Stage Pills — horizontal scroll */}
      <div className="flex gap-2 overflow-x-auto pb-2 hide-scrollbar -mx-4 px-4">
        {sortedStages.map((stage, idx) => {
          const count = getLeadsByStage(stage.id).length;
          const isActive = idx === activeStageIndex;
          return (
            <button
              key={stage.id}
              onClick={() => scrollToStage(idx)}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all shrink-0 border',
                isActive
                  ? 'text-white border-transparent shadow-md'
                  : 'bg-card text-foreground border-border'
              )}
              style={isActive ? { backgroundColor: stage.color || '#6b7280', borderColor: stage.color || '#6b7280' } : {}}
            >
              {stage.name}
              <span className={cn(
                'flex items-center justify-center h-4 min-w-4 px-1 rounded-full text-[10px] font-bold',
                isActive ? 'bg-white/25 text-white' : 'bg-muted text-muted-foreground'
              )}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Active Stage Summary Card */}
      {activeStage && (
        <motion.div
          key={activeStage.id}
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-xl text-white p-3 mb-3 flex items-center justify-between"
          style={{ background: `linear-gradient(135deg, ${activeStage.color || '#6b7280'}, ${activeStage.color || '#6b7280'}cc)` }}
        >
          <div>
            <p className="text-xs font-medium opacity-80 uppercase tracking-wider">{activeStage.name}</p>
            <p className="text-lg font-bold">{formatCurrency(getStageTotal(activeStage.id))}</p>
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold">{activeLeads.length}</p>
            <p className="text-xs opacity-80">leads</p>
          </div>
        </motion.div>
      )}

      {/* Lead Cards for Active Stage */}
      <div className="flex-1 overflow-y-auto space-y-2 pb-4">
        <AnimatePresence mode="popLayout">
          {activeLeads.length === 0 ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex flex-col items-center justify-center py-16 text-muted-foreground"
            >
              <User size={32} className="mb-3 opacity-30" />
              <p className="text-sm">Nenhum lead nesta etapa</p>
              <Button variant="ghost" size="sm" className="mt-3 text-xs" onClick={() => setAddLeadOpen(true)}>
                <Plus size={14} className="mr-1" />
                Adicionar lead
              </Button>
            </motion.div>
          ) : (
            activeLeads.map((lead, idx) => (
              <motion.div
                key={lead.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ delay: idx * 0.04 }}
              >
                <Card
                  className="p-4 bg-card border-border active:scale-[0.98] transition-transform touch-manipulation cursor-pointer"
                  style={{ borderLeftWidth: 3, borderLeftColor: activeStage?.color || '#6b7280' }}
                  onClick={() => setSelectedLeadId(lead.id)}
                >
                  {/* Header */}
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                        <span className="text-xs font-bold text-primary">
                          {lead.name.charAt(0).toUpperCase()}
                        </span>
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <TemperatureIcon temp={lead.temperature} />
                          <span className="font-semibold text-sm text-foreground truncate">{lead.name}</span>
                        </div>
                        {lead.company && (
                          <div className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
                            <Building2 size={11} />
                            <span className="truncate">{lead.company}</span>
                          </div>
                        )}
                      </div>
                    </div>
                    <ChevronRight size={16} className="text-muted-foreground shrink-0 mt-1" />
                  </div>

                  {/* Deal Value */}
                  {lead.deal_value && lead.deal_value > 0 && (
                    <div className="flex items-center gap-1 px-2 py-1 bg-emerald-500/10 rounded-md w-fit mb-2">
                      <DollarSign size={12} className="text-emerald-600" />
                      <span className="text-xs font-semibold text-emerald-600">
                        {formatCurrency(lead.deal_value)}
                      </span>
                    </div>
                  )}

                  {/* Contact Quick Actions */}
                  <div className="flex items-center gap-1 pt-2 border-t border-border">
                    {lead.phone && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-[11px]"
                        onClick={e => { e.stopPropagation(); window.open(`tel:${lead.phone}`, '_self'); }}
                      >
                        <Phone size={12} className="mr-1 text-green-500" />
                        Ligar
                      </Button>
                    )}
                    {lead.phone && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-[11px]"
                        onClick={e => { e.stopPropagation(); window.open(`https://wa.me/${lead.phone?.replace(/\D/g, '')}`, '_blank'); }}
                      >
                        <Mail size={12} className="mr-1 text-primary" />
                        WhatsApp
                      </Button>
                    )}

                    {/* Stage Changer */}
                    <div className="ml-auto" onClick={e => e.stopPropagation()}>
                      <Select
                        value={lead.current_stage_id || ''}
                        onValueChange={val => handleMoveStage(lead.id, val)}
                      >
                        <SelectTrigger className="h-7 text-[11px] border-dashed w-auto px-2 gap-1">
                          <ArrowRight size={11} />
                          <SelectValue placeholder="Mover" />
                        </SelectTrigger>
                        <SelectContent>
                          {sortedStages.map(s => (
                            <SelectItem key={s.id} value={s.id} className="text-xs">
                              <div className="flex items-center gap-2">
                                <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: s.color || '#6b7280' }} />
                                {s.name}
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </Card>
              </motion.div>
            ))
          )}
        </AnimatePresence>
      </div>

      {/* Lead Detail Full-Screen */}
      <AnimatePresence>
        {selectedLeadId && (
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 300 }}
            className="fixed inset-0 z-50 bg-background"
          >
            <LeadDetailPage
              leadId={selectedLeadId}
              onBack={() => setSelectedLeadId(null)}
              isAdminView={false}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Add Lead Sheet */}
      <Sheet open={addLeadOpen} onOpenChange={setAddLeadOpen}>
        <SheetContent side="bottom" className="rounded-t-2xl pb-8">
          <SheetHeader className="mb-4">
            <SheetTitle>Novo Lead</SheetTitle>
          </SheetHeader>
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Nome *</label>
              <Input
                placeholder="Nome do lead"
                value={newLead.name}
                onChange={e => setNewLead({ ...newLead, name: e.target.value })}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Empresa</label>
              <Input
                placeholder="Nome da empresa"
                value={newLead.company}
                onChange={e => setNewLead({ ...newLead, company: e.target.value })}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">WhatsApp / Telefone</label>
              <Input
                type="tel"
                placeholder="(11) 99999-9999"
                value={newLead.phone}
                onChange={e => setNewLead({ ...newLead, phone: e.target.value })}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Email</label>
              <Input
                type="email"
                placeholder="email@empresa.com"
                value={newLead.email}
                onChange={e => setNewLead({ ...newLead, email: e.target.value })}
              />
            </div>
            <Button
              className="w-full mt-2"
              onClick={handleAddLead}
              disabled={createLead.isPending}
            >
              {createLead.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Adicionar Lead'}
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
