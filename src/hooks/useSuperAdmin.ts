import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

// Check if user is super admin
export function useIsSuperAdmin() {
  const { user, isSuperAdmin: isAuthSuperAdmin } = useAuth();
  
  return useQuery({
    queryKey: ['is-super-admin', user?.id],
    queryFn: async () => {
      if (!user?.id) return false;
      
      // First try the local role check as it's the most reliable source of truth for the current session
      if (isAuthSuperAdmin()) return true;

      // Fallback to RPC check only if local check is false
      try {
        const { data, error } = await supabase
          .rpc('is_super_admin', { _user_id: user.id });
        
        if (error) {
          // If RPC is missing or fails, we already have the local role check as fallback
          console.warn('[auth] is_super_admin RPC failed, using local roles');
          return isAuthSuperAdmin();
        }
        
        return data || false;
      } catch (e) {
        return isAuthSuperAdmin();
      }
    },
    enabled: !!user?.id,
    staleTime: 1000 * 60 * 5, // Cache for 5 minutes
  });
}

// Platform settings hook
export function usePlatformSettings() {
  return useQuery({
    queryKey: ['platform-settings'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('platform_settings')
        .select('*')
        .limit(1)
        .single();
      
      if (error) throw error;
      return data;
    },
  });
}

export function useUpdatePlatformSettings() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (settings: Record<string, any>) => {
      const { data: existing } = await supabase
        .from('platform_settings')
        .select('id')
        .limit(1)
        .single();

      if (existing) {
        const { data: updated, error } = await supabase
          .from('platform_settings')
          .update(settings)
          .eq('id', existing.id)
          .select('*')
          .maybeSingle();
        if (error) throw error;
        return updated;
      }
      return null;
    },
    onSuccess: (updated) => {
      // Limpa o cache local antigo (placeholder visual) para não voltar ao estado anterior
      try {
        localStorage.removeItem('platform-branding-cache-v1');
      } catch {
        // ignore
      }

      // Semeia imediatamente o resultado na query canônica de branding
      // para que Logo, Login, favicon, cores etc. atualizem na mesma sessão
      // sem precisar de refresh manual.
      if (updated) {
        try {
          localStorage.setItem(
            'platform-branding-cache-v1',
            JSON.stringify(updated)
          );
        } catch {
          // ignore
        }
        queryClient.setQueryData(['platform-branding'], updated);
      }

      queryClient.invalidateQueries({ queryKey: ['platform-settings'] });
      queryClient.invalidateQueries({ queryKey: ['platform-branding'] });
      // Refetch ativo garante que qualquer dado derivado no servidor
      // (defaults, triggers, etc.) entre na UI imediatamente.
      queryClient.refetchQueries({ queryKey: ['platform-branding'] });
    },
  });
}

// Platform email settings hook
export function usePlatformEmailSettings() {
  return useQuery({
    queryKey: ['platform-email-settings'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('platform_email_settings')
        .select('*')
        .limit(1)
        .single();
      
      if (error) throw error;
      return data;
    },
  });
}

export function useUpdatePlatformEmailSettings() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (settings: {
      provider?: string;
      sender_email?: string;
      sender_name?: string;
      smtp_host?: string;
      smtp_port?: number;
      reminder_days_before?: number;
      reminder_on_due_date?: boolean;
      alert_days_after?: number;
      suspend_days_after?: number;
    }) => {
      const { data: existing } = await supabase
        .from('platform_email_settings')
        .select('id')
        .limit(1)
        .single();
      
      if (existing) {
        const { error } = await supabase
          .from('platform_email_settings')
          .update(settings)
          .eq('id', existing.id);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['platform-email-settings'] });
    },
  });
}

// Organizations management
export function useAllOrganizations() {
  return useQuery({
    queryKey: ['all-organizations'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('organizations')
        .select(`
          *,
          subscriptions (*)
        `)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data;
    },
  });
}

