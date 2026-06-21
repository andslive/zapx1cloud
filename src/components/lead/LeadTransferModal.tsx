import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { User, Users, UserX, Loader2 } from 'lucide-react';
import { useTransferLead } from '@/hooks/useLeadTransfer';
import { useTeamMembers } from '@/hooks/useTeam';
import { useSquads } from '@/hooks/useSquads';
import { toast } from 'sonner';

interface LeadTransferModalProps {
  isOpen: boolean;
  onClose: () => void;
  lead: {
    id: string;
    name: string;
    assigned_to?: string | null;
    squad_id?: string | null;
    product_id?: string | null;
    organization_id: string;
  };
  currentAssignee?: {
    id: string;
    full_name: string;
  } | null;
  currentSquad?: {
    id: string;
    name: string;
  } | null;
  onSuccess?: () => void;
}

type TransferType = 'seller' | 'unassigned' | 'squad';

export function LeadTransferModal({
  isOpen,
  onClose,
  lead,
  currentAssignee,
  currentSquad,
  onSuccess
}: LeadTransferModalProps) {
  const [transferType, setTransferType] = useState<TransferType>('seller');
  const [selectedSeller, setSelectedSeller] = useState<string>('');
  const [selectedSquad, setSelectedSquad] = useState<string>(lead.squad_id || '');
  const [reason, setReason] = useState('');

  const { data: teamMembers, isLoading: isLoadingTeam } = useTeamMembers();
  const { data: squads, isLoading: isLoadingSquads } = useSquads();
  const transferLead = useTransferLead();

  const handleTransfer = async () => {
    try {
      let toUserId: string | null = null;
      let toSquadId: string | null = lead.squad_id || null;

      switch (transferType) {
        case 'seller':
          if (!selectedSeller) {
            toast.error('Selecione um vendedor');
            return;
          }
          toUserId = selectedSeller;
          break;
        case 'unassigned':
          toUserId = null;
          break;
        case 'squad':
          if (!selectedSquad) {
            toast.error('Selecione um squad');
            return;
          }
          toUserId = null;
          toSquadId = selectedSquad;
          break;
      }

      await transferLead.mutateAsync({
        leadId: lead.id,
        toUserId,
        toSquadId,
        reason: reason.trim() || undefined
      });

      toast.success('Lead transferido com sucesso');
      onSuccess?.();
    } catch (error) {
      console.error('Error transferring lead:', error);
      toast.error('Erro ao transferir lead');
    }
  };

  const availableSellers = teamMembers?.filter(m => m.id !== lead.assigned_to) || [];

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Transferir Lead: {lead.name}</DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Transfer type */}
          <div className="space-y-3">
            <Label>Tipo de Transferência</Label>
            <RadioGroup
              value={transferType}
              onValueChange={(v) => setTransferType(v as TransferType)}
              className="space-y-2"
            >
              <div className="flex items-center space-x-3 p-3 rounded-lg border border-border hover:bg-muted/50 cursor-pointer">
                <RadioGroupItem value="seller" id="seller" />
                <Label htmlFor="seller" className="flex items-center gap-2 cursor-pointer flex-1">
                  <User className="h-4 w-4 text-primary" />
                  Para outro vendedor
                </Label>
              </div>
              
              <div className="flex items-center space-x-3 p-3 rounded-lg border border-border hover:bg-muted/50 cursor-pointer">
                <RadioGroupItem value="unassigned" id="unassigned" />
                <Label htmlFor="unassigned" className="flex items-center gap-2 cursor-pointer flex-1">
                  <UserX className="h-4 w-4 text-amber-500" />
                  Deixar sem atendimento
                </Label>
              </div>
              
              <div className="flex items-center space-x-3 p-3 rounded-lg border border-border hover:bg-muted/50 cursor-pointer">
                <RadioGroupItem value="squad" id="squad" />
                <Label htmlFor="squad" className="flex items-center gap-2 cursor-pointer flex-1">
                  <Users className="h-4 w-4 text-blue-500" />
                  Transferir para outro Squad
                </Label>
              </div>
            </RadioGroup>
          </div>

          {/* Seller selection */}
          {transferType === 'seller' && (
            <div className="space-y-2">
              <Label>Vendedor destino</Label>
              <Select value={selectedSeller} onValueChange={setSelectedSeller}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione um vendedor" />
                </SelectTrigger>
                <SelectContent>
                  {isLoadingTeam ? (
                    <div className="flex justify-center py-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                    </div>
                  ) : (
                    availableSellers.map((member) => (
                      <SelectItem key={member.id} value={member.id}>
                        <div className="flex items-center gap-2">
                          <Avatar className="h-6 w-6">
                            <AvatarImage src={member.avatar_url || undefined} />
                            <AvatarFallback className="text-xs">
                              {member.full_name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                            </AvatarFallback>
                          </Avatar>
                          <span>{member.full_name}</span>
                        </div>
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Squad selection */}
          {transferType === 'squad' && (
            <div className="space-y-2">
              <Label>Squad destino</Label>
              <Select value={selectedSquad} onValueChange={setSelectedSquad}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione um squad" />
                </SelectTrigger>
                <SelectContent>
                  {isLoadingSquads ? (
                    <div className="flex justify-center py-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                    </div>
                  ) : (
                    squads?.map((squad) => (
                      <SelectItem key={squad.id} value={squad.id}>
                        <div className="flex items-center gap-2">
                          <div 
                            className="h-3 w-3 rounded-full"
                            style={{ backgroundColor: squad.color || '#888' }}
                          />
                          <span>{squad.name}</span>
                        </div>
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Reason */}
          <div className="space-y-2">
            <Label htmlFor="reason">Motivo da transferência (opcional)</Label>
            <Textarea
              id="reason"
              placeholder="Ex: Especialidade do vendedor destino, redistribuição de carteira..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
            />
          </div>

          {/* Current info */}
          <div className="p-3 bg-muted rounded-lg text-sm">
            <p className="text-muted-foreground">
              <strong>Atual:</strong>{' '}
              {currentAssignee?.full_name || 'Sem atendimento'}
              {currentSquad && ` (${currentSquad.name})`}
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-2 pt-4 border-t border-border">
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button 
            onClick={handleTransfer}
            disabled={transferLead.isPending}
          >
            {transferLead.isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Transferindo...
              </>
            ) : (
              'Transferir'
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
