import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { useAdminKPIs, useTopSellers, useProductSalesDistribution, useMonthlySalesEvolution } from '@/hooks/useAdminDashboard';
import { useAllSquadsPerformance } from '@/hooks/useSquadPerformance';
import { TrendingUp, TrendingDown, DollarSign, Target, Users, ShoppingCart, Award, Loader2 } from 'lucide-react';
import { LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(value);
};

const COLORS = ['hsl(173, 80%, 45%)', 'hsl(190, 80%, 50%)', 'hsl(142, 71%, 45%)', 'hsl(38, 92%, 50%)', 'hsl(280, 70%, 50%)'];

export function AdminDashboard() {
  const { data: kpis, isLoading: kpisLoading } = useAdminKPIs();
  const { data: topSellers, isLoading: sellersLoading } = useTopSellers(5);
  const { data: productDistribution } = useProductSalesDistribution();
  const { data: monthlyData } = useMonthlySalesEvolution(6);
  const { data: squadsPerformance } = useAllSquadsPerformance();

  if (kpisLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Dashboard Administrativo</h1>
        <p className="text-muted-foreground">Visão geral da performance da sua operação</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="gradient-card border-border">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Vendas do Mês</p>
                <p className="text-2xl font-bold text-foreground mt-1">
                  {formatCurrency(kpis?.totalSalesThisMonth || 0)}
                </p>
                <div className="flex items-center gap-1 mt-2">
                  {(kpis?.salesGrowth || 0) >= 0 ? (
                    <TrendingUp className="h-4 w-4 text-success" />
                  ) : (
                    <TrendingDown className="h-4 w-4 text-destructive" />
                  )}
                  <span className={`text-sm ${(kpis?.salesGrowth || 0) >= 0 ? 'text-success' : 'text-destructive'}`}>
                    {Math.abs(kpis?.salesGrowth || 0).toFixed(1)}% vs mês anterior
                  </span>
                </div>
              </div>
              <div className="w-12 h-12 rounded-xl gradient-primary flex items-center justify-center">
                <DollarSign className="h-6 w-6 text-primary-foreground" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="gradient-card border-border">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Meta Global</p>
                <p className="text-2xl font-bold text-foreground mt-1">
                  {(kpis?.goalProgress || 0).toFixed(0)}%
                </p>
                <Progress value={kpis?.goalProgress || 0} className="mt-2 h-2" />
                <p className="text-xs text-muted-foreground mt-1">
                  {formatCurrency(kpis?.totalSalesThisMonth || 0)} de {formatCurrency(kpis?.totalGoalValue || 0)}
                </p>
              </div>
              <div className="w-12 h-12 rounded-xl bg-success/20 flex items-center justify-center">
                <Target className="h-6 w-6 text-success" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="gradient-card border-border">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Taxa de Conversão</p>
                <p className="text-2xl font-bold text-foreground mt-1">
                  {(kpis?.conversionRate || 0).toFixed(1)}%
                </p>
                <p className="text-xs text-muted-foreground mt-2">
                  {kpis?.totalDeals || 0} deals fechados
                </p>
              </div>
              <div className="w-12 h-12 rounded-xl bg-warning/20 flex items-center justify-center">
                <ShoppingCart className="h-6 w-6 text-warning" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="gradient-card border-border">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Ticket Médio</p>
                <p className="text-2xl font-bold text-foreground mt-1">
                  {formatCurrency(kpis?.avgTicket || 0)}
                </p>
                <p className="text-xs text-muted-foreground mt-2">
                  Baseado em {kpis?.totalDeals || 0} vendas
                </p>
              </div>
              <div className="w-12 h-12 rounded-xl bg-primary/20 flex items-center justify-center">
                <Award className="h-6 w-6 text-primary" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Monthly Evolution */}
        <Card className="gradient-card border-border">
          <CardHeader>
            <CardTitle className="text-lg">Evolução de Vendas</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={monthlyData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="month" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                  <YAxis 
                    stroke="hsl(var(--muted-foreground))" 
                    fontSize={12}
                    tickFormatter={(value) => formatCurrency(value)}
                  />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--popover))', 
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px'
                    }}
                    formatter={(value: number) => [formatCurrency(value), 'Vendas']}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="sales" 
                    stroke="hsl(173, 80%, 45%)" 
                    strokeWidth={2}
                    dot={{ fill: 'hsl(173, 80%, 45%)' }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Product Distribution */}
        <Card className="gradient-card border-border">
          <CardHeader>
            <CardTitle className="text-lg">Vendas por Produto</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={productDistribution}
                    dataKey="totalValue"
                    nameKey="productName"
                    cx="50%"
                    cy="50%"
                    outerRadius={80}
                    label={({ name, percentage }) => `${name}: ${percentage.toFixed(0)}%`}
                  >
                    {productDistribution?.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--popover))', 
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px'
                    }}
                    formatter={(value: number) => [formatCurrency(value), 'Vendas']}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Bottom Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Top Sellers */}
        <Card className="gradient-card border-border">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Award className="h-5 w-5 text-warning" />
              Top Vendedores
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {sellersLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            ) : topSellers?.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">
                Nenhuma venda este mês
              </p>
            ) : (
              topSellers?.map((seller, index) => (
                <div key={seller.id} className="flex items-center gap-3">
                  <div className="relative">
                    <Avatar className="h-10 w-10">
                      <AvatarImage src={seller.avatar || undefined} />
                      <AvatarFallback className="bg-primary/20 text-primary">
                        {seller.name.charAt(0)}
                      </AvatarFallback>
                    </Avatar>
                    {index < 3 && (
                      <span className={`absolute -top-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold ${
                        index === 0 ? 'bg-warning text-warning-foreground' :
                        index === 1 ? 'bg-muted text-muted-foreground' :
                        'bg-warning/50 text-warning-foreground'
                      }`}>
                        {index + 1}
                      </span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-foreground truncate">{seller.name}</p>
                    <p className="text-xs text-muted-foreground">{seller.dealsCount} deals</p>
                  </div>
                  <p className="font-semibold text-primary">
                    {formatCurrency(seller.totalValue)}
                  </p>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {/* Squads Performance */}
        <Card className="gradient-card border-border lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Users className="h-5 w-5 text-primary" />
              Performance dos Squads
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart 
                  data={squadsPerformance} 
                  layout="vertical"
                  margin={{ left: 80 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis type="number" stroke="hsl(var(--muted-foreground))" fontSize={12} tickFormatter={(value) => formatCurrency(value)} />
                  <YAxis type="category" dataKey="squadName" stroke="hsl(var(--muted-foreground))" fontSize={12} width={70} />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--popover))', 
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px'
                    }}
                    formatter={(value: number) => [formatCurrency(value), 'Vendas']}
                  />
                  <Bar 
                    dataKey="totalValue" 
                    fill="hsl(173, 80%, 45%)"
                    radius={[0, 4, 4, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
            {(!squadsPerformance || squadsPerformance.length === 0) && (
              <p className="text-center text-muted-foreground py-8">
                Nenhum squad cadastrado ainda
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Pending Commissions Alert */}
      {(kpis?.pendingCommissionsCount || 0) > 0 && (
        <Card className="border-warning/50 bg-warning/10">
          <CardContent className="p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-warning/20 flex items-center justify-center">
                <DollarSign className="h-5 w-5 text-warning" />
              </div>
              <div>
                <p className="font-medium text-foreground">Comissões Pendentes</p>
                <p className="text-sm text-muted-foreground">
                  {kpis?.pendingCommissionsCount} comissões aguardando aprovação
                </p>
              </div>
            </div>
            <Badge variant="outline" className="border-warning text-warning">
              {formatCurrency(kpis?.pendingCommissions || 0)}
            </Badge>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