export function useOrganizationDetails(orgId: string | null) {
  return useQuery({
    queryKey: ['organization-details', orgId],
    queryFn: async () => {
      if (!orgId) return null;
      
      // Fetch organization with subscriptions and profiles
      const { data: org, error: orgError } = await supabase
        .from('organizations')
        .select(`
          *,
          subscriptions (*),
          profiles!profiles_organization_id_fkey (
            id, 
            full_name, 
            email, 
            avatar_url
          )
        `)
        .eq('id', orgId)
        .single();
      
      if (orgError) throw orgError;
      
      // Fetch user roles for each profile
      if (org?.profiles && org.profiles.length > 0) {
        const userIds = org.profiles.map((p: any) => p.id);
        const { data: roles } = await supabase
          .from('user_roles')
          .select('user_id, role')
          .in('user_id', userIds);
        
        // Map roles to profiles
        org.profiles = org.profiles.map((profile: any) => ({
          ...profile,
          user_roles: roles?.filter((r: any) => r.user_id === profile.id) || []
        }));
      }
      
      return org;
    },
    enabled: !!orgId,
  });
}

export function useUpdateOrganization() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: string; [key: string]: any }) => {
      const { error } = await supabase
        .from('organizations')
        .update(updates)
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['all-organizations'] });
      queryClient.invalidateQueries({ queryKey: ['organization-details'] });
      queryClient.invalidateQueries({ queryKey: ['all-subscriptions'] });
    },
  });
}

export function useDeleteOrganization() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (organization_id: string) => {
      const { data, error } = await supabase.functions.invoke(
        'delete-organization',
        { body: { organization_id } }
      );
      if (error) throw error;
      if (data && data.ok === false) throw new Error(data.error || 'Falha ao excluir');
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['all-organizations'] });
      queryClient.invalidateQueries({ queryKey: ['all-subscriptions'] });
      queryClient.invalidateQueries({ queryKey: ['platform-stats'] });
    },
  });
}

// Subscriptions management
export function useAllSubscriptions() {
  return useQuery({
    queryKey: ['all-subscriptions'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('subscriptions')
        .select(`
          *,
          organizations (id, name, email, status)
        `)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data;
    },
  });
}

export function useUpdateSubscription() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: string; [key: string]: any }) => {
      const { error } = await supabase
        .from('subscriptions')
        .update(updates)
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['all-subscriptions'] });
      queryClient.invalidateQueries({ queryKey: ['all-organizations'] });
    },
  });
}

export function useCreateSubscription() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (subscription: {
      organization_id: string;
      plan_type: string;
      price_monthly: number;
      billing_cycle?: string;
      current_period_start?: string;
      current_period_end?: string;
      plan_id?: string | null;
    }) => {
      const { error } = await supabase
        .from('subscriptions')
        .insert(subscription);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['all-subscriptions'] });
      queryClient.invalidateQueries({ queryKey: ['all-organizations'] });
    },
  });
}

// Billing history
export function useBillingHistory(orgId?: string) {
  return useQuery({
    queryKey: ['billing-history', orgId],
    queryFn: async () => {
      let query = supabase
        .from('billing_history')
        .select(`
          *,
          organizations (name)
        `)
        .order('created_at', { ascending: false });
      
      if (orgId) {
        query = query.eq('organization_id', orgId);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });
}

// Audit logs
export function useAuditLogs(limit = 50) {
  return useQuery({
    queryKey: ['audit-logs', limit],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('platform_audit_logs')
        .select(`
          *,
          profiles:actor_id (full_name, email)
        `)
        .order('created_at', { ascending: false })
        .limit(limit);
      
      if (error) throw error;
      return data;
    },
  });
}

export function useCreateAuditLog() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (log: {
      action: string;
      entity_type?: string;
      entity_id?: string;
      metadata?: object;
    }) => {
      const { error } = await supabase
        .from('platform_audit_logs')
        .insert({
          action: log.action,
          entity_type: log.entity_type,
          entity_id: log.entity_id,
          metadata: log.metadata as any,
          actor_id: user?.id,
        });
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['audit-logs'] });
    },
  });
}

