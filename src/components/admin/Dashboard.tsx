import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Users,
  DollarSign,
  TrendingUp,
  ShoppingCart,
  Megaphone,
  PiggyBank,
  Gauge,
  Percent,
  Pencil,
  Check,
  X,
  AlertTriangle,
  Plus,
  Download,
  FileSpreadsheet,
} from 'lucide-react';
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import {
  useCommercialDashboardV2,
  useCommercialFilterOptions,
  useSaveMetaSpend,
  resolvePeriod,
  CommercialFilters,
  SaleHistoryRow,
} from '@/hooks/useCommercialDashboard';
import { cn } from '@/lib/utils';
import { DashboardFilters } from '@/components/admin/dashboard/DashboardFilters';
import { SalesHistoryTable } from '@/components/admin/dashboard/SalesHistoryTable';
import { NewManualSaleDialog } from '@/components/admin/dashboard/NewManualSaleDialog';
import { EditSaleDialog } from '@/components/admin/dashboard/EditSaleDialog';
import { exportSalesToCsv, exportSalesToXlsx } from '@/lib/exportSales';

const CHART_PURPLE = '#8b5cf6';
const CHART_ORANGE = '#fb923c';
const CHART_EMERALD = '#34d399';
const CHART_VIOLET = '#a78bfa';

const formatBRL = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

const formatNumber = (value: number) =>
  new Intl.NumberFormat('pt-BR').format(value);

const tooltipStyle = {
  backgroundColor: 'hsl(var(--popover))',
  border: '1px solid hsl(var(--border))',
  borderRadius: '8px',
  color: 'hsl(var(--popover-foreground))',
};

const FILTER_OPTIONS_QUERY_KEY = ['commercial-dashboard-filter-options'];
const MIN_REFRESH_SPINNER_MS = 500;

