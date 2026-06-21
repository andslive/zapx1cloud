import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2, Workflow, Play, Square, History } from 'lucide-react';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';

interface SendFlowDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conversationId: string;
  widgetProductId?: string;
}

export function SendFlowDialog({
  open,
  onOpenChange,
  conversationId,
  widgetProductId,
}: SendFlowDialogProps) {
  const { profile, user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedFlowId, setSelectedFlowId] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [isStopping, setIsStopping] = useState(false);

  // Carrega todos os funis ativos do sistema
  const { data: flows, isLoading: isLoadingFlows } = useQuery({
    queryKey: ['capture-funnels-all', profile?.organization_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('capture_funnels')
        .select('id, name, description, status, created_at, flow_blocks')
        .eq('organization_id', profile!.organization_id!)
        .order('name', { ascending: true });

      if (error) throw error;
      return data || [];
    },
    enabled: open && !!profile?.organization_id,
  });

  // Carrega o estado atual da execução na conversa
  const { data: currentExecution, isLoading: isLoadingExecution } = useQuery({
    queryKey: ['conversation-execution', conversationId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('webchat_conversations')
        .select('current_flow_id, status, current_block_id, updated_at, flow_source')
        .eq('id', conversationId)
        .single();

      if (error) throw error;
      
      if (!data.current_flow_id) return null;

      // Busca o nome do funil
      const { data: funnel } = await supabase
        .from('capture_funnels')
        .select('name')
        .eq('id', data.current_flow_id)
        .maybeSingle();

      return {
        ...data,
        funnel_name: funnel?.name || 'Funil desconhecido',
      };
    },
    enabled: open,
    refetchInterval: 15000, // 5s -> 15s (audit Cloud Usage)
  });

  const handleSend = async () => {
    if (!selectedFlowId) {
      toast({ title: 'Selecione um funil primeiro', variant: 'destructive' });
      return;
    }
    
    setIsSending(true);
    try {
      console.log("[FUNNEL_TRIGGER_REQUEST]", {
        function_called: 'webchat-inbox-v3',
        action: 'trigger-flow',
        conversation_id: conversationId,
        flow_id: selectedFlowId,
        user_id: user?.id
      });

      const { data, error } = await supabase.functions.invoke('webchat-inbox-v3', {
        body: {
          action: 'trigger-flow',
          conversation_id: conversationId,
          flow_id: selectedFlowId,
          metadata: {
            trigger_type: 'manual_funnel_start',
            user_id: user?.id,
          }
        },
      });

      console.log("[FUNNEL_JOB_INSERT_RESULT]", { success: !error, data, error });

      if (error) {
        const errorDetails = JSON.stringify(error, Object.getOwnPropertyNames(error));
        console.error("[EDGE_FUNCTION_AUTH_ERROR]", { error, details: errorDetails });
        toast({ 
          title: 'Erro de Conexão (Edge Function)', 
          description: error.message || 'Falha na autenticação ou timeout da função.', 
          variant: 'destructive' 
        });
        return;
      }

      if (data?.success === false) {
        console.error("[FUNNEL_RUNNER_RESULT]", { success: false, data });
        toast({ 
          title: 'Erro ao processar funil', 
          description: data.message || 'O servidor retornou um erro interno.', 
          variant: 'destructive' 
        });
        return;
      }

      if (data?.already_running) {
        toast({ title: 'Este funil já está em processamento', description: 'Aguarde o envio das mensagens.' });
      } else {
        toast({ title: 'Funil enfileirado com sucesso!', description: 'As mensagens serão enviadas em instantes.' });
      }

      onOpenChange(false);
      queryClient.invalidateQueries({ queryKey: ['webchat-conversation', conversationId] });
      queryClient.invalidateQueries({ queryKey: ['conversation-execution', conversationId] });
    } catch (err: any) {
      console.error("SEND_FLOW_UNEXPECTED_ERROR", err);
      toast({ 
        title: 'Erro inesperado', 
        description: err.message || 'Falha ao solicitar envio do funil', 
        variant: 'destructive' 
      });
    } finally {
      setIsSending(false);
    }
  };


  const handleStop = async () => {
    setIsStopping(true);
    try {
      const { error } = await supabase.functions.invoke('webchat-inbox-v3', {
        body: {
          action: 'stop-flow',
          conversation_id: conversationId,
          metadata: {
            stop_reason: 'manual',
            user_id: user?.id,
          }
        },
      });


      if (error) throw error;

      toast({ title: 'Funil interrompido com sucesso!' });
      queryClient.invalidateQueries({ queryKey: ['conversation-execution', conversationId] });
      queryClient.invalidateQueries({ queryKey: ['webchat-conversation', conversationId] });
    } catch (err: any) {
      console.error('Error stopping flow:', err);
      toast({ title: 'Erro ao interromper funil', description: err.message, variant: 'destructive' });
    } finally {
      setIsStopping(false);
    }
  };

  const isLoading = isLoadingFlows || isLoadingExecution;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md p-0 overflow-hidden flex flex-col max-h-[90vh]">
        <DialogHeader className="p-6 pb-2">
          <DialogTitle className="flex items-center gap-2 text-xl font-bold">
            <Workflow className="h-6 w-6 text-primary" />
            Gerenciar Funis
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 py-2 space-y-6">
          {/* Status Atual */}
          <div className="bg-muted/40 rounded-xl p-4 border border-border/50">
            <h4 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-3 flex items-center gap-2">
              <History className="h-3 w-3" />
              Execução Atual
            </h4>
            {isLoadingExecution ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Verificando...
              </div>
            ) : currentExecution?.current_flow_id ? (
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground mb-0.5">Funil em execução:</p>
                    <p className="text-sm font-bold truncate text-primary">{currentExecution.funnel_name}</p>
                  </div>
                  <Badge className={cn(
                    "text-[10px] font-bold px-2 py-0.5 uppercase tracking-wider",
                    currentExecution.status === 'bot_active' ? "bg-blue-500" : "bg-zinc-500"
                  )}>
                    {currentExecution.status === 'bot_active' ? 'Running' : currentExecution.status}
                  </Badge>
                </div>
                <div className="flex items-center justify-between pt-2 border-t border-border/30">
                  <span className="text-[10px] text-muted-foreground italic">
                    Última atividade: {currentExecution.updated_at ? format(new Date(currentExecution.updated_at), "HH:mm 'em' dd/MM", { locale: ptBR }) : '-'}
                  </span>
                  <Button 
                    variant="destructive" 
                    size="sm" 
                    className="h-7 text-[10px] font-bold px-3 gap-1.5"
                    onClick={handleStop}
                    disabled={isStopping || isSending}
                  >
                    {isStopping ? <Loader2 className="h-3 w-3 animate-spin" /> : <Square className="h-3 w-3 fill-current" />}
                    PARAR FUNIL
                  </Button>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground py-2 italic font-medium">Nenhum funil em execução.</p>
            )}
          </div>

          {/* Listagem de Funis */}
          <div className="space-y-3 pb-4">
            <h4 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
              <Play className="h-3 w-3" />
              Selecione um Funil para Enviar
            </h4>
            
            {isLoadingFlows ? (
              <div className="flex justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-primary/50" />
              </div>
            ) : flows?.length === 0 ? (
              <div className="text-center py-12 bg-muted/20 rounded-xl border border-dashed">
                <p className="text-sm text-muted-foreground font-medium">Nenhum funil cadastrado.</p>
              </div>
            ) : (
              <RadioGroup value={selectedFlowId || ""} onValueChange={setSelectedFlowId} className="space-y-2">
                {flows?.map((flow) => (
                  <Label
                    key={flow.id}
                    htmlFor={flow.id}
                    className={cn(
                      "flex items-center gap-4 p-4 rounded-xl border cursor-pointer transition-all hover:bg-muted/30",
                      selectedFlowId === flow.id
                        ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                        : "border-border bg-card"
                    )}
                  >
                    <RadioGroupItem value={flow.id} id={flow.id} className="sr-only" />
                    <div className={cn(
                      "h-5 w-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors",
                      selectedFlowId === flow.id ? "border-primary bg-primary" : "border-muted-foreground/30"
                    )}>
                      {selectedFlowId === flow.id && <div className="h-2 w-2 rounded-full bg-white" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <div className="flex items-center gap-2 min-w-0">
                          <p className="text-sm font-bold truncate">{flow.name}</p>
                          {flow.status !== 'active' && (
                            <Badge variant="outline" className={cn(
                              "text-[8px] h-3.5 px-1 uppercase font-bold tracking-tighter",
                              flow.status === 'paused' ? "text-amber-500 border-amber-500/50 bg-amber-500/5" : "text-zinc-500 border-zinc-500/50 bg-zinc-500/5"
                            )}>
                              {flow.status === 'paused' ? 'Pausado' : flow.status}
                            </Badge>
                          )}
                        </div>
                        <span className="text-[10px] text-muted-foreground shrink-0 font-medium">
                          {Array.isArray(flow.flow_blocks) ? `${flow.flow_blocks.length} blocos` : '0 blocos'}
                        </span>
                      </div>
                      {flow.description && (
                        <p className="text-xs text-muted-foreground line-clamp-1 mb-1 font-normal opacity-80">{flow.description}</p>
                      )}
                      <p className="text-[9px] text-muted-foreground font-medium flex items-center gap-1 uppercase tracking-tighter">
                        Criado em: {format(new Date(flow.created_at), "dd 'de' MMMM", { locale: ptBR })}
                      </p>
                    </div>
                  </Label>
                ))}
              </RadioGroup>
            )}
          </div>
        </div>

        <DialogFooter className="p-6 bg-muted/30 border-t gap-3 flex-row items-center justify-between sm:justify-end">
          <Button variant="ghost" onClick={() => onOpenChange(false)} className="font-bold text-xs uppercase tracking-wider h-10 px-6">
            Cancelar
          </Button>
          <Button 
            onClick={handleSend} 
            disabled={!selectedFlowId || isSending || isStopping}
            className="font-bold text-xs uppercase tracking-wider h-10 px-8 gap-2 shadow-lg shadow-primary/20 transition-all active:scale-95"
          >
            {isSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4 fill-current" />}
            ENVIAR FLUXO
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

