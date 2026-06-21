import { useMemo } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Legend } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Target } from 'lucide-react';

interface ConversionData {
  totalLeads: number;
  wonLeads: number;
  lostLeads: number;
  activeLeads: number;
}

interface ConversionRateChartProps {
  data: ConversionData;
  isLoading?: boolean;
}

export function ConversionRateChart({ data, isLoading }: ConversionRateChartProps) {
  const chartData = useMemo(() => {
    const closedDeals = data.wonLeads + data.lostLeads;
    const conversionRate = closedDeals > 0 ? (data.wonLeads / closedDeals) * 100 : 0;

    return {
      pieData: [
        { name: 'Ganhos', value: data.wonLeads, color: 'hsl(142 71% 45%)' },
        { name: 'Perdidos', value: data.lostLeads, color: 'hsl(0 72% 51%)' },
        { name: 'Em Andamento', value: data.activeLeads, color: 'hsl(173 80% 45%)' },
      ].filter(d => d.value > 0),
      conversionRate: Math.round(conversionRate),
      totalLeads: data.totalLeads,
      wonLeads: data.wonLeads,
      lostLeads: data.lostLeads,
      activeLeads: data.activeLeads,
    };
  }, [data]);

  if (isLoading) {
    return (
      <Card className="bg-card">
        <CardHeader className="pb-2">
          <CardTitle className="text-lg font-semibold flex items-center gap-2">
            <Target className="h-5 w-5 text-primary" />
            Taxa de Conversão
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

  if (chartData.totalLeads === 0) {
    return (
      <Card className="bg-card">
        <CardHeader className="pb-2">
          <CardTitle className="text-lg font-semibold flex items-center gap-2">
            <Target className="h-5 w-5 text-primary" />
            Taxa de Conversão
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[280px] flex items-center justify-center text-muted-foreground text-sm">
            Nenhum lead registrado
          </div>
        </CardContent>
      </Card>
    );
  }

  const renderCustomLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent, name }: any) => {
    if (percent < 0.05) return null;
    const RADIAN = Math.PI / 180;
    const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
    const x = cx + radius * Math.cos(-midAngle * RADIAN);
    const y = cy + radius * Math.sin(-midAngle * RADIAN);

    return (
      <text
        x={x}
        y={y}
        fill="white"
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={12}
        fontWeight={600}
      >
        {`${(percent * 100).toFixed(0)}%`}
      </text>
    );
  };

  return (
    <Card className="bg-card">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg font-semibold flex items-center gap-2">
            <Target className="h-5 w-5 text-primary" />
            Taxa de Conversão
          </CardTitle>
          <div className="text-right">
            <span className="text-2xl font-bold text-foreground">{chartData.conversionRate}%</span>
            <p className="text-xs text-muted-foreground">dos deals fechados</p>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="h-[220px]">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={chartData.pieData}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={renderCustomLabel}
                outerRadius={80}
                innerRadius={40}
                dataKey="value"
                strokeWidth={2}
                stroke="hsl(var(--background))"
              >
                {chartData.pieData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
        </div>
        
        {/* Stats */}
        <div className="mt-4 grid grid-cols-3 gap-2 text-center">
          <div className="bg-[hsl(142_71%_45%/0.1)] rounded-lg p-2">
            <p className="text-lg font-bold text-[hsl(142_71%_45%)]">{chartData.wonLeads}</p>
            <p className="text-xs text-muted-foreground">Ganhos</p>
          </div>
          <div className="bg-[hsl(0_72%_51%/0.1)] rounded-lg p-2">
            <p className="text-lg font-bold text-[hsl(0_72%_51%)]">{chartData.lostLeads}</p>
            <p className="text-xs text-muted-foreground">Perdidos</p>
          </div>
          <div className="bg-[hsl(173_80%_45%/0.1)] rounded-lg p-2">
            <p className="text-lg font-bold text-[hsl(173_80%_45%)]">{chartData.activeLeads}</p>
            <p className="text-xs text-muted-foreground">Ativos</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
