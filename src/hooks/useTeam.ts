import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Tables } from '@/integrations/supabase/types';

type Profile = Tables<'profiles'>;
type UserRole = Tables<'user_roles'>;

export interface SquadInfo {
  id: string;
  name: string;
  color: string | null;
  icon_url: string | null;
  role: string;
}

export interface ProductInfo {
  id: string;
  name: string;
  monthly_goal: number;
  assignment_id: string;
}

export interface TeamMember extends Profile {
  roles: UserRole[];
  squads: SquadInfo[];
  products: ProductInfo[];
}

export function useTeamMembers(organizationId?: string) {
  return useQuery({
    queryKey: ['team-members', organizationId],
    queryFn: async () => {
      // Resolve org context: explicit param > current user's org.
      // Defence-in-depth on top of RLS: super admins can read all profiles
      // via RLS, so we MUST scope by organization_id on the client when
      // browsing inside a specific company, otherwise users from other
      // organizations leak into team listings.
      let orgId = organizationId;
      if (!orgId) {
        const { data: authData } = await supabase.auth.getUser();
        const uid = authData?.user?.id;
        if (uid) {
          const { data: me } = await supabase
            .from('profiles')
            .select('organization_id')
            .eq('id', uid)
            .maybeSingle();
          orgId = me?.organization_id ?? undefined;
        }
      }

      if (!orgId) {
        // Without an org context we refuse to return anything.
        return [] as TeamMember[];
      }

      const profilesResult = await supabase
        .from('profiles')
        .select('*')
        .eq('organization_id', orgId)
        .order('created_at', { ascending: false });

      if (profilesResult.error) throw profilesResult.error;
      const profiles = profilesResult.data || [];
      const userIds = profiles.map(p => p.id);

      if (userIds.length === 0) {
        return [] as TeamMember[];
      }

      const [rolesResult, squadMembershipsResult, assignmentsResult] = await Promise.all([
        supabase.from('user_roles').select('*').in('user_id', userIds),
        supabase
          .from('squad_members')
          .select(`
            user_id,
            role,
            squad:squad_id (id, name, color, icon_url)
          `)
          .in('user_id', userIds),
        supabase
          .from('user_product_assignments')
          .select(`
            id,
            user_id,
            monthly_goal,
            product:product_id (id, name)
          `)
          .in('user_id', userIds),
      ]);

      if (rolesResult.error) throw rolesResult.error;
      if (squadMembershipsResult.error) throw squadMembershipsResult.error;
      if (assignmentsResult.error) throw assignmentsResult.error;

      const roles = rolesResult.data || [];
      const squadMemberships = squadMembershipsResult.data || [];
      const assignments = assignmentsResult.data || [];

      const rolesByUserId = new Map<string, UserRole[]>();
      roles.forEach(role => {
        const existing = rolesByUserId.get(role.user_id) || [];
        existing.push(role);
        rolesByUserId.set(role.user_id, existing);
      });

      const squadsByUserId = new Map<string, SquadInfo[]>();
      squadMemberships.forEach(sm => {
        if (sm.squad) {
          const existing = squadsByUserId.get(sm.user_id) || [];
          existing.push({
            id: (sm.squad as any).id,
            name: (sm.squad as any).name,
            color: (sm.squad as any).color,
            icon_url: (sm.squad as any).icon_url,
            role: sm.role || 'member',
          });
          squadsByUserId.set(sm.user_id, existing);
        }
      });

      const productsByUserId = new Map<string, ProductInfo[]>();
      assignments.forEach(a => {
        if (a.product && (a.product as any).id) {
          const existing = productsByUserId.get(a.user_id) || [];
          existing.push({
            id: (a.product as any).id,
            name: (a.product as any).name,
            monthly_goal: a.monthly_goal || 0,
            assignment_id: a.id,
          });
          productsByUserId.set(a.user_id, existing);
        }
      });

      const members: TeamMember[] = profiles.map(profile => ({
        ...profile,
        roles: rolesByUserId.get(profile.id) || [],
        squads: squadsByUserId.get(profile.id) || [],
        products: productsByUserId.get(profile.id) || [],
      }));

      return members;
    },
    staleTime: 30000,
    gcTime: 60000,
  });
}

