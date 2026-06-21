import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { DollarSign, ShoppingCart, Clock, RotateCcw, TrendingUp, Loader2 } from 'lucide-react';

interface Props {
  productId: string;
  organizationId: string;
}

type RolePerf = { role: string; paid_count: number; revenue: number };
type ProductPerf = {
  product_id: string | null;
  product_name: string | null;
  paid_count: number;
  pending_count: number;
  refunded_count: number;
  revenue: number;
  avg_ticket: number;
  roles: RolePerf[] | null;
};

const ROLE_LABEL: Record<string, string> = {
  main: 'Principal',
  front_end: 'Front-end',
  order_bump: 'Order Bump',
  upsell: 'Upsell',
  downsell: 'Downsell',
  cross_sell: 'Cross-sell',
  unmapped: 'Não mapeado',
};

const fmt = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);

export function ProductCaktoPerformance({ productId, organizationId }: Props) {
  const [data, setData] = useState<ProductPerf | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancel = false;
    async function load() {
      setLoading(true);
      const { data: result, error } = await supabase.rpc('get_product_performance', {
        p_org_id: organizationId,
        p_from: null,
        p_to: null,
      });
      if (cancel) return;
      if (error || !result) {
        setData(null);
      } else {
        const products = (result as any).products as ProductPerf[];
        setData(products.find((p) => p.product_id === productId) ?? null);
      }
      setLoading(false);
    }
    if (organizationId && productId) void load();
    return () => {
      cancel = true;
    };
  }, [productId, organizationId]);

  if (loading) {
    return (
      <Card>
        <CardContent className="py-8 flex items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (!data || data.paid_count + data.pending_count + data.refunded_count === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <DollarSign className="h-4 w-4" /> Performance Cakto
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Nenhuma venda Cakto vinculada a este produto ainda. Vincule as ofertas em{' '}
            <span className="font-medium">Integrações → Cakto → Mapear ofertas</span>.
          </p>
        </CardContent>
      </Card>
    );
  }

  const stats = [
    { label: 'Receita', value: fmt(data.revenue), icon: DollarSign, color: 'text-emerald-500', bg: 'bg-emerald-500/10' },
    { label: 'Vendas pagas', value: data.paid_count.toString(), icon: ShoppingCart, color: 'text-blue-500', bg: 'bg-blue-500/10' },
    { label: 'Pendentes', value: data.pending_count.toString(), icon: Clock, color: 'text-amber-500', bg: 'bg-amber-500/10' },
    { label: 'Reembolsadas', value: data.refunded_count.toString(), icon: RotateCcw, color: 'text-rose-500', bg: 'bg-rose-500/10' },
    { label: 'Ticket médio', value: fmt(data.avg_ticket), icon: TrendingUp, color: 'text-violet-500', bg: 'bg-violet-500/10' },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <DollarSign className="h-4 w-4" /> Performance Cakto
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {stats.map((s) => (
            <div key={s.label} className="rounded-lg border border-border p-3">
              <div className={`${s.bg} ${s.color} w-8 h-8 rounded-md flex items-center justify-center mb-2`}>
                <s.icon className="h-4 w-4" />
              </div>
              <div className="text-lg font-semibold">{s.value}</div>
              <div className="text-xs text-muted-foreground">{s.label}</div>
            </div>
          ))}
        </div>

        {data.roles && data.roles.length > 0 && (
          <div>
            <h4 className="text-xs font-medium text-muted-foreground mb-2">Receita por papel da oferta</h4>
            <div className="flex flex-wrap gap-2">
              {data.roles
                .filter((r) => r.paid_count > 0)
                .sort((a, b) => b.revenue - a.revenue)
                .map((r) => (
                  <Badge key={r.role} variant="outline" className="text-xs">
                    {ROLE_LABEL[r.role] ?? r.role}: <span className="ml-1 font-semibold">{fmt(r.revenue)}</span>
                    <span className="ml-1 text-muted-foreground">({r.paid_count})</span>
                  </Badge>
                ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
