import { useEffect, useMemo, useState } from 'react';
import { Sparkles, Loader2, Bot, Phone } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useProductAgents, useAllAgents } from '@/hooks/useProductAgents';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';

interface CallWithAIDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lead: {
    id: string;
    name: string;
    phone?: string | null;
    product_id?: string | null;
  };
}

const OBJECTIVE_PRESETS = [
  { value: 'agendar', label: 'Agendar reunião', text: 'Agendar uma reunião com o lead.' },
  { value: 'retomar', label: 'Retomar conversa', text: 'Retomar a conversa de onde parou e dar continuidade ao atendimento.' },
  { value: 'qualificar', label: 'Qualificar (BANT)', text: 'Qualificar o lead usando BANT (orçamento, autoridade, necessidade, prazo).' },
  { value: 'oferta', label: 'Apresentar oferta', text: 'Apresentar a oferta principal e conduzir para o fechamento.' },
  { value: 'recuperar', label: 'Recuperar carrinho', text: 'Recuperar carrinho abandonado e ajudar a finalizar a compra.' },
  { value: 'custom', label: 'Outro (escrever)', text: '' },
];

export function CallWithAIDialog({ open, onOpenChange, lead }: CallWithAIDialogProps) {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const productAgentsQuery = useProductAgents(lead.product_id || '');
  const allAgentsQuery = useAllAgents();

  // Se o lead tem produto, usa agentes do produto; senão fallback p/ todos da org.
  const agents = lead.product_id ? productAgentsQuery.data : allAgentsQuery.data;
  const loadingAgents = lead.product_id ? productAgentsQuery.isLoading : allAgentsQuery.isLoading;

  const [agentId, setAgentId] = useState<string>('');
  const [objectivePreset, setObjectivePreset] = useState<string>('retomar');
  const [customObjective, setCustomObjective] = useState('');
  const [extraContext, setExtraContext] = useState('');
  const [mode, setMode] = useState<'direct' | 'conversational'>('direct');
  const [isSending, setIsSending] = useState(false);

  // Pré-seleciona agente padrão / primeiro ativo
  useEffect(() => {
    if (!agents?.length) return;
    if (agentId && agents.some((a) => a.id === agentId)) return;
    const def = agents.find((a: any) => a.is_default && a.is_active) || agents.find((a: any) => a.is_active) || agents[0];
    if (def) setAgentId(def.id);
  }, [agents, agentId]);

  const formattedPhone = useMemo(() => {
    if (!lead.phone) return '';
    const digits = lead.phone.replace(/\D/g, '');
    if (digits.length >= 12) {
      return `+${digits.slice(0, 2)} (${digits.slice(2, 4)}) ${digits.slice(4, 9)}-${digits.slice(9)}`;
    }
    return lead.phone;
  }, [lead.phone]);

  const initials = lead.name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase();

  const handleSubmit = async () => {
    if (!profile?.organization_id) {
      toast.error('Sessão inválida.');
      return;
    }
    if (!lead.phone) {
      toast.error('Lead sem telefone cadastrado.');
      return;
    }
    if (!agentId) {
      toast.error('Selecione um agente de IA.');
      return;
    }

    const preset = OBJECTIVE_PRESETS.find((p) => p.value === objectivePreset);
    const objective = objectivePreset === 'custom' ? customObjective.trim() : preset?.text || '';

    if (!objective) {
      toast.error('Defina um objetivo para a IA.');
      return;
    }

    setIsSending(true);
    try {
      const { data, error } = await supabase.functions.invoke('manual-outreach', {
        body: {
          lead_ids: [lead.id],
          agent_id: agentId,
          organization_id: profile.organization_id,
          objective,
          extra_context: extraContext.trim() || undefined,
          mode,
        },
      });

      if (error) throw error;

      const result = Array.isArray((data as any)?.results) ? (data as any).results[0] : null;
      if (result?.skipped) {
        toast.info(`IA não disparou: ${result.reason || 'já existe outreach recente'}`);
      } else if (result?.error) {
        toast.error(`Erro: ${result.error}`);
      } else {
        toast.success(`IA iniciou contato com ${lead.name}.`);
      }

      queryClient.invalidateQueries({ queryKey: ['interactions', lead.id] });
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      queryClient.invalidateQueries({ queryKey: ['lead', lead.id] });
      onOpenChange(false);
    } catch (err: any) {
      console.error('[CallWithAI] erro:', err);
      const msg = err?.message || 'Erro ao iniciar atendimento com IA.';
      if (msg.includes('402')) {
        toast.error('Sem créditos de IA. Adicione créditos nas configurações.');
      } else if (msg.includes('429')) {
        toast.error('Muitas requisições. Tente novamente em instantes.');
      } else {
        toast.error(msg);
      }
    } finally {
      setIsSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Chamar com IA
          </DialogTitle>
          <DialogDescription>
            A IA entrará em contato e conduzirá o atendimento de forma autônoma.
          </DialogDescription>
        </DialogHeader>

        {/* Lead info */}
        <div className="flex items-center gap-3 p-3 rounded-lg border border-border bg-muted/30">
          <Avatar className="h-10 w-10">
            <AvatarFallback className="bg-primary/10 text-primary text-sm font-medium">
              {initials}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="font-medium text-sm truncate">{lead.name}</p>
            {formattedPhone && (
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <Phone className="h-3 w-3" />
                {formattedPhone}
              </p>
            )}
          </div>
        </div>

        <div className="space-y-4">
          {/* Agente */}
          <div className="space-y-2">
            <Label>Agente de IA</Label>
            <Select value={agentId} onValueChange={setAgentId} disabled={loadingAgents || !agents?.length}>
              <SelectTrigger>
                <SelectValue placeholder={loadingAgents ? 'Carregando...' : 'Selecione um agente'} />
              </SelectTrigger>
              <SelectContent>
                {agents?.map((a: any) => (
                  <SelectItem key={a.id} value={a.id}>
                    <div className="flex items-center gap-2">
                      <Bot className="h-3.5 w-3.5 text-muted-foreground" />
                      <span>{a.name}</span>
                      {a.agent_type && (
                        <span className="text-xs text-muted-foreground capitalize">· {a.agent_type}</span>
                      )}
                      {a.is_default && (
                        <span className="text-xs text-primary">· padrão</span>
                      )}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {!loadingAgents && !agents?.length && (
              <p className="text-xs text-destructive">
                Nenhum agente de IA configurado{lead.product_id ? ' para este produto' : ''}.
              </p>
            )}
          </div>

          {/* Objetivo */}
          <div className="space-y-2">
            <Label>Objetivo</Label>
            <Select value={objectivePreset} onValueChange={setObjectivePreset}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {OBJECTIVE_PRESETS.map((p) => (
                  <SelectItem key={p.value} value={p.value}>
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {objectivePreset === 'custom' && (
              <Input
                value={customObjective}
                onChange={(e) => setCustomObjective(e.target.value)}
                placeholder="Ex: Convidar para o webinar de quinta-feira."
              />
            )}
          </div>

          {/* Contexto */}
          <div className="space-y-2">
            <Label>Contexto adicional (opcional)</Label>
            <Textarea
              value={extraContext}
              onChange={(e) => setExtraContext(e.target.value)}
              placeholder="Ex: Lead pediu para retornar amanhã sobre plano anual com desconto."
              rows={3}
            />
          </div>

          {/* Modo */}
          <div className="space-y-2">
            <Label>Modo de contato</Label>
            <RadioGroup value={mode} onValueChange={(v) => setMode(v as 'direct' | 'conversational')} className="grid grid-cols-2 gap-2">
              <label className={`flex items-start gap-2 p-3 rounded-lg border cursor-pointer transition-colors ${mode === 'direct' ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50'}`}>
                <RadioGroupItem value="direct" className="mt-0.5" />
                <div>
                  <p className="text-sm font-medium">Direto</p>
                  <p className="text-xs text-muted-foreground">Já dispara a abordagem inicial.</p>
                </div>
              </label>
              <label className={`flex items-start gap-2 p-3 rounded-lg border cursor-pointer transition-colors ${mode === 'conversational' ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50'}`}>
                <RadioGroupItem value="conversational" className="mt-0.5" />
                <div>
                  <p className="text-sm font-medium">Conversacional</p>
                  <p className="text-xs text-muted-foreground">Conduz com perguntas exploratórias.</p>
                </div>
              </label>
            </RadioGroup>
          </div>

          <p className="text-xs text-muted-foreground border-l-2 border-primary/40 pl-3">
            A IA continuará o atendimento e fará follow-ups automáticos respeitando o horário comercial. A conversa aparecerá no Inbox.
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSending}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={isSending || !agentId || !lead.phone} className="gap-2">
            {isSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            Iniciar atendimento com IA
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
