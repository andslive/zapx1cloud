import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { 
  Users, 
  DollarSign, 
  TrendingUp, 
  ShoppingCart, 
  Zap, 
  Flame, 
  MessageSquare, 
  Phone,
  BarChart3,
  Calendar,
  Filter,
  ArrowRight,
  Loader2,
  AlertTriangle
} from 'lucide-react';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { useAdminDashboardData, DashboardFilters, DashboardPeriod } from '@/hooks/useAdminDashboardData';
import { useProducts } from '@/hooks/useProducts';
import { useWhatsAppInstances } from '@/hooks/useWhatsAppInstances';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2
  }).format(value);
};

const formatNumber = (value: number) => {
  return new Intl.NumberFormat('pt-BR').format(value);
};

export function CommercialDashboard() {
  const [filters, setFilters] = useState<DashboardFilters>({
    period: 'today',
    offerId: null,
    connectionId: null,
    source: 'all'
  });

  const { data: products } = useProducts();
  const { data: connections } = useWhatsAppInstances();
  const { data: dashboard, isLoading } = useAdminDashboardData(filters);

  const updateFilter = (key: keyof DashboardFilters, value: any) => {
    setFilters(prev => ({ ...prev, [key]: value === 'all' ? null : value }));
  };

  const statCards = [
    { label: 'Novos Leads', value: dashboard?.cards.newLeads, icon: Users, color: 'text-blue-500', bg: 'bg-blue-500/10' },
    { label: 'Receita', value: formatCurrency(dashboard?.cards.revenue || 0), icon: DollarSign, color: 'text-emerald-500', bg: 'bg-emerald-500/10' },
    { label: 'Ticket Médio', value: formatCurrency(dashboard?.cards.avgTicket || 0), icon: TrendingUp, color: 'text-violet-500', bg: 'bg-violet-500/10' },
    { label: 'Vendas', value: dashboard?.cards.sales, icon: ShoppingCart, color: 'text-orange-500', bg: 'bg-orange-500/10' },
    { label: 'Taxa de Conversão', value: `${dashboard?.cards.conversionRate.toFixed(1)}%`, icon: Zap, color: 'text-yellow-500', bg: 'bg-yellow-500/10' },
    { label: 'Conversas Ativas', value: dashboard?.cards.activeConversations, icon: MessageSquare, color: 'text-pink-500', bg: 'bg-pink-500/10' },
    { label: 'Leads Quentes', value: dashboard?.cards.hotLeads, icon: Flame, color: 'text-red-500', bg: 'bg-red-500/10' },
    { label: 'Conexões Ativas', value: dashboard?.cards.activeConnections, icon: Phone, color: 'text-cyan-500', bg: 'bg-cyan-500/10' },
  ];

  return (
    <div className="space-y-6 animate-fade-in pb-12">
      {/* Header Filters */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between bg-card p-4 rounded-xl border border-border shadow-sm">
        <div className="flex flex-wrap gap-3">
          {/* Period */}
          <div className="space-y-1.5">
            <label className="text-[10px] uppercase font-bold text-muted-foreground ml-1">Período</label>
            <Select value={filters.period} onValueChange={(v) => updateFilter('period', v)}>
              <SelectTrigger className="w-[140px] h-9">
                <SelectValue placeholder="Período" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="today">Hoje</SelectItem>
                <SelectItem value="yesterday">Ontem</SelectItem>
                <SelectItem value="7d">7 dias</SelectItem>
                <SelectItem value="30d">30 dias</SelectItem>
                <SelectItem value="month">Mês atual</SelectItem>
                <SelectItem value="custom">Personalizado</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Offer (Funil) */}
          <div className="space-y-1.5">
            <label className="text-[10px] uppercase font-bold text-muted-foreground ml-1">Oferta</label>
            <Select value={filters.offerId || 'all'} onValueChange={(v) => updateFilter('offerId', v)}>
              <SelectTrigger className="w-[180px] h-9">
                <SelectValue placeholder="Todas as Ofertas" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as Ofertas</SelectItem>
                {products?.map(p => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Connection */}
          <div className="space-y-1.5">
            <label className="text-[10px] uppercase font-bold text-muted-foreground ml-1">Conexão</label>
            <Select value={filters.connectionId || 'all'} onValueChange={(v) => updateFilter('connectionId', v)}>
              <SelectTrigger className="w-[180px] h-9">
                <SelectValue placeholder="Todas as Conexões" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as Conexões</SelectItem>
                {connections?.map(c => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Source */}
          <div className="space-y-1.5">
            <label className="text-[10px] uppercase font-bold text-muted-foreground ml-1">Origem</label>
            <Select value={filters.source || 'all'} onValueChange={(v) => updateFilter('source', v)}>
              <SelectTrigger className="w-[150px] h-9">
                <SelectValue placeholder="Todas as Origens" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as Origens</SelectItem>
                <SelectItem value="facebook">Facebook Ads</SelectItem>
                <SelectItem value="instagram">Instagram Ads</SelectItem>
                <SelectItem value="whatsapp">WhatsApp Orgânico</SelectItem>
                <SelectItem value="webchat">Webchat</SelectItem>
                <SelectItem value="import">Importação</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex items-center gap-2">
           <Button variant="outline" size="icon" className="h-9 w-9">
             <Filter className="h-4 w-4" />
           </Button>
           <Button variant="soft" size="sm" className="h-9">
             <Calendar className="h-4 w-4 mr-2" />
             Exportar
           </Button>
        </div>
      </div>

      {/* Alert for strong identification */}
      {dashboard?.cards.sales > 0 && dashboard?.auditFunnel.metaAccepted / dashboard?.cards.sales < 0.5 && (
        <Card className="border-orange-500/50 bg-orange-500/10">
          <CardContent className="p-3 flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 text-orange-600" />
            <div className="text-sm font-medium text-orange-800">
              Alerta Visual: Muitos eventos aceitos pela Meta estão sem identificador forte de clique (fbclid/ctwa). Verifique a atribuição.
            </div>
          </CardContent>
        </Card>
      )}

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((stat, index) => {
          const Icon = stat.icon;
          return (
            <Card key={index} className="border-border shadow-sm overflow-hidden group hover:border-primary/30 transition-all duration-300">
              <CardContent className="p-5">
                <div className="flex items-center justify-between mb-3">
                  <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center transition-transform group-hover:scale-110 duration-300", stat.bg)}>
                    <Icon className={cn("w-5 h-5", stat.color)} />
                  </div>
                  <Badge variant="outline" className="bg-muted/30 text-[10px] font-bold uppercase">
                    SP TIMEZONE
                  </Badge>
                </div>
                <div className="space-y-0.5">
                  <p className="text-2xl font-bold tracking-tight">
                    {isLoading ? <Loader2 className="h-5 w-5 animate-spin inline" /> : (stat.value ?? 0)}
                  </p>
                  <p className="text-sm font-medium text-muted-foreground">{stat.label}</p>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Main Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2 border-border shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-4">
            <div>
              <CardTitle className="text-lg font-bold">Receita {filters.period === 'today' || filters.period === 'yesterday' ? 'por Hora' : 'por Dia'}</CardTitle>
              <p className="text-xs text-muted-foreground">Faturamento bruto confirmado no período</p>
            </div>
            <div className="flex items-center gap-1">
               <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20">TOTAL: {formatCurrency(dashboard?.cards.revenue || 0)}</Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="h-[320px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={dashboard?.chartData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                  <XAxis 
                    dataKey="label" 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }}
                  />
                  <YAxis 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }}
                    tickFormatter={(v) => `R$ ${v >= 1000 ? v/1000 + 'k' : v}`}
                  />
                  <Tooltip 
                    contentStyle={{ backgroundColor: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', borderRadius: '8px' }}
                    formatter={(v: any) => [formatCurrency(v), 'Receita']}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="revenue" 
                    stroke="hsl(142, 71%, 45%)" 
                    strokeWidth={3} 
                    dot={{ r: 4, fill: 'hsl(142, 71%, 45%)', strokeWidth: 2, stroke: 'white' }}
                    activeDot={{ r: 6, strokeWidth: 0 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Performance Section */}
        <div className="space-y-6">
          <Card className="border-border shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-bold flex items-center gap-2">
                <Zap className="h-4 w-4 text-primary" />
                Performance por Oferta
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-2">
              <div className="space-y-4">
                {(dashboard?.performance.revenueByOffer || []).sort((a: any, b: any) => b.value - a.value).slice(0, 5).map((offer, idx) => (
                  <div key={idx} className="space-y-1.5">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium truncate max-w-[150px]">{offer.name}</span>
                      <span className="font-bold">{formatCurrency(offer.value)}</span>
                    </div>
                    <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-primary rounded-full" 
                        style={{ width: `${(offer.value / (dashboard?.cards.revenue || 1)) * 100}%` }}
                      />
                    </div>
                  </div>
                ))}
                {(!dashboard?.performance.revenueByOffer || dashboard.performance.revenueByOffer.length === 0) && (
                  <p className="text-center py-6 text-xs text-muted-foreground italic">Aguardando vendas...</p>
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="border-border shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-bold flex items-center gap-2">
                <Filter className="h-4 w-4 text-orange-500" />
                Receita por Funil
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-2">
              <div className="space-y-4">
                {(dashboard?.performance.revenueByFunnel || []).sort((a: any, b: any) => b.value - a.value).slice(0, 5).map((funnel, idx) => (
                  <div key={idx} className="space-y-1.5">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium truncate max-w-[150px]">{funnel.name}</span>
                      <span className="font-bold">{formatCurrency(funnel.value)}</span>
                    </div>
                    <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-orange-500 rounded-full" 
                        style={{ width: `${(funnel.value / (dashboard?.cards.revenue || 1)) * 100}%` }}
                      />
                    </div>
                  </div>
                ))}
                {(!dashboard?.performance.revenueByFunnel || dashboard.performance.revenueByFunnel.length === 0) && (
                  <p className="text-center py-6 text-xs text-muted-foreground italic">Aguardando dados...</p>
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="border-border shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-bold flex items-center gap-2">
                <Phone className="h-4 w-4 text-cyan-500" />
                Receita por Conexão
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-2">
              <div className="space-y-4">
                {(dashboard?.performance.revenueByConnection || []).sort((a: any, b: any) => b.value - a.value).slice(0, 5).map((conn, idx) => (
                  <div key={idx} className="space-y-1.5">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium truncate max-w-[150px]">{conn.name}</span>
                      <span className="font-bold">{formatCurrency(conn.value)}</span>
                    </div>
                    <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-cyan-500 rounded-full" 
                        style={{ width: `${(conn.value / (dashboard?.cards.revenue || 1)) * 100}%` }}
                      />
                    </div>
                  </div>
                ))}
                {(!dashboard?.performance.revenueByConnection || dashboard.performance.revenueByConnection.length === 0) && (
                  <p className="text-center py-6 text-xs text-muted-foreground italic">Aguardando dados...</p>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
      
      {/* Funil de Auditoria Técnica */}
      <Card className="border-border shadow-sm">
        <CardHeader className="pb-4">
          <CardTitle className="text-lg font-bold flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-primary" />
            Funil de Auditoria Técnica (Lead Journey)
          </CardTitle>
          <p className="text-sm text-muted-foreground">Consolidação da jornada técnica do lead em etapas visuais</p>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-5 gap-4 relative">
            {[
              { label: 'Meta API', value: dashboard?.auditFunnel.metaAccepted, desc: 'Accepted', icon: Zap, color: 'text-blue-500', bg: 'bg-blue-500/10' },
              { label: 'UazAPI', value: dashboard?.auditFunnel.webhookReceived, desc: 'Webhook', icon: MessageSquare, color: 'text-purple-500', bg: 'bg-purple-500/10' },
              { label: 'Lead Tracking', value: dashboard?.auditFunnel.leadCreated, desc: 'Created', icon: Users, color: 'text-cyan-500', bg: 'bg-cyan-500/10' },
              { label: 'Attribution', value: dashboard?.auditFunnel.enriched, desc: 'Enriched', icon: TrendingUp, color: 'text-orange-500', bg: 'bg-orange-500/10' },
              { label: 'Sales', value: dashboard?.auditFunnel.confirmed, desc: 'Confirmed', icon: DollarSign, color: 'text-emerald-500', bg: 'bg-emerald-500/10' },
            ].map((step, idx) => (
              <div key={idx} className="relative flex flex-col items-center text-center p-4 rounded-xl border border-border bg-muted/20">
                <div className={cn("w-12 h-12 rounded-full flex items-center justify-center mb-3", step.bg)}>
                  <step.icon className={cn("w-6 h-6", step.color)} />
                </div>
                <p className="text-xl font-bold">{isLoading ? '...' : (step.value ?? 0)}</p>
                <p className="text-sm font-semibold">{step.label}</p>
                <p className="text-[10px] uppercase text-muted-foreground font-bold">{step.desc}</p>
                
                {idx < 4 && (
                  <div className="hidden sm:block absolute -right-4 top-1/2 -translate-y-1/2 z-10">
                    <ArrowRight className="h-4 w-4 text-muted-foreground opacity-30" />
                  </div>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>

  );
}
