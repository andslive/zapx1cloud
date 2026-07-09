import { useState } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { useCreateManualSale, CommercialFilterOption } from '@/hooks/useCommercialDashboard';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  connections: CommercialFilterOption[];
  funnels: CommercialFilterOption[];
}

const todayKey = () => new Date().toISOString().slice(0, 10);

export function NewManualSaleDialog({ open, onOpenChange, connections, funnels }: Props) {
  const createSale = useCreateManualSale();
  const [form, setForm] = useState({
    saleDate: todayKey(),
    connectionId: '',
    leadPhone: '',
    customerName: '',
    funnelId: '',
    offerName: '',
    purchaseValue: '',
    currency: 'BRL',
    sourceLabel: '',
    notes: '',
  });

  const reset = () => setForm({
    saleDate: todayKey(), connectionId: '', leadPhone: '', customerName: '',
    funnelId: '', offerName: '', purchaseValue: '', currency: 'BRL',
    sourceLabel: '', notes: '',
  });

  const handleSubmit = async () => {
    const value = Number(form.purchaseValue.replace(',', '.'));
    if (!Number.isFinite(value) || value < 0) return;
    if (!form.customerName.trim()) return;

    await createSale.mutateAsync({
      saleDate: form.saleDate,
      connectionId: form.connectionId || undefined,
      leadPhone: form.leadPhone || undefined,
      customerName: form.customerName,
      funnelId: form.funnelId || undefined,
      offerName: form.offerName || undefined,
      purchaseValue: value,
      currency: form.currency,
      sourceLabel: form.sourceLabel || undefined,
      notes: form.notes || undefined,
    });
    reset();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Nova venda manual</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3 py-2">
          <div className="space-y-1.5">
            <Label>Data</Label>
            <Input type="date" value={form.saleDate} onChange={(e) => setForm((f) => ({ ...f, saleDate: e.target.value }))} />
          </div>
          <div className="space-y-1.5">
            <Label>Instância</Label>
            <Select value={form.connectionId} onValueChange={(v) => setForm((f) => ({ ...f, connectionId: v }))}>
              <SelectTrigger><SelectValue placeholder="Selecionar" /></SelectTrigger>
              <SelectContent>
                {connections.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Número do lead</Label>
            <Input value={form.leadPhone} onChange={(e) => setForm((f) => ({ ...f, leadPhone: e.target.value }))} placeholder="55DDNNNNNNNNN" />
          </div>
          <div className="space-y-1.5">
            <Label>Cliente *</Label>
            <Input value={form.customerName} onChange={(e) => setForm((f) => ({ ...f, customerName: e.target.value }))} />
          </div>
          <div className="space-y-1.5">
            <Label>Funil/oferta</Label>
            <Select value={form.funnelId} onValueChange={(v) => setForm((f) => ({ ...f, funnelId: v }))}>
              <SelectTrigger><SelectValue placeholder="Selecionar" /></SelectTrigger>
              <SelectContent>
                {funnels.map((f) => (
                  <SelectItem key={f.id} value={f.id}>{f.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Nome da oferta (texto livre)</Label>
            <Input value={form.offerName} onChange={(e) => setForm((f) => ({ ...f, offerName: e.target.value }))} />
          </div>
          <div className="space-y-1.5">
            <Label>Valor *</Label>
            <Input inputMode="decimal" value={form.purchaseValue} onChange={(e) => setForm((f) => ({ ...f, purchaseValue: e.target.value }))} placeholder="0,00" />
          </div>
          <div className="space-y-1.5">
            <Label>Moeda</Label>
            <Input value={form.currency} onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value.toUpperCase() }))} />
          </div>
          <div className="space-y-1.5 col-span-2">
            <Label>Source/origem (opcional)</Label>
            <Input value={form.sourceLabel} onChange={(e) => setForm((f) => ({ ...f, sourceLabel: e.target.value }))} />
          </div>
          <div className="space-y-1.5 col-span-2">
            <Label>Observação (opcional)</Label>
            <Textarea value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} rows={2} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button
            onClick={handleSubmit}
            disabled={createSale.isPending || !form.customerName.trim() || !form.purchaseValue}
          >
            Salvar venda
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
