import { useState } from 'react';
import { useProducts } from '@/hooks/useProducts';
import { useTeamMembers } from '@/hooks/useTeam';
import { useCommissionRules, useCreateCommissionRule, useUpdateCommissionRule, useDeleteCommissionRule } from '@/hooks/useCommissions';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Plus, Pencil, Trash2, Percent, DollarSign, Users, User } from 'lucide-react';
import { toast } from 'sonner';

export function CommissionManager() {
  const { user } = useAuth();
  const { data: products } = useProducts();
  const { data: teamMembers } = useTeamMembers();
  const { data: commissionRules, isLoading } = useCommissionRules();
  const createRule = useCreateCommissionRule();
  const updateRule = useUpdateCommissionRule();
  const deleteRule = useDeleteCommissionRule();

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    product_id: '',
    user_id: '',
    rule_type: 'percentage' as 'percentage' | 'fixed',
    base_value: 10,
    min_value: 0,
    max_value: null as number | null,
    is_default: true
  });

  const resetForm = () => {
    setFormData({
      product_id: '',
      user_id: '',
      rule_type: 'percentage',
      base_value: 10,
      min_value: 0,
      max_value: null,
      is_default: true
    });
    setEditingRule(null);
  };

  const handleSubmit = async () => {
    if (!formData.product_id) {
      toast.error('Selecione um produto');
      return;
    }

    try {
      const ruleData = {
        product_id: formData.product_id,
        user_id: formData.is_default ? null : formData.user_id || null,
        organization_id: user?.user_metadata?.organization_id || '',
        rule_type: formData.rule_type,
        base_value: formData.base_value,
        min_value: formData.min_value,
        max_value: formData.max_value,
        applies_to: 'deal' as const,
        stage_id: null,
        is_default: formData.is_default,
        is_active: true
      };

      if (editingRule) {
        await updateRule.mutateAsync({ id: editingRule, ...ruleData });
        toast.success('Regra atualizada com sucesso');
      } else {
        await createRule.mutateAsync(ruleData);
        toast.success('Regra criada com sucesso');
      }

      setIsDialogOpen(false);
      resetForm();
    } catch (error) {
      toast.error('Erro ao salvar regra');
    }
  };

  const handleEdit = (rule: typeof commissionRules[0]) => {
    setFormData({
      product_id: rule.product_id,
      user_id: rule.user_id || '',
      rule_type: rule.rule_type as 'percentage' | 'fixed',
      base_value: rule.base_value,
      min_value: rule.min_value || 0,
      max_value: rule.max_value,
      is_default: rule.is_default
    });
    setEditingRule(rule.id);
    setIsDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteRule.mutateAsync(id);
      toast.success('Regra removida com sucesso');
    } catch (error) {
      toast.error('Erro ao remover regra');
    }
  };

  const groupedRules = commissionRules?.reduce((acc, rule) => {
    const productId = rule.product_id;
    if (!acc[productId]) {
      acc[productId] = [];
    }
    acc[productId].push(rule);
    return acc;
  }, {} as Record<string, typeof commissionRules>);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Regras de Comissão</h2>
          <p className="text-muted-foreground">Configure as regras de comissão por produto e vendedor</p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={(open) => {
          setIsDialogOpen(open);
          if (!open) resetForm();
        }}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Nova Regra
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle>{editingRule ? 'Editar Regra' : 'Nova Regra de Comissão'}</DialogTitle>
              <DialogDescription>
                Configure a regra de comissão para os vendedores
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="space-y-2">
                <Label>Produto</Label>
                <Select
                  value={formData.product_id}
                  onValueChange={(value) => setFormData({ ...formData, product_id: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione um produto" />
                  </SelectTrigger>
                  <SelectContent>
                    {products?.map((product) => (
                      <SelectItem key={product.id} value={product.id}>
                        {product.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center space-x-2">
                <Switch
                  id="is_default"
                  checked={formData.is_default}
                  onCheckedChange={(checked) => setFormData({ ...formData, is_default: checked })}
                />
                <Label htmlFor="is_default">Regra padrão (todos os vendedores)</Label>
              </div>

              {!formData.is_default && (
                <div className="space-y-2">
                  <Label>Vendedor Específico</Label>
                  <Select
                    value={formData.user_id}
                    onValueChange={(value) => setFormData({ ...formData, user_id: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione um vendedor" />
                    </SelectTrigger>
                    <SelectContent>
                      {teamMembers?.map((member) => (
                        <SelectItem key={member.id} value={member.id}>
                          {member.full_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="space-y-2">
                <Label>Tipo de Comissão</Label>
                <Select
                  value={formData.rule_type}
                  onValueChange={(value) => setFormData({ ...formData, rule_type: value as 'percentage' | 'fixed' })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="percentage">Percentual (%)</SelectItem>
                    <SelectItem value="fixed">Valor Fixo (R$)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>
                  {formData.rule_type === 'percentage' ? 'Percentual (%)' : 'Valor Fixo (R$)'}
                </Label>
                <Input
                  type="number"
                  value={formData.base_value}
                  onChange={(e) => setFormData({ ...formData, base_value: Number(e.target.value) })}
                  min={0}
                  step={formData.rule_type === 'percentage' ? 0.5 : 100}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Valor Mínimo (R$)</Label>
                  <Input
                    type="number"
                    value={formData.min_value}
                    onChange={(e) => setFormData({ ...formData, min_value: Number(e.target.value) })}
                    min={0}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Valor Máximo (R$)</Label>
                  <Input
                    type="number"
                    value={formData.max_value || ''}
                    onChange={(e) => setFormData({ ...formData, max_value: e.target.value ? Number(e.target.value) : null })}
                    min={0}
                    placeholder="Sem limite"
                  />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                Cancelar
              </Button>
              <Button onClick={handleSubmit} disabled={createRule.isPending || updateRule.isPending}>
                {editingRule ? 'Salvar' : 'Criar Regra'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      ) : (
        <div className="space-y-6">
          {products?.map((product) => {
            const productRules = groupedRules?.[product.id] || [];
            return (
              <Card key={product.id}>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    {product.name}
                    <Badge variant="secondary">{productRules.length} regras</Badge>
                  </CardTitle>
                  <CardDescription>{product.description}</CardDescription>
                </CardHeader>
                <CardContent>
                  {productRules.length === 0 ? (
                    <p className="text-muted-foreground text-sm">Nenhuma regra de comissão configurada</p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Tipo</TableHead>
                          <TableHead>Aplicação</TableHead>
                          <TableHead>Valor</TableHead>
                          <TableHead>Limites</TableHead>
                          <TableHead className="text-right">Ações</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {productRules.map((rule) => (
                          <TableRow key={rule.id}>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                {rule.rule_type === 'percentage' ? (
                                  <Percent className="h-4 w-4 text-muted-foreground" />
                                ) : (
                                  <DollarSign className="h-4 w-4 text-muted-foreground" />
                                )}
                                {rule.rule_type === 'percentage' ? 'Percentual' : 'Fixo'}
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                {rule.is_default ? (
                                  <>
                                    <Users className="h-4 w-4 text-muted-foreground" />
                                    <span>Todos</span>
                                  </>
                                ) : (
                                  <>
                                    <User className="h-4 w-4 text-muted-foreground" />
                                    <span>{rule.profiles?.full_name || 'Vendedor'}</span>
                                  </>
                                )}
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline">
                                {rule.rule_type === 'percentage' 
                                  ? `${rule.base_value}%` 
                                  : `R$ ${rule.base_value.toLocaleString('pt-BR')}`
                                }
                              </Badge>
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {rule.min_value ? `Min: R$ ${rule.min_value.toLocaleString('pt-BR')}` : ''}
                              {rule.min_value && rule.max_value ? ' | ' : ''}
                              {rule.max_value ? `Max: R$ ${rule.max_value.toLocaleString('pt-BR')}` : ''}
                              {!rule.min_value && !rule.max_value ? 'Sem limites' : ''}
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex justify-end gap-2">
                                <Button variant="ghost" size="icon" onClick={() => handleEdit(rule)}>
                                  <Pencil className="h-4 w-4" />
                                </Button>
                                <Button variant="ghost" size="icon" onClick={() => handleDelete(rule.id)}>
                                  <Trash2 className="h-4 w-4 text-destructive" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
