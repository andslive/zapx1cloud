import { usePaymentsSummary, type PaymentProvider } from '@/hooks/useCaktoOrders';
import type { CaktoScope } from '@/hooks/useCaktoCredentials';
import { Card, CardContent } from '@/components/ui/card';
import { DollarSign, CheckCircle2, Clock, RotateCcw, TrendingUp } from 'lucide-react';

interface Props {
  scope: CaktoScope;
  provider?: PaymentProvider | 'all';
}

export function CaktoSummaryCards({ scope, provider = 'all' }: Props) {
  const { data: summary } = usePaymentsSummary(scope, provider);
  const fmtBRL = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

  const items = [
    { icon: DollarSign, label: 'Receita total (pago)', value: fmtBRL(summary?.totalRevenue ?? 0), color: 'text-emerald-600 bg-emerald-500/10' },
    { icon: CheckCircle2, label: 'Vendas pagas', value: String(summary?.paidCount ?? 0), color: 'text-blue-600 bg-blue-500/10' },
    { icon: Clock, label: 'Pendentes', value: String(summary?.pendingCount ?? 0), color: 'text-amber-600 bg-amber-500/10' },
    { icon: RotateCcw, label: 'Reembolsadas', value: String(summary?.refundedCount ?? 0), color: 'text-rose-600 bg-rose-500/10' },
    { icon: TrendingUp, label: 'Ticket médio', value: fmtBRL(summary?.ticketAvg ?? 0), color: 'text-violet-600 bg-violet-500/10' },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
      {items.map((it) => (
        <Card key={it.label}>
          <CardContent className="p-4">
            <div className={`h-9 w-9 rounded-lg flex items-center justify-center ${it.color}`}>
              <it.icon className="h-4 w-4" />
            </div>
            <div className="mt-3 text-xl font-semibold">{it.value}</div>
            <div className="text-xs text-muted-foreground">{it.label}</div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
