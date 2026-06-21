import { useState } from 'react';
import { 
  CreditCard, 
  Search,
  AlertTriangle,
  Mail,
  Ban,
  CheckCircle,
  Clock
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useAllSubscriptions, useUpdateSubscription, useSuperAdminStats } from '@/hooks/useSuperAdmin';
import { Skeleton } from '@/components/ui/skeleton';
import { format, differenceInDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';

export function SubscriptionsManager() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [planFilter, setPlanFilter] = useState<string>('all');

  const { data: subscriptions, isLoading } = useAllSubscriptions();
  const { data: stats } = useSuperAdminStats();
  const updateSubscription = useUpdateSubscription();

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value);
  };

  const filteredSubs = subscriptions?.filter((sub: any) => {
    const matchesSearch = sub.organizations?.name?.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === 'all' || sub.status === statusFilter;
    const matchesPlan = planFilter === 'all' || sub.plan_type === planFilter;
    
    return matchesSearch && matchesStatus && matchesPlan;
  }) || [];

  const overdueSubs = subscriptions?.filter((sub: any) => 
    sub.status === 'past_due' || 
    (sub.current_period_end && new Date(sub.current_period_end) < new Date())
  ) || [];

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return <Badge className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20">Ativo</Badge>;
      case 'past_due':
        return <Badge className="bg-amber-500/10 text-amber-500 border-amber-500/20">Em Atraso</Badge>;
      case 'canceled':
        return <Badge className="bg-red-500/10 text-red-500 border-red-500/20">Cancelado</Badge>;
      case 'suspended':
        return <Badge className="bg-gray-500/10 text-gray-500 border-gray-500/20">Suspenso</Badge>;
      case 'trialing':
        return <Badge className="bg-blue-500/10 text-blue-500 border-blue-500/20">Trial</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const getPlanBadge = (planType: string) => {
    switch (planType) {
      case 'trial':
        return <Badge variant="outline">Trial</Badge>;
      case 'starter':
        return <Badge className="bg-blue-500/10 text-blue-500 border-blue-500/20">Starter</Badge>;
      case 'pro':
        return <Badge className="bg-primary/10 text-primary border-primary/20">Pro</Badge>;
      case 'enterprise':
        return <Badge className="bg-violet-500/10 text-violet-500 border-violet-500/20">Enterprise</Badge>;
      default:
        return <Badge variant="secondary">{planType}</Badge>;
    }
  };

  const handleSendReminder = async (sub: any) => {
    toast.success(`Lembrete enviado para ${sub.organizations?.name}`);
  };

  const handleSuspend = async (sub: any) => {
    try {
      await updateSubscription.mutateAsync({
        id: sub.id,
        status: 'suspended',
      });
      toast.success('Assinatura suspensa');
    } catch (error) {
      toast.error('Erro ao suspender assinatura');
    }
  };

  const handleMarkPaid = async (sub: any) => {
    try {
      await updateSubscription.mutateAsync({
        id: sub.id,
        status: 'active',
        current_period_start: new Date().toISOString(),
        current_period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      });
      toast.success('Assinatura marcada como paga');
    } catch (error) {
      toast.error('Erro ao atualizar assinatura');
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Assinaturas</h1>
        <p className="text-muted-foreground">Gerencie planos e assinaturas das empresas</p>
      </div>

      {/* Plan Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="w-3 h-3 rounded-full bg-gray-400" />
              <span className="font-medium">Trial</span>
            </div>
            <p className="text-2xl font-bold mt-2">{stats?.planCounts?.trial || 0}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="w-3 h-3 rounded-full bg-blue-500" />
              <span className="font-medium">Starter</span>
            </div>
            <p className="text-2xl font-bold mt-2">{stats?.planCounts?.starter || 0}</p>
            <p className="text-xs text-muted-foreground">R$ 97/mês</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="w-3 h-3 rounded-full bg-primary" />
              <span className="font-medium">Pro</span>
            </div>
            <p className="text-2xl font-bold mt-2">{stats?.planCounts?.pro || 0}</p>
            <p className="text-xs text-muted-foreground">R$ 497/mês</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="w-3 h-3 rounded-full bg-violet-500" />
              <span className="font-medium">Enterprise</span>
            </div>
            <p className="text-2xl font-bold mt-2">{stats?.planCounts?.enterprise || 0}</p>
            <p className="text-xs text-muted-foreground">Personalizado</p>
          </CardContent>
        </Card>
      </div>

      {/* Overdue Subscriptions Alert */}
      {overdueSubs.length > 0 && (
        <Card className="border-amber-500/50 bg-amber-500/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-amber-500">
              <AlertTriangle className="h-5 w-5" />
              Assinaturas em Atraso ({overdueSubs.length})
            </CardTitle>
            <CardDescription>
              Empresas com pagamento pendente que precisam de atenção
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {overdueSubs.slice(0, 3).map((sub: any) => {
                const daysOverdue = sub.current_period_end 
                  ? differenceInDays(new Date(), new Date(sub.current_period_end))
                  : 0;
                
                return (
                  <div 
                    key={sub.id}
                    className="flex items-center justify-between p-3 bg-background rounded-lg border"
                  >
                    <div>
                      <p className="font-medium">{sub.organizations?.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {formatCurrency(sub.price_monthly || 0)} - Vencido há {daysOverdue} dias
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => handleSendReminder(sub)}>
                        <Mail className="h-4 w-4 mr-1" />
                        Lembrete
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => handleSuspend(sub)}>
                        <Ban className="h-4 w-4 mr-1" />
                        Suspender
                      </Button>
                      <Button size="sm" onClick={() => handleMarkPaid(sub)}>
                        <CheckCircle className="h-4 w-4 mr-1" />
                        Pago
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por empresa..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="active">Ativo</SelectItem>
                <SelectItem value="past_due">Em Atraso</SelectItem>
                <SelectItem value="suspended">Suspenso</SelectItem>
                <SelectItem value="canceled">Cancelado</SelectItem>
                <SelectItem value="trialing">Trial</SelectItem>
              </SelectContent>
            </Select>
            <Select value={planFilter} onValueChange={setPlanFilter}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Plano" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="trial">Trial</SelectItem>
                <SelectItem value="starter">Starter</SelectItem>
                <SelectItem value="pro">Pro</SelectItem>
                <SelectItem value="enterprise">Enterprise</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Subscriptions Table */}
      <Card>
        <CardContent className="pt-6">
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : filteredSubs.length === 0 ? (
            <div className="text-center py-12">
              <CreditCard className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">Nenhuma assinatura encontrada</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Empresa</TableHead>
                  <TableHead>Plano</TableHead>
                  <TableHead>Valor</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Renovação</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredSubs.map((sub: any) => (
                  <TableRow key={sub.id}>
                    <TableCell className="font-medium">
                      {sub.organizations?.name || 'N/A'}
                    </TableCell>
                    <TableCell>{getPlanBadge(sub.plan_type)}</TableCell>
                    <TableCell>{formatCurrency(sub.price_monthly || 0)}</TableCell>
                    <TableCell>{getStatusBadge(sub.status)}</TableCell>
                    <TableCell>
                      {sub.current_period_end 
                        ? format(new Date(sub.current_period_end), "dd/MM/yyyy", { locale: ptBR })
                        : '-'
                      }
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm">
                        <Clock className="h-4 w-4" />
                      </Button>
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