export function Dashboard() {
  const [filters, setFilters] = useState<CommercialFilters>({ period: 'today' });
  const { data, isLoading, isFetching, isError, refetch } = useCommercialDashboardV2(filters);
  const { data: filterOptions } = useCommercialFilterOptions();
  const saveSpend = useSaveMetaSpend();
  const queryClient = useQueryClient();

  const [editingSpend, setEditingSpend] = useState(false);
  const [spendDraft, setSpendDraft] = useState('');
  const [newSaleOpen, setNewSaleOpen] = useState(false);
  const [editingSale, setEditingSale] = useState<SaleHistoryRow | null>(null);
  const [manualRefreshing, setManualRefreshing] = useState(false);

  // Botão "Atualizar": refaz a query principal (cards, gráfico de período,
  // gráficos por instância/estado e Histórico de Vendas vêm todos do mesmo
  // `data`) e também as opções de filtro (instâncias/funis), sem resetar
  // `filters` nem duplicar dados — react-query substitui o cache existente
  // pela mesma queryKey. Um piso de duração mantém o spinner visível mesmo
  // quando a rede responde muito rápido, para o clique ficar perceptível.
  const handleRefresh = async () => {
    setManualRefreshing(true);
    const startedAt = Date.now();
    try {
      await Promise.all([
        refetch(),
        queryClient.invalidateQueries({ queryKey: FILTER_OPTIONS_QUERY_KEY }),
      ]);
    } finally {
      const elapsed = Date.now() - startedAt;
      if (elapsed < MIN_REFRESH_SPINNER_MS) {
        await new Promise((resolve) => setTimeout(resolve, MIN_REFRESH_SPINNER_MS - elapsed));
      }
      setManualRefreshing(false);
    }
  };

  // Sai do modo de edição ao trocar o período (o valor pertence a outro range)
  useEffect(() => {
    setEditingSpend(false);
  }, [filters.period, filters.startDate, filters.endDate]);

  const { startKey, endKey } = resolvePeriod(filters);
  const isSingleDay = startKey === endKey;

  const startSpendEdit = () => {
    setSpendDraft(String(data?.metaSpend ?? 0).replace('.', ','));
    setEditingSpend(true);
  };

  const commitSpend = () => {
    const parsed = Number(spendDraft.replace(/\./g, '').replace(',', '.'));
    if (!Number.isFinite(parsed) || parsed < 0) return;
    saveSpend.mutate({ filters, amount: parsed });
    setEditingSpend(false);
  };

  const cards = [
    {
      label: 'Novos leads',
      value: data ? formatNumber(data.newLeads) : null,
      icon: Users, iconColor: 'text-blue-400', iconBg: 'bg-blue-500/10',
      valueColor: 'text-foreground',
    },
    {
      label: 'Receita',
      value: data ? formatBRL(data.revenue) : null,
      icon: DollarSign, iconColor: 'text-emerald-400', iconBg: 'bg-emerald-500/10',
      valueColor: 'text-emerald-400',
    },
    {
      label: 'Ticket médio',
      value: data ? formatBRL(data.avgTicket) : null,
      icon: TrendingUp, iconColor: 'text-emerald-400', iconBg: 'bg-emerald-500/10',
      valueColor: 'text-emerald-400',
    },
    {
      label: 'Vendas',
      value: data ? formatNumber(data.sales) : null,
      icon: ShoppingCart, iconColor: 'text-orange-400', iconBg: 'bg-orange-500/10',
      valueColor: 'text-foreground',
    },
    {
      label: 'Investimento Meta',
      value: data ? formatBRL(data.metaSpend) : null,
      icon: Megaphone, iconColor: 'text-red-400', iconBg: 'bg-red-500/10',
      valueColor: 'text-red-400',
      editable: true,
    },
    {
      label: 'Lucro',
      value: data ? formatBRL(data.profit) : null,
      icon: PiggyBank, iconColor: 'text-emerald-400', iconBg: 'bg-emerald-500/10',
      valueColor: data && data.profit < 0 ? 'text-red-400' : 'text-emerald-400',
    },
    {
      label: 'ROAS',
      value: data ? (data.roas === null ? '—' : data.roas.toFixed(2)) : null,
      icon: Gauge, iconColor: 'text-orange-400', iconBg: 'bg-orange-500/10',
      valueColor: 'text-foreground',
    },
    {
      label: 'Taxa de conv.',
      value: data ? `${data.conversionRate.toFixed(2)}%` : null,
      icon: Percent, iconColor: 'text-violet-400', iconBg: 'bg-violet-500/10',
      valueColor: 'text-violet-400',
    },
  ];

  const totalSalesInSeries = data?.salesSeries.reduce((acc, p) => acc + p.sales, 0) ?? 0;
  const connections = filterOptions?.connections ?? [];
  const funnels = filterOptions?.funnels ?? [];

  return (
    <div className="space-y-6 animate-fade-in pb-12">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        <DashboardFilters
          filters={filters}
          onChange={setFilters}
          connections={connections}
          funnels={funnels}
          onRefresh={handleRefresh}
          isRefreshing={isFetching || manualRefreshing}
        />
      </div>

      {/* Error state */}
      {isError && (
        <Card className="border-destructive/50 bg-destructive/10">
          <CardContent className="p-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              <p className="text-sm font-medium">Falha ao carregar os dados do dashboard.</p>
            </div>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              Tentar novamente
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Metric cards — 2 colunas */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <Card
              key={card.label}
              className="border-border bg-card shadow-sm rounded-xl overflow-hidden group hover:border-primary/30 transition-colors"
            >
              <CardContent className="p-5 flex items-center gap-4">
                <div className={cn('w-11 h-11 shrink-0 rounded-xl flex items-center justify-center', card.iconBg)}>
                  <Icon className={cn('w-5 h-5', card.iconColor)} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    {card.label}
                  </p>
                  {isLoading || card.value === null ? (
                    <Skeleton className="h-8 w-28 mt-1" />
                  ) : card.editable && editingSpend ? (
                    <div className="flex items-center gap-2 mt-1">
                      <Input
                        autoFocus
                        inputMode="decimal"
                        className="h-9 w-36"
                        value={spendDraft}
                        onChange={(e) => setSpendDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') commitSpend();
                          if (e.key === 'Escape') setEditingSpend(false);
                        }}
                      />
                      <Button size="icon" className="h-8 w-8" onClick={commitSpend} disabled={saveSpend.isPending}>
                        <Check className="h-4 w-4" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setEditingSpend(false)}>
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <p className={cn('text-2xl font-bold tracking-tight truncate', card.valueColor)}>
                        {card.value}
                      </p>
                      {card.editable && (
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 opacity-60 hover:opacity-100"
                          onClick={startSpendEdit}
                          title="Editar investimento"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  )}
                  {card.editable && !editingSpend && !isSingleDay && !isLoading && (
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      Soma do período · editar grava no período
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Vendas por período */}
      <Card className="border-border bg-card shadow-sm rounded-xl">
        <CardHeader className="pb-2">
          <CardTitle className="text-lg font-bold">Vendas por período</CardTitle>
          <p className="text-xs text-muted-foreground">
            {data?.groupedBy === 'day' ? 'Agrupado por dia' : 'Agrupado por hora'}
          </p>
        </CardHeader>
        <CardContent>
          <div className="h-[300px] w-full">
            {isLoading ? (
              <Skeleton className="h-full w-full rounded-lg" />
            ) : totalSalesInSeries === 0 ? (
              <div className="h-full flex items-center justify-center">
                <p className="text-sm text-muted-foreground italic">Sem vendas no período.</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data?.salesSeries} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                  <defs>
                    <linearGradient id="salesGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={CHART_PURPLE} stopOpacity={0.35} />
                      <stop offset="100%" stopColor={CHART_PURPLE} stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                  <XAxis
                    dataKey="label"
                    axisLine={false}
                    tickLine={false}
                    interval="preserveStartEnd"
                    minTickGap={24}
                    tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }}
                  />
                  <YAxis
                    allowDecimals={false}
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }}
                  />
                  <Tooltip
                    cursor={{ stroke: CHART_PURPLE, strokeOpacity: 0.3 }}
                    contentStyle={tooltipStyle}
                    formatter={(v: any) => [formatNumber(Number(v)), 'Vendas']}
                  />
                  <Area
                    type="monotone"
                    dataKey="sales"
                    stroke={CHART_PURPLE}
                    strokeWidth={2}
                    fill="url(#salesGradient)"
                    activeDot={{ r: 5, strokeWidth: 2, stroke: 'hsl(var(--card))' }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Gráficos por instância e por estado */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="border-border bg-card shadow-sm rounded-xl">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-bold">Vendas por instância</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[260px] w-full">
              {isLoading ? (
                <Skeleton className="h-full w-full rounded-lg" />
              ) : !data?.salesByInstance.length ? (
                <div className="h-full flex items-center justify-center">
                  <p className="text-sm text-muted-foreground italic">Sem vendas no período.</p>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.salesByInstance} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                    <XAxis dataKey="label" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }} interval={0} angle={-20} textAnchor="end" height={50} />
                    <YAxis allowDecimals={false} tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} />
                    <Tooltip contentStyle={tooltipStyle} formatter={(v: any) => [formatNumber(Number(v)), 'Vendas']} />
                    <Bar dataKey="sales" fill={CHART_ORANGE} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="border-border bg-card shadow-sm rounded-xl">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-bold">Faturamento por instância</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[260px] w-full">
              {isLoading ? (
                <Skeleton className="h-full w-full rounded-lg" />
              ) : !data?.salesByInstance.length ? (
                <div className="h-full flex items-center justify-center">
                  <p className="text-sm text-muted-foreground italic">Sem vendas no período.</p>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.salesByInstance} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                    <XAxis dataKey="label" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }} interval={0} angle={-20} textAnchor="end" height={50} />
                    <YAxis tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} />
                    <Tooltip contentStyle={tooltipStyle} formatter={(v: any) => [formatBRL(Number(v)), 'Faturamento']} />
                    <Bar dataKey="revenue" fill={CHART_EMERALD} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="border-border bg-card shadow-sm rounded-xl">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-bold">Vendas por estado</CardTitle>
            <p className="text-[10px] text-muted-foreground">
              Estimativa pelo DDD do telefone do lead — não é o endereço real do cliente.
            </p>
          </CardHeader>
          <CardContent>
            <div className="h-[260px] w-full">
              {isLoading ? (
                <Skeleton className="h-full w-full rounded-lg" />
              ) : !data?.salesByState.length ? (
                <div className="h-full flex items-center justify-center">
                  <p className="text-sm text-muted-foreground italic">Sem vendas no período.</p>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.salesByState} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                    <XAxis dataKey="uf" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }} interval={0} angle={-20} textAnchor="end" height={50} />
                    <YAxis allowDecimals={false} tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} />
                    <Tooltip contentStyle={tooltipStyle} formatter={(v: any) => [formatNumber(Number(v)), 'Vendas']} />
                    <Bar dataKey="sales" fill={CHART_VIOLET} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Histórico de Vendas */}
      <Card className="border-border bg-card shadow-sm rounded-xl">
        <CardHeader className="pb-2 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="text-lg font-bold">Histórico de Vendas</CardTitle>
            <p className="text-xs text-muted-foreground">Vendas automáticas e manuais, com trilha de edições auditadas.</p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline" size="sm"
              disabled={!data?.history.length}
              onClick={() => data && exportSalesToCsv(data.history)}
            >
              <Download className="mr-1.5 h-3.5 w-3.5" /> CSV
            </Button>
            <Button
              variant="outline" size="sm"
              disabled={!data?.history.length}
              onClick={() => data && exportSalesToXlsx(data.history)}
            >
              <FileSpreadsheet className="mr-1.5 h-3.5 w-3.5" /> XLSX
            </Button>
            <Button size="sm" onClick={() => setNewSaleOpen(true)}>
              <Plus className="mr-1.5 h-3.5 w-3.5" /> Nova venda
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-64 w-full rounded-lg" />
          ) : (
            <SalesHistoryTable rows={data?.history ?? []} onEdit={setEditingSale} />
          )}
        </CardContent>
      </Card>

      <NewManualSaleDialog
        open={newSaleOpen}
        onOpenChange={setNewSaleOpen}
        connections={connections}
        funnels={funnels}
      />
      <EditSaleDialog sale={editingSale} onOpenChange={(open) => !open && setEditingSale(null)} />
    </div>
  );
}
