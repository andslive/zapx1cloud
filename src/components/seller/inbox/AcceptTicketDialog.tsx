import { useState, useEffect } from 'react';
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
import { Loader2, ShieldCheck } from 'lucide-react';
import { useUserSectors } from '@/hooks/useUserSectors';
import { useAcceptConversation } from '@/hooks/useAcceptConversation';
import { useToast } from '@/hooks/use-toast';

interface AcceptTicketDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conversationId: string | null;
  /** If conversation already has a sector, suggest it. */
  defaultSectorId?: string | null;
  /** Force takeover: admin assuming someone else's conversation. */
  isTakeover?: boolean;
  previousAssigneeName?: string | null;
  onAccepted?: () => void;
}

export function AcceptTicketDialog({
  open,
  onOpenChange,
  conversationId,
  defaultSectorId,
  isTakeover = false,
  previousAssigneeName,
  onAccepted,
}: AcceptTicketDialogProps) {
  const { data: sectors = [], isLoading: loadingSectors } = useUserSectors();
  const acceptMutation = useAcceptConversation();
  const { toast } = useToast();
  const [sectorId, setSectorId] = useState<string>('');

  useEffect(() => {
    if (open) {
      setSectorId(defaultSectorId || '');
    }
  }, [open, defaultSectorId]);

  const handleConfirm = async () => {
    if (!conversationId || !sectorId) return;
    try {
      await acceptMutation.mutateAsync({
        conversation_id: conversationId,
        sector_id: sectorId,
        force: isTakeover,
      });
      toast({
        title: isTakeover ? 'Atendimento assumido' : 'Atendimento aceito',
        description: isTakeover
          ? 'Você é o agente responsável agora.'
          : 'A conversa está em sua fila.',
      });
      onAccepted?.();
      onOpenChange(false);
    } catch (e: any) {
      toast({
        title: 'Erro ao aceitar',
        description: e?.message || 'Tente novamente.',
        variant: 'destructive',
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isTakeover ? <ShieldCheck className="h-5 w-5 text-amber-500" /> : null}
            {isTakeover ? 'Assumir atendimento' : 'Aceitar atendimento'}
          </DialogTitle>
          <DialogDescription>
            {isTakeover && previousAssigneeName
              ? `Você está prestes a assumir uma conversa atualmente com ${previousAssigneeName}. Selecione o setor para registrar o atendimento.`
              : 'Escolha o setor responsável por este atendimento. Ele será vinculado à conversa.'}
          </DialogDescription>
        </DialogHeader>

        <div className="py-2">
          <label className="text-sm font-medium mb-2 block">Setor</label>
          {loadingSectors ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Carregando setores...
            </div>
          ) : sectors.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Você não está associado a nenhum setor. Peça a um administrador para vinculá-lo.
            </p>
          ) : (
            <Select value={sectorId} onValueChange={setSectorId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione um setor" />
              </SelectTrigger>
              <SelectContent>
                {sectors.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    <div className="flex items-center gap-2">
                      <span
                        className="w-2.5 h-2.5 rounded-full"
                        style={{ backgroundColor: s.color || 'hsl(var(--primary))' }}
                      />
                      {s.name}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={!sectorId || acceptMutation.isPending || sectors.length === 0}
          >
            {acceptMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {isTakeover ? 'Assumir conversa' : 'Aceitar atendimento'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
