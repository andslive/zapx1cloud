import { useAuth } from '@/hooks/useAuth';
import { useCommissions, useCommissionsSummary } from '@/hooks/useCommissions';
import { useDealsSummary } from '@/hooks/useDeals';
import { usePipelineFinancialSummary } from '@/hooks/useStageValues';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { DollarSign, TrendingUp, Clock, CheckCircle, Target, Wallet, ChevronRight } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';

interface FinancialPanelProps {
  productId: string;
  productName: string;
}

export function FinancialPanel({ productId, productName }: FinancialPanelProps) {
  const { user } = useAuth();
  const userId = user?.id;
  const isMobile = useIsMobile();

  const { data: commissions } = useCommissions({ userId, productId });
  const { data: commissionsSummary } = useCommissionsSummary(userId, productId);
  const { data: dealsSummary } = useDealsSummary(productId, userId);
  const { data: pipelineSummary } = usePipelineFinancialSummary(productId, userId);

  // Mock goal - na prática viria de user_product_assignments
  const monthlyGoal = 50000;
  const goalProgress = dealsSummary ? (dealsSummary.monthlyWon / monthlyGoal) * 100 : 0;

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200 dark:bg-yellow-900/20 dark:text-yellow-400 dark:border-yellow-800">Pendente</Badge>;
      case 'approved':
        return <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-800">Aprovada</Badge>;
      case 'paid':
        return <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 dark:bg-green-900/20 dark:text-green-400 dark:border-green-800">Paga</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header - Mobile optimized */}
      {isMobile && (
        <div className="pb-2">
          <h2 className="text-xl font-bold text-foreground">Financeiro</h2>
          <p className="text-sm text-muted-foreground">{productName}</p>
        </div>
      )}

      {/* Cards de Resumo - Mobile optimized grid */}
      <div className={cn(
        "grid gap-4",
        isMobile ? "grid-cols-2" : "md:grid-cols-2 lg:grid-cols-4"
      )}>
        <Card className={cn(isMobile && "p-0")}>
          <CardHeader className={cn("flex flex-row items-center justify-between space-y-0", isMobile ? "p-4 pb-2" : "pb-2")}>
            <CardTitle className={cn("font-medium", isMobile ? "text-xs" : "text-sm")}>Comissões Ganhas</CardTitle>
            <DollarSign className={cn("text-green-500", isMobile ? "h-4 w-4" : "h-4 w-4")} />
          </CardHeader>
          <CardContent className={isMobile ? "p-4 pt-0" : ""}>
            <div className={cn("font-bold text-green-600", isMobile ? "text-xl" : "text-2xl")}>
              R$ {(commissionsSummary?.paid || 0).toLocaleString('pt-BR')}
            </div>
            <p className="text-xs text-muted-foreground">Este mês</p>
          </CardContent>
        </Card>

        <Card className={cn(isMobile && "p-0")}>
          <CardHeader className={cn("flex flex-row items-center justify-between space-y-0", isMobile ? "p-4 pb-2" : "pb-2")}>
            <CardTitle className={cn("font-medium", isMobile ? "text-xs" : "text-sm")}>A Receber</CardTitle>
            <Wallet className={cn("text-blue-500", isMobile ? "h-4 w-4" : "h-4 w-4")} />
          </CardHeader>
          <CardContent className={isMobile ? "p-4 pt-0" : ""}>
            <div className={cn("font-bold text-blue-600", isMobile ? "text-xl" : "text-2xl")}>
              R$ {((commissionsSummary?.pending || 0) + (commissionsSummary?.approved || 0)).toLocaleString('pt-BR')}
            </div>
            <p className="text-xs text-muted-foreground">Pendentes + Aprovadas</p>
          </CardContent>
        </Card>

        <Card className={cn(isMobile && "p-0")}>
          <CardHeader className={cn("flex flex-row items-center justify-between space-y-0", isMobile ? "p-4 pb-2" : "pb-2")}>
            <CardTitle className={cn("font-medium", isMobile ? "text-xs" : "text-sm")}>Potencial do Funil</CardTitle>
            <TrendingUp className={cn("text-purple-500", isMobile ? "h-4 w-4" : "h-4 w-4")} />
          </CardHeader>
          <CardContent className={isMobile ? "p-4 pt-0" : ""}>
            <div className={cn("font-bold text-purple-600", isMobile ? "text-xl" : "text-2xl")}>
              R$ {(pipelineSummary?.totalWeightedValue || 0).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}
            </div>
            <p className="text-xs text-muted-foreground">{pipelineSummary?.totalLeads || 0} leads</p>
          </CardContent>
        </Card>

        <Card className={cn(isMobile && "p-0")}>
          <CardHeader className={cn("flex flex-row items-center justify-between space-y-0", isMobile ? "p-4 pb-2" : "pb-2")}>
            <CardTitle className={cn("font-medium", isMobile ? "text-xs" : "text-sm")}>Meta do Mês</CardTitle>
            <Target className={cn("text-orange-500", isMobile ? "h-4 w-4" : "h-4 w-4")} />
          </CardHeader>
          <CardContent className={isMobile ? "p-4 pt-0" : ""}>
            <div className={cn("font-bold", isMobile ? "text-xl" : "text-2xl")}>
              {goalProgress.toFixed(0)}%
            </div>
            <Progress value={Math.min(goalProgress, 100)} className="mt-2 h-2" />
            <p className="text-xs text-muted-foreground mt-1">
              R$ {(dealsSummary?.monthlyWon || 0).toLocaleString('pt-BR')} / R$ {monthlyGoal.toLocaleString('pt-BR')}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Funil Financeiro */}
      <Card>
        <CardHeader className={isMobile ? "p-4" : ""}>
          <CardTitle className={cn("flex items-center gap-2", isMobile && "text-base")}>
            <TrendingUp className="h-5 w-5" />
            Pipeline Financeiro
          </CardTitle>
          {!isMobile && (
            <CardDescription>
              Valor potencial por etapa do funil
            </CardDescription>
          )}
        </CardHeader>
        <CardContent className={isMobile ? "p-4 pt-0" : ""}>
          {pipelineSummary?.stages && pipelineSummary.stages.length > 0 ? (
            <div className="space-y-4">
              {pipelineSummary.stages.map((stage) => (
                <div key={stage.stageId} className="flex items-center gap-3">
                  <div 
                    className="w-3 h-3 rounded-full flex-shrink-0"
                    style={{ backgroundColor: stage.stageColor }}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <span className={cn("font-medium truncate", isMobile && "text-sm")}>{stage.stageName}</span>
                      <span className="text-xs text-muted-foreground ml-2">
                        {stage.leadsCount} leads
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Progress 
                        value={(stage.weightedValue / (pipelineSummary.totalWeightedValue || 1)) * 100} 
                        className="flex-1 h-2"
                      />
                      <span className={cn("font-medium text-right", isMobile ? "text-xs w-20" : "text-sm w-28")}>
                        R$ {stage.weightedValue.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
              
              <div className="pt-4 border-t flex items-center justify-between">
                <span className="font-medium">Total Ponderado</span>
                <span className={cn("font-bold", isMobile ? "text-base" : "text-lg")}>
                  R$ {pipelineSummary.totalWeightedValue.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}
                </span>
              </div>
            </div>
          ) : (
            <p className="text-muted-foreground text-center py-8 text-sm">
              Configure os valores do pipeline no painel administrativo
            </p>
          )}
        </CardContent>
      </Card>

      {/* Histórico de Comissões */}
      <Card>
        <CardHeader className={isMobile ? "p-4" : ""}>
          <CardTitle className={cn("flex items-center gap-2", isMobile && "text-base")}>
            <DollarSign className="h-5 w-5" />
            Minhas Comissões
          </CardTitle>
          {!isMobile && (
            <CardDescription>
              Histórico de comissões e status de pagamento
            </CardDescription>
          )}
        </CardHeader>
        <CardContent className={isMobile ? "p-4 pt-0" : ""}>
          {commissions?.length === 0 ? (
            <p className="text-muted-foreground text-center py-8 text-sm">
              Nenhuma comissão registrada ainda
            </p>
          ) : isMobile ? (
            // Mobile version - Cards
            <div className="space-y-3">
              {commissions?.slice(0, 10).map((commission) => (
                <div 
                  key={commission.id}
                  className="p-4 rounded-xl border border-border bg-card"
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-foreground truncate">
                        {commission.deals?.leads?.name || 'N/A'}
                      </p>
                      {commission.deals?.leads?.company && (
                        <p className="text-xs text-muted-foreground truncate">
                          {commission.deals.leads.company}
                        </p>
                      )}
                    </div>
                    {getStatusBadge(commission.status)}
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs text-muted-foreground">Negócio</p>
                      <p className="text-sm font-medium">
                        R$ {(commission.deals?.deal_value || 0).toLocaleString('pt-BR')}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-muted-foreground">Comissão</p>
                      <p className="text-sm font-bold text-green-600">
                        R$ {Number(commission.amount).toLocaleString('pt-BR')}
                      </p>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">
                    {format(new Date(commission.earned_at), 'dd/MM/yyyy', { locale: ptBR })}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            // Desktop version - Table
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Lead</TableHead>
                  <TableHead>Valor do Negócio</TableHead>
                  <TableHead>Comissão</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Data</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {commissions?.slice(0, 10).map((commission) => (
                  <TableRow key={commission.id}>
                    <TableCell className="font-medium">
                      {commission.deals?.leads?.name || 'N/A'}
                      {commission.deals?.leads?.company && (
                        <span className="text-muted-foreground text-sm block">
                          {commission.deals.leads.company}
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      R$ {(commission.deals?.deal_value || 0).toLocaleString('pt-BR')}
                    </TableCell>
                    <TableCell className="font-medium text-green-600">
                      R$ {Number(commission.amount).toLocaleString('pt-BR')}
                    </TableCell>
                    <TableCell>
                      {getStatusBadge(commission.status)}
                    </TableCell>
                    <TableCell>
                      {format(new Date(commission.earned_at), 'dd/MM/yyyy', { locale: ptBR })}
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