// Dashboard stats
export function useSuperAdminStats() {
  return useQuery({
    queryKey: ['super-admin-stats'],
    queryFn: async () => {
      // Get organizations count
      const { count: orgsCount } = await supabase
        .from('organizations')
        .select('*', { count: 'exact', head: true });
      
      // Get active users count
      const { count: usersCount } = await supabase
        .from('profiles')
        .select('*', { count: 'exact', head: true });
      
      // Get active subscriptions and MRR
      const { data: subscriptions } = await supabase
        .from('subscriptions')
        .select('price_monthly, status, plan_type');
      
      const activeSubscriptions = subscriptions?.filter(s => s.status === 'active') || [];
      const mrr = activeSubscriptions.reduce((sum, s) => sum + (Number(s.price_monthly) || 0), 0);
      
      // Get leads count
      const { count: leadsCount } = await supabase
        .from('leads')
        .select('*', { count: 'exact', head: true });
      
      // Get deals sum
      const { data: deals } = await supabase
        .from('deals')
        .select('deal_value');
      
      const totalDealsValue = deals?.reduce((sum, d) => sum + (Number(d.deal_value) || 0), 0) || 0;
      
      // Plan breakdown
      const planCounts = {
        trial: subscriptions?.filter(s => s.plan_type === 'trial').length || 0,
        starter: subscriptions?.filter(s => s.plan_type === 'starter').length || 0,
        pro: subscriptions?.filter(s => s.plan_type === 'pro').length || 0,
        enterprise: subscriptions?.filter(s => s.plan_type === 'enterprise').length || 0,
      };
      
      return {
        organizations: orgsCount || 0,
        users: usersCount || 0,
        activeSubscriptions: activeSubscriptions.length,
        mrr,
        arr: mrr * 12,
        leads: leadsCount || 0,
        totalDealsValue,
        planCounts,
      };
    },
  });
}

// Create organization
export function useCreateOrganization() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (org: {
      name: string;
      email: string;
      cnpj?: string | null;
      phone?: string | null;
      max_users?: number;
      max_products?: number;
      status?: string;
      plan_id?: string | null;
      features?: Record<string, any>;
    }) => {
      const { data, error } = await supabase
        .from('organizations')
        .insert(org)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['all-organizations'] });
      queryClient.invalidateQueries({ queryKey: ['super-admin-stats'] });
    },
  });
}

// All users across organizations
export function useAllUsers() {
  return useQuery({
    queryKey: ['all-users'],
    queryFn: async () => {
      // Buscar profiles primeiro (evita erro 300 de múltiplos relacionamentos)
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (profilesError) {
        console.error('Error fetching profiles:', profilesError);
        throw profilesError;
      }
      if (!profiles || profiles.length === 0) return [];
      
      // Buscar organizações (apenas se houver org_ids válidos)
      const orgIds = [...new Set(profiles.map(p => p.organization_id).filter(Boolean))] as string[];
      let organizations: { id: string; name: string }[] = [];
      
      if (orgIds.length > 0) {
        const { data: orgsData, error: orgsError } = await supabase
          .from('organizations')
          .select('id, name')
          .in('id', orgIds);
        
        if (orgsError) {
          console.error('Error fetching organizations:', orgsError);
        } else {
          organizations = orgsData || [];
        }
      }
      
      // Buscar roles
      const userIds = profiles.map(p => p.id);
      let roles: { user_id: string; role: string }[] = [];
      
      if (userIds.length > 0) {
        const { data: rolesData, error: rolesError } = await supabase
          .from('user_roles')
          .select('user_id, role')
          .in('user_id', userIds);
        
        if (rolesError) {
          console.error('Error fetching roles:', rolesError);
        } else {
          roles = rolesData || [];
        }
      }
      
      // Mapear tudo
      return profiles.map(profile => ({
        ...profile,
        organizations: organizations.find(o => o.id === profile.organization_id) || null,
        user_roles: roles.filter(r => r.user_id === profile.id) || []
      }));
    },
    staleTime: 1000 * 30, // 30 segundos
  });
}

