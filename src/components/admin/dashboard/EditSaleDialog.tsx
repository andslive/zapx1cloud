import { useEffect, useState } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useEditSale, SaleHistoryRow } from '@/hooks/useCommercialDashboard';

interface Props {
  sale: SaleHistoryRow | null;
  onOpenChange: (open: boolean) => void;
}

export function EditSaleDialog({ sale, onOpenChange }: Props) {
  const editSale = useEditSale();
  const [customerName, setCustomerName] = useState('');
  const [purchaseValue, setPurchaseValue] = useState('');
  const [offerLabel, setOfferLabel] = useState('');
  const [sourceLabel, setSourceLabel] = useState('');
  const [reason, setReason] = useState('');

  useEffect(() => {
    if (sale) {
      setCustomerName(sale.customerName);
      setPurchaseValue(String(sale.purchaseValue).replace('.', ','));
      setOfferLabel(sale.offerLabel);
      setSourceLabel(sale.sourceLabel === '—' ? '' : sale.sourceLabel);
      setReason('');
    }
  }, [sale]);

  if (!sale) return null;

  const submitField = async (fieldName: 'purchase_value' | 'customer_name' | 'offer_name' | 'source_label', oldValue: string, newValue: string) => {
    if (oldValue === newValue) return;
    await editSale.mutateAsync({
      origin: sale.origin, id: sale.id, fieldName, oldValue, newValue, reason: reason || undefined,
    });
  };

  const handleSave = async () => {
    const parsedValue = Number(purchaseValue.replace(/\./g, '').replace(',', '.'));
    await Promise.all([
      submitField('customer_name', sale.customerName, customerName.trim()),
      Number.isFinite(parsedValue) && parsedValue !== sale.purchaseValue
        ? submitField('purchase_value', String(sale.purchaseValue), String(parsedValue))
        : Promise.resolve(),
      submitField('offer_name', sale.offerLabel, offerLabel.trim()),
      submitField('source_label', sale.sourceLabel === '—' ? '' : sale.sourceLabel, sourceLabel.trim()),
    ]);
    onOpenChange(false);
  };

  return (
    <Dialog open={!!sale} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Editar venda</DialogTitle>
          <DialogDescription>
            {sale.origin === 'automatic'
              ? 'Venda automática: o registro bruto do webhook não é alterado. A correção fica registrada como um ajuste auditável.'
              : 'Venda manual: o valor exibido é atualizado e a alteração fica registrada na auditoria.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div className="space-y-1.5">
            <Label>Cliente</Label>
            <Input value={customerName} onChange={(e) => setCustomerName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Valor</Label>
            <Input inputMode="decimal" value={purchaseValue} onChange={(e) => setPurchaseValue(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Funil/oferta</Label>
            <Input value={offerLabel} onChange={(e) => setOfferLabel(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Source/origem</Label>
            <Input value={sourceLabel} onChange={(e) => setSourceLabel(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Motivo da correção (opcional, fica na auditoria)</Label>
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSave} disabled={editSale.isPending}>Salvar correção</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
