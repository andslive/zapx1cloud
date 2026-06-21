import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export interface UserSector {
  id: string;
  name: string;
  color: string | null;
  is_member: boolean;
}

/**
 * Returns the sectors the current user can accept tickets for.
 * - Admins/super_admins: all org sectors.
 * - Other users: only sectors where they are members.
 */
export function useUserSectors() {
  const { user, roles, profile } = useAuth();
  const isAdmin = roles?.includes('admin') || roles?.includes('super_admin');
  const orgId = profile?.organization_id;

  return useQuery({
    queryKey: ['user-sectors', user?.id, isAdmin, orgId],
    enabled: !!user?.id,
    staleTime: 60_000,
    queryFn: async (): Promise<UserSector[]> => {
      if (!user?.id) return [];

      if (isAdmin) {
        if (!orgId) return [];
        const { data } = await supabase
          .from('sectors')
          .select('id, name, color')
          .eq('is_active', true)
          .eq('organization_id', orgId)
          .order('name');
        return (data || []).map((s) => ({ ...s, is_member: true }));
      }

      const { data: memberships } = await supabase
        .from('sector_members')
        .select('sector_id, sectors(id, name, color, is_active)')
        .eq('user_id', user.id);

      return (memberships || [])
        .map((m: any) => m.sectors)
        .filter((s: any) => s && s.is_active)
        .map((s: any) => ({ id: s.id, name: s.name, color: s.color, is_member: true }));
    },
  });
}
