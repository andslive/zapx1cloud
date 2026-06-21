import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, Circle, Clock, ArrowRight } from 'lucide-react';
import { format, parseISO, differenceInDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useLeadStageHistory } from '@/hooks/useInteractions';
import { Loader2 } from 'lucide-react';

interface LeadJourneyTabProps {
  leadId: string;
  currentStageId?: string | null;
  stages: Array<{
    id: string;
    name: string;
    color?: string | null;
    order_index: number;
    is_won?: boolean | null;
    is_lost?: boolean | null;
  }>;
}

export function LeadJourneyTab({ leadId, currentStageId, stages }: LeadJourneyTabProps) {
  const { data: stageHistory, isLoading } = useLeadStageHistory(leadId);

  const journeyData = useMemo(() => {
    if (!stages || stages.length === 0) return [];

    const currentStageIndex = stages.findIndex(s => s.id === currentStageId);

    return stages.map((stage, index) => {
      const historyEntry = stageHistory?.find(h => h.stage_id === stage.id);
      const isPast = index < currentStageIndex;
      const isCurrent = stage.id === currentStageId;
      const isFuture = index > currentStageIndex;

      let daysInStage = 0;
      if (historyEntry) {
        if (historyEntry.exited_at) {
          daysInStage = differenceInDays(
            parseISO(historyEntry.exited_at),
            parseISO(historyEntry.entered_at)
          );
        } else if (isCurrent) {
          daysInStage = differenceInDays(new Date(), parseISO(historyEntry.entered_at));
        }
      }

      return {
        ...stage,
        isPast,
        isCurrent,
        isFuture,
        enteredAt: historyEntry?.entered_at,
        exitedAt: historyEntry?.exited_at,
        daysInStage: historyEntry?.days_in_stage || daysInStage
      };
    });
  }, [stages, stageHistory, currentStageId]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (stages.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          Nenhum estágio configurado para este produto
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Visual funnel */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Progresso no Funil</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 overflow-x-auto pb-2">
            {journeyData.map((stage, index) => (
              <div key={stage.id} className="flex items-center">
                <div 
                  className={`
                    flex items-center gap-2 px-4 py-2 rounded-lg border-2 transition-all
                    ${stage.isCurrent 
                      ? 'border-primary bg-primary/10' 
                      : stage.isPast 
                        ? 'border-green-500 bg-green-500/10' 
                        : 'border-muted bg-muted/30'
                    }
                  `}
                >
                  {stage.isPast ? (
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                  ) : stage.isCurrent ? (
                    <div 
                      className="h-4 w-4 rounded-full animate-pulse"
                      style={{ backgroundColor: stage.color || 'hsl(var(--primary))' }}
                    />
                  ) : (
                    <Circle className="h-4 w-4 text-muted-foreground" />
                  )}
                  <span className={`text-sm font-medium whitespace-nowrap ${
                    stage.isFuture ? 'text-muted-foreground' : ''
                  }`}>
                    {stage.name}
                  </span>
                </div>
                {index < journeyData.length - 1 && (
                  <ArrowRight className="h-4 w-4 text-muted-foreground mx-1 flex-shrink-0" />
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Stage details */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Detalhes da Jornada</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {journeyData.map((stage, index) => (
            <div 
              key={stage.id}
              className={`
                relative pl-8 pb-4
                ${index < journeyData.length - 1 ? 'border-l-2 border-border ml-2' : 'ml-2'}
              `}
            >
              {/* Timeline dot */}
              <div 
                className={`
                  absolute left-0 -translate-x-1/2 h-4 w-4 rounded-full border-2
                  ${stage.isPast 
                    ? 'bg-green-500 border-green-500' 
                    : stage.isCurrent 
                      ? 'bg-primary border-primary' 
                      : 'bg-background border-muted'
                  }
                `}
                style={stage.isCurrent ? { backgroundColor: stage.color || undefined } : undefined}
              />
              
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <h4 className={`font-medium ${stage.isFuture ? 'text-muted-foreground' : ''}`}>
                      {stage.name}
                    </h4>
                    {stage.is_won && <Badge className="bg-green-500">Ganho</Badge>}
                    {stage.is_lost && <Badge variant="destructive">Perdido</Badge>}
                    {stage.isCurrent && <Badge variant="outline">Atual</Badge>}
                  </div>
                  
                  {stage.enteredAt && (
                    <p className="text-sm text-muted-foreground mt-1">
                      Entrou em {format(parseISO(stage.enteredAt), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                    </p>
                  )}
                </div>

                {(stage.isPast || stage.isCurrent) && stage.daysInStage > 0 && (
                  <div className="flex items-center gap-1 text-sm text-muted-foreground">
                    <Clock className="h-4 w-4" />
                    <span>{stage.daysInStage} dias</span>
                  </div>
                )}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Stats summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4 text-center">
            <p className="text-2xl font-bold text-green-500">
              {journeyData.filter(s => s.isPast).length}
            </p>
            <p className="text-xs text-muted-foreground">Estágios concluídos</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 text-center">
            <p className="text-2xl font-bold text-primary">
              {journeyData.find(s => s.isCurrent)?.daysInStage || 0}
            </p>
            <p className="text-xs text-muted-foreground">Dias no estágio atual</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 text-center">
            <p className="text-2xl font-bold">
              {journeyData.reduce((acc, s) => acc + (s.daysInStage || 0), 0)}
            </p>
            <p className="text-xs text-muted-foreground">Total de dias</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 text-center">
            <p className="text-2xl font-bold">
              {journeyData.filter(s => s.isFuture).length}
            </p>
            <p className="text-xs text-muted-foreground">Estágios restantes</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