// Update user role (Super Admin)
export function useUpdateUserRole() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ 
      userId, 
      oldRole, 
      newRole 
    }: { 
      userId: string; 
      oldRole: string | null; 
      newRole: 'admin' | 'manager' | 'seller';
    }) => {
      // Deletar role antigo (exceto super_admin)
      if (oldRole && oldRole !== 'super_admin') {
        await supabase
          .from('user_roles')
          .delete()
          .eq('user_id', userId)
          .eq('role', oldRole as 'admin' | 'manager' | 'seller' | 'super_admin');
      }
      
      // Inserir novo role
      const { error } = await supabase
        .from('user_roles')
        .insert({ user_id: userId, role: newRole });
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organization-details'] });
      queryClient.invalidateQueries({ queryKey: ['all-users'] });
    },
  });
}

// Remove user from organization (set organization_id to null)
export function useRemoveUserFromOrganization() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ userId }: { userId: string }) => {
      // Remover organization_id do profile
      const { error: profileError } = await supabase
        .from('profiles')
        .update({ organization_id: null })
        .eq('id', userId);
      
      if (profileError) throw profileError;
      
      // Remover roles (exceto super_admin)
      await supabase
        .from('user_roles')
        .delete()
        .eq('user_id', userId)
        .neq('role', 'super_admin');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organization-details'] });
      queryClient.invalidateQueries({ queryKey: ['all-users'] });
    },
  });
}

// Create invitation for organization (Super Admin)
export function useCreateOrganizationInvitation() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  
  return useMutation({
    mutationFn: async ({ 
      email, 
      role, 
      organizationId 
    }: {
      email: string;
      role: 'admin' | 'manager' | 'seller';
      organizationId: string;
    }) => {
      // Verificar se já existe convite pendente
      const { data: existing } = await supabase
        .from('team_invitations')
        .select('id')
        .eq('email', email.toLowerCase())
        .eq('organization_id', organizationId)
        .eq('status', 'pending')
        .maybeSingle();
      
      if (existing) {
        throw new Error('Já existe um convite pendente para este email');
      }
      
      // Criar convite
      const { data, error } = await supabase
        .from('team_invitations')
        .insert({
          email: email.toLowerCase(),
          role,
          organization_id: organizationId,
          invited_by: user?.id,
        })
        .select()
        .single();
      
      if (error) throw error;
      
      // Buscar nome da organização para o email
      const { data: org } = await supabase
        .from('organizations')
        .select('name')
        .eq('id', organizationId)
        .single();
      
      // Enviar email de convite
      await supabase.functions.invoke('send-invite-email', {
        body: {
          email: email.toLowerCase(),
          inviteLink: `${window.location.origin}/aceitar-convite?token=${data.token}`,
          role,
          organizationName: org?.name,
          invitedByName: 'Super Admin',
        },
      });
      
      return data;
    },
    onSuccess: (_, { organizationId }) => {
      queryClient.invalidateQueries({ queryKey: ['organization-details', organizationId] });
      queryClient.invalidateQueries({ queryKey: ['organization-invitations', organizationId] });
    },
  });
}

// List pending invitations for organization
export function useOrganizationInvitations(orgId: string | null) {
  return useQuery({
    queryKey: ['organization-invitations', orgId],
    queryFn: async () => {
      if (!orgId) return [];
      
      const { data, error } = await supabase
        .from('team_invitations')
        .select('*')
        .eq('organization_id', orgId)
        .eq('status', 'pending')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data;
    },
    enabled: !!orgId,
  });
}

// Delete/cancel an invitation
export function useDeleteOrganizationInvitation() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ invitationId, organizationId }: { invitationId: string; organizationId: string }) => {
      const { error } = await supabase
        .from('team_invitations')
        .delete()
        .eq('id', invitationId);
      
      if (error) throw error;
      return { organizationId };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['organization-invitations', result.organizationId] });
    },
  });
}

// Resend invitation email
export function useResendOrganizationInvitation() {
  return useMutation({
    mutationFn: async ({ 
      invitation, 
      organizationName 
    }: { 
      invitation: { id: string; email: string; role: string; token: string };
      organizationName: string;
    }) => {
      await supabase.functions.invoke('send-invite-email', {
        body: {
          email: invitation.email,
          inviteLink: `${window.location.origin}/aceitar-convite?token=${invitation.token}`,
          role: invitation.role,
          organizationName,
          invitedByName: 'Super Admin',
        },
      });
      return invitation;
    },
  });
}
