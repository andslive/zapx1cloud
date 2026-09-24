import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Send } from 'lucide-react';
import { toast } from 'sonner';

// manual_charge_trigger_manual_send ainda não está nos tipos gerados do
// Supabase (RPC nova, migration não aplicada em produção). Em vez de
// `as any` (linter: no-explicit-any), declara a forma real esperada e
// tipa só o necessário via `unknown` -- nunca perde a checagem de tipo
// do resto do arquivo.
interface ManualTriggerRpcResult {
  outcome: string;
  disposition_reason: string | null;
  claim_token: string | null;
}
type ManualTriggerRpcClient = {
  rpc: (
    fn: 'manual_charge_trigger_manual_send',
    args: { p_dispatch_id: string; p_reason: string },
  ) => Promise<{ data: ManualTriggerRpcResult[] | ManualTriggerRpcResult | null; error: { message: string } | null }>;
};

// Mapa de outcome -> mensagem exibida. Nunca reformula a causa real como
// "enviado" -- cada bloqueio mostra exatamente o motivo, nunca um sucesso
// genérico quando o disparo foi recusado por qualquer barreira.
const OUTCOME_LABELS: Record<string, string> = {
  claimed: 'Cobrança reivindicada para envio.',
  already_sending: 'Já existe um envio em andamento para esta cobrança (automático ou manual).',
  not_eligible: 'Não elegível no momento -- revalidado imediatamente antes do envio e bloqueado.',
  not_found: 'Cobrança não encontrada.',
  trigger_disabled: 'Disparo manual ainda não está liberado para esta organização.',
  claim_disabled: 'Envio automático/manual ainda não está ativado globalmente.',
  blocked_min_date: 'Ainda não chegou a data mínima liberada para envio (29/09/2026 09h, horário de Recife).',
  blocked_pause: 'Cobrança pausada.',
  unauthorized: 'Sem permissão para disparar esta cobrança.',
};

interface ManualChargeTriggerButtonProps {
  dispatchId: string;
  leadName: string;
  messagePreview: string;
  connectionName?: string;
  /** Bloqueia o botão (ex.: classificação provisória em revisão). */
  disabled?: boolean;
  onTriggered?: () => void;
}

// Botão "Disparar manual" -- nunca chama o provider diretamente. Delega
// inteiramente a manual_charge_trigger_manual_send (RPC), que reusa o
// MESMO caminho seguro do envio automático (manual_charge_evaluate +
// claim_charge_for_send da Fase A) e fica bloqueada, nesta etapa, por 3
// barreiras independentes (piso de data, flag do botão manual, flag do
// Gate 1 automático) -- ver supabase/migrations/20260923184132_manual_charge_manual_trigger.sql.
export function ManualChargeTriggerButton({
  dispatchId, leadName, messagePreview, connectionName, disabled, onTriggered,
}: ManualChargeTriggerButtonProps) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleConfirm() {
    if (!reason.trim()) {
      toast.error('Informe o motivo do disparo manual.');
      return;
    }
    setSubmitting(true);
    try {
      const client = supabase as unknown as ManualTriggerRpcClient;
      const { data, error } = await client.rpc('manual_charge_trigger_manual_send', {
        p_dispatch_id: dispatchId,
        p_reason: reason.trim(),
      });

      if (error) {
        toast.error(`Falha ao disparar: ${error.message}`);
        return;
      }

      const row = Array.isArray(data) ? data[0] : data;
      const outcome: string = row?.outcome ?? 'unknown';
      const label = OUTCOME_LABELS[outcome] ?? `Resultado: ${outcome}`;

      if (outcome === 'claimed') {
        toast.success(label);
      } else {
        // Nunca um toast de sucesso para um bloqueio -- mesmo que o botão
        // tenha "funcionado" (a chamada não deu erro técnico), o disparo
        // real não aconteceu.
        toast.warning(label);
      }

      setOpen(false);
      setReason('');
      onTriggered?.();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        disabled={disabled}
        title={disabled ? "Em revisão: classificação provisória, envio bloqueado" : undefined}
        className="gap-1.5"
      >
        <Send className="h-3.5 w-3.5" />
        Disparar manual
      </Button>

      <AlertDialog open={open} onOpenChange={(v) => { if (!submitting) setOpen(v); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar disparo manual</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-sm text-foreground">
                <p>
                  Este disparo <strong>conta como a tentativa desta ocasião</strong> e
                  invalida automaticamente uma tentativa automática pendente para a
                  mesma cobrança -- as duas disputam a mesma exclusividade, nunca duas
                  são enviadas.
                </p>
                <div className="rounded-md border bg-muted/40 p-3 space-y-1">
                  <div><span className="text-muted-foreground">Lead:</span> {leadName}</div>
                  {connectionName && (
                    <div><span className="text-muted-foreground">Conexão:</span> {connectionName}</div>
                  )}
                  <div>
                    <span className="text-muted-foreground">Mensagem que embasa a cobrança:</span>
                    <p className="mt-1 italic">"{messagePreview}"</p>
                  </div>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">
                    Motivo do disparo manual (obrigatório, fica registrado na auditoria)
                  </label>
                  <Textarea
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="Ex.: cliente pediu para reenviar agora por telefone"
                    rows={3}
                  />
                </div>
                <Badge variant="outline" className="text-xs">
                  Sujeito a: pausa, data mínima, elegibilidade, pagamento, recusa e limites -- revalidados no servidor imediatamente antes do envio.
                </Badge>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={submitting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); handleConfirm(); }}
              disabled={submitting || !reason.trim()}
            >
              {submitting ? 'Disparando...' : 'Confirmar disparo'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
