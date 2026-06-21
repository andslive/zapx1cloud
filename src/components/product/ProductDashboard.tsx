import { Tables } from '@/integrations/supabase/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  Users, 
  TrendingUp, 
  Target, 
  DollarSign, 
  AlertTriangle,
  ArrowRight,
  Calendar,
  MessageSquare,
  ListTodo,
  Sparkles
} from 'lucide-react';
import { useDashboardData } from '@/hooks/useDashboardData';
import { useAuth } from '@/hooks/useAuth';
import { SalesFunnelChart } from '@/components/charts/SalesFunnelChart';
import { CommissionsChart } from '@/components/charts/CommissionsChart';
import { ConversionRateChart } from '@/components/charts/ConversionRateChart';
import { GoalProgress } from '@/components/goals/GoalProgress';
import { Leaderboard } from '@/components/goals/Leaderboard';
import { TaskCenter } from '@/components/seller/TaskCenter';
import { AIInsightsPanel } from '@/components/insights/AIInsightsPanel';
import { ProductCaktoPerformance } from '@/components/product/ProductCaktoPerformance';

type DBProduct = Tables<'products'>;

interface ProductDashboardProps {
  product: DBProduct;
  onNavigate: (tab: string) => void;
}

export function ProductDashboard({ product, onNavigate }: ProductDashboardProps) {
  const { user, profile, isAdmin, isManager } = useAuth();
  const orgId = profile?.organization_id;
  // For sellers, filter by their user ID; for admin/manager, show all
  const isAdminOrManager = isAdmin() || isManager();
  const userId = isAdminOrManager ? undefined : user?.id;
  
  const { funnelData, conversionData, commissions, stats, isLoading } = useDashboardData(product.id, userId);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  const statsCards = [
    { 
      label: 'Leads Ativos', 
      value: stats.activeLeadsCount.toString(), 
      change: `${stats.wonDealsCount} convertidos`,
      icon: Users,
      color: 'text-blue-500',
      bg: 'bg-blue-500/10'
    },
    { 
      label: 'Taxa de Conversão', 
      value: `${stats.conversionRate}%`, 
      change: 'dos deals fechados',
      icon: TrendingUp,
      color: 'text-emerald-500',
      bg: 'bg-emerald-500/10'
    },
    { 
      label: 'Valor Ganho', 
      value: formatCurrency(stats.wonDealsValue), 
      change: `${stats.wonDealsCount} negócios`,
      icon: Target,
      color: 'text-violet-500',
      bg: 'bg-violet-500/10'
    },
    { 
      label: 'Comissões', 
      value: formatCurrency(stats.totalCommissions), 
      change: `${formatCurrency(stats.pendingCommissions)} pendente`,
      icon: DollarSign,
      color: 'text-amber-500',
      bg: 'bg-amber-500/10'
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header do Produto */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{product.name}</h1>
          {product.description && (
            <p className="text-muted-foreground mt-1">{product.description}</p>
          )}
        </div>
        <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20">
          Ativo
        </Badge>
      </div>

      {/* Stats Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {statsCards.map((stat, index) => {
          const Icon = stat.icon;
          return (
            <Card key={index} className="bg-card">
              <CardContent className="p-5">
                <div className="flex items-center justify-between mb-3">
                  <div className={`h-10 w-10 rounded-lg ${stat.bg} flex items-center justify-center`}>
                    <Icon className={`h-5 w-5 ${stat.color}`} />
                  </div>
                </div>
                <div className="text-2xl font-bold text-foreground">
                  {isLoading ? '...' : stat.value}
                </div>
                <div className="text-sm text-muted-foreground">{stat.label}</div>
                <div className="text-xs text-muted-foreground/70 mt-1">{stat.change}</div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Performance Cakto por produto */}
      {orgId && <ProductCaktoPerformance productId={product.id} organizationId={orgId} />}


      <div className="grid gap-6 lg:grid-cols-2">
        <SalesFunnelChart stages={funnelData} isLoading={isLoading} />
        <ConversionRateChart data={conversionData} isLoading={isLoading} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <CommissionsChart commissions={commissions} isLoading={isLoading} />
        
        {/* Leads em Risco */}
        <Card className="bg-card">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-lg font-semibold flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Leads em Risco
            </CardTitle>
            <Button variant="ghost" size="sm" onClick={() => onNavigate('leads')}>
              Ver pipeline
              <ArrowRight className="ml-1 h-4 w-4" />
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            {isLoading ? (
              <div className="text-center py-6 text-muted-foreground text-sm animate-pulse">
                Carregando...
              </div>
            ) : stats.atRiskLeads.length > 0 ? (
              stats.atRiskLeads.map((lead) => (
                <div 
                  key={lead.id}
                  className="flex items-center justify-between p-3 rounded-lg bg-amber-500/5 border border-amber-500/10"
                >
                  <div className="flex items-center gap-3">
                    <div className="h-9 w-9 rounded-full bg-amber-500/10 flex items-center justify-center">
                      <span className="text-sm font-medium text-amber-600">{lead.name.charAt(0)}</span>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-foreground">{lead.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {lead.company || 'Sem empresa'} • {lead.daysWithoutContact} dias sem contato
                      </p>
                    </div>
                  </div>
                  <Badge variant="outline" className="bg-amber-500/10 text-amber-600 border-amber-500/20">
                    {lead.daysWithoutContact}d
                  </Badge>
                </div>
              ))
            ) : (
              <div className="text-center py-6 text-muted-foreground text-sm">
                Nenhum lead em risco 🎉
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Goals and Leaderboard */}
      <div className="grid gap-6 lg:grid-cols-2">
        <GoalProgress productId={product.id} />
        <Leaderboard productId={product.id} maxHeight="320px" />
      </div>

      {/* AI Insights and Tasks */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* AI Insights - Compact Version */}
        <AIInsightsPanel 
          productId={product.id} 
          organizationId={product.organization_id}
          compact 
        />

        {/* Task Center - Compact Version */}
        {user && (
          <Card className="bg-card">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-lg font-semibold flex items-center gap-2">
                <ListTodo className="h-5 w-5 text-primary" />
                Tarefas do Dia
              </CardTitle>
              <Button variant="ghost" size="sm" onClick={() => onNavigate('tasks')}>
                Ver central
                <ArrowRight className="ml-1 h-4 w-4" />
              </Button>
            </CardHeader>
            <CardContent>
              <TaskCenter 
                userId={user.id} 
                productId={product.id} 
                productName={product.name}
                compact 
              />
            </CardContent>
          </Card>
        )}
      </div>

      {/* Quick Actions */}
      <div className="grid gap-4 md:grid-cols-3">
        <Button 
          variant="outline" 
          className="h-auto py-4 justify-start"
          onClick={() => onNavigate('leads')}
        >
          <Users className="h-5 w-5 mr-3 text-primary" />
          <div className="text-left">
            <div className="font-medium">Pipeline de Leads</div>
            <div className="text-xs text-muted-foreground">Gerenciar oportunidades</div>
          </div>
        </Button>
        <Button 
          variant="outline" 
          className="h-auto py-4 justify-start"
          onClick={() => onNavigate('cadence')}
        >
          <Calendar className="h-5 w-5 mr-3 text-primary" />
          <div className="text-left">
            <div className="font-medium">Cadência</div>
            <div className="text-xs text-muted-foreground">Roteiro de follow-up</div>
          </div>
        </Button>
        <Button 
          variant="outline" 
          className="h-auto py-4 justify-start"
          onClick={() => onNavigate('ai')}
        >
          <MessageSquare className="h-5 w-5 mr-3 text-primary" />
          <div className="text-left">
            <div className="font-medium">IA Copiloto</div>
            <div className="text-xs text-muted-foreground">Assistente de vendas</div>
          </div>
        </Button>
      </div>
    </div>
  );
}
