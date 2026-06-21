import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { useCadence, CadenceDay } from '@/hooks/useCadence';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Loader2, CalendarDays } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SendCadenceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  leadId?: string;
  productId?: string;
  conversationId: string;
}

export function SendCadenceDialog({
  open,
  onOpenChange,
  leadId,
  productId,
  conversationId,
}: SendCadenceDialogProps) {
  const { profile } = useAuth();
  const { toast } = useToast();
  const { data: cadenceDays, isLoading } = useCadence(productId);
  const [selectedDay, setSelectedDay] = useState<CadenceDay | null>(null);
  const [isSending, setIsSending] = useState(false);

  const handleSend = async () => {
    if (!leadId || !productId || !profile?.organization_id) {
      toast({ title: 'Lead precisa estar vinculado', variant: 'destructive' });
      return;
    }

    setIsSending(true);
    try {
      const steps = (cadenceDays || []).map((day) => ({
        day: day.day,
        title: day.title,
        blocks: day.blocks,
      }));

      await supabase.from('ai_outreach_queue').insert([{
        lead_id: leadId,
        organization_id: profile.organization_id,
        product_id: productId,
        conversation_id: conversationId,
        status: 'pending',
        followup_enabled: true,
        followup_steps: steps as any,
        followups_sent: selectedDay ? selectedDay.day - 1 : 0,
        max_followups: steps.length,
        next_followup_at: new Date().toISOString(),
      }]);

      toast({ title: `Cadência iniciada no dia ${selectedDay?.day || 1}` });
      onOpenChange(false);
    } catch {
      toast({ title: 'Erro ao iniciar cadência', variant: 'destructive' });
    } finally {
      setIsSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarDays className="h-5 w-5" />
            Enviar Cadência
          </DialogTitle>
        </DialogHeader>

        {!leadId && (
          <p className="text-sm text-destructive">Vincule um lead antes de enviar a cadência.</p>
        )}

        <ScrollArea className="max-h-80">
          {isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : !cadenceDays?.length ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              Nenhuma cadência configurada para este produto.
            </p>
          ) : (
            <div className="space-y-2">
              {cadenceDays.map((day) => (
                <button
                  key={day.id}
                  onClick={() => setSelectedDay(day)}
                  className={cn(
                    "w-full text-left p-3 rounded-lg border transition-colors",
                    selectedDay?.id === day.id
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-primary/50"
                  )}
                >
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="shrink-0">Dia {day.day}</Badge>
                    <span className="text-sm font-medium">{day.title}</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {day.blocks.length} {day.blocks.length === 1 ? 'bloco' : 'blocos'}
                  </p>
                </button>
              ))}
            </div>
          )}
        </ScrollArea>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSend} disabled={!leadId || !cadenceDays?.length || isSending}>
            {isSending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {selectedDay ? `Iniciar do Dia ${selectedDay.day}` : 'Iniciar do Dia 1'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
