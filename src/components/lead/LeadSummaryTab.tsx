import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { 
  Clock, 
  Calendar, 
  TrendingUp, 
  MessageCircle, 
  AlertTriangle,
  CheckCircle2,
  Target,
  CalendarPlus,
  DollarSign,
  Pencil,
  Check,
  X,
  Star,
} from 'lucide-react';
import { format, differenceInDays, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { EventModal } from '@/components/calendar/EventModal';
import { LeadTagsBlock } from './summary/LeadTagsBlock';
import { LeadRecentNotes } from './summary/LeadRecentNotes';
import { LeadKeyResponses } from './summary/LeadKeyResponses';
import { LeadConversationPreview } from './summary/LeadConversationPreview';
import { toast } from 'sonner';
import { useProduct } from '@/hooks/useProducts';
import type { ProductPlan } from '@/components/admin/products/tabs/PricingPlansSection';

interface LeadSummaryTabProps {
  lead: {
    id: string;
    name: string;
    product_id?: string | null;
    created_at: string;
    last_contact_at?: string | null;
    current_stage_id?: string | null;
    cadence_day?: number | null;
    next_action?: string | null;
    deal_value?: number | null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    metadata?: any;
    pipeline_stages?: {
      id: string;
      name: string;
      color?: string | null;
      order_index: number;
      is_won?: boolean | null;
      is_lost?: boolean | null;
    } | null;
  };
  stagesCount?: number;
  interactionsCount?: number;
  onUpdateLead?: (updates: Record<string, any>) => Promise<void>;
  onNavigateTab?: (tab: string) => void;
}

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
};

