import { useState } from 'react';
import { useLeadsNeedingTasks, useGenerateCadenceTasks } from '@/hooks/useTaskAutomation';
import { useCadence } from '@/hooks/useCadence';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  Wand2, 
  Users, 
  Calendar, 
  Loader2,
  CheckCircle2,
  Zap
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface TaskGenerationWidgetProps {
  productId?: string;
  productName?: string;
}

export function TaskGenerationWidget({ productId, productName }: TaskGenerationWidgetProps) {
  const { user } = useAuth();
  const [selectedLeads, setSelectedLeads] = useState<Set<string>>(new Set());
  const [isGenerating, setIsGenerating] = useState(false);
  
  const { data: leadsNeedingTasks, isLoading } = useLeadsNeedingTasks(user?.id, productId);
  const { data: cadence } = useCadence(productId);
  const generateTasks = useGenerateCadenceTasks();

  const toggleLead = (leadId: string) => {
    const newSet = new Set(selectedLeads);
    if (newSet.has(leadId)) {
      newSet.delete(leadId);
    } else {
      newSet.add(leadId);
    }
    setSelectedLeads(newSet);
  };

  const selectAll = () => {
    if (leadsNeedingTasks) {
      setSelectedLeads(new Set(leadsNeedingTasks.map(l => l.id)));
    }
  };

  const clearSelection = () => {
    setSelectedLeads(new Set());
  };

  const handleGenerateTasks = async () => {
    if (!user?.id || selectedLeads.size === 0 || !leadsNeedingTasks) return;
    
    setIsGenerating(true);
    
    try {
      const tasksToCreate = leadsNeedingTasks
        .filter(lead => selectedLeads.has(lead.id))
        .map(lead => {
          const cadenceDay = lead.cadence_day || 1;
          const cadenceInfo = cadence?.find(c => c.day === cadenceDay);
          
          return {
            leadId: lead.id,
            leadName: lead.name,
            productId: lead.product_id!,
            productName: (lead.products as any)?.name || productName || 'Produto',
            cadenceDay,
            cadenceTitle: cadenceInfo?.title || 'Follow-up',
            userId: user.id
          };
        });
      
      await generateTasks.mutateAsync(tasksToCreate);
      
      toast.success(`${tasksToCreate.length} tarefa${tasksToCreate.length > 1 ? 's' : ''} criada${tasksToCreate.length > 1 ? 's' : ''}!`, {
        icon: <CheckCircle2 className="h-5 w-5 text-success" />
      });
      
      setSelectedLeads(new Set());
    } catch (error) {
      toast.error('Erro ao criar tarefas');
    } finally {
      setIsGenerating(false);
    }
  };

  if (isLoading) {
    return (
      <Card className="bg-card border-border">
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </CardContent>
      </Card>
    );
  }

  if (!leadsNeedingTasks || leadsNeedingTasks.length === 0) {
    return (
      <Card className="bg-card border-border">
        <CardContent className="flex flex-col items-center justify-center py-8">
          <div className="h-12 w-12 rounded-xl bg-success/10 flex items-center justify-center mb-3">
            <CheckCircle2 className="h-6 w-6 text-success" />
          </div>
          <p className="text-sm text-muted-foreground text-center">
            Todos os leads já possuem tarefas ativas!
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <Wand2 className="h-5 w-5 text-primary" />
          Gerar Tarefas Automáticas
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            {leadsNeedingTasks.length} lead{leadsNeedingTasks.length > 1 ? 's' : ''} sem tarefas pendentes
          </p>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={selectAll}>
              Selecionar todos
            </Button>
            {selectedLeads.size > 0 && (
              <Button variant="ghost" size="sm" onClick={clearSelection}>
                Limpar
              </Button>
            )}
          </div>
        </div>

        <ScrollArea className="h-[200px]">
          <div className="space-y-2">
            {leadsNeedingTasks.map((lead) => (
              <div
                key={lead.id}
                className={cn(
                  "flex items-center gap-3 p-3 rounded-lg border transition-all cursor-pointer",
                  selectedLeads.has(lead.id)
                    ? "border-primary/50 bg-primary/5"
                    : "border-border hover:border-primary/30"
                )}
                onClick={() => toggleLead(lead.id)}
              >
                <Checkbox
                  checked={selectedLeads.has(lead.id)}
                  onCheckedChange={() => toggleLead(lead.id)}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm text-foreground truncate">
                      {lead.name}
                    </span>
                    <Badge variant="outline" className="text-xs shrink-0">
                      Dia {lead.cadence_day || 1}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground truncate">
                    {lead.company || (lead.products as any)?.name || 'Sem empresa'}
                  </p>
                </div>
                <Calendar className="h-4 w-4 text-muted-foreground shrink-0" />
              </div>
            ))}
          </div>
        </ScrollArea>

        <Button
          className="w-full"
          onClick={handleGenerateTasks}
          disabled={selectedLeads.size === 0 || isGenerating}
        >
          {isGenerating ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Gerando...
            </>
          ) : (
            <>
              <Zap className="h-4 w-4 mr-2" />
              Gerar {selectedLeads.size} tarefa{selectedLeads.size !== 1 ? 's' : ''}
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  );
}
