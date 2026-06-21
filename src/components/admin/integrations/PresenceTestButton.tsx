import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Activity } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface Props {
  instanceId: string;
  instanceName: string;
}

export function PresenceTestButton({ instanceId, instanceName }: Props) {
  const [open, setOpen] = useState(false);
  const [phone, setPhone] = useState('');
  const [isAudio, setIsAudio] = useState(false);
  const [duration, setDuration] = useState(6);
  const [loading, setLoading] = useState(false);

  const run = async () => {
    const digits = phone.replace(/\D/g, '');
    if (digits.length < 10) {
      toast.error('Informe um número válido com DDD (e DDI 55 se possível).');
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('presence-test', {
        body: {
          instance_id: instanceId,
          phone: digits,
          state: isAudio ? 'recording' : 'composing',
          duration_ms: duration * 1000,
        },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      toast.success(
        isAudio
          ? `Disparado "gravando áudio..." por ${duration}s. Confira o celular.`
          : `Disparado "digitando..." por ${duration}s. Confira o celular.`,
      );
      setOpen(false);
    } catch (e: any) {
      toast.error(`Falha no teste: ${e?.message || String(e)}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        onClick={() => setOpen(true)}
        title='Testar "digitando..." real no WhatsApp'
      >
        <Activity className="h-4 w-4 mr-2" />
        Testar presença
      </Button>

      <Dialog open={open} onOpenChange={(o) => !o && setOpen(false)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Testar presença · {instanceName}</DialogTitle>
            <DialogDescription>
              Dispara o status no WhatsApp do número informado, sem enviar mensagem alguma. Você
              deve ver "digitando..." (ou "gravando áudio...") aparecer no celular dentro de
              poucos segundos.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Número de teste</Label>
              <Input
                placeholder="55 11 9XXXX-XXXX"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Inclua o DDI 55 (Brasil). Ex: 5511999998888.
              </p>
            </div>

            <div className="flex items-center justify-between rounded-md border p-3">
              <div>
                <p className="text-sm font-medium">Tipo</p>
                <p className="text-xs text-muted-foreground">
                  {isAudio ? '"gravando áudio..."' : '"digitando..."'}
                </p>
              </div>
              <Button
                type="button"
                size="sm"
                variant={isAudio ? 'default' : 'outline'}
                onClick={() => setIsAudio((v) => !v)}
              >
                {isAudio ? 'Áudio' : 'Texto'}
              </Button>
            </div>

            <div className="space-y-2">
              <Label>Duração (segundos)</Label>
              <Input
                type="number"
                min={2}
                max={20}
                value={duration}
                onChange={(e) => setDuration(Number(e.target.value) || 6)}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={loading}>
              Cancelar
            </Button>
            <Button onClick={run} disabled={loading}>
              {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Disparar agora
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
