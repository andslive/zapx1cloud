import { useState, useEffect } from 'react';
import { Loader2, CreditCard, Link as LinkIcon } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface PaymentLinkDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conversationId?: string | null;
  leadId?: string | null;
  onSend: (text: string) => void;
}

function formatMoney(value: number, currency = 'BRL') {
  try {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency }).format(value);
  } catch {
    return `R$ ${value.toFixed(2)}`;
  }
}

export function PaymentLinkDialog({
  open, onOpenChange, conversationId, leadId, onSend,
}: PaymentLinkDialogProps) {
  const { user, profile } = useAuth();
  const { toast } = useToast();
  const [title, setTitle] = useState('');
  const [amountStr, setAmountStr] = useState('');
  const [url, setUrl] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setTitle('');
      setAmountStr('');
      setUrl('');
      setDescription('');
    }
  }, [open]);

  const isValidUrl = (s: string) => {
    try { new URL(s); return true; } catch { return false; }
  };

  const amount = parseFloat(amountStr.replace(',', '.'));
  const canSubmit = title.trim().length > 0 && url.trim().length > 0 && isValidUrl(url) && !isNaN(amount) && amount >= 0;

  const handleSubmit = async () => {
    if (!profile?.organization_id || !user?.id || !canSubmit) return;
    setSaving(true);
    try {
      const { error } = await supabase.from('payment_links').insert({
        organization_id: profile.organization_id,
        created_by: user.id,
        conversation_id: conversationId || null,
        lead_id: leadId || null,
        title: title.trim(),
        description: description.trim() || null,
        amount,
        currency: 'BRL',
        url: url.trim(),
      });
      if (error) throw error;

      const lines = [
        `💳 *${title.trim()}*`,
        formatMoney(amount),
      ];
      if (description.trim()) lines.push('', description.trim());
      lines.push('', `🔗 ${url.trim()}`);
      onSend(lines.join('\n'));

      toast({ title: 'Link de pagamento enviado' });
      onOpenChange(false);
    } catch (e: any) {
      toast({ title: 'Erro ao enviar', description: e.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5 text-primary" />
            Enviar link de pagamento
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Descrição do pagamento *</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Plano Premium • Mensalidade"
              maxLength={120}
              autoFocus
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Valor (R$) *</Label>
              <Input
                value={amountStr}
                onChange={(e) => setAmountStr(e.target.value.replace(/[^\d.,]/g, ''))}
                placeholder="297,00"
                inputMode="decimal"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-muted-foreground">Moeda</Label>
              <Input value="BRL" disabled />
            </div>
          </div>

          <div className="space-y-2">
            <Label className="flex items-center gap-1">
              <LinkIcon className="h-3.5 w-3.5" /> URL do pagamento *
            </Label>
            <Input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://pay.cakto.com.br/..."
              type="url"
            />
            <p className="text-[11px] text-muted-foreground">
              Cole o link gerado no Cakto, Stripe, Mercado Pago, Pix QR ou qualquer gateway.
            </p>
          </div>

          <div className="space-y-2">
            <Label>Observação (opcional)</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Pagamento via Pix com 5% de desconto à vista"
              rows={2}
              maxLength={300}
            />
          </div>

          {canSubmit && (
            <div className="rounded-lg border bg-muted/40 p-3 text-xs">
              <p className="text-muted-foreground mb-1 font-medium">Pré-visualização</p>
              <p className="whitespace-pre-wrap font-mono text-[11px]">
                {`💳 *${title.trim()}*\n${formatMoney(amount)}${description.trim() ? `\n\n${description.trim()}` : ''}\n\n🔗 ${url.trim()}`}
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={!canSubmit || saving}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Enviar no chat
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
