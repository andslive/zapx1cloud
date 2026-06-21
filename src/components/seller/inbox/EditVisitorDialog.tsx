import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

interface EditVisitorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conversationId: string;
  visitorName?: string | null;
  visitorEmail?: string | null;
  visitorPhone?: string | null;
}

const safe = (v: string | null | undefined) => (v ?? '').toString();

export function EditVisitorDialog({
  open,
  onOpenChange,
  conversationId,
  visitorName,
  visitorEmail,
  visitorPhone,
}: EditVisitorDialogProps) {
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setName(safe(visitorName));
      setEmail(safe(visitorEmail));
      setPhone(safe(visitorPhone));
    }
  }, [open, visitorName, visitorEmail, visitorPhone]);

  const handleSave = async () => {
    const n = name.trim();
    if (!n) {
      toast.error('Nome é obrigatório');
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase
        .from('webchat_conversations')
        .update({
          visitor_name: n,
          visitor_email: email.trim() || null,
          visitor_phone: phone.trim() || null,
        })
        .eq('id', conversationId);
      if (error) throw error;
      toast.success('Contato atualizado');
      queryClient.invalidateQueries({ queryKey: ['webchat-conversation', conversationId] });
      queryClient.invalidateQueries({ queryKey: ['webchat-conversations'] });
      onOpenChange(false);
    } catch (e: any) {
      console.error('[EditVisitor] erro:', e);
      toast.error(e?.message || 'Erro ao atualizar');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Editar Contato</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Nome *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <Label>Email</Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email@exemplo.com" />
          </div>
          <div>
            <Label>Telefone</Label>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="55 11 99999-9999" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
