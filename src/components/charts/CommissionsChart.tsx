import { useMemo } from 'react';
import { AreaChart, Area, XAxis, YAxis, ResponsiveContainer, Tooltip, CartesianGrid } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DollarSign } from 'lucide-react';
import { format, subMonths, startOfMonth, endOfMonth } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface Commission {
  id: string;
  amount: number;
  created_at: string | null;
  status: string | null;
}

interface CommissionsChartProps {
  commissions: Commission[];
  isLoading?: boolean;
}

export function CommissionsChart({ commissions, isLoading }: CommissionsChartProps) {
  const chartData = useMemo(() => {
    const months: { month: string; date: Date; pending: number; approved: number; paid: number }[] = [];
    
    // Last 6 months
    for (let i = 5; i >= 0; i--) {
      const date = subMonths(new Date(), i);
      months.push({
        month: format(date, 'MMM', { locale: ptBR }),
        date,
        pending: 0,
        approved: 0,
        paid: 0,
      });
    }

    commissions.forEach(commission => {
      if (!commission.created_at) return;
      
      const commissionDate = new Date(commission.created_at);
      const monthIndex = months.findIndex(m => 
        commissionDate >= startOfMonth(m.date) && 
        commissionDate <= endOfMonth(m.date)
      );

      if (monthIndex !== -1) {
        if (commission.status === 'pending') {
          months[monthIndex].pending += commission.amount;
        } else if (commission.status === 'approved') {
          months[monthIndex].approved += commission.amount;
        } else if (commission.status === 'paid') {
          months[monthIndex].paid += commission.amount;
        }
      }
    });

    return months.map(m => ({
      name: m.month.charAt(0).toUpperCase() + m.month.slice(1),
      pending: m.pending,
      approved: m.approved,
      paid: m.paid,
      total: m.pending + m.approved + m.paid,
    }));
  }, [commissions]);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-popover border border-border rounded-lg p-3 shadow-lg">
          <p className="font-medium text-foreground mb-2">{label}</p>
          {payload.map((entry: any, index: number) => (
            <p key={index} className="text-sm" style={{ color: entry.color }}>
              {entry.name}: {formatCurrency(entry.value)}
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  if (isLoading) {
    return (
      <Card className="bg-card">
        <CardHeader className="pb-2">
          <CardTitle className="text-lg font-semibold flex items-center gap-2">
            <DollarSign className="h-5 w-5 text-primary" />
            Comissões por Mês
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[280px] flex items-center justify-center">
            <div className="animate-pulse text-muted-foreground">Carregando...</div>
          </div>
        </CardContent>
      </Card>
    );
  }

  const totalCommissions = chartData.reduce((sum, m) => sum + m.total, 0);

  return (
    <Card className="bg-card">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg font-semibold flex items-center gap-2">
            <DollarSign className="h-5 w-5 text-primary" />
            Comissões por Mês
          </CardTitle>
          <span className="text-sm text-muted-foreground">
            Total: <span className="font-medium text-foreground">{formatCurrency(totalCommissions)}</span>
          </span>
        </div>
      </CardHeader>
      <CardContent>
        <div className="h-[280px]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={chartData}
              margin={{ top: 10, right: 10, left: 0, bottom: 10 }}
            >
              <defs>
                <linearGradient id="colorPaid" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(142 71% 45%)" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="hsl(142 71% 45%)" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="colorApproved" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(173 80% 45%)" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="hsl(173 80% 45%)" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="colorPending" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(38 92% 50%)" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="hsl(38 92% 50%)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
              <XAxis 
                dataKey="name" 
                axisLine={false}
                tickLine={false}
                tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
              />
              <YAxis 
                axisLine={false}
                tickLine={false}
                tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }}
                tickFormatter={(value) => value >= 1000 ? `${value / 1000}k` : value}
              />
              <Tooltip content={<CustomTooltip />} />
              <Area
                type="monotone"
                dataKey="paid"
                name="Pago"
                stackId="1"
                stroke="hsl(142 71% 45%)"
                fill="url(#colorPaid)"
                strokeWidth={2}
              />
              <Area
                type="monotone"
                dataKey="approved"
                name="Aprovado"
                stackId="1"
                stroke="hsl(173 80% 45%)"
                fill="url(#colorApproved)"
                strokeWidth={2}
              />
              <Area
                type="monotone"
                dataKey="pending"
                name="Pendente"
                stackId="1"
                stroke="hsl(38 92% 50%)"
                fill="url(#colorPending)"
                strokeWidth={2}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        
        {/* Legend */}
        <div className="mt-4 flex justify-center gap-6">
          <div className="flex items-center gap-2">
            <div className="h-3 w-3 rounded-full bg-[hsl(142_71%_45%)]" />
            <span className="text-xs text-muted-foreground">Pago</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-3 w-3 rounded-full bg-[hsl(173_80%_45%)]" />
            <span className="text-xs text-muted-foreground">Aprovado</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-3 w-3 rounded-full bg-[hsl(38_92%_50%)]" />
            <span className="text-xs text-muted-foreground">Pendente</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
