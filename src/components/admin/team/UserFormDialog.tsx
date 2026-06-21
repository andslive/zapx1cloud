import { useState, useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, UserPlus, X, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useSectors } from '@/hooks/useSectors';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { TeamMember } from '@/hooks/useTeam';
import { useUserPermissions, useUpdateUserPermissions, useInitializePermissions, PERMISSION_LABELS, PermissionKey } from '@/hooks/useUserPermissions';
import { useNotificationSettings, useUpsertNotificationSettings, NOTIFICATION_LABELS } from '@/hooks/useNotificationSettings';

interface UserFormDialogProps {
  member?: TeamMember | null; // null/undefined = create mode
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const DEFAULT_GENERAL = {
  full_name: '',
  email: '',
  password: '',
  role: 'seller' as 'admin' | 'manager' | 'seller',
  recovery_whatsapp: '',
  default_connection_id: '' as string,
  work_start_time: '00:00',
  work_end_time: '23:59',
  farewell_message: '',
  default_theme: 'system',
  default_menu_state: 'open',
  avatar_url: '',
};

export function UserFormDialog({ member, open, onOpenChange }: UserFormDialogProps) {
  const isEdit = !!member;
  const queryClient = useQueryClient();
  const { profile } = useAuth();
  const { data: sectors } = useSectors();

  const [tab, setTab] = useState('general');
  const [general, setGeneral] = useState(DEFAULT_GENERAL);
  const [sectorIds, setSectorIds] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  // Existing permissions/notifications when editing
  const { data: permissions } = useUserPermissions(member?.id);
  const updatePermissions = useUpdateUserPermissions();
  const initPermissions = useInitializePermissions();
  const { data: notifications } = useNotificationSettings(member?.id);
  const upsertNotifications = useUpsertNotificationSettings();

  const [localPerms, setLocalPerms] = useState<Record<string, any>>({});
  const [localNotifs, setLocalNotifs] = useState<Record<string, boolean>>({});

  // WhatsApp connections
  const { data: connections } = useQuery({
    queryKey: ['evolution-instances', profile?.organization_id],
    queryFn: async () => {
      if (!profile?.organization_id) return [];
      const { data, error } = await supabase
        .from('evolution_instances')
        .select('id, name, phone_number')
        .eq('organization_id', profile.organization_id);
      if (error) return [];
      return data || [];
    },
    enabled: !!profile?.organization_id,
  });

  // Initialize on open
  useEffect(() => {
    if (!open) return;

    if (member) {
      setGeneral({
        full_name: member.full_name || '',
        email: member.email || '',
        password: '',
        role: ((member.roles?.[0]?.role as any) || 'seller'),
        recovery_whatsapp: (member as any).recovery_whatsapp || '',
        default_connection_id: (member as any).default_connection_id || '',
        work_start_time: (member as any).work_start_time?.slice(0, 5) || '00:00',
        work_end_time: (member as any).work_end_time?.slice(0, 5) || '23:59',
        farewell_message: (member as any).farewell_message || '',
        default_theme: (member as any).default_theme || 'system',
        default_menu_state: (member as any).default_menu_state || 'open',
        avatar_url: member.avatar_url || '',
      });
      // Load member's sectors
      supabase
        .from('sector_members')
        .select('sector_id')
        .eq('user_id', member.id)
        .then(({ data }) => setSectorIds((data || []).map((r) => r.sector_id)));
    } else {
      setGeneral(DEFAULT_GENERAL);
      setSectorIds([]);
    }
    setTab('general');
  }, [member, open]);

  // Pre-select first available connection when creating a new user
  useEffect(() => {
    if (!open || isEdit) return;
    if (!general.default_connection_id && connections && connections.length > 0) {
      setGeneral((g) => ({ ...g, default_connection_id: connections[0].id }));
    }
  }, [open, isEdit, connections, general.default_connection_id]);

  useEffect(() => {
    if (permissions) setLocalPerms(permissions as any);
  }, [permissions]);

  useEffect(() => {
    if (notifications) setLocalNotifs(notifications as any);
  }, [notifications]);

  const sectorBadges = useMemo(
    () => (sectors || []).filter((s) => sectorIds.includes(s.id)),
    [sectors, sectorIds]
  );
  const availableSectors = useMemo(
    () => (sectors || []).filter((s) => !sectorIds.includes(s.id)),
    [sectors, sectorIds]
  );

  const updateGeneral = (k: keyof typeof general, v: any) => setGeneral((g) => ({ ...g, [k]: v }));

  const handleAvatarUpload = async (file: File) => {
    try {
      const ext = file.name.split('.').pop();
      const path = `${profile?.organization_id}/${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from('avatars').upload(path, file, { upsert: true });
      if (error) throw error;
      const { data } = supabase.storage.from('avatars').getPublicUrl(path);
      updateGeneral('avatar_url', data.publicUrl);
      toast.success('Avatar enviado');
    } catch (e: any) {
      toast.error(e.message || 'Erro no upload');
    }
  };

  const handleSubmit = async () => {
    if (!general.full_name.trim()) return toast.error('Informe o nome');
    if (!isEdit) {
      if (!general.email.trim()) return toast.error('Informe o email');
      if (!general.password || general.password.length < 6) return toast.error('Senha mínima de 6 caracteres');
    }

    setSubmitting(true);
    try {
      if (isEdit && member) {
        // Update profile (critical: must succeed)
        const { error: profileErr } = await supabase.from('profiles').update({
          full_name: general.full_name,
          recovery_whatsapp: general.recovery_whatsapp || null,
          default_connection_id: general.default_connection_id || null,
          work_start_time: general.work_start_time,
          work_end_time: general.work_end_time,
          farewell_message: general.farewell_message || null,
          default_theme: general.default_theme,
          default_menu_state: general.default_menu_state,
          avatar_url: general.avatar_url || null,
        }).eq('id', member.id);
        if (profileErr) throw profileErr;

        // Non-critical blocks: log but don't abort
        const currentRole = member.roles?.[0]?.role;
        if (currentRole !== general.role) {
          try {
            await supabase.from('user_roles').delete().eq('user_id', member.id);
            await supabase.from('user_roles').insert({ user_id: member.id, role: general.role });
          } catch (e) { console.warn('role update failed', e); }
        }

        // Sync sectors (CRITICAL): compute diff and apply add/remove explicitly so
        // a partial RLS failure surfaces to the user instead of silently wiping.
        try {
          const { data: existing, error: fetchErr } = await supabase
            .from('sector_members')
            .select('sector_id')
            .eq('user_id', member.id);
          if (fetchErr) throw fetchErr;

          const currentIds = new Set((existing || []).map((r: any) => r.sector_id));
          const desiredIds = new Set(sectorIds);
          const toRemove = [...currentIds].filter((id) => !desiredIds.has(id));
          const toAdd = [...desiredIds].filter((id) => !currentIds.has(id));

          if (toRemove.length > 0) {
            const { error: delErr } = await supabase
              .from('sector_members')
              .delete()
              .eq('user_id', member.id)
              .in('sector_id', toRemove);
            if (delErr) throw delErr;
          }

          if (toAdd.length > 0) {
            const { error: insErr } = await supabase
              .from('sector_members')
              .upsert(
                toAdd.map((sid) => ({ sector_id: sid, user_id: member.id })),
                { onConflict: 'sector_id,user_id', ignoreDuplicates: true }
              );
            if (insErr) throw insErr;
          }
        } catch (e: any) {
          console.error('sectors sync failed', e);
          toast.error(`Erro ao salvar setores: ${e?.message || 'permissão negada'}`);
          // Don't abort the rest, but make the failure visible
        }

        if (Object.keys(localPerms).length > 0) {
          try {
            const { id, user_id, organization_id, created_at, updated_at, ...rest } = localPerms as any;
            await updatePermissions.mutateAsync({ userId: member.id, permissions: rest });
          } catch (e) { console.warn('permissions save failed', e); }
        }

        if (Object.keys(localNotifs).length > 0) {
          try {
            const { user_id, organization_id, created_at, updated_at, ...rest } = localNotifs as any;
            await upsertNotifications.mutateAsync({ userId: member.id, settings: rest });
          } catch (e) { console.warn('notifications save failed', e); }
        }

        toast.success('Usuário atualizado!');
      } else {
        // Create via edge function
        const { data, error } = await supabase.functions.invoke('create-team-member', {
          body: {
            email: general.email,
            password: general.password,
            full_name: general.full_name,
            role: general.role,
            recovery_whatsapp: general.recovery_whatsapp || undefined,
            sector_ids: sectorIds,
            default_connection_id: general.default_connection_id || undefined,
            work_start_time: general.work_start_time,
            work_end_time: general.work_end_time,
            farewell_message: general.farewell_message || undefined,
            default_theme: general.default_theme,
            default_menu_state: general.default_menu_state,
            avatar_url: general.avatar_url || undefined,
          },
        });
        if (error) throw error;
        if ((data as any)?.error) throw new Error((data as any).error);
        toast.success('Usuário criado com sucesso!');
      }

      queryClient.invalidateQueries({ queryKey: ['team-members'] });
      queryClient.invalidateQueries({ queryKey: ['sectors'] });
      queryClient.invalidateQueries({ queryKey: ['user-sectors'] });
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err?.message || 'Erro ao salvar usuário');
    } finally {
      setSubmitting(false);
    }
  };

  // Group permissions by category
  const groupedPerms = useMemo(() => {
    const groups: Record<string, { key: PermissionKey; label: string }[]> = {};
    for (const [key, meta] of Object.entries(PERMISSION_LABELS)) {
      if (!groups[meta.category]) groups[meta.category] = [];
      groups[meta.category].push({ key: key as PermissionKey, label: meta.label });
    }
    return groups;
  }, []);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5 text-primary" />
            {isEdit ? 'Editar Usuário' : 'Adicionar Usuário'}
          </DialogTitle>
        </DialogHeader>

        <Tabs value={tab} onValueChange={setTab} className="w-full">
          <TabsList className="w-full grid grid-cols-3">
            <TabsTrigger value="general">Geral</TabsTrigger>
            <TabsTrigger value="permissions">Permissões</TabsTrigger>
            <TabsTrigger value="notifications">Notificações</TabsTrigger>
          </TabsList>

          {/* ============== GERAL ============== */}
          <TabsContent value="general" className="space-y-4 pt-5">
            {/* Avatar */}
            <div className="flex flex-col items-center gap-2">
              <Avatar className="h-20 w-20">
                <AvatarImage src={general.avatar_url} />
                <AvatarFallback className="text-xl bg-primary/10 text-primary">
                  {general.full_name?.charAt(0) || '?'}
                </AvatarFallback>
              </Avatar>
              <label className="cursor-pointer">
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => e.target.files?.[0] && handleAvatarUpload(e.target.files[0])}
                />
                <Button type="button" variant="outline" size="sm" asChild>
                  <span><Upload className="h-3.5 w-3.5 mr-1.5" /> Enviar avatar</span>
                </Button>
              </label>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="name">Nome *</Label>
                <Input id="name" value={general.full_name} onChange={(e) => updateGeneral('full_name', e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="role">Perfil *</Label>
                <Select value={general.role} onValueChange={(v: any) => updateGeneral('role', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="seller">Vendedor</SelectItem>
                    <SelectItem value="manager">Gestor</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="email">Email *</Label>
                <Input
                  id="email"
                  type="email"
                  value={general.email}
                  onChange={(e) => updateGeneral('email', e.target.value)}
                  disabled={isEdit}
                />
              </div>
              {!isEdit && (
                <div className="space-y-1.5">
                  <Label htmlFor="pwd">Senha *</Label>
                  <Input id="pwd" type="password" value={general.password} onChange={(e) => updateGeneral('password', e.target.value)} />
                </div>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="wpp">WhatsApp para Recuperação (Ex: 5511999999999)</Label>
              <Input id="wpp" value={general.recovery_whatsapp} onChange={(e) => updateGeneral('recovery_whatsapp', e.target.value)} />
            </div>

            {/* Setores */}
            <div className="space-y-1.5">
              <Label>Setores</Label>
              {sectorBadges.length > 0 && (
                <div className="flex flex-wrap gap-1.5 p-2 border rounded-md bg-muted/30">
                  {sectorBadges.map((s) => (
                    <Badge key={s.id} variant="secondary" className="gap-1.5">
                      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: s.color || '#999' }} />
                      {s.name}
                      <button
                        type="button"
                        onClick={() => setSectorIds(sectorIds.filter((id) => id !== s.id))}
                        className="hover:bg-background rounded-full p-0.5"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
              {availableSectors.length > 0 && (
                <Select value="" onValueChange={(v) => v && setSectorIds([...sectorIds, v])}>
                  <SelectTrigger><SelectValue placeholder="+ Adicionar setor" /></SelectTrigger>
                  <SelectContent>
                    {availableSectors.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        <div className="flex items-center gap-2">
                          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: s.color || '#999' }} />
                          {s.name}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            {/* Conexão padrão */}
            <div className="space-y-1.5">
              <Label>Conexão Padrão (WhatsApp)</Label>
              {(!connections || connections.length === 0) ? (
                <div className="text-xs rounded-md border border-yellow-300 bg-yellow-50 text-yellow-900 px-3 py-2">
                  Nenhuma conexão WhatsApp encontrada. Conecte um aparelho em <strong>Integrações → WhatsApp</strong> para que esse usuário receba conversas.
                </div>
              ) : (
                <Select
                  value={general.default_connection_id || 'none'}
                  onValueChange={(v) => updateGeneral('default_connection_id', v === 'none' ? '' : v)}
                >
                  <SelectTrigger><SelectValue placeholder="Nenhuma" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Nenhuma</SelectItem>
                    {connections.map((c: any) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name} {c.phone_number ? `(${c.phone_number})` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Início de trabalho</Label>
                <Input type="time" value={general.work_start_time} onChange={(e) => updateGeneral('work_start_time', e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Fim de trabalho</Label>
                <Input type="time" value={general.work_end_time} onChange={(e) => updateGeneral('work_end_time', e.target.value)} />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Mensagem de despedida</Label>
              <Textarea rows={2} value={general.farewell_message} onChange={(e) => updateGeneral('farewell_message', e.target.value)} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Tema padrão</Label>
                <Select value={general.default_theme} onValueChange={(v) => updateGeneral('default_theme', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="light">Claro</SelectItem>
                    <SelectItem value="dark">Escuro</SelectItem>
                    <SelectItem value="system">Sistema</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Menu padrão</Label>
                <Select value={general.default_menu_state} onValueChange={(v) => updateGeneral('default_menu_state', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="open">Aberto</SelectItem>
                    <SelectItem value="collapsed">Recolhido</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </TabsContent>

          {/* ============== PERMISSÕES ============== */}
          <TabsContent value="permissions" className="space-y-5 pt-5">
            {!isEdit ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                Permissões poderão ser configuradas após criar o usuário.<br />
                Defaults serão aplicadas automaticamente conforme o perfil escolhido.
              </p>
            ) : !permissions ? (
              <div className="text-center py-8 space-y-3">
                <p className="text-sm text-muted-foreground">Permissões ainda não foram inicializadas.</p>
                <Button
                  onClick={() => member && initPermissions.mutate({ userId: member.id, organizationId: member.organization_id || '', role: general.role })}
                  disabled={initPermissions.isPending}
                >
                  {initPermissions.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Inicializar permissões
                </Button>
              </div>
            ) : (
              <>
                <div className="space-y-1.5">
                  <Label>Modo de visualização de agendamentos</Label>
                  <Select
                    value={localPerms.view_schedules_mode || 'mine_only'}
                    onValueChange={(v) => setLocalPerms((p) => ({ ...p, view_schedules_mode: v }))}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="mine_only">Somente os meus</SelectItem>
                      <SelectItem value="all">Todos</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {Object.entries(groupedPerms).map(([category, perms]) => (
                  <div key={category} className="space-y-2">
                    <h4 className="text-sm font-semibold border-b pb-1.5">{category}</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {perms.map(({ key, label }) => (
                        <div key={key} className="space-y-1.5">
                          <Label className="text-xs text-muted-foreground">{label}</Label>
                          <Select
                            value={localPerms[key] ? 'enabled' : 'disabled'}
                            onValueChange={(v) => setLocalPerms((p) => ({ ...p, [key]: v === 'enabled' }))}
                          >
                            <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="disabled">Desabilitado</SelectItem>
                              <SelectItem value="enabled">Habilitado</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </>
            )}
          </TabsContent>

          {/* ============== NOTIFICAÇÕES ============== */}
          <TabsContent value="notifications" className="space-y-5 pt-5">
            {!isEdit ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                As notificações poderão ser configuradas após criar o usuário.
              </p>
            ) : (
              <>
                <div className="space-y-3">
                  <h4 className="text-sm font-semibold">Configurações Globais</h4>
                  <p className="text-xs text-muted-foreground -mt-2">Afeta todos os dispositivos.</p>
                  <div className="space-y-3 p-3 border rounded-lg bg-muted/30">
                    {(Object.keys(NOTIFICATION_LABELS) as (keyof typeof NOTIFICATION_LABELS)[]).map((key) => (
                      <div key={key} className="flex items-center justify-between">
                        <Label htmlFor={key} className="cursor-pointer text-sm">{NOTIFICATION_LABELS[key]}</Label>
                        <Switch
                          id={key}
                          checked={!!localNotifs[key]}
                          onCheckedChange={(v) => setLocalNotifs((n) => ({ ...n, [key]: v }))}
                        />
                      </div>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <h4 className="text-sm font-semibold">Notificações neste Aparelho (Push)</h4>
                  <div className="p-4 border rounded-lg text-center space-y-2">
                    <p className="text-xs text-muted-foreground">
                      Receba notificações mesmo com o navegador fechado ou minimizado.
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={async () => {
                        if (!('Notification' in window)) return toast.error('Navegador sem suporte');
                        const perm = await Notification.requestPermission();
                        if (perm === 'granted') {
                          setLocalNotifs((n) => ({ ...n, push_enabled: true }));
                          toast.success('Notificações ativadas neste dispositivo');
                        } else {
                          toast.error('Permissão negada');
                        }
                      }}
                    >
                      Ativar Notificações neste Dispositivo
                    </Button>
                  </div>
                </div>
              </>
            )}
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isEdit ? 'Salvar' : 'Adicionar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
