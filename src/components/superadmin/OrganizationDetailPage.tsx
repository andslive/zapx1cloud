import { useState } from 'react';
import { 
  ArrowLeft, 
  Building2,
  Users,
  Package,
  CreditCard,
  FileText,
  Mail,
  Phone,
  Calendar,
  Ban,
  CheckCircle,
  UserPlus,
  Clock,
  Copy,
  Check,
  MoreHorizontal,
  Link,
  Send,
  Trash2,
  UserCog,
  KeyRound,
  MailCheck,
  AtSign
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  useOrganizationDetails, 
  useBillingHistory, 
  useUpdateOrganization,
  useCreateOrganizationInvitation,
  useOrganizationInvitations,
  useDeleteOrganizationInvitation,
  useResendOrganizationInvitation,
  useUpdateUserRole,
  useRemoveUserFromOrganization,
  useDeleteOrganization
} from '@/hooks/useSuperAdmin';
import { DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';

interface OrganizationDetailPageProps {
  orgId: string;
  onBack: () => void;
}

export function OrganizationDetailPage({ orgId, onBack }: OrganizationDetailPageProps) {
  const { data: org, isLoading } = useOrganizationDetails(orgId);
  const { data: billingHistory } = useBillingHistory(orgId);
  const { data: pendingInvitations } = useOrganizationInvitations(orgId);
  const updateOrganization = useUpdateOrganization();
  const createInvitation = useCreateOrganizationInvitation();
  const deleteInvitation = useDeleteOrganizationInvitation();
  const resendInvitation = useResendOrganizationInvitation();
  const updateUserRole = useUpdateUserRole();
  const removeUserFromOrg = useRemoveUserFromOrganization();
  const deleteOrganization = useDeleteOrganization();
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteConfirmName, setDeleteConfirmName] = useState('');

  const [isInviting, setIsInviting] = useState(false);
  const [inviteData, setInviteData] = useState({
    email: '',
    role: 'seller' as 'admin' | 'manager' | 'seller',
  });
  const [createdInvite, setCreatedInvite] = useState<{ token: string; email: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [inviteToDelete, setInviteToDelete] = useState<{ id: string; email: string } | null>(null);
  const [userToEdit, setUserToEdit] = useState<any>(null);
  const [userToRemove, setUserToRemove] = useState<any>(null);
  const [newRole, setNewRole] = useState<'admin' | 'manager' | 'seller'>('seller');
  const [userToManage, setUserToManage] = useState<any>(null);
  const [manageAction, setManageAction] = useState<'set_password' | 'change_email' | 'confirm_email' | null>(null);
  const [manageInput, setManageInput] = useState('');
  const [managing, setManaging] = useState(false);

  const inviteLink = createdInvite 
    ? `${window.location.origin}/aceitar-convite?token=${createdInvite.token}`
    : '';

  const copyLink = async () => {
    await navigator.clipboard.writeText(inviteLink);
    setCopied(true);
    toast.success('Link copiado!');
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCloseInviteModal = () => {
    setIsInviting(false);
    setInviteData({ email: '', role: 'seller' });
    setCreatedInvite(null);
    setCopied(false);
  };

  const copyInviteLink = async (token: string) => {
    const link = `${window.location.origin}/aceitar-convite?token=${token}`;
    await navigator.clipboard.writeText(link);
    toast.success('Link copiado!');
  };

  const handleResendInvite = async (invite: any) => {
    try {
      await resendInvitation.mutateAsync({
        invitation: invite,
        organizationName: org?.name || '',
      });
      toast.success('Convite reenviado!');
    } catch (error) {
      toast.error('Erro ao reenviar convite');
    }
  };

  const handleDeleteInvite = async () => {
    if (!inviteToDelete) return;
    try {
      await deleteInvitation.mutateAsync({
        invitationId: inviteToDelete.id,
        organizationId: orgId,
      });
      toast.success('Convite excluído!');
      setInviteToDelete(null);
    } catch (error) {
      toast.error('Erro ao excluir convite');
    }
  };

  const handleEditRole = (user: any) => {
    setUserToEdit(user);
    setNewRole(user.user_roles?.[0]?.role || 'seller');
  };

  const handleSaveRole = async () => {
    if (!userToEdit) return;
    try {
      await updateUserRole.mutateAsync({
        userId: userToEdit.id,
        oldRole: userToEdit.user_roles?.[0]?.role || null,
        newRole,
      });
      toast.success('Papel atualizado com sucesso!');
      setUserToEdit(null);
    } catch (error) {
      toast.error('Erro ao atualizar papel');
    }
  };

  const handleRemoveUser = async () => {
    if (!userToRemove) return;
    try {
      await removeUserFromOrg.mutateAsync({ userId: userToRemove.id });
      toast.success('Usuário removido da empresa!');
      setUserToRemove(null);
    } catch (error) {
      toast.error('Erro ao remover usuário');
    }
  };

  const copyUserId = async (userId: string) => {
    await navigator.clipboard.writeText(userId);
    toast.success('ID copiado!');
  };

  const openManageModal = (user: any, action: 'set_password' | 'change_email' | 'confirm_email') => {
    setUserToManage(user);
    setManageAction(action);
    setManageInput(action === 'change_email' ? user.email || '' : '');
  };

  const closeManageModal = () => {
    setUserToManage(null);
    setManageAction(null);
    setManageInput('');
    setManaging(false);
  };

  const handleManageUser = async () => {
    if (!userToManage || !manageAction) return;
    setManaging(true);
    try {
      const payload: any = { action: manageAction, user_id: userToManage.id };
      if (manageAction === 'set_password') payload.password = manageInput;
      if (manageAction === 'change_email') payload.email = manageInput.trim().toLowerCase();

      const { data, error } = await supabase.functions.invoke('super-admin-manage-user', { body: payload });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      const msgs: Record<string, string> = {
        confirm_email: 'Email confirmado com sucesso!',
        set_password: 'Senha redefinida com sucesso!',
        change_email: 'Email alterado com sucesso!',
      };
      toast.success(msgs[manageAction]);
      closeManageModal();
    } catch (err: any) {
      toast.error(err.message || 'Erro ao executar ação');
      setManaging(false);
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value);
  };

  const getInitials = (name: string) => {
    return name
      ?.split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2) || '??';
  };

  const getRoleBadge = (role: string) => {
    switch (role) {
      case 'admin':
        return <Badge className="bg-red-500/10 text-red-500 border-red-500/20">Admin</Badge>;
      case 'manager':
        return <Badge className="bg-violet-500/10 text-violet-500 border-violet-500/20">Gestor</Badge>;
      case 'seller':
        return <Badge className="bg-blue-500/10 text-blue-500 border-blue-500/20">Vendedor</Badge>;
      default:
        return <Badge variant="secondary">{role}</Badge>;
    }
  };

  const getRoleLabel = (role: string) => {
    switch (role) {
      case 'admin': return 'Admin';
      case 'manager': return 'Gestor';
      case 'seller': return 'Vendedor';
      default: return role;
    }
  };

  const handleToggleStatus = async () => {
    if (!org) return;
    
    try {
      await updateOrganization.mutateAsync({
        id: org.id,
        status: org.status === 'active' ? 'suspended' : 'active',
      });
      toast.success(org.status === 'active' ? 'Empresa suspensa' : 'Empresa reativada');
    } catch (error) {
      toast.error('Erro ao atualizar status');
    }
  };

  const handleSendInvite = async () => {
    if (!inviteData.email) {
      toast.error('Preencha o email');
      return;
    }

    try {
      const result = await createInvitation.mutateAsync({
        email: inviteData.email,
        role: inviteData.role,
        organizationId: orgId,
      });
      setCreatedInvite({ token: result.token, email: inviteData.email });
      toast.success('Convite criado com sucesso!');
    } catch (error: any) {
      toast.error(error.message || 'Erro ao enviar convite');
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-[400px] w-full" />
      </div>
    );
  }

  if (!org) {
    return (
      <div className="text-center py-12">
        <Building2 className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
        <p className="text-muted-foreground">Empresa não encontrada</p>
        <Button variant="outline" onClick={onBack} className="mt-4">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Voltar
        </Button>
      </div>
    );
  }

  const subscription = org.subscriptions?.[0];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={onBack}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-foreground">{org.name}</h1>
            <p className="text-muted-foreground">{org.cnpj || 'Sem CNPJ'}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button 
            variant={org.status === 'active' ? 'destructive' : 'default'}
            onClick={handleToggleStatus}
            disabled={updateOrganization.isPending}
          >
            {org.status === 'active' ? (
              <>
                <Ban className="h-4 w-4 mr-2" />
                Suspender
              </>
            ) : (
              <>
                <CheckCircle className="h-4 w-4 mr-2" />
                Reativar
              </>
            )}
          </Button>
          <Button
            variant="ghost"
            className="text-destructive hover:text-destructive hover:bg-destructive/10"
            onClick={() => { setIsDeleting(true); setDeleteConfirmName(''); }}
            title="Excluir empresa"
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Excluir
          </Button>
        </div>
      </div>

      <Tabs defaultValue="overview" className="space-y-6">
        <TabsList>
          <TabsTrigger value="overview">Visão Geral</TabsTrigger>
          <TabsTrigger value="users">Usuários</TabsTrigger>
          <TabsTrigger value="subscription">Assinatura</TabsTrigger>
          <TabsTrigger value="billing">Faturamento</TabsTrigger>
        </TabsList>

        {/* Overview */}
        <TabsContent value="overview" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Informações da Empresa</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-3">
                  <Building2 className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">Nome:</span>
                  <span className="font-medium">{org.name}</span>
                </div>
                <div className="flex items-center gap-3">
                  <Mail className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">E-mail:</span>
                  <span className="font-medium">{org.email || 'Não informado'}</span>
                </div>
                <div className="flex items-center gap-3">
                  <Phone className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">Telefone:</span>
                  <span className="font-medium">{org.phone || 'Não informado'}</span>
                </div>
                <div className="flex items-center gap-3">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">Criado em:</span>
                  <span className="font-medium">
                    {format(new Date(org.created_at), "dd/MM/yyyy", { locale: ptBR })}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm text-muted-foreground">Status:</span>
                  <Badge className={
                    org.status === 'active' 
                      ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'
                      : 'bg-amber-500/10 text-amber-500 border-amber-500/20'
                  }>
                    {org.status === 'active' ? 'Ativo' : org.status}
                  </Badge>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Métricas</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                  <div className="flex items-center gap-3">
                    <CreditCard className="h-5 w-5 text-primary" />
                    <span>MRR</span>
                  </div>
                  <span className="font-bold">
                    {formatCurrency(subscription?.price_monthly || 0)}
                  </span>
                </div>
                <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                  <div className="flex items-center gap-3">
                    <Users className="h-5 w-5 text-blue-500" />
                    <span>Usuários</span>
                  </div>
                  <span className="font-bold">
                    {org.profiles?.length || 0} / {org.max_users || 10}
                  </span>
                </div>
                <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                  <div className="flex items-center gap-3">
                    <Package className="h-5 w-5 text-violet-500" />
                    <span>Produtos</span>
                  </div>
                  <span className="font-bold">
                    - / {org.max_products || 5}
                  </span>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Users */}
        <TabsContent value="users">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Usuários da Empresa</CardTitle>
                <CardDescription>
                  {org.profiles?.length || 0} usuários{pendingInvitations?.length ? ` | ${pendingInvitations.length} convite(s) pendente(s)` : ''}
                </CardDescription>
              </div>
              <Button onClick={() => setIsInviting(true)}>
                <UserPlus className="h-4 w-4 mr-2" />
                Adicionar Usuário
              </Button>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Usuários existentes */}
              {!org.profiles?.length ? (
                <p className="text-muted-foreground text-center py-8">
                  Nenhum usuário cadastrado
                </p>
              ) : (
                <div className="space-y-3">
                  {org.profiles.map((user: any) => (
                    <div 
                      key={user.id}
                      className="flex items-center justify-between p-3 border border-border rounded-lg"
                    >
                      <div className="flex items-center gap-3">
                        <Avatar>
                          <AvatarImage src={user.avatar_url} />
                          <AvatarFallback>{getInitials(user.full_name)}</AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="font-medium">{user.full_name || 'Sem nome'}</p>
                          <p className="text-sm text-muted-foreground">{user.email}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {user.user_roles?.[0]?.role && getRoleBadge(user.user_roles[0].role)}
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => handleEditRole(user)}>
                              <UserCog className="h-4 w-4 mr-2" />
                              Alterar Papel
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => copyUserId(user.id)}>
                              <Copy className="h-4 w-4 mr-2" />
                              Copiar ID
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => openManageModal(user, 'confirm_email')}>
                              <MailCheck className="h-4 w-4 mr-2" />
                              Validar Email
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => openManageModal(user, 'set_password')}>
                              <KeyRound className="h-4 w-4 mr-2" />
                              Redefinir Senha
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => openManageModal(user, 'change_email')}>
                              <AtSign className="h-4 w-4 mr-2" />
                              Alterar Email
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem 
                              onClick={() => setUserToRemove(user)}
                              className="text-destructive focus:text-destructive"
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              Remover da Empresa
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Convites pendentes */}
              {pendingInvitations && pendingInvitations.length > 0 && (
                <div className="space-y-3">
                  <h4 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                    <Clock className="h-4 w-4" />
                    Convites Pendentes
                  </h4>
                  {pendingInvitations.map((invite: any) => (
                    <div 
                      key={invite.id}
                      className="flex items-center justify-between p-3 border border-dashed border-border rounded-lg bg-muted/30"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
                          <Mail className="h-4 w-4 text-muted-foreground" />
                        </div>
                        <div>
                          <p className="font-medium">{invite.email}</p>
                          <p className="text-sm text-muted-foreground">
                            Expira: {format(new Date(invite.expires_at), "dd/MM/yyyy", { locale: ptBR })}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {getRoleBadge(invite.role)}
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => copyInviteLink(invite.token)}>
                              <Link className="h-4 w-4 mr-2" />
                              Copiar Link
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleResendInvite(invite)}>
                              <Send className="h-4 w-4 mr-2" />
                              Reenviar Email
                            </DropdownMenuItem>
                            <DropdownMenuItem 
                              onClick={() => setInviteToDelete({ id: invite.id, email: invite.email })}
                              className="text-destructive focus:text-destructive"
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              Excluir Convite
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Modal de Convite */}
          <Dialog open={isInviting} onOpenChange={handleCloseInviteModal}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>
                  {createdInvite ? 'Convite Criado' : 'Adicionar Usuário'}
                </DialogTitle>
              </DialogHeader>
              
              {!createdInvite ? (
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="invite-email">Email *</Label>
                    <Input 
                      id="invite-email"
                      type="email"
                      placeholder="usuario@empresa.com"
                      value={inviteData.email}
                      onChange={(e) => setInviteData(prev => ({ ...prev, email: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="invite-role">Papel *</Label>
                    <Select 
                      value={inviteData.role} 
                      onValueChange={(value: 'admin' | 'manager' | 'seller') => setInviteData(prev => ({ ...prev, role: value }))}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="seller">🔵 Vendedor</SelectItem>
                        <SelectItem value="manager">🟣 Gestor</SelectItem>
                        <SelectItem value="admin">🔴 Admin</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <p className="text-sm text-muted-foreground flex items-center gap-2">
                    <Mail className="h-4 w-4" />
                    Um convite será enviado para o email
                  </p>
                </div>
              ) : (
                <div className="space-y-4 py-4">
                  <div className="p-4 rounded-lg bg-primary/5 border border-primary/20">
                    <p className="text-sm text-muted-foreground mb-2">
                      Compartilhe este link com <strong>{createdInvite.email}</strong>:
                    </p>
                    <div className="flex items-center gap-2">
                      <Input 
                        value={inviteLink} 
                        readOnly 
                        className="text-xs bg-background"
                      />
                      <Button size="icon" variant="outline" onClick={copyLink}>
                        {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                      </Button>
                    </div>
                  </div>
                  
                  <p className="text-xs text-muted-foreground text-center">
                    O convite expira em 7 dias
                  </p>
                </div>
              )}
              
              <DialogFooter>
                {!createdInvite ? (
                  <>
                    <Button variant="outline" onClick={handleCloseInviteModal}>
                      Cancelar
                    </Button>
                    <Button 
                      onClick={handleSendInvite}
                      disabled={createInvitation.isPending}
                    >
                      {createInvitation.isPending ? 'Criando...' : 'Criar Convite'}
                    </Button>
                  </>
                ) : (
                  <Button onClick={handleCloseInviteModal} className="w-full">
                    Fechar
                  </Button>
                )}
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Alert de Exclusão de Convite */}
          <AlertDialog open={!!inviteToDelete} onOpenChange={() => setInviteToDelete(null)}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Excluir Convite</AlertDialogTitle>
                <AlertDialogDescription>
                  Tem certeza que deseja excluir o convite para <strong>{inviteToDelete?.email}</strong>? Esta ação não pode ser desfeita.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction 
                  onClick={handleDeleteInvite}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  Excluir
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          {/* Modal de Alterar Papel */}
          <Dialog open={!!userToEdit} onOpenChange={() => setUserToEdit(null)}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Alterar Papel</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
                  <Avatar>
                    <AvatarImage src={userToEdit?.avatar_url} />
                    <AvatarFallback>{getInitials(userToEdit?.full_name || '')}</AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="font-medium">{userToEdit?.full_name || 'Sem nome'}</p>
                    <p className="text-sm text-muted-foreground">{userToEdit?.email}</p>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Novo Papel</Label>
                  <Select 
                    value={newRole} 
                    onValueChange={(value: 'admin' | 'manager' | 'seller') => setNewRole(value)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="seller">🔵 Vendedor</SelectItem>
                      <SelectItem value="manager">🟣 Gestor</SelectItem>
                      <SelectItem value="admin">🔴 Admin</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setUserToEdit(null)}>
                  Cancelar
                </Button>
                <Button 
                  onClick={handleSaveRole}
                  disabled={updateUserRole.isPending}
                >
                  {updateUserRole.isPending ? 'Salvando...' : 'Salvar'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Alert de Remoção de Usuário */}
          <AlertDialog open={!!userToRemove} onOpenChange={() => setUserToRemove(null)}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Remover Usuário</AlertDialogTitle>
                <AlertDialogDescription>
                  Tem certeza que deseja remover <strong>{userToRemove?.full_name || userToRemove?.email}</strong> da empresa? O usuário perderá acesso e seus papéis serão removidos.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction 
                  onClick={handleRemoveUser}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  Remover
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          {/* Modal de Gerenciamento de Conta (validar email / senha / email) */}
          <Dialog open={!!userToManage} onOpenChange={(o) => !o && closeManageModal()}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>
                  {manageAction === 'confirm_email' && 'Validar Email'}
                  {manageAction === 'set_password' && 'Redefinir Senha'}
                  {manageAction === 'change_email' && 'Alterar Email'}
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
                  <Avatar>
                    <AvatarImage src={userToManage?.avatar_url} />
                    <AvatarFallback>{getInitials(userToManage?.full_name || '')}</AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="font-medium">{userToManage?.full_name || 'Sem nome'}</p>
                    <p className="text-sm text-muted-foreground">{userToManage?.email}</p>
                  </div>
                </div>

                {manageAction === 'confirm_email' && (
                  <p className="text-sm text-muted-foreground">
                    Confirmar manualmente o email deste usuário, dispensando a verificação por link. Use quando o usuário não recebeu ou perdeu o email de validação.
                  </p>
                )}

                {manageAction === 'set_password' && (
                  <div className="space-y-2">
                    <Label>Nova Senha</Label>
                    <Input
                      type="text"
                      value={manageInput}
                      onChange={(e) => setManageInput(e.target.value)}
                      placeholder="Mínimo 8 caracteres"
                      autoFocus
                    />
                    <p className="text-xs text-muted-foreground">
                      Informe a nova senha. O usuário poderá trocá-la depois em Perfil → Trocar senha.
                    </p>
                  </div>
                )}

                {manageAction === 'change_email' && (
                  <div className="space-y-2">
                    <Label>Novo Email</Label>
                    <Input
                      type="email"
                      value={manageInput}
                      onChange={(e) => setManageInput(e.target.value)}
                      placeholder="novo@email.com"
                      autoFocus
                    />
                    <p className="text-xs text-muted-foreground">
                      O email será alterado e marcado como confirmado automaticamente.
                    </p>
                  </div>
                )}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={closeManageModal} disabled={managing}>
                  Cancelar
                </Button>
                <Button
                  onClick={handleManageUser}
                  disabled={
                    managing ||
                    (manageAction === 'set_password' && manageInput.length < 8) ||
                    (manageAction === 'change_email' && !manageInput.includes('@'))
                  }
                >
                  {managing ? 'Aplicando...' : 'Confirmar'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </TabsContent>

        {/* Subscription */}
        <TabsContent value="subscription">
          <Card>
            <CardHeader>
              <CardTitle>Assinatura Atual</CardTitle>
            </CardHeader>
            <CardContent>
              {!subscription ? (
                <p className="text-muted-foreground text-center py-8">
                  Nenhuma assinatura ativa
                </p>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
                    <div>
                      <p className="text-sm text-muted-foreground">Plano</p>
                      <p className="text-xl font-bold capitalize">{subscription.plan_type}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm text-muted-foreground">Valor</p>
                      <p className="text-xl font-bold">
                        {formatCurrency(subscription.price_monthly || 0)}/mês
                      </p>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-4 border border-border rounded-lg">
                      <p className="text-sm text-muted-foreground">Status</p>
                      <Badge className={
                        subscription.status === 'active'
                          ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20 mt-1'
                          : 'bg-amber-500/10 text-amber-500 border-amber-500/20 mt-1'
                      }>
                        {subscription.status === 'active' ? 'Ativo' : subscription.status}
                      </Badge>
                    </div>
                    <div className="p-4 border border-border rounded-lg">
                      <p className="text-sm text-muted-foreground">Renovação</p>
                      <p className="font-medium mt-1">
                        {subscription.current_period_end
                          ? format(new Date(subscription.current_period_end), "dd/MM/yyyy", { locale: ptBR })
                          : '-'
                        }
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Billing */}
        <TabsContent value="billing">
          <Card>
            <CardHeader>
              <CardTitle>Histórico de Faturamento</CardTitle>
            </CardHeader>
            <CardContent>
              {!billingHistory?.length ? (
                <p className="text-muted-foreground text-center py-8">
                  Nenhuma cobrança registrada
                </p>
              ) : (
                <div className="space-y-3">
                  {billingHistory.map((bill: any) => (
                    <div 
                      key={bill.id}
                      className="flex items-center justify-between p-3 border border-border rounded-lg"
                    >
                      <div>
                        <p className="font-medium">{bill.description || 'Mensalidade'}</p>
                        <p className="text-sm text-muted-foreground">
                          {bill.due_date 
                            ? format(new Date(bill.due_date), "dd/MM/yyyy", { locale: ptBR })
                            : '-'
                          }
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-bold">{formatCurrency(bill.amount)}</p>
                        <Badge variant={bill.status === 'paid' ? 'default' : 'secondary'}>
                          {bill.status === 'paid' ? 'Pago' : bill.status}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <AlertDialog open={isDeleting} onOpenChange={(open) => { if (!open) { setIsDeleting(false); setDeleteConfirmName(''); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir empresa permanentemente</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p className="text-destructive font-medium">
                  Esta ação é irreversível. Todos os dados (usuários, leads, conversas, produtos, integrações) serão removidos.
                </p>
                <p>Para confirmar, digite o nome exato: <strong>{org.name}</strong></p>
                <Input
                  autoFocus
                  value={deleteConfirmName}
                  onChange={(e) => setDeleteConfirmName(e.target.value)}
                  placeholder={org.name}
                />
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleteConfirmName !== org.name || deleteOrganization.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={async (e) => {
                e.preventDefault();
                try {
                  await deleteOrganization.mutateAsync(org.id);
                  toast.success(`Empresa "${org.name}" excluída`);
                  onBack();
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
