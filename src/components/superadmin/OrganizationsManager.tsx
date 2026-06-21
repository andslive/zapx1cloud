import { useState } from 'react';
import { 
  Building2, 
  Search, 
  Eye, 
  Edit, 
  Ban,
  CheckCircle,
  Users,
  Package,
  Calendar,
  Plus,
  Trash2
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useAllOrganizations, useUpdateOrganization, useCreateAuditLog, useCreateOrganization, useCreateSubscription, useDeleteOrganization } from '@/hooks/useSuperAdmin';
import { Skeleton } from '@/components/ui/skeleton';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useActivePlans, PlatformPlan } from '@/hooks/usePlatformPlans';
import { OrganizationCreateForm } from './OrganizationCreateForm';

interface OrganizationsManagerProps {
  onViewOrganization: (orgId: string) => void;
}

export function OrganizationsManager({ onViewOrganization }: OrganizationsManagerProps) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [planFilter, setPlanFilter] = useState<string>('all');
  const [editingOrg, setEditingOrg] = useState<any>(null);
  const [suspendingOrg, setSuspendingOrg] = useState<any>(null);
  const [deletingOrg, setDeletingOrg] = useState<any>(null);
  const [deleteConfirmName, setDeleteConfirmName] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [newOrg, setNewOrg] = useState({
    name: '',
    email: '',
    cnpj: '',
    phone: '',
    max_users: 10,
    max_products: 5,
    status: 'active',
    plan_id: '' as string,
    customize: false,
  });

  const { data: organizations, isLoading } = useAllOrganizations();
  const { data: activePlans } = useActivePlans();
  const updateOrganization = useUpdateOrganization();
  const createAuditLog = useCreateAuditLog();
  const createOrganization = useCreateOrganization();
  const createSubscription = useCreateSubscription();
  const deleteOrganization = useDeleteOrganization();

  const selectedPlan: PlatformPlan | undefined = activePlans?.find((p) => p.id === newOrg.plan_id);

  const resetForm = () => {
    setNewOrg({
      name: '',
      email: '',
      cnpj: '',
      phone: '',
      max_users: 10,
      max_products: 5,
      status: 'active',
      plan_id: '',
      customize: false,
    });
  };

  // Quando seleciona um plano, pré-popula limites
  const handleSelectPlan = (planId: string) => {
    const plan = activePlans?.find((p) => p.id === planId);
    setNewOrg((prev) => ({
      ...prev,
      plan_id: planId,
      customize: false,
      max_users: plan?.max_users ?? prev.max_users,
      max_products: plan?.max_products ?? prev.max_products,
    }));
  };

  const handleCreateOrg = async () => {
    if (!newOrg.name.trim() || !newOrg.email.trim()) {
      toast.error('Preencha nome e e-mail da empresa');
      return;
    }

    try {
      const isCustom = newOrg.customize || !newOrg.plan_id;
      const features = !isCustom && selectedPlan
        ? {
            whatsapp: selectedPlan.feature_whatsapp,
            facebook: selectedPlan.feature_facebook,
            instagram: selectedPlan.feature_instagram,
            campaigns: selectedPlan.feature_campaigns,
            scheduling: selectedPlan.feature_scheduling,
            internal_chat: selectedPlan.feature_internal_chat,
            external_api: selectedPlan.feature_external_api,
            kanban: selectedPlan.feature_kanban,
            pipeline: selectedPlan.feature_pipeline,
            integrations: selectedPlan.feature_integrations,
            audio_transcription_ai: selectedPlan.feature_audio_transcription_ai,
            text_correction_ai: selectedPlan.feature_text_correction_ai,
            ai_agents: selectedPlan.feature_ai_agents,
            voice_agents: selectedPlan.feature_voice_agents,
            outreach: selectedPlan.feature_outreach,
            capture_funnels: selectedPlan.feature_capture_funnels,
            forms: selectedPlan.feature_forms,
            webhooks: selectedPlan.feature_webhooks,
          }
        : undefined;

      const org = await createOrganization.mutateAsync({
        name: newOrg.name.trim(),
        email: newOrg.email.trim(),
        cnpj: newOrg.cnpj.trim() || null,
        phone: newOrg.phone.trim() || null,
        max_users: newOrg.max_users,
        max_products: newOrg.max_products,
        status: newOrg.status,
        plan_id: newOrg.plan_id || null,
        ...(features ? { features } : {}),
      });

      if (newOrg.plan_id && selectedPlan) {
        await createSubscription.mutateAsync({
          organization_id: org.id,
          plan_type: selectedPlan.slug,
          plan_id: selectedPlan.id,
          price_monthly: Number(selectedPlan.price_monthly),
        });
      }

      await createAuditLog.mutateAsync({
        action: `Nova empresa criada: ${newOrg.name}`,
        entity_type: 'organization',
        entity_id: org.id,
      });

      toast.success('Empresa criada com sucesso!');
      setIsCreating(false);
      resetForm();
    } catch (error) {
      console.error('Error creating organization:', error);
      toast.error('Erro ao criar empresa');
    }
  };

  const filteredOrgs = organizations?.filter((org: any) => {
    const matchesSearch = org.name?.toLowerCase().includes(search.toLowerCase()) ||
                         org.email?.toLowerCase().includes(search.toLowerCase()) ||
                         org.cnpj?.includes(search);
    
    const matchesStatus = statusFilter === 'all' || org.status === statusFilter;
    const matchesPlan = planFilter === 'all' || org.subscriptions?.[0]?.plan_type === planFilter;
    
    return matchesSearch && matchesStatus && matchesPlan;
  }) || [];

  const handleSuspend = async () => {
    if (!suspendingOrg) return;
    
    try {
      await updateOrganization.mutateAsync({
        id: suspendingOrg.id,
        status: suspendingOrg.status === 'active' ? 'suspended' : 'active',
      });
      
      await createAuditLog.mutateAsync({
        action: suspendingOrg.status === 'active' 
          ? `Empresa ${suspendingOrg.name} suspensa`
          : `Empresa ${suspendingOrg.name} reativada`,
        entity_type: 'organization',
        entity_id: suspendingOrg.id,
      });
      
      toast.success(
        suspendingOrg.status === 'active' 
          ? 'Empresa suspensa com sucesso' 
          : 'Empresa reativada com sucesso'
      );
      setSuspendingOrg(null);
    } catch (error) {
      toast.error('Erro ao atualizar status da empresa');
    }
  };

  const handleUpdateOrg = async () => {
    if (!editingOrg) return;
    
    try {
      const newPlanId: string | null = editingOrg.plan_id ?? null;
      const previousPlanId: string | null =
        organizations?.find((o: any) => o.id === editingOrg.id)?.plan_id ?? null;

      await updateOrganization.mutateAsync({
        id: editingOrg.id,
        name: editingOrg.name,
        email: editingOrg.email,
        cnpj: editingOrg.cnpj,
        phone: editingOrg.phone,
        max_users: editingOrg.max_users,
        max_products: editingOrg.max_products,
        max_connections: editingOrg.max_connections ?? null,
        plan_id: newPlanId,
      });

      // Sincroniza subscription quando o plano muda
      if (newPlanId !== previousPlanId) {
        const { supabase } = await import('@/integrations/supabase/client');
        const { data: existingSub } = await supabase
          .from('subscriptions')
          .select('id')
          .eq('organization_id', editingOrg.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (newPlanId) {
          const plan = activePlans?.find((p) => p.id === newPlanId);
          if (plan) {
            if (existingSub) {
              await supabase
                .from('subscriptions')
                .update({
                  plan_id: plan.id,
                  plan_type: plan.slug,
                  price_monthly: Number(plan.price_monthly),
                  status: 'active',
                })
                .eq('id', existingSub.id);
            } else {
              await createSubscription.mutateAsync({
                organization_id: editingOrg.id,
                plan_type: plan.slug,
                plan_id: plan.id,
                price_monthly: Number(plan.price_monthly),
              });
            }
          }
        } else if (existingSub) {
          await supabase
            .from('subscriptions')
            .update({ status: 'canceled' })
            .eq('id', existingSub.id);
        }
      }

      await createAuditLog.mutateAsync({
        action: `Empresa ${editingOrg.name} atualizada`,
        entity_type: 'organization',
        entity_id: editingOrg.id,
      });
      
      toast.success('Empresa atualizada com sucesso');
      setEditingOrg(null);
    } catch (error) {
      console.error('Error updating org:', error);
      toast.error('Erro ao atualizar empresa');
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return <Badge className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20">Ativo</Badge>;
      case 'suspended':
        return <Badge className="bg-amber-500/10 text-amber-500 border-amber-500/20">Suspenso</Badge>;
      case 'canceled':
        return <Badge className="bg-red-500/10 text-red-500 border-red-500/20">Cancelado</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const getPlanBadge = (org: any) => {
    // Fonte da verdade: plan_id da organização
    if (org?.plan_id) {
      const plan = activePlans?.find((p) => p.id === org.plan_id);
      const name = plan?.name || org.subscriptions?.[0]?.plan_type || 'Plano';
      return <Badge className="bg-primary/10 text-primary border-primary/20">{name}</Badge>;
    }
    const planType = org?.subscriptions?.[0]?.plan_type;
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
        return <Badge variant="secondary">Sem plano</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Empresas</h1>
          <p className="text-muted-foreground">Gerencie todas as organizações da plataforma</p>
        </div>
        <Button onClick={() => setIsCreating(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Nova Empresa
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por nome, e-mail ou CNPJ..."
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
                <SelectItem value="suspended">Suspenso</SelectItem>
                <SelectItem value="canceled">Cancelado</SelectItem>
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

      {/* Organizations List */}
      <div className="space-y-4">
        {isLoading ? (
          Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-32 w-full" />
          ))
        ) : filteredOrgs.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <Building2 className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">Nenhuma empresa encontrada</p>
            </CardContent>
          </Card>
        ) : (
          filteredOrgs.map((org: any) => (
            <Card key={org.id} className="hover:border-primary/50 transition-colors">
              <CardContent className="pt-6">
                <div className="flex flex-col lg:flex-row lg:items-center gap-4">
                  {/* Org Info */}
                  <div className="flex items-start gap-4 flex-1">
                    <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                      <Building2 className="h-6 w-6 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-semibold text-lg">{org.name}</h3>
                        {getStatusBadge(org.status || 'active')}
                        {getPlanBadge(org)}
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">
                        {org.cnpj && `CNPJ: ${org.cnpj} | `}
                        {org.email || 'Sem e-mail'}
                      </p>
                      <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Users className="h-3.5 w-3.5" />
                          {org.max_users || 10} usuários
                        </span>
                        <span className="flex items-center gap-1">
                          <Package className="h-3.5 w-3.5" />
                          {org.max_products || 5} produtos
                        </span>
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3.5 w-3.5" />
                          Desde {format(new Date(org.created_at), "MMM/yyyy", { locale: ptBR })}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2">
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => onViewOrganization(org.id)}
                    >
                      <Eye className="h-4 w-4 mr-1" />
                      Ver
                    </Button>
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => setEditingOrg(org)}
                    >
                      <Edit className="h-4 w-4 mr-1" />
                      Editar
                    </Button>
                    <Button 
                      variant={org.status === 'active' ? 'destructive' : 'default'}
                      size="sm"
                      onClick={() => setSuspendingOrg(org)}
                    >
                      {org.status === 'active' ? (
                        <>
                          <Ban className="h-4 w-4 mr-1" />
                          Suspender
                        </>
                      ) : (
                        <>
                          <CheckCircle className="h-4 w-4 mr-1" />
                          Reativar
                        </>
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:text-destructive hover:bg-destructive/10"
                      onClick={() => {
                        setDeletingOrg(org);
                        setDeleteConfirmName('');
                      }}
                      title="Excluir empresa"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* Edit Dialog */}
      <Dialog open={!!editingOrg} onOpenChange={(open) => !open && setEditingOrg(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Empresa</DialogTitle>
            <DialogDescription>
              Atualize as informações da empresa
            </DialogDescription>
          </DialogHeader>
          
          {editingOrg && (
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Nome</Label>
                <Input
                  value={editingOrg.name || ''}
                  onChange={(e) => setEditingOrg({ ...editingOrg, name: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>E-mail</Label>
                <Input
                  type="email"
                  value={editingOrg.email || ''}
                  onChange={(e) => setEditingOrg({ ...editingOrg, email: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>CNPJ</Label>
                <Input
                  value={editingOrg.cnpj || ''}
                  onChange={(e) => setEditingOrg({ ...editingOrg, cnpj: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Telefone</Label>
                <Input
                  value={editingOrg.phone || ''}
                  onChange={(e) => setEditingOrg({ ...editingOrg, phone: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Plano</Label>
                <Select
                  value={editingOrg.plan_id ?? 'none'}
                  onValueChange={(value) => {
                    const planId = value === 'none' ? null : value;
                    const plan = activePlans?.find((p) => p.id === planId);
                    setEditingOrg({
                      ...editingOrg,
                      plan_id: planId,
                      // Pré-popula limites do plano apenas se não houver override manual
                      max_users: plan?.max_users ?? editingOrg.max_users,
                      max_products: plan?.max_products ?? editingOrg.max_products,
                    });
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione um plano" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sem plano (personalizado)</SelectItem>
                    {activePlans?.map((plan) => (
                      <SelectItem key={plan.id} value={plan.id}>
                        {plan.name} — {plan.max_users} usuários · {plan.max_connections ?? 1} conexões
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Selecionar um plano atualiza automaticamente os limites padrão. Você pode sobrescrever abaixo.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Máx. Usuários</Label>
                  <Input
                    type="number"
                    value={editingOrg.max_users || 10}
                    onChange={(e) => setEditingOrg({ ...editingOrg, max_users: parseInt(e.target.value) })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Máx. Produtos</Label>
                  <Input
                    type="number"
                    value={editingOrg.max_products || 5}
                    onChange={(e) => setEditingOrg({ ...editingOrg, max_products: parseInt(e.target.value) })}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Máx. Conexões WhatsApp (override do plano)</Label>
                <Input
                  type="number"
                  placeholder="Vazio = usar limite do plano"
                  value={editingOrg.max_connections ?? ''}
                  onChange={(e) => setEditingOrg({
                    ...editingOrg,
                    max_connections: e.target.value === '' ? null : parseInt(e.target.value),
                  })}
                />
              </div>

            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingOrg(null)}>
              Cancelar
            </Button>
            <Button onClick={handleUpdateOrg} disabled={updateOrganization.isPending}>
              {updateOrganization.isPending ? 'Salvando...' : 'Salvar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Dialog */}
      <Dialog
        open={isCreating}
        onOpenChange={(open) => {
          if (!open) {
            setIsCreating(false);
            resetForm();
          }
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Nova Empresa</DialogTitle>
            <DialogDescription>
              Cadastre uma nova organização na plataforma
            </DialogDescription>
          </DialogHeader>
          <OrganizationCreateForm
            onCreated={() => {
              setIsCreating(false);
              resetForm();
            }}
            onCancel={() => {
              setIsCreating(false);
              resetForm();
            }}
          />
        </DialogContent>
      </Dialog>
      {/* Suspend/Reactivate confirmation */}
      <AlertDialog open={!!suspendingOrg} onOpenChange={(open) => !open && setSuspendingOrg(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {suspendingOrg?.status === 'active' ? 'Suspender empresa' : 'Reativar empresa'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {suspendingOrg?.status === 'active'
                ? `Ao suspender "${suspendingOrg?.name}", todos os usuários da empresa perderão acesso até a reativação. Deseja continuar?`
                : `Reativar "${suspendingOrg?.name}" devolverá o acesso aos usuários. Deseja continuar?`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleSuspend}
              className={suspendingOrg?.status === 'active' ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90' : ''}
            >
              {suspendingOrg?.status === 'active' ? 'Suspender' : 'Reativar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deletingOrg} onOpenChange={(open) => { if (!open) { setDeletingOrg(null); setDeleteConfirmName(''); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir empresa permanentemente</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p className="text-destructive font-medium">
                  Esta ação é irreversível. Todos os dados da empresa (usuários, leads, conversas, produtos, integrações) serão removidos.
                </p>
                <p>
                  Para confirmar, digite o nome exato da empresa: <strong>{deletingOrg?.name}</strong>
                </p>
                <Input
                  autoFocus
                  value={deleteConfirmName}
                  onChange={(e) => setDeleteConfirmName(e.target.value)}
                  placeholder={deletingOrg?.name}
                />
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleteConfirmName !== deletingOrg?.name || deleteOrganization.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={async (e) => {
                e.preventDefault();
                if (!deletingOrg) return;
                try {
                  await deleteOrganization.mutateAsync(deletingOrg.id);
                  toast.success(`Empresa "${deletingOrg.name}" excluída`);
                  setDeletingOrg(null);
                  setDeleteConfirmName('');
                } catch (err: any) {
                  toast.error(err?.message || 'Erro ao excluir empresa');
                }
              }}
            >
              {deleteOrganization.isPending ? 'Excluindo...' : 'Excluir permanentemente'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
