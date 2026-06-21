import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
import { Beaker, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface SimulateOutageModalProps {
  isOpen: boolean;
  onClose: () => void;
  connections: any[];
  organizationId?: string;
}

export function SimulateOutageModal({
  isOpen,
  onClose,
  connections,
  organizationId,
}: SimulateOutageModalProps) {
  const [selectedConnectionId, setSelectedConnectionId] = useState<string>('');
  const [newStatus, setNewStatus] = useState<string>('offline');
  const [isSimulating, setIsSimulating] = useState(false);
  const [result, setResult] = useState<any>(null);

  const handleSimulate = async () => {
    if (!selectedConnectionId || !organizationId) {
      toast.error('Selecione uma conexão');
      return;
    }

    setIsSimulating(true);
    setResult(null);

    try {
      const { data, error } = await supabase.functions.invoke('whatsapp-proxy', {
        body: {
          action: 'simulate_connection_status_change',
          connection_id: selectedConnectionId,
          new_status: newStatus,
          organization_id: organizationId,
        },
      });

      if (error) throw error;

      if (data.success) {
        setResult(data);
        toast.success('Simulação executada com sucesso');
      } else {
        setResult({ ...data, failed: true });
        toast.error(data.error || 'Erro ao executar simulação');
      }
    } catch (err: any) {
      console.error('Simulation error:', err);
      toast.error(err.message || 'Erro inesperado na simulação');
    } finally {
      setIsSimulating(false);
    }
  };

  const handleClose = () => {
    setResult(null);
    setSelectedConnectionId('');
    setNewStatus('offline');
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Beaker className="h-5 w-5 text-amber-500" />
            Simular Queda de Conexão
          </DialogTitle>
          <DialogDescription>
            Teste o pipeline de alertas sem afetar as conexões reais.
          </DialogDescription>
        </DialogHeader>

        {!result ? (
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Conexão para Simular Queda</Label>
              <Select
                value={selectedConnectionId}
                onValueChange={setSelectedConnectionId}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione a conexão..." />
                </SelectTrigger>
                <SelectContent>
                  {connections.map((conn) => (
                    <SelectItem key={conn.id} value={conn.id}>
                      {conn.name} {conn.phone ? `(${conn.phone})` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[10px] text-muted-foreground">
                Esta conexão NÃO poderá ser escolhida como remetente do alerta.
              </p>
            </div>

            <div className="space-y-2">
              <Label>Novo Status (Simulado)</Label>
              <Select value={newStatus} onValueChange={setNewStatus}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="offline">offline</SelectItem>
                  <SelectItem value="disconnected">disconnected</SelectItem>
                  <SelectItem value="error">error</SelectItem>
                  <SelectItem value="waiting_qr">waiting_qr</SelectItem>
                  <SelectItem value="logged_out">logged_out</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        ) : (
          <div className="py-4 space-y-4">
            <div className={`p-3 rounded-lg border ${result.failed ? 'bg-destructive/10 border-destructive/30' : 'bg-green-500/10 border-green-500/30'}`}>
              <div className="flex items-center gap-2 mb-2">
                {result.failed ? (
                  <AlertCircle className="h-5 w-5 text-destructive" />
                ) : (
                  <CheckCircle2 className="h-5 w-5 text-green-500" />
                )}
                <span className="font-semibold">
                  {result.failed ? 'Simulação falhou' : 'Simulação concluída'}
                </span>
              </div>
              <ul className="text-sm space-y-1 opacity-90">
                <li><strong>Conexão simulada:</strong> {result.target_connection}</li>
                {!result.failed && <li><strong>Remetente utilizado:</strong> {result.sender_used}</li>}
                <li><strong>Status simulado:</strong> {result.status_simulated}</li>
                <li><strong>Request ID:</strong> {result.request_id}</li>
                {result.admin_phones && (
                  <li><strong>Destinatários:</strong> {result.admin_phones.join(', ')}</li>
                )}
                {result.error && (
                  <li className="text-destructive font-medium mt-2">Erro: {result.error}</li>
                )}
              </ul>
            </div>
          </div>
        )}

        <DialogFooter>
          {!result ? (
            <>
              <Button variant="outline" onClick={handleClose} disabled={isSimulating}>
                Cancelar
              </Button>
              <Button
                onClick={handleSimulate}
                disabled={isSimulating || !selectedConnectionId}
                className="bg-amber-600 hover:bg-amber-700 text-white"
              >
                {isSimulating ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Simulando...
                  </>
                ) : (
                  'Executar Simulação'
                )}
              </Button>
            </>
          ) : (
            <Button onClick={handleClose}>Fechar</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