export function LeadSummaryTab({ lead, stagesCount = 7, interactionsCount = 0, onUpdateLead, onNavigateTab }: LeadSummaryTabProps) {
  const [isEventModalOpen, setIsEventModalOpen] = useState(false);
  const [isEditingValue, setIsEditingValue] = useState(false);
  const [dealValueInput, setDealValueInput] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [selectedPlanId, setSelectedPlanId] = useState('');

  const { data: product } = useProduct(lead.product_id || '');
  const activePlans: ProductPlan[] = ((product?.pricing as unknown as ProductPlan[]) || []).filter(p => p.active);
  const hasPlans = activePlans.length > 0;

  const handlePlanSelect = async (planId: string) => {
    setSelectedPlanId(planId);
    const plan = activePlans.find(p => p.id === planId);
    if (plan && onUpdateLead) {
      setIsSaving(true);
      try {
        await onUpdateLead({ deal_value: plan.price });
        toast.success(`Plano "${plan.name}" selecionado — valor atualizado`);
      } catch {
        toast.error('Erro ao atualizar valor');
      } finally {
        setIsSaving(false);
      }
    }
  };

  const stats = useMemo(() => {
    const now = new Date();
    const createdAt = parseISO(lead.created_at);
    const daysInFunnel = differenceInDays(now, createdAt);
    const lastContact = lead.last_contact_at ? parseISO(lead.last_contact_at) : null;
    const daysSinceContact = lastContact ? differenceInDays(now, lastContact) : null;
    const stageProgress = lead.pipeline_stages?.order_index 
      ? Math.round(((lead.pipeline_stages.order_index + 1) / stagesCount) * 100)
      : 0;
    const isStale = daysSinceContact !== null && daysSinceContact > 3;
    return { daysInFunnel, daysSinceContact, lastContact, stageProgress, isStale };
  }, [lead, stagesCount]);

  const handleStartEdit = () => {
    setDealValueInput((lead.deal_value || 0).toString());
    setIsEditingValue(true);
  };

  const handleCancelEdit = () => {
    setIsEditingValue(false);
    setDealValueInput('');
  };

  const handleSaveValue = async () => {
    if (!onUpdateLead) return;
    const cleanValue = dealValueInput.replace(/[^\d,.-]/g, '').replace(',', '.');
    const numericValue = parseFloat(cleanValue) || 0;
    setIsSaving(true);
    try {
      await onUpdateLead({ deal_value: numericValue });
      toast.success('Valor atualizado com sucesso');
      setIsEditingValue(false);
    } catch {
      toast.error('Erro ao atualizar valor');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Quick Actions */}
      <div className="flex gap-2 flex-wrap">
        <Button onClick={() => setIsEventModalOpen(true)} className="gap-2" size="sm">
          <CalendarPlus className="h-4 w-4" />
          Agendar Evento
        </Button>
        {onNavigateTab && (
          <Button variant="outline" size="sm" className="gap-2" onClick={() => onNavigateTab('notes')}>
            <Pencil className="h-4 w-4" />
            Adicionar nota
          </Button>
        )}
      </div>

      {/* Alerts */}
      {stats.isStale && (
        <Card className="border-amber-500/50 bg-amber-500/10">
          <CardContent className="p-4 flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            <div>
              <p className="font-medium text-amber-500">Lead sem contato há {stats.daysSinceContact} dias</p>
              <p className="text-sm text-muted-foreground">
                Considere entrar em contato para não perder o timing
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      <EventModal
        open={isEventModalOpen}
        onOpenChange={setIsEventModalOpen}
        defaultLeadId={lead.id}
        defaultProductId={lead.product_id || undefined}
      />

      {/* Deal Value */}
      <Card className="border-emerald-500/30 bg-emerald-500/5">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-medium text-muted-foreground flex items-center gap-2">
            <DollarSign className="h-5 w-5 text-emerald-500" />
            Valor da Negociação
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0 space-y-3">
          {hasPlans && onUpdateLead && (
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground">Plano do Cliente</p>
              <Select value={selectedPlanId} onValueChange={handlePlanSelect} disabled={isSaving}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Selecione o plano contratado" />
                </SelectTrigger>
                <SelectContent>
                  {activePlans.map(plan => {
                    const price = plan.price.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
                    const cycle = plan.billing_cycle !== 'unico' ? `/${plan.billing_cycle === 'mensal' ? 'mês' : plan.billing_cycle}` : '';
                    return (
                      <SelectItem key={plan.id} value={plan.id}>
                        <span className="flex items-center gap-1">
                          {plan.recommended && <Star className="h-3 w-3 text-primary" />}
                          {plan.name} — {price}{cycle}
                        </span>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
          )}

          {isEditingValue ? (
            <div className="flex items-center gap-3">
              <div className="relative flex-1 max-w-xs">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-lg text-muted-foreground font-medium">R$</span>
                <Input
                  type="text"
                  value={dealValueInput}
                  onChange={(e) => setDealValueInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSaveValue();
                    if (e.key === 'Escape') handleCancelEdit();
                  }}
                  className="pl-12 text-2xl font-bold h-14"
                  placeholder="0"
                  autoFocus
                  disabled={isSaving}
                />
              </div>
              <Button size="icon" variant="ghost" onClick={handleSaveValue} disabled={isSaving} className="h-10 w-10 text-emerald-500 hover:text-emerald-600 hover:bg-emerald-500/10">
                <Check className="h-5 w-5" />
              </Button>
              <Button size="icon" variant="ghost" onClick={handleCancelEdit} disabled={isSaving} className="h-10 w-10">
                <X className="h-5 w-5" />
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <button
                onClick={handleStartEdit}
                className="text-3xl font-bold text-emerald-600 hover:text-emerald-500 transition-colors cursor-pointer bg-transparent border-none p-0"
                disabled={!onUpdateLead || (hasPlans && !!selectedPlanId)}
              >
                {formatCurrency(lead.deal_value || 0)}
              </button>
              {onUpdateLead && !hasPlans && (
                <Button variant="ghost" size="icon" onClick={handleStartEdit} className="h-8 w-8 opacity-60 hover:opacity-100">
                  <Pencil className="h-4 w-4" />
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Stats grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Target className="h-4 w-4" />
              Estágio Atual
            </CardTitle>
          </CardHeader>
          <CardContent>
            {lead.pipeline_stages ? (
              <>
                <div className="flex items-center gap-2 mb-2">
                  <div className="h-3 w-3 rounded-full" style={{ backgroundColor: lead.pipeline_stages.color || '#888' }} />
                  <span className="font-semibold">{lead.pipeline_stages.name}</span>
                </div>
                <Progress value={stats.stageProgress} className="h-2" />
                <p className="text-xs text-muted-foreground mt-1">{stats.stageProgress}% do funil</p>
              </>
            ) : (
              <span className="text-muted-foreground">Sem estágio definido</span>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Tempo no Funil
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{stats.daysInFunnel} dias</p>
            <p className="text-xs text-muted-foreground">
              Desde {format(parseISO(lead.created_at), "dd 'de' MMM", { locale: ptBR })}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <MessageCircle className="h-4 w-4" />
              Último Contato
            </CardTitle>
          </CardHeader>
          <CardContent>
            {stats.lastContact ? (
              <>
                <p className="text-2xl font-bold">
                  {stats.daysSinceContact === 0 ? 'Hoje' : `${stats.daysSinceContact} dias`}
                </p>
                <p className="text-xs text-muted-foreground">
                  {format(stats.lastContact, "dd/MM 'às' HH:mm", { locale: ptBR })}
                </p>
              </>
            ) : (
              <span className="text-muted-foreground">Nenhum contato</span>
            )}
            <Badge variant="outline" className="mt-2 text-[10px]">
              {interactionsCount} {interactionsCount === 1 ? 'interação' : 'interações'}
            </Badge>
          </CardContent>
        </Card>
      </div>

      {/* Etiquetas */}
      <LeadTagsBlock leadId={lead.id} />

      {/* Notas recentes */}
      <LeadRecentNotes leadId={lead.id} onSeeAll={onNavigateTab ? () => onNavigateTab('notes') : undefined} />

      {/* Respostas importantes */}
      <LeadKeyResponses metadata={lead.metadata} />

      {/* Conversa recente */}
      <LeadConversationPreview leadId={lead.id} />

      {/* Cadência + Próxima ação */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              Cadência
            </CardTitle>
          </CardHeader>
          <CardContent>
            {lead.cadence_day ? (
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                  <span className="text-xl font-bold text-primary">D{lead.cadence_day}</span>
                </div>
                <div>
                  <p className="font-medium">Dia {lead.cadence_day}</p>
                  <p className="text-sm text-muted-foreground">da cadência de vendas</p>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-muted-foreground">
                <CheckCircle2 className="h-4 w-4" />
                <span>Cadência não iniciada</span>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              Próxima Ação
            </CardTitle>
          </CardHeader>
          <CardContent>
            {lead.next_action ? (
              <p className="text-sm">{lead.next_action}</p>
            ) : (
              <span className="text-muted-foreground">Nenhuma ação definida</span>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
