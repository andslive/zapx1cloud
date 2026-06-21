import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Calendar } from 'lucide-react';
import { format, addDays } from 'date-fns';

interface ScheduleFollowupDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  leadId?: string;
  visitorName?: string;
  conversationId: string;
}

export function ScheduleFollowupDialog({
  open,
  onOpenChange,
  leadId,
  visitorName,
  conversationId,
}: ScheduleFollowupDialogProps) {
  const { user, profile } = useAuth();
  const { toast } = useToast();
  const [note, setNote] = useState('');
  const [dueDate, setDueDate] = useState(
    format(addDays(new Date(), 1), "yyyy-MM-dd'T'HH:mm")
  );
  const [isSaving, setIsSaving] = useState(false);

  const handleSubmit = async () => {
    if (!user?.id) return;

    setIsSaving(true);
    try {
      const { error } = await supabase.from('tasks').insert({
        title: `Follow-up: ${visitorName || 'Conversa'}`,
        description: note.trim() || `Follow-up da conversa ${conversationId}`,
        due_date: new Date(dueDate).toISOString(),
        user_id: user.id,
        created_by: user.id,
        lead_id: leadId || null,
        type: 'followup',
        priority: 'medium',
        status: 'pending',
      });

      if (error) throw error;

      toast({ title: 'Follow-up agendado!', description: `Para ${format(new Date(dueDate), "dd/MM 'às' HH:mm")}` });
      setNote('');
      onOpenChange(false);
    } catch {
      toast({ title: 'Erro ao agendar follow-up', variant: 'destructive' });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Agendar Follow-up
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label htmlFor="followup-date">Data e Hora</Label>
            <Input
              id="followup-date"
              type="datetime-local"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              min={format(new Date(), "yyyy-MM-dd'T'HH:mm")}
            />
          </div>
          <div>
            <Label htmlFor="followup-note">Nota (opcional)</Label>
            <Textarea
              id="followup-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Ex: Enviar proposta comercial..."
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={isSaving}>
            {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Agendar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
