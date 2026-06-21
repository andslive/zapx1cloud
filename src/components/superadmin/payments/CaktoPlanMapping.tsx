import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { Loader2, Save } from 'lucide-react';

interface Plan {
  id: string;
  name: string;
  slug: string;
  price_monthly: number | null;
  cakto_product_id: string | null;
  checkout_url_cakto: string | null;
}

export function CaktoPlanMapping() {
  const qc = useQueryClient();
  const { data: plans, isLoading } = useQuery({
    queryKey: ['platform-plans-cakto'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('platform_plans')
        .select('id,name,slug,price_monthly,cakto_product_id,checkout_url_cakto')
        .order('display_order', { ascending: true });
      if (error) throw error;
      return (data as unknown as Plan[]) ?? [];
    },
  });

  const [edits, setEdits] = useState<Record<string, { product?: string; url?: string }>>({});
  const [savingId, setSavingId] = useState<string | null>(null);

  useEffect(() => {
    if (plans) {
      const init: Record<string, { product?: string; url?: string }> = {};
      plans.forEach((p) => {
        init[p.id] = { product: p.cakto_product_id ?? '', url: p.checkout_url_cakto ?? '' };
      });
      setEdits(init);
    }
  }, [plans]);

  const handleSave = async (planId: string) => {
    const e = edits[planId];
    setSavingId(planId);
    try {
      const { error } = await supabase
        .from('platform_plans')
        .update({
          cakto_product_id: e.product || null,
          checkout_url_cakto: e.url || null,
        } as any)
        .eq('id', planId);
      if (error) throw error;
      toast.success('Plano atualizado');
      qc.invalidateQueries({ queryKey: ['platform-plans-cakto'] });
    } catch (err: any) {
      toast.error(err.message ?? 'Erro');
    } finally {
      setSavingId(null);
    }
  };

  if (isLoading) {
    return <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Carregando planos…</div>;
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Vínculo dos planos com produtos Cakto</CardTitle>
          <CardDescription>
            Para cada plano da plataforma, informe o ID do produto Cakto correspondente e a URL de checkout. Assim conseguimos identificar automaticamente qual plano cada empresa pagou.
          </CardDescription>
        </CardHeader>
      </Card>

      <div className="grid gap-3">
        {plans?.map((plan) => {
          const e = edits[plan.id] ?? {};
          return (
            <Card key={plan.id}>
              <CardContent className="pt-6">
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div>
                    <div className="font-semibold">{plan.name}</div>
                    <div className="text-xs text-muted-foreground">{plan.slug} {plan.price_monthly ? `· R$ ${plan.price_monthly}` : ''}</div>
                  </div>
                </div>
                <div className="grid sm:grid-cols-2 gap-3">
                  <div>
                    <Label>ID do produto Cakto</Label>
                    <Input
                      value={e.product ?? ''}
                      onChange={(ev) => setEdits((p) => ({ ...p, [plan.id]: { ...p[plan.id], product: ev.target.value } }))}
                      placeholder="ex: 10bb51bb-03be-..."
                    />
                  </div>
                  <div>
                    <Label>URL de checkout</Label>
                    <Input
                      value={e.url ?? ''}
                      onChange={(ev) => setEdits((p) => ({ ...p, [plan.id]: { ...p[plan.id], url: ev.target.value } }))}
                      placeholder="https://pay.cakto.com.br/..."
                    />
                  </div>
                </div>
                <div className="flex justify-end mt-3">
                  <Button size="sm" onClick={() => handleSave(plan.id)} disabled={savingId === plan.id}>
                    {savingId === plan.id ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                    Salvar
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
