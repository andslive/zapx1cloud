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
import { Loader2, Clock } from 'lucide-react';
import { format, addHours } from 'date-fns';

interface ScheduleMessageDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conversationId: string;
}

export function ScheduleMessageDialog({
  open,
  onOpenChange,
  conversationId,
}: ScheduleMessageDialogProps) {
  const { user, profile } = useAuth();
  const { toast } = useToast();
  const [content, setContent] = useState('');
  const [scheduledAt, setScheduledAt] = useState(
    format(addHours(new Date(), 1), "yyyy-MM-dd'T'HH:mm")
  );
  const [isSaving, setIsSaving] = useState(false);

  const handleSubmit = async () => {
    if (!content.trim() || !user?.id || !profile?.organization_id) return;

    setIsSaving(true);
    try {
      const { error } = await supabase.from('scheduled_messages' as any).insert({
        conversation_id: conversationId,
        content: content.trim(),
        scheduled_at: new Date(scheduledAt).toISOString(),
        created_by: user.id,
        organization_id: profile.organization_id,
        status: 'pending',
      });

      if (error) throw error;

      toast({ title: 'Mensagem agendada!', description: `Será enviada em ${format(new Date(scheduledAt), "dd/MM 'às' HH:mm")}` });
      setContent('');
      onOpenChange(false);
    } catch {
      toast({ title: 'Erro ao agendar mensagem', variant: 'destructive' });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Agendar Mensagem
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label htmlFor="msg-content">Mensagem</Label>
            <Textarea
              id="msg-content"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Digite a mensagem a ser enviada..."
              rows={4}
            />
          </div>
          <div>
            <Label htmlFor="msg-schedule">Data e Hora</Label>
            <Input
              id="msg-schedule"
              type="datetime-local"
              value={scheduledAt}
              onChange={(e) => setScheduledAt(e.target.value)}
              min={format(new Date(), "yyyy-MM-dd'T'HH:mm")}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={!content.trim() || isSaving}>
            {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Agendar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
