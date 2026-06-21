import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { useSectors } from '@/hooks/useSectors';

interface AcceptTicketBarProps {
  /** Aceita o ticket. Recebe o id do setor escolhido (se houver). */
  onAccept: (sectorId?: string) => Promise<void> | void;
  loading?: boolean;
}

/**
 * Barra de aceite exibida no rodapé quando o atendimento está aguardando humano
 * e ainda não tem agente atribuído. Se houver mais de um setor disponível,
 * pede para o agente escolher antes de assumir.
 */
export function AcceptTicketBar({ onAccept, loading }: AcceptTicketBarProps) {
  const { data: sectors = [] } = useSectors();
  const [open, setOpen] = useState(false);
  const [selectedSector, setSelectedSector] = useState<string>('');

  const handleClick = () => {
    if (sectors.length <= 1) {
      onAccept(sectors[0]?.id);
      return;
    }
    setOpen(true);
  };

  const confirm = async () => {
    await onAccept(selectedSector || undefined);
    setOpen(false);
  };

  return (
    <>
      <div className="border-t bg-card p-3">
        <Button
          size="lg"
          className="w-full h-12 text-base font-semibold"
          onClick={handleClick}
          disabled={loading}
        >
          {loading ? (
            <Loader2 className="h-5 w-5 mr-2 animate-spin" />
          ) : (
            <CheckCircle2 className="h-5 w-5 mr-2" />
          )}
          Aceitar Atendimento
        </Button>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Aceitar Atendimento</DialogTitle>
            <DialogDescription>
              Escolha o setor para o qual deseja vincular este atendimento.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2 py-4">
            <Label>Setor</Label>
            <Select value={selectedSector} onValueChange={setSelectedSector}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione um setor" />
              </SelectTrigger>
              <SelectContent>
                {sectors.map((sector: any) => (
                  <SelectItem key={sector.id} value={sector.id}>
                    <span style={{ color: sector.color || undefined }}>{sector.name}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={confirm} disabled={loading || !selectedSector}>
              {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