export function useAddMemberToSquad() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ userId, squadId, role = 'member' }: {
      userId: string;
      squadId: string;
      role?: string;
    }) => {
      const { data, error } = await supabase
        .from('squad_members')
        .insert({
          user_id: userId,
          squad_id: squadId,
          role,
        })
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['team-members'] });
      queryClient.invalidateQueries({ queryKey: ['squad-members'] });
    },
  });
}

export function useRemoveMemberFromSquad() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ userId, squadId }: {
      userId: string;
      squadId: string;
    }) => {
      const { error } = await supabase
        .from('squad_members')
        .delete()
        .eq('user_id', userId)
        .eq('squad_id', squadId);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['team-members'] });
      queryClient.invalidateQueries({ queryKey: ['squad-members'] });
    },
  });
}

export function useProductAssignments(productId?: string) {
  return useQuery({
    queryKey: ['product-assignments', productId],
    queryFn: async () => {
      // Resolve org context: super admins poderiam ver atribuições de
      // outras empresas; aplicamos defesa em profundidade no cliente.
      const { data: authData } = await supabase.auth.getUser();
      const uid = authData?.user?.id;
      let orgId: string | undefined;
      if (uid) {
        const { data: me } = await supabase
          .from('profiles')
          .select('organization_id')
          .eq('id', uid)
          .maybeSingle();
        orgId = me?.organization_id ?? undefined;
      }
      if (!orgId) return [];

      // Busca somente IDs de usuários da empresa atual.
      const { data: orgProfiles, error: orgErr } = await supabase
        .from('profiles')
        .select('id')
        .eq('organization_id', orgId);
      if (orgErr) throw orgErr;
      const userIds = (orgProfiles || []).map((p: any) => p.id);
      if (userIds.length === 0) return [];

      let query = supabase
        .from('user_product_assignments')
        .select(`
          *,
          profiles:user_id (id, full_name, email, avatar_url),
          products:product_id (id, name)
        `)
        .in('user_id', userIds);
      
      if (productId) {
        query = query.eq('product_id', productId);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
    staleTime: 30000,
    gcTime: 60000,
  });
}

export function useAssignProduct() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ userId, productId, monthlyGoal, assignedBy }: {
      userId: string;
      productId: string;
      monthlyGoal?: number;
      assignedBy?: string;
    }) => {
      // Use upsert to handle duplicates gracefully
      const { data, error } = await supabase
        .from('user_product_assignments')
        .upsert({
          user_id: userId,
          product_id: productId,
          monthly_goal: monthlyGoal || 0,
          assigned_by: assignedBy,
        }, {
          onConflict: 'user_id,product_id',
          ignoreDuplicates: false
        })
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['product-assignments'] });
      queryClient.invalidateQueries({ queryKey: ['assigned-products'] });
      queryClient.invalidateQueries({ queryKey: ['team-members'] });
    },
  });
}

export function useUnassignProduct() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (assignmentId: string) => {
      const { error } = await supabase
        .from('user_product_assignments')
        .delete()
        .eq('id', assignmentId);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['product-assignments'] });
      queryClient.invalidateQueries({ queryKey: ['assigned-products'] });
      queryClient.invalidateQueries({ queryKey: ['team-members'] });
    },
  });
}

export function useUpdateAssignment() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ id, monthlyGoal }: { id: string; monthlyGoal: number }) => {
      const { data, error } = await supabase
        .from('user_product_assignments')
        .update({ monthly_goal: monthlyGoal })
        .eq('id', id)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['product-assignments'] });
    },
  });
}

export function useRemoveTeamMember() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await supabase.rpc('delete_team_member', { p_user_id: userId });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['team-members'] });
      queryClient.invalidateQueries({ queryKey: ['product-assignments'] });
      queryClient.invalidateQueries({ queryKey: ['squad-members'] });
    },
  });
}

export function useUpdateUserRole() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: 'admin' | 'manager' | 'seller' }) => {
      // Remove existing role
      await supabase
        .from('user_roles')
        .delete()
        .eq('user_id', userId);
      
      // Add new role
      const { data, error } = await supabase
        .from('user_roles')
        .insert({ user_id: userId, role })
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['team-members'] });
    },
  });
}
