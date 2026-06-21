import { useState, useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Loader2, Shield, UserCog, User, Settings2 } from 'lucide-react';
import { toast } from 'sonner';
import { TeamMember } from '@/hooks/useTeam';
import {
  useUserPermissions,
  useUpdateUserPermissions,
  useInitializePermissions,
  PERMISSION_LABELS,
  PermissionKey,
  UserPermissions,
} from '@/hooks/useUserPermissions';

interface EditMemberPermissionsDialogProps {
  member: TeamMember | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const roleConfig = {
  admin: { label: 'Admin', icon: Shield, color: 'text-red-600' },
  manager: { label: 'Gestor', icon: UserCog, color: 'text-violet-600' },
  seller: { label: 'Vendedor', icon: User, color: 'text-blue-600' },
};

export function EditMemberPermissionsDialog({ member, open, onOpenChange }: EditMemberPermissionsDialogProps) {
  const { data: permissions, isLoading } = useUserPermissions(member?.id);
  const updatePermissions = useUpdateUserPermissions();
  const initPermissions = useInitializePermissions();
  const [localPerms, setLocalPerms] = useState<Partial<UserPermissions>>({});
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    if (permissions) {
      setLocalPerms(permissions);
      setHasChanges(false);
    }
  }, [permissions]);

  const role = member?.roles[0]?.role || 'seller';
  const config = roleConfig[role as keyof typeof roleConfig] || roleConfig.seller;

  const handleToggle = (key: PermissionKey, value: boolean) => {
    setLocalPerms(prev => ({ ...prev, [key]: value }));
    setHasChanges(true);
  };

  const handleSave = async () => {
    if (!member) return;
    try {
      await updatePermissions.mutateAsync({ userId: member.id, permissions: localPerms });
      toast.success('Permissões atualizadas!');
      setHasChanges(false);
    } catch {
      toast.error('Erro ao atualizar permissões');
    }
  };

  const handleInitialize = async () => {
    if (!member) return;
    try {
      await initPermissions.mutateAsync({
        userId: member.id,
        organizationId: member.organization_id || '',
        role,
      });
      toast.success('Permissões inicializadas!');
    } catch {
      toast.error('Erro ao inicializar permissões');
    }
  };

  // Group permissions by category
  const groupedPermissions = useMemo(() => {
    const groups: Record<string, { key: PermissionKey; label: string }[]> = {};
    for (const [key, meta] of Object.entries(PERMISSION_LABELS)) {
      if (!groups[meta.category]) groups[meta.category] = [];
      groups[meta.category].push({ key: key as PermissionKey, label: meta.label });
    }
    return groups;
  }, []);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings2 className="h-5 w-5" />
            Permissões do Usuário
          </DialogTitle>
        </DialogHeader>

        {member && (
          <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 mb-2">
            <Avatar className="h-10 w-10">
              <AvatarImage src={member.avatar_url || ''} />
              <AvatarFallback className="bg-primary/10 text-primary font-medium">
                {member.full_name?.charAt(0) || 'U'}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-sm truncate">{member.full_name}</p>
              <p className="text-xs text-muted-foreground truncate">{member.email}</p>
            </div>
            <Badge variant="outline" className={config.color}>
              <config.icon className="h-3 w-3 mr-1" />
              {config.label}
            </Badge>
          </div>
        )}

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : !permissions ? (
          <div className="text-center py-8 space-y-3">
            <p className="text-sm text-muted-foreground">
              Este usuário ainda não tem permissões configuradas.
            </p>
            <Button onClick={handleInitialize} disabled={initPermissions.isPending}>
              {initPermissions.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Inicializar Permissões
            </Button>
          </div>
        ) : (
          <Tabs defaultValue="permissions" className="w-full">
            <TabsList className="w-full">
              <TabsTrigger value="permissions" className="flex-1">Permissões</TabsTrigger>
              <TabsTrigger value="notifications" className="flex-1" disabled>Notificações</TabsTrigger>
            </TabsList>

            <TabsContent value="permissions" className="space-y-6 mt-4">
              {Object.entries(groupedPermissions).map(([category, perms]) => (
                <div key={category}>
                  <h4 className="text-sm font-semibold text-foreground mb-3 border-b border-border pb-1.5">
                    {category}
                  </h4>
                  <div className="space-y-3">
                    {perms.map(({ key, label }) => (
                      <div key={key} className="flex items-center justify-between gap-3">
                        <Label htmlFor={key} className="text-sm text-muted-foreground cursor-pointer flex-1">
                          {label}
                        </Label>
                        <Switch
                          id={key}
                          checked={!!localPerms[key]}
                          onCheckedChange={(v) => handleToggle(key, v)}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </TabsContent>

            <TabsContent value="notifications">
              <p className="text-sm text-muted-foreground text-center py-8">Em breve</p>
            </TabsContent>
          </Tabs>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          {permissions && (
            <Button onClick={handleSave} disabled={!hasChanges || updatePermissions.isPending}>
              {updatePermissions.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Salvar
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
