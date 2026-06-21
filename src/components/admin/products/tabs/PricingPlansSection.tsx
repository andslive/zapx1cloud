import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { DollarSign, Plus, Pencil, Trash2, Star } from 'lucide-react';

export interface ProductPlan {
  id: string;
  name: string;
  price: number;
  billing_cycle: 'mensal' | 'trimestral' | 'semestral' | 'anual' | 'unico';
  duration: string;
  features: string[];
  recommended: boolean;
  active: boolean;
}

const billingCycleLabels: Record<string, string> = {
  mensal: 'mês',
  trimestral: 'trimestre',
  semestral: 'semestre',
  anual: 'ano',
  unico: 'único',
};

const billingCycleOptions = [
  { value: 'mensal', label: 'Mensal' },
  { value: 'trimestral', label: 'Trimestral' },
  { value: 'semestral', label: 'Semestral' },
  { value: 'anual', label: 'Anual' },
  { value: 'unico', label: 'Pagamento Único' },
];

const emptyPlan: Omit<ProductPlan, 'id'> = {
  name: '',
  price: 0,
  billing_cycle: 'mensal',
  duration: '',
  features: [],
  recommended: false,
  active: true,
};

interface PricingPlansSectionProps {
  plans: ProductPlan[];
  onChange: (plans: ProductPlan[]) => void;
}

export function PricingPlansSection({ plans, onChange }: PricingPlansSectionProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState<ProductPlan | null>(null);
  const [form, setForm] = useState<Omit<ProductPlan, 'id'>>(emptyPlan);
  const [featuresText, setFeaturesText] = useState('');
  const [priceText, setPriceText] = useState('');

  const openAdd = () => {
    setEditingPlan(null);
    setForm(emptyPlan);
    setFeaturesText('');
    setPriceText('');
    setDialogOpen(true);
  };

  const openEdit = (plan: ProductPlan) => {
    setEditingPlan(plan);
    setForm({ ...plan });
    setFeaturesText(plan.features.join('\n'));
    setPriceText(plan.price.toLocaleString('pt-BR', { minimumFractionDigits: 2 }));
    setDialogOpen(true);
  };

  const handleSave = () => {
    const features = featuresText.split('\n').filter(f => f.trim());
    const price = parseFloat(priceText.replace(/[^\d,.-]/g, '').replace(',', '.')) || 0;

    if (!form.name.trim() || price <= 0) return;

    const planData = { ...form, price, features };

    if (editingPlan) {
      onChange(plans.map(p => p.id === editingPlan.id ? { ...planData, id: editingPlan.id } : p));
    } else {
      onChange([...plans, { ...planData, id: crypto.randomUUID() }]);
    }
    setDialogOpen(false);
  };

  const handleDelete = (id: string) => {
    onChange(plans.filter(p => p.id !== id));
  };

  const formatCurrency = (value: number) =>
    value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  return (
    <>
      <Card className="bg-card">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <DollarSign className="h-4 w-4" />
                Planos e Preços
              </CardTitle>
              <CardDescription>Configure os planos disponíveis para este produto</CardDescription>
            </div>
            <Button size="sm" onClick={openAdd}>
              <Plus className="mr-1 h-4 w-4" />
              Adicionar Plano
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {plans.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              Nenhum plano cadastrado. Adicione planos para que os vendedores selecionem ao fechar negócios.
            </p>
          ) : (
            <div className="grid gap-3">
              {plans.map(plan => (
                <div
                  key={plan.id}
                  className={`border rounded-lg p-4 flex items-start justify-between gap-4 ${
                    plan.recommended ? 'border-primary bg-primary/5' : ''
                  } ${!plan.active ? 'opacity-50' : ''}`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium">{plan.name}</span>
                      {plan.recommended && (
                        <Badge variant="default" className="text-xs gap-1">
                          <Star className="h-3 w-3" /> Recomendado
                        </Badge>
                      )}
                      {!plan.active && <Badge variant="secondary" className="text-xs">Inativo</Badge>}
                    </div>
                    <p className="text-lg font-semibold mt-1">
                      {formatCurrency(plan.price)}
                      {plan.billing_cycle !== 'unico' && (
                        <span className="text-sm font-normal text-muted-foreground">
                          /{billingCycleLabels[plan.billing_cycle]}
                        </span>
                      )}
                    </p>
                    {plan.duration && (
                      <p className="text-xs text-muted-foreground">Duração: {plan.duration}</p>
                    )}
                    {plan.features.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {plan.features.map((f, i) => (
                          <Badge key={i} variant="outline" className="text-xs font-normal">{f}</Badge>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(plan)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => handleDelete(plan.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>{editingPlan ? 'Editar Plano' : 'Novo Plano'}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Nome do Plano *</Label>
                <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Ex: Pro" />
              </div>
              <div className="space-y-2">
                <Label>Preço (R$) *</Label>
                <Input value={priceText} onChange={e => setPriceText(e.target.value)} placeholder="297,00" />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Ciclo de Cobrança</Label>
                <Select value={form.billing_cycle} onValueChange={(v: ProductPlan['billing_cycle']) => setForm(f => ({ ...f, billing_cycle: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {billingCycleOptions.map(o => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Duração / Acesso</Label>
                <Input value={form.duration} onChange={e => setForm(f => ({ ...f, duration: e.target.value }))} placeholder="Ex: 12 meses, Vitalício" />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Recursos incluídos (um por linha)</Label>
              <Textarea value={featuresText} onChange={e => setFeaturesText(e.target.value)} rows={3} placeholder={"Recurso 1\nRecurso 2\nRecurso 3"} />
            </div>
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2">
                <Checkbox id="recommended" checked={form.recommended} onCheckedChange={v => setForm(f => ({ ...f, recommended: !!v }))} />
                <Label htmlFor="recommended" className="cursor-pointer">Recomendado</Label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox id="active" checked={form.active} onCheckedChange={v => setForm(f => ({ ...f, active: !!v }))} />
                <Label htmlFor="active" className="cursor-pointer">Ativo</Label>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={!form.name.trim() || !priceText}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
