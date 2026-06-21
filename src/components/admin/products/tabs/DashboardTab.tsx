import { useProduct } from '@/hooks/useProducts';
import { useLeads } from '@/hooks/useLeads';
import { useDeals } from '@/hooks/useDeals';
import { useSalesGoals } from '@/hooks/useSalesGoals';
import { useCommissions } from '@/hooks/useCommissions';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { SalesFunnelChart } from '@/components/charts/SalesFunnelChart';
import { ConversionRateChart } from '@/components/charts/ConversionRateChart';
import { TrendingUp, Users, DollarSign, Target, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Loader2 } from 'lucide-react';

interface DashboardTabProps {
  productId: string;
}

export function DashboardTab({ productId }: DashboardTabProps) {
  const { data: product } = useProduct(productId);
  const { data: leads, isLoading: leadsLoading } = useLeads(productId);
  const { data: deals, isLoading: dealsLoading } = useDeals({ productId });
  const { data: goals } = useSalesGoals(undefined, productId);
  const { data: commissions } = useCommissions({ productId });

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
  const productGoals = goals || [];
  const productCommissions = commissions || [];

  // Calculate stats
  const activeLeads = productLeads.length;
  const wonDeals = productDeals.filter(d => d.status === 'won');
  const totalSales = wonDeals.reduce((sum, d) => sum + (d.deal_value || 0), 0);
  const pendingCommissions = productCommissions
    .filter(c => c.status === 'pending')
    .reduce((sum, c) => sum + c.amount, 0);
  
  // Conversion rate (simplified)
  const conversionRate = productLeads.length > 0 
    ? ((wonDeals.length / productLeads.length) * 100).toFixed(1)
    : '0';

  // Leads at risk (no contact in 7+ days)
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const leadsAtRisk = productLeads.filter(l => {
    if (!l.last_contact_at) return true;
    return new Date(l.last_contact_at) < sevenDaysAgo;
  });

  // Goal progress
  const currentGoal = productGoals[0];
  const goalProgress = currentGoal 
    ? ((currentGoal.achieved_value || 0) / currentGoal.target_value * 100).toFixed(0)
    : 0;

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
  const conversionData = {
    totalLeads: productLeads.length,
    wonLeads: wonDeals.length,
    lostLeads: productDeals.filter(d => d.status === 'lost').length,
    activeLeads: productLeads.length - wonDeals.length - productDeals.filter(d => d.status === 'lost').length,
  };

  return (
    <div className="space-y-6">
      {/* Stats Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="bg-card">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <TrendingUp className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{activeLeads}</p>
                <p className="text-sm text-muted-foreground">Leads Ativos</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-success/10 flex items-center justify-center">
                <CheckCircle2 className="h-5 w-5 text-success" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{conversionRate}%</p>
                <p className="text-sm text-muted-foreground">Taxa de Conversão</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-accent/10 flex items-center justify-center">
                <DollarSign className="h-5 w-5 text-accent" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{formatCurrency(totalSales)}</p>
                <p className="text-sm text-muted-foreground">Total Vendido</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-warning/10 flex items-center justify-center">
                <Target className="h-5 w-5 text-warning" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{goalProgress}%</p>
                <p className="text-sm text-muted-foreground">Meta do Mês</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts Row */}
      <div className="grid gap-6 lg:grid-cols-2">
        <SalesFunnelChart stages={funnelStages} isLoading={isLoading} />
        <ConversionRateChart data={conversionData} isLoading={isLoading} />
      </div>

      {/* Leads at Risk & Pending Commissions */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="bg-card">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-warning" />
              Leads em Risco
            </CardTitle>
            <Badge variant="outline" className="bg-warning/10 text-warning">
              {leadsAtRisk.length}
            </Badge>
          </CardHeader>
          <CardContent>
            {leadsAtRisk.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                Nenhum lead em risco! 🎉
              </p>
            ) : (
              <div className="space-y-3 max-h-60 overflow-y-auto">
                {leadsAtRisk.slice(0, 5).map((lead) => (
                  <div key={lead.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                    <div>
                      <p className="font-medium text-foreground">{lead.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {lead.last_contact_at 
                          ? `Último contato: ${new Date(lead.last_contact_at).toLocaleDateString('pt-BR')}`
                          : 'Nunca contatado'}
                      </p>
                    </div>
                    <Badge variant="outline" className="bg-destructive/10 text-destructive">
                      Sem ação
                    </Badge>
                  </div>
                ))}
                {leadsAtRisk.length > 5 && (
                  <p className="text-sm text-muted-foreground text-center pt-2">
                    +{leadsAtRisk.length - 5} leads em risco
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="bg-card">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-primary" />
              Comissões Pendentes
            </CardTitle>
            <Badge variant="outline" className="bg-primary/10 text-primary">
              {formatCurrency(pendingCommissions)}
            </Badge>
          </CardHeader>
          <CardContent>
            {productCommissions.filter(c => c.status === 'pending').length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                Nenhuma comissão pendente
              </p>
            ) : (
              <div className="space-y-3 max-h-60 overflow-y-auto">
                {productCommissions
                  .filter(c => c.status === 'pending')
                  .slice(0, 5)
                  .map((commission) => (
                    <div key={commission.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                      <div>
                        <p className="font-medium text-foreground">
                          {formatCurrency(commission.amount)}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(commission.created_at || '').toLocaleDateString('pt-BR')}
                        </p>
                      </div>
                      <Badge variant="outline" className="bg-warning/10 text-warning">
                        Pendente
                      </Badge>
                    </div>
                  ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
