import { useProduct } from '@/hooks/useProducts';
import { useLeads } from '@/hooks/useLeads';
import { useDeals } from '@/hooks/useDeals';
import { useCommissions } from '@/hooks/useCommissions';
import { useTeamMembers } from '@/hooks/useTeam';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { SalesFunnelChart } from '@/components/charts/SalesFunnelChart';
import { ConversionRateChart } from '@/components/charts/ConversionRateChart';
import { CommissionsChart } from '@/components/charts/CommissionsChart';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { TrendingUp, Users, Clock, Target, Loader2 } from 'lucide-react';

interface ReportsTabProps {
  productId: string;
}

export function ReportsTab({ productId }: ReportsTabProps) {
  const { data: product } = useProduct(productId);
  const { data: leads, isLoading: leadsLoading } = useLeads(productId);
  const { data: deals, isLoading: dealsLoading } = useDeals({ productId });
  const { data: commissions, isLoading: commissionsLoading } = useCommissions({ productId });
  const { data: teamMembers } = useTeamMembers();

  const isLoading = leadsLoading || dealsLoading;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const productLeads = leads || [];
  const productDeals = deals || [];

  // Calculate seller performance
  const sellerPerformance = teamMembers?.map(member => {
    const memberLeads = productLeads.filter(l => l.assigned_to === member.id);
    const memberDeals = productDeals.filter(d => d.seller_id === member.id);
    const wonDeals = memberDeals.filter(d => d.status === 'won');
    const totalValue = wonDeals.reduce((sum, d) => sum + (d.deal_value || 0), 0);
    const conversionRate = memberLeads.length > 0 
      ? (wonDeals.length / memberLeads.length * 100).toFixed(1)
      : '0';

    return {
      ...member,
      leads: memberLeads.length,
      deals: wonDeals.length,
      value: totalValue,
      conversionRate: parseFloat(conversionRate),
    };
  }).filter(m => m.leads > 0 || m.deals > 0) || [];

  // Calculate average time in each stage (simplified)
  const avgTimeInStage = 3.5; // Mock data - would need lead_stage_history

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
      minimumFractionDigits: 0,
    }).format(value);
  };

  // Build funnel stages from leads
  const stageGroups = productLeads.reduce((acc, lead) => {
    const stage = (lead as any).pipeline_stages;
    const stageName = stage?.name || 'Sem etapa';
    const stageColor = stage?.color || '#6b7280';
    const stageOrder = stage?.order_index ?? 99;
    if (!acc[stageName]) {
      acc[stageName] = { count: 0, color: stageColor, order: stageOrder };
    }
    acc[stageName].count++;
    return acc;
  }, {} as Record<string, { count: number; color: string; order: number }>);

  const funnelStages = Object.entries(stageGroups)
    .sort(([, a], [, b]) => a.order - b.order)
    .map(([name, data]) => ({
      name,
      count: data.count,
      color: data.color,
    }));

  // Conversion data
  const wonDeals = productDeals.filter(d => d.status === 'won');
  const lostDeals = productDeals.filter(d => d.status === 'lost');
  const conversionData = {
    totalLeads: productLeads.length,
    wonLeads: wonDeals.length,
    lostLeads: lostDeals.length,
    activeLeads: productLeads.length - wonDeals.length - lostDeals.length,
  };

  return (
    <div className="space-y-6">
      {/* Summary Stats */}
      <div className="grid gap-4 sm:grid-cols-4">
        <Card className="bg-card">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <TrendingUp className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{productLeads.length}</p>
                <p className="text-sm text-muted-foreground">Total Leads</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-success/10 flex items-center justify-center">
                <Target className="h-5 w-5 text-success" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">
                  {wonDeals.length}
                </p>
                <p className="text-sm text-muted-foreground">Vendas Fechadas</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-accent/10 flex items-center justify-center">
                <Users className="h-5 w-5 text-accent" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{sellerPerformance.length}</p>
                <p className="text-sm text-muted-foreground">Vendedores Ativos</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-warning/10 flex items-center justify-center">
                <Clock className="h-5 w-5 text-warning" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{avgTimeInStage}d</p>
                <p className="text-sm text-muted-foreground">Tempo Médio/Etapa</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid gap-6 lg:grid-cols-2">
        <SalesFunnelChart stages={funnelStages} isLoading={isLoading} wonCount={wonDeals.length} lostCount={lostDeals.length} />
        <ConversionRateChart data={conversionData} isLoading={isLoading} />
      </div>

      {/* Commissions Chart */}
      <CommissionsChart commissions={commissions || []} isLoading={commissionsLoading} />

      {/* Seller Performance Table */}
      <Card className="bg-card">
        <CardHeader>
          <CardTitle className="text-base">Performance por Vendedor</CardTitle>
        </CardHeader>
        <CardContent>
          {sellerPerformance.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              Nenhum dado de performance disponível
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Vendedor</TableHead>
                  <TableHead className="text-center">Leads</TableHead>
                  <TableHead className="text-center">Vendas</TableHead>
                  <TableHead className="text-center">Conversão</TableHead>
                  <TableHead className="text-right">Valor Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sellerPerformance
                  .sort((a, b) => b.value - a.value)
                  .map((seller) => (
                    <TableRow key={seller.id}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <Avatar className="h-8 w-8">
                            <AvatarImage src={seller.avatar_url || ''} />
                            <AvatarFallback>
                              {seller.full_name?.slice(0, 2).toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <span className="font-medium">{seller.full_name}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-center">{seller.leads}</TableCell>
                      <TableCell className="text-center">{seller.deals}</TableCell>
                      <TableCell className="text-center">
                        <Badge 
                          variant="outline"
                          className={seller.conversionRate >= 30 
                            ? 'bg-success/10 text-success' 
                            : seller.conversionRate >= 15 
                              ? 'bg-warning/10 text-warning'
                              : 'bg-muted text-muted-foreground'
                          }
                        >
                          {seller.conversionRate}%
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {formatCurrency(seller.value)}
                      </TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
