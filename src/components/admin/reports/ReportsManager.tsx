import { useState } from 'react';
import { useProducts } from '@/hooks/useProducts';
import { useAdminKPIs, useTopSellers, useProductSalesDistribution, useMonthlySalesEvolution } from '@/hooks/useAdminDashboard';
import { AdminDashboard } from '@/components/admin/AdminDashboard';
import { useAllSquadsPerformance } from '@/hooks/useSquadPerformance';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  BarChart3, 
  Loader2, 
  TrendingUp, 
  Users, 
  DollarSign, 
  Target,
  Award,
  Package,
  Search
} from 'lucide-react';
import { LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, FunnelChart, Funnel, LabelList } from 'recharts';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Progress } from '@/components/ui/progress';
import { PurchaseAudit } from './PurchaseAudit';

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(value);
};

const COLORS = ['hsl(173, 80%, 45%)', 'hsl(190, 80%, 50%)', 'hsl(142, 71%, 45%)', 'hsl(38, 92%, 50%)', 'hsl(280, 70%, 50%)'];

export function ReportsManager() {
  const { data: products, isLoading: productsLoading } = useProducts();
  const [selectedProductId, setSelectedProductId] = useState<string>('all');
  const [activeTab, setActiveTab] = useState('overview');
  
  const { data: kpis, isLoading: kpisLoading } = useAdminKPIs();
  const { data: topSellers } = useTopSellers(10);
  const { data: productDistribution } = useProductSalesDistribution();
  const { data: monthlyData } = useMonthlySalesEvolution(12);
  const { data: squadsPerformance } = useAllSquadsPerformance();

  if (productsLoading || kpisLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Filter data by product if selected (when filtering is possible)
  const filteredSellers = topSellers;

  const filteredDistribution = selectedProductId === 'all'
    ? productDistribution
    : productDistribution?.filter(p => p.productId === selectedProductId);

  return (
    <div className="space-y-6">
      {/* Header with Product Filter */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 rounded-xl gradient-primary flex items-center justify-center">
            <BarChart3 className="h-6 w-6 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Relatórios</h1>
            <p className="text-muted-foreground text-sm">
              Análise completa de performance e vendas
            </p>
          </div>
        </div>
        
        <Select value={selectedProductId} onValueChange={setSelectedProductId}>
          <SelectTrigger className="w-[240px]">
            <SelectValue placeholder="Filtrar por produto" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">
              <div className="flex items-center gap-2">
                <Package className="h-4 w-4 text-muted-foreground" />
                Todos os Produtos
              </div>
            </SelectItem>
            {products?.map((product) => (
              <SelectItem key={product.id} value={product.id}>
                <div className="flex items-center gap-2">
                  {product.logo_url ? (
                    <img 
                      src={product.logo_url} 
                      alt={product.name}
                      className="h-5 w-5 rounded object-cover"
                    />
                  ) : (
                    <Package className="h-4 w-4 text-muted-foreground" />
                  )}
                  {product.name}
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="w-full justify-start flex-wrap">
          <TabsTrigger value="overview">Performance Geral</TabsTrigger>
          <TabsTrigger value="sales">Vendas</TabsTrigger>
          <TabsTrigger value="sellers">Vendedores</TabsTrigger>
          <TabsTrigger value="squads">Squads</TabsTrigger>
          <TabsTrigger value="commissions">Comissões</TabsTrigger>
          <TabsTrigger value="audit">Auditoria Purchase</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-6">
          <AdminDashboard />
        </TabsContent>

        {/* Sales Tab */}
        <TabsContent value="sales" className="space-y-6 mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Vendas Mensais Detalhadas</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={monthlyData}>
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
                    <Bar 
                      dataKey="sales" 
                      fill="hsl(173, 80%, 45%)"
                      radius={[4, 4, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Sellers Tab */}
        <TabsContent value="sellers" className="space-y-6 mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Award className="h-5 w-5 text-warning" />
                Ranking de Vendedores
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {filteredSellers?.map((seller, index) => (
                  <div key={seller.id} className="flex items-center gap-4 p-3 rounded-lg bg-muted/50">
                    <div className="relative">
                      <Avatar className="h-12 w-12">
                        <AvatarImage src={seller.avatar || undefined} />
                        <AvatarFallback className="bg-primary/20 text-primary">
                          {seller.name.charAt(0)}
                        </AvatarFallback>
                      </Avatar>
                      {index < 3 && (
                        <span className={`absolute -top-1 -right-1 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                          index === 0 ? 'bg-warning text-warning-foreground' :
                          index === 1 ? 'bg-muted text-muted-foreground' :
                          'bg-warning/50 text-warning-foreground'
                        }`}>
                          {index + 1}
                        </span>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium">{seller.name}</p>
                      <p className="text-sm text-muted-foreground">{seller.dealsCount} deals fechados</p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-primary">
                        {formatCurrency(seller.totalValue)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Ticket médio: {formatCurrency(seller.totalValue / (seller.dealsCount || 1))}
                      </p>
                    </div>
                  </div>
                ))}
                {(!filteredSellers || filteredSellers.length === 0) && (
                  <p className="text-center text-muted-foreground py-8">
                    Nenhuma venda registrada
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Squads Tab */}
        <TabsContent value="squads" className="space-y-6 mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Users className="h-5 w-5 text-primary" />
                Performance dos Squads
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart 
                    data={squadsPerformance} 
                    layout="vertical"
                    margin={{ left: 100 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis type="number" stroke="hsl(var(--muted-foreground))" fontSize={12} tickFormatter={(value) => formatCurrency(value)} />
                    <YAxis type="category" dataKey="squadName" stroke="hsl(var(--muted-foreground))" fontSize={12} width={90} />
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
        </TabsContent>

        {/* Commissions Tab */}
        <TabsContent value="commissions" className="space-y-6 mt-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Comissões Pendentes</p>
                    <p className="text-2xl font-bold mt-1">
                      {formatCurrency(kpis?.pendingCommissions || 0)}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {kpis?.pendingCommissionsCount || 0} aguardando
                    </p>
                  </div>
                  <div className="w-12 h-12 rounded-xl bg-warning/20 flex items-center justify-center">
                    <DollarSign className="h-6 w-6 text-warning" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Comissões Pagas (Mês)</p>
                    <p className="text-2xl font-bold mt-1">
                      {formatCurrency(0)}
                    </p>
                  </div>
                  <div className="w-12 h-12 rounded-xl bg-success/20 flex items-center justify-center">
                    <DollarSign className="h-6 w-6 text-success" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Total Deals</p>
                    <p className="text-2xl font-bold mt-1">
                      {kpis?.totalDeals || 0}
                    </p>
                  </div>
                  <div className="w-12 h-12 rounded-xl bg-primary/20 flex items-center justify-center">
                    <Target className="h-6 w-6 text-primary" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="audit" className="mt-6">
          <PurchaseAudit />
        </TabsContent>
      </Tabs>
    </div>
  );
}
