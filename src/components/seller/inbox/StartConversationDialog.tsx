import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
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
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2, Search, MessageCircle, User, Phone } from 'lucide-react';
import { cn } from '@/lib/utils';

interface StartConversationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConversationCreated: (conversationId: string) => void;
}

export function StartConversationDialog({
  open,
  onOpenChange,
  onConversationCreated,
}: StartConversationDialogProps) {
  const { profile } = useAuth();
  const { toast } = useToast();
  const [search, setSearch] = useState('');
  const [phone, setPhone] = useState('');
  const [message, setMessage] = useState('');
  const [selectedLead, setSelectedLead] = useState<any>(null);
  const [isCreating, setIsCreating] = useState(false);

  // Search leads
  const { data: leads = [] } = useQuery({
    queryKey: ['leads-search', search, profile?.organization_id],
    queryFn: async () => {
      if (!search || search.length < 2 || !profile?.organization_id) return [];
      const { data } = await supabase
        .from('leads')
        .select('id, name, phone, email, company')
        .eq('organization_id', profile.organization_id)
        .or(`name.ilike.%${search}%,phone.ilike.%${search}%,email.ilike.%${search}%`)
        .limit(10);
      return data || [];
    },
    enabled: open && search.length >= 2,
  });

  const handleSelectLead = (lead: any) => {
    setSelectedLead(lead);
    if (lead.phone) {
      setPhone(lead.phone);
    }
    setSearch('');
  };

  const handleCreate = async () => {
    const targetPhone = phone.replace(/\D/g, '');
    if (!targetPhone) {
      toast({ title: 'Informe um telefone', variant: 'destructive' });
      return;
    }

    setIsCreating(true);
    try {
      const { data, error } = await supabase.functions.invoke('start-whatsapp-conversation', {
        body: {
          phone: targetPhone,
          lead_id: selectedLead?.id || null,
          lead_name: selectedLead?.name || null,
          initial_message: message || null,
        },
      });

      if (error) throw error;

      toast({
        title: data.is_new ? 'Conversa criada' : 'Conversa encontrada',
        description: data.is_new
          ? 'Nova conversa WhatsApp iniciada.'
          : 'Conversa existente selecionada.',
      });

      onConversationCreated(data.conversation_id);
      handleClose();
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' });
    } finally {
      setIsCreating(false);
    }
  };

  const handleClose = () => {
    setSearch('');
    setPhone('');
    setMessage('');
    setSelectedLead(null);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageCircle className="h-5 w-5 text-primary" />
            Nova Conversa WhatsApp
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Lead search */}
          <div>
            <Label>Buscar Lead (opcional)</Label>
            <div className="relative mt-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Nome, telefone ou email..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            {leads.length > 0 && (
              <ScrollArea className="mt-2 max-h-40 border rounded-md">
                {leads.map((lead) => (
                  <button
                    key={lead.id}
                    onClick={() => handleSelectLead(lead)}
                    className="w-full text-left px-3 py-2 hover:bg-muted/50 flex items-center gap-2 text-sm border-b last:border-0"
                  >
                    <User className="h-4 w-4 text-muted-foreground shrink-0" />
                    <div className="min-w-0">
                      <p className="font-medium truncate">{lead.name}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {lead.phone || lead.email}
                      </p>
                    </div>
                  </button>
                ))}
              </ScrollArea>
            )}
          </div>

          {/* Selected lead badge */}
          {selectedLead && (
            <div className="flex items-center gap-2 p-2 rounded-md bg-primary/10 text-sm">
              <User className="h-4 w-4 text-primary" />
              <span className="font-medium">{selectedLead.name}</span>
              <Button
                variant="ghost"
                size="sm"
                className="ml-auto h-6 px-2 text-xs"
                onClick={() => { setSelectedLead(null); setPhone(''); }}
              >
                Remover
              </Button>
            </div>
          )}

          {/* Phone */}
          <div>
            <Label>Telefone WhatsApp</Label>
            <div className="relative mt-1">
              <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="5511999999999"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>

          {/* Initial message */}
          <div>
            <Label>Primeira mensagem (opcional)</Label>
            <Textarea
              placeholder="Olá! Tudo bem?"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className="mt-1"
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            Cancelar
          </Button>
          <Button onClick={handleCreate} disabled={isCreating || !phone.replace(/\D/g, '')}>
            {isCreating ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Criando...
              </>
            ) : (
              'Iniciar Conversa'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
