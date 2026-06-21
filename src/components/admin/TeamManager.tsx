import { useState, useMemo } from 'react';
import { useTeamMembers, useUpdateUserRole, useRemoveTeamMember, TeamMember } from '@/hooks/useTeam';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { Users, Shield, UserCog, User, Loader2, Search, Plus, Filter, Package, LayoutGrid } from 'lucide-react';
import { toast } from 'sonner';
import { useSquads } from '@/hooks/useSquads';
import { useProducts } from '@/hooks/useProducts';
import { MemberCard } from './MemberCard';
import { ChangeSquadDialog } from './ChangeSquadDialog';
import { AssignProductDialog } from './AssignProductDialog';
import { PendingInvitations } from './PendingInvitations';
import { UserFormDialog } from './team/UserFormDialog';
import { SectorsManager } from './sectors/SectorsManager';

export function TeamManager() {
  const { data: members, isLoading } = useTeamMembers();
  const { data: squads } = useSquads();
  const { data: products } = useProducts();
  const updateRole = useUpdateUserRole();
  const removeMember = useRemoveTeamMember();
  
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [squadFilter, setSquadFilter] = useState<string>('all');
  const [productFilter, setProductFilter] = useState<string>('all');
  
  const [editingMember, setEditingMember] = useState<TeamMember | null>(null);
  const [selectedRole, setSelectedRole] = useState<'admin' | 'manager' | 'seller'>('seller');
  const [squadMember, setSquadMember] = useState<TeamMember | null>(null);
  const [productMember, setProductMember] = useState<TeamMember | null>(null);
  const [userFormOpen, setUserFormOpen] = useState(false);
  const [userFormMember, setUserFormMember] = useState<TeamMember | null>(null);
  const [memberToRemove, setMemberToRemove] = useState<TeamMember | null>(null);

  // Filter members
  const filteredMembers = useMemo(() => {
    if (!members) return [];
    
    return members.filter(member => {
      // Search filter
      const searchLower = search.toLowerCase();
      const matchesSearch = !search || 
        member.full_name?.toLowerCase().includes(searchLower) ||
        member.email?.toLowerCase().includes(searchLower);
      
      // Role filter
      const memberRole = member.roles[0]?.role || 'seller';
      const matchesRole = roleFilter === 'all' || memberRole === roleFilter;
      
      // Squad filter
      const memberSquadIds = member.squads.map(s => s.id);
      const matchesSquad = squadFilter === 'all' || 
        (squadFilter === 'none' && member.squads.length === 0) ||
        memberSquadIds.includes(squadFilter);

      // Product filter
      const memberProductIds = member.products?.map(p => p.id) || [];
      const matchesProduct = productFilter === 'all' ||
        (productFilter === 'none' && memberProductIds.length === 0) ||
        memberProductIds.includes(productFilter);
      
      return matchesSearch && matchesRole && matchesSquad && matchesProduct;
    });
  }, [members, search, roleFilter, squadFilter, productFilter]);

  const handleEditRole = (member: TeamMember) => {
    setEditingMember(member);
    const currentRole = member.roles[0]?.role || 'seller';
    setSelectedRole(currentRole as 'admin' | 'manager' | 'seller');
  };

  const handleSaveRole = async () => {
    if (!editingMember) return;
    
    try {
      await updateRole.mutateAsync({ 
        userId: editingMember.id, 
        role: selectedRole 
      });
      toast.success('Papel atualizado!');
      setEditingMember(null);
    } catch (error) {
      toast.error('Erro ao atualizar papel');
    }
  };

  const handleAssignProduct = (member: TeamMember) => {
    setProductMember(member);
  };

  // Get existing assignments for the product dialog
  const existingAssignments = useMemo(() => {
    if (!productMember) return [];
    return productMember.products?.map(p => ({
      id: p.assignment_id,
      product_id: p.id,
      monthly_goal: p.monthly_goal,
    })) || [];
  }, [productMember]);

  if (isLoading) {
    return (
      <div className="space-y-6">
        {/* Header Skeleton */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-2">
            <Skeleton className="h-6 w-24" />
            <Skeleton className="h-4 w-48" />
          </div>
          <Skeleton className="h-10 w-40" />
        </div>

        {/* Filters Skeleton */}
        <div className="flex flex-col sm:flex-row gap-3">
          <Skeleton className="h-10 flex-1" />
          <Skeleton className="h-10 w-[160px]" />
          <Skeleton className="h-10 w-[180px]" />
          <Skeleton className="h-10 w-[180px]" />
        </div>

        {/* Members Grid Skeleton */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Card key={i} className="bg-card">
              <CardContent className="p-5">
                <div className="flex items-start gap-4">
                  <Skeleton className="h-12 w-12 rounded-full shrink-0" />
                  <div className="flex-1 space-y-3">
                    <Skeleton className="h-5 w-32" />
                    <Skeleton className="h-4 w-44" />
                    <div className="flex gap-2">
                      <Skeleton className="h-5 w-20" />
                      <Skeleton className="h-5 w-24" />
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  const handleAddUser = () => {
    setUserFormMember(null);
    setUserFormOpen(true);
  };
  const handleEditMember = (m: TeamMember) => {
    setUserFormMember(m);
    setUserFormOpen(true);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-foreground">Equipe & Setores</h2>
          <p className="text-sm text-muted-foreground">
            Gerencie usuários, suas permissões e os setores de atendimento
          </p>
        </div>
      </div>

      <Tabs defaultValue="members" className="w-full">
        <TabsList>
          <TabsTrigger value="members" className="gap-2">
            <Users className="h-4 w-4" /> Usuários
          </TabsTrigger>
          <TabsTrigger value="sectors" className="gap-2">
            <LayoutGrid className="h-4 w-4" /> Setores
          </TabsTrigger>
        </TabsList>

        <TabsContent value="members" className="space-y-6 pt-4">
          <div className="flex justify-end">
            <Button onClick={handleAddUser}>
              <Plus className="h-4 w-4 mr-2" />
              Adicionar Usuário
            </Button>
          </div>

      {/* Pending Invitations */}
      <PendingInvitations />

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome ou email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        
        <Select value={roleFilter} onValueChange={setRoleFilter}>
          <SelectTrigger className="w-full sm:w-[160px]">
            <Filter className="h-4 w-4 mr-2 text-muted-foreground" />
            <SelectValue placeholder="Papel" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os papéis</SelectItem>
            <SelectItem value="seller">Vendedores</SelectItem>
            <SelectItem value="manager">Gestores</SelectItem>
            <SelectItem value="admin">Admins</SelectItem>
          </SelectContent>
        </Select>

        <Select value={squadFilter} onValueChange={setSquadFilter}>
          <SelectTrigger className="w-full sm:w-[180px]">
            <Users className="h-4 w-4 mr-2 text-muted-foreground" />
            <SelectValue placeholder="Squad" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os squads</SelectItem>
            <SelectItem value="none">Sem squad</SelectItem>
            {squads?.map((squad) => (
              <SelectItem key={squad.id} value={squad.id}>
                <div className="flex items-center gap-2">
                  <div 
                    className="h-2 w-2 rounded-full" 
                    style={{ backgroundColor: squad.color || '#6366F1' }}
                  />
                  {squad.name}
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={productFilter} onValueChange={setProductFilter}>
          <SelectTrigger className="w-full sm:w-[180px]">
            <Package className="h-4 w-4 mr-2 text-muted-foreground" />
            <SelectValue placeholder="Produto" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os produtos</SelectItem>
            <SelectItem value="none">Sem produto</SelectItem>
            {products?.map((product) => (
              <SelectItem key={product.id} value={product.id}>
                {product.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Members Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {filteredMembers.map((member) => (
          <MemberCard
            key={member.id}
            member={member}
            onEditRole={handleEditRole}
            onEditSquad={(m) => setSquadMember(m)}
            onAssignProduct={handleAssignProduct}
            onEditPermissions={handleEditMember}
            onRemove={(m) => setMemberToRemove(m)}
          />
        ))}

        {filteredMembers.length === 0 && (
          <Card className="col-span-full bg-card">
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Users className="h-12 w-12 text-muted-foreground/50 mb-4" />
              <h3 className="text-lg font-medium text-foreground mb-1">
                {search || roleFilter !== 'all' || squadFilter !== 'all' || productFilter !== 'all'
                  ? 'Nenhum membro encontrado' 
                  : 'Nenhum membro'}
              </h3>
              <p className="text-sm text-muted-foreground text-center max-w-sm">
                {search || roleFilter !== 'all' || squadFilter !== 'all' || productFilter !== 'all'
                  ? 'Tente ajustar os filtros de busca'
                  : 'Convide membros para sua equipe usando o botão acima'}
              </p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Role Edit Dialog */}
      <Dialog open={!!editingMember} onOpenChange={() => setEditingMember(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Alterar Papel do Usuário</DialogTitle>
          </DialogHeader>
          
          {editingMember && (
            <div className="space-y-4 py-4">
              <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                <Avatar>
                  <AvatarImage src={editingMember.avatar_url || ''} />
                  <AvatarFallback className="bg-primary/10 text-primary">
                    {editingMember.full_name?.charAt(0)}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <p className="font-medium">{editingMember.full_name}</p>
                  <p className="text-sm text-muted-foreground">{editingMember.email}</p>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Novo Papel</label>
                <Select value={selectedRole} onValueChange={(v: 'admin' | 'manager' | 'seller') => setSelectedRole(v)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="seller">
                      <div className="flex items-center gap-2">
                        <User className="h-4 w-4 text-blue-500" />
                        Vendedor
                      </div>
                    </SelectItem>
                    <SelectItem value="manager">
                      <div className="flex items-center gap-2">
                        <UserCog className="h-4 w-4 text-violet-500" />
                        Gestor
                      </div>
                    </SelectItem>
                    <SelectItem value="admin">
                      <div className="flex items-center gap-2">
                        <Shield className="h-4 w-4 text-red-500" />
                        Admin
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingMember(null)}>
              Cancelar
            </Button>
            <Button onClick={handleSaveRole} disabled={updateRole.isPending}>
              {updateRole.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Squad Dialog */}
      <ChangeSquadDialog
        member={squadMember}
        open={!!squadMember}
        onOpenChange={(open) => !open && setSquadMember(null)}
      />

      {/* Product Assignment Dialog */}
      <AssignProductDialog
        member={productMember}
        existingAssignments={existingAssignments}
        open={!!productMember}
        onOpenChange={(open) => !open && setProductMember(null)}
      />

      {/* Remove Member Confirmation */}
      <AlertDialog open={!!memberToRemove} onOpenChange={(open) => !open && setMemberToRemove(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Apagar usuário</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja apagar <strong>{memberToRemove?.full_name}</strong> permanentemente?
              Todos os dados do usuário (papel, squads, produtos, leads vinculados) serão removidos. Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (memberToRemove) {
                  removeMember.mutate(memberToRemove.id, {
                    onSuccess: () => {
                      toast.success('Usuário apagado com sucesso');
                      setMemberToRemove(null);
                    },
                    onError: () => {
                      toast.error('Erro ao apagar usuário');
                    },
                  });
                }
              }}
            >
              {removeMember.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Apagar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
        </TabsContent>

        <TabsContent value="sectors" className="pt-4">
          <SectorsManager />
        </TabsContent>
      </Tabs>

      {/* Unified User Form (Create/Edit) */}
      <UserFormDialog
        member={userFormMember}
        open={userFormOpen}
        onOpenChange={(o) => {
          setUserFormOpen(o);
          if (!o) setUserFormMember(null);
        }}
      />
    </div>
  );
}
