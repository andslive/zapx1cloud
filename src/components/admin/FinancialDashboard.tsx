import { useState } from 'react';
import { useProducts } from '@/hooks/useProducts';
import { useTeamMembers } from '@/hooks/useTeam';
import { useDeals, useDealsSummary } from '@/hooks/useDeals';
import { useCommissions, useCommissionsSummary, useApproveCommission, useMarkCommissionPaid, useBulkUpdateCommissions } from '@/hooks/useCommissions';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DollarSign, TrendingUp, Clock, CheckCircle, Users, Briefcase, Check, CreditCard } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export function FinancialDashboard() {
  const { data: products } = useProducts();
  const { data: teamMembers } = useTeamMembers();
  const [selectedProductId, setSelectedProductId] = useState<string>('all');
  const [selectedSellerId, setSelectedSellerId] = useState<string>('all');
  const [selectedCommissions, setSelectedCommissions] = useState<string[]>([]);

  const productFilter = selectedProductId !== 'all' ? selectedProductId : undefined;
  const sellerFilter = selectedSellerId !== 'all' ? selectedSellerId : undefined;

  const { data: deals } = useDeals({ productId: productFilter, sellerId: sellerFilter });
  const { data: dealsSummary } = useDealsSummary(productFilter, sellerFilter);
  const { data: commissions } = useCommissions({ productId: productFilter, userId: sellerFilter });
  const { data: commissionsSummary } = useCommissionsSummary(sellerFilter, productFilter);

  const approveCommission = useApproveCommission();
  const markPaid = useMarkCommissionPaid();
  const bulkUpdate = useBulkUpdateCommissions();

  const handleApprove = async (id: string) => {
    try {
      await approveCommission.mutateAsync(id);
      toast.success('Comissão aprovada');
    } catch (error) {
      toast.error('Erro ao aprovar comissão');
    }
  };

  const handleMarkPaid = async (id: string) => {
    try {
      await markPaid.mutateAsync(id);
      toast.success('Comissão marcada como paga');
    } catch (error) {
      toast.error('Erro ao marcar como paga');
    }
  };

  const handleBulkApprove = async () => {
    if (selectedCommissions.length === 0) return;
    try {
      await bulkUpdate.mutateAsync({ ids: selectedCommissions, status: 'approved' });
      toast.success(`${selectedCommissions.length} comissões aprovadas`);
      setSelectedCommissions([]);
    } catch (error) {
      toast.error('Erro ao aprovar comissões');
    }
  };

  const handleBulkPay = async () => {
    if (selectedCommissions.length === 0) return;
    try {
      await bulkUpdate.mutateAsync({ ids: selectedCommissions, status: 'paid' });
      toast.success(`${selectedCommissions.length} comissões marcadas como pagas`);
      setSelectedCommissions([]);
    } catch (error) {
      toast.error('Erro ao marcar como pagas');
    }
  };

  const toggleCommission = (id: string) => {
    setSelectedCommissions(prev => 
      prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id]
    );
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200">Pendente</Badge>;
      case 'approved':
        return <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">Aprovada</Badge>;
      case 'paid':
        return <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">Paga</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const pendingCommissions = commissions?.filter(c => c.status === 'pending') || [];
  const approvedCommissions = commissions?.filter(c => c.status === 'approved') || [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Dashboard Financeiro</h2>
          <p className="text-muted-foreground">Visão geral de vendas e comissões</p>
        </div>
        <div className="flex items-center gap-4">
          <Select value={selectedProductId} onValueChange={setSelectedProductId}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Todos os produtos" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os produtos</SelectItem>
              {products?.map((product) => (
                <SelectItem key={product.id} value={product.id}>
                  {product.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={selectedSellerId} onValueChange={setSelectedSellerId}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Todos os vendedores" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os vendedores</SelectItem>
              {teamMembers?.map((member) => (
                <SelectItem key={member.id} value={member.id}>
                  {member.full_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Cards de Resumo */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Vendas do Mês</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              R$ {(dealsSummary?.monthlyWon || 0).toLocaleString('pt-BR')}
            </div>
            <p className="text-xs text-muted-foreground">
              {dealsSummary?.monthlyDealsCount || 0} negócios fechados
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Comissões Pendentes</CardTitle>
            <Clock className="h-4 w-4 text-yellow-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600">
              R$ {(commissionsSummary?.pending || 0).toLocaleString('pt-BR')}
            </div>
            <p className="text-xs text-muted-foreground">
              Aguardando aprovação
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Comissões Aprovadas</CardTitle>
            <CheckCircle className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">
              R$ {(commissionsSummary?.approved || 0).toLocaleString('pt-BR')}
            </div>
            <p className="text-xs text-muted-foreground">
              A pagar
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Comissões Pagas</CardTitle>
            <TrendingUp className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              R$ {(commissionsSummary?.paid || 0).toLocaleString('pt-BR')}
            </div>
            <p className="text-xs text-muted-foreground">
              Total pago
            </p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="pending" className="space-y-4">
        <TabsList>
          <TabsTrigger value="pending" className="gap-2">
            <Clock className="h-4 w-4" />
            Pendentes ({pendingCommissions.length})
          </TabsTrigger>
          <TabsTrigger value="approved" className="gap-2">
            <CheckCircle className="h-4 w-4" />
            Aprovadas ({approvedCommissions.length})
          </TabsTrigger>
          <TabsTrigger value="deals" className="gap-2">
            <Briefcase className="h-4 w-4" />
            Negócios
          </TabsTrigger>
        </TabsList>

        <TabsContent value="pending">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Comissões Pendentes</CardTitle>
                  <CardDescription>Aprovar comissões para liberar pagamento</CardDescription>
                </div>
                {selectedCommissions.length > 0 && (
                  <Button onClick={handleBulkApprove} disabled={bulkUpdate.isPending}>
                    <Check className="mr-2 h-4 w-4" />
                    Aprovar Selecionadas ({selectedCommissions.length})
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {pendingCommissions.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">Nenhuma comissão pendente</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">
                        <Checkbox
                          checked={selectedCommissions.length === pendingCommissions.length}
                          onCheckedChange={(checked) => {
                            if (checked) {
                              setSelectedCommissions(pendingCommissions.map(c => c.id));
                            } else {
                              setSelectedCommissions([]);
                            }
                          }}
                        />
                      </TableHead>
                      <TableHead>Vendedor</TableHead>
                      <TableHead>Produto</TableHead>
                      <TableHead>Lead</TableHead>
                      <TableHead>Valor do Negócio</TableHead>
                      <TableHead>Comissão</TableHead>
                      <TableHead>Data</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pendingCommissions.map((commission) => (
                      <TableRow key={commission.id}>
                        <TableCell>
                          <Checkbox
                            checked={selectedCommissions.includes(commission.id)}
                            onCheckedChange={() => toggleCommission(commission.id)}
                          />
                        </TableCell>
                        <TableCell className="font-medium">
                          {commission.profiles?.full_name || 'N/A'}
                        </TableCell>
                        <TableCell>{commission.products?.name || 'N/A'}</TableCell>
                        <TableCell>{commission.deals?.leads?.name || 'N/A'}</TableCell>
                        <TableCell>
                          R$ {(commission.deals?.deal_value || 0).toLocaleString('pt-BR')}
                        </TableCell>
                        <TableCell className="font-medium text-green-600">
                          R$ {Number(commission.amount).toLocaleString('pt-BR')}
                        </TableCell>
                        <TableCell>
                          {format(new Date(commission.earned_at), 'dd/MM/yyyy', { locale: ptBR })}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button size="sm" onClick={() => handleApprove(commission.id)}>
                            <Check className="mr-1 h-3 w-3" />
                            Aprovar
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="approved">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Comissões Aprovadas</CardTitle>
                  <CardDescription>Marcar como pagas após efetuar o pagamento</CardDescription>
                </div>
                {selectedCommissions.length > 0 && (
                  <Button onClick={handleBulkPay} disabled={bulkUpdate.isPending}>
                    <CreditCard className="mr-2 h-4 w-4" />
                    Marcar como Pagas ({selectedCommissions.length})
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {approvedCommissions.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">Nenhuma comissão aprovada</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">
                        <Checkbox
                          checked={selectedCommissions.length === approvedCommissions.length}
                          onCheckedChange={(checked) => {
                            if (checked) {
                              setSelectedCommissions(approvedCommissions.map(c => c.id));
                            } else {
                              setSelectedCommissions([]);
                            }
                          }}
                        />
                      </TableHead>
                      <TableHead>Vendedor</TableHead>
                      <TableHead>Produto</TableHead>
                      <TableHead>Comissão</TableHead>
                      <TableHead>Aprovada em</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {approvedCommissions.map((commission) => (
                      <TableRow key={commission.id}>
                        <TableCell>
                          <Checkbox
                            checked={selectedCommissions.includes(commission.id)}
                            onCheckedChange={() => toggleCommission(commission.id)}
                          />
                        </TableCell>
                        <TableCell className="font-medium">
                          {commission.profiles?.full_name || 'N/A'}
                        </TableCell>
                        <TableCell>{commission.products?.name || 'N/A'}</TableCell>
                        <TableCell className="font-medium text-blue-600">
                          R$ {Number(commission.amount).toLocaleString('pt-BR')}
                        </TableCell>
                        <TableCell>
                          {commission.approved_at 
                            ? format(new Date(commission.approved_at), 'dd/MM/yyyy', { locale: ptBR })
                            : 'N/A'
                          }
                        </TableCell>
                        <TableCell className="text-right">
                          <Button size="sm" variant="outline" onClick={() => handleMarkPaid(commission.id)}>
                            <CreditCard className="mr-1 h-3 w-3" />
                            Pagar
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="deals">
          <Card>
            <CardHeader>
              <CardTitle>Negócios Fechados</CardTitle>
              <CardDescription>Histórico de vendas realizadas</CardDescription>
            </CardHeader>
            <CardContent>
              {deals?.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">Nenhum negócio registrado</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Lead</TableHead>
                      <TableHead>Vendedor</TableHead>
                      <TableHead>Produto</TableHead>
                      <TableHead>Valor</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Data</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {deals?.map((deal) => (
                      <TableRow key={deal.id}>
                        <TableCell className="font-medium">{deal.leads?.name || 'N/A'}</TableCell>
                        <TableCell>{deal.profiles?.full_name || 'N/A'}</TableCell>
                        <TableCell>{deal.products?.name || 'N/A'}</TableCell>
                        <TableCell className="font-medium">
                          R$ {Number(deal.deal_value).toLocaleString('pt-BR')}
                        </TableCell>
                        <TableCell>
                          <Badge variant={deal.status === 'won' ? 'default' : 'secondary'}>
                            {deal.status === 'won' ? 'Ganho' : deal.status === 'lost' ? 'Perdido' : 'Cancelado'}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {format(new Date(deal.closed_at), 'dd/MM/yyyy', { locale: ptBR })}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
