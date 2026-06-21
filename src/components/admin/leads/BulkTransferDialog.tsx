import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Loader2, ArrowRightLeft, Users, UserCircle } from 'lucide-react';

interface BulkTransferDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedCount: number;
  onTransfer: (data: { assignedTo: string | null; squadId: string | null; reason?: string }) => void;
  isLoading?: boolean;
  teamMembers: { id: string; full_name: string }[];
  squads: { id: string; name: string }[];
}

export function BulkTransferDialog({
  open,
  onOpenChange,
  selectedCount,
  onTransfer,
  isLoading,
  teamMembers,
  squads,
}: BulkTransferDialogProps) {
  const [assignedTo, setAssignedTo] = useState<string>('');
  const [squadId, setSquadId] = useState<string>('');
  const [reason, setReason] = useState('');

  const handleSubmit = () => {
    onTransfer({
      assignedTo: assignedTo || null,
      squadId: squadId || null,
      reason: reason || undefined,
    });
    setAssignedTo('');
    setSquadId('');
    setReason('');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowRightLeft className="h-5 w-5 text-primary" />
            Transferir Leads
          </DialogTitle>
          <DialogDescription>
            Transferir{' '}
            <Badge variant="secondary" className="mx-1">
              {selectedCount} lead{selectedCount > 1 ? 's' : ''}
            </Badge>{' '}
            para outro vendedor ou squad
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <UserCircle className="h-4 w-4" />
              Novo Vendedor
            </Label>
            <Select value={assignedTo} onValueChange={setAssignedTo}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione um vendedor (opcional)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="unassigned">Remover atribuição</SelectItem>
                {teamMembers.map((member) => (
                  <SelectItem key={member.id} value={member.id}>
                    {member.full_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              Novo Squad
            </Label>
            <Select value={squadId} onValueChange={setSquadId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione um squad (opcional)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="unassigned">Remover do squad</SelectItem>
                {squads.map((squad) => (
                  <SelectItem key={squad.id} value={squad.id}>
                    {squad.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Motivo (opcional)</Label>
            <Textarea
              placeholder="Descreva o motivo da transferência..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
            />
          </div>
        </div>

        <div className="flex justify-end gap-3">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isLoading}
          >
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={isLoading}>
            {isLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Transferir
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
