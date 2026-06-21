import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

export type SectorRotationStrategy = 'round_robin' | 'least_busy' | 'random';

export interface Sector {
  id: string;
  organization_id: string;
  name: string;
  color: string | null;
  icon: string | null;
  description: string | null;
  bot_order: number | null;
  greeting_message: string | null;
  farewell_message: string | null;
  auto_close_ticket: boolean | null;
  enable_scheduling: boolean | null;
  rotation_enabled: boolean | null;
  rotation_strategy: SectorRotationStrategy | null;
  is_active: boolean | null;
  created_at: string;
  updated_at: string;
  member_count?: number;
  members?: { user_id: string; full_name?: string | null; avatar_url?: string | null }[];
}

export interface UpsertSectorPayload {
  id?: string;
  name: string;
  color?: string;
  icon?: string;
  bot_order?: number;
  is_active?: boolean;
  member_ids?: string[];
}

export function useSectors() {
  const { profile } = useAuth();

  return useQuery({
    queryKey: ['sectors', profile?.organization_id],
    queryFn: async () => {
      if (!profile?.organization_id) return [];
      const { data, error } = await supabase
        .from('sectors')
        .select('*, sector_members(user_id, profiles:user_id(full_name, avatar_url))')
        .eq('organization_id', profile.organization_id)
        .order('bot_order', { ascending: true })
        .order('name', { ascending: true });
      if (error) throw error;
      return (data || []).map((s: any) => ({
        ...s,
        member_count: s.sector_members?.length || 0,
        members: (s.sector_members || []).map((m: any) => ({
          user_id: m.user_id,
          full_name: m.profiles?.full_name,
          avatar_url: m.profiles?.avatar_url,
        })),
      })) as Sector[];
    },
    enabled: !!profile?.organization_id,
  });
}

export function useMySectors() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['my-sectors', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data, error } = await supabase
        .from('sector_members')
        .select('sector_id, sectors:sector_id(*)')
        .eq('user_id', user.id);
      if (error) throw error;
      return (data || []).map((r: any) => r.sectors).filter(Boolean) as Sector[];
    },
    enabled: !!user?.id,
  });
}

export function useUpsertSector() {
  const queryClient = useQueryClient();
  const { profile, user } = useAuth();

  return useMutation({
    mutationFn: async (payload: UpsertSectorPayload) => {
      if (!profile?.organization_id) throw new Error('Sem organização');

      const { id, member_ids, ...fields } = payload;
      let sectorId = id;

      if (id) {
        const { error } = await supabase
          .from('sectors')
          .update(fields)
          .eq('id', id);
        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from('sectors')
          .insert({
            ...fields,
            organization_id: profile.organization_id,
            created_by: user?.id,
          })
          .select('id')
          .single();
        if (error) throw error;
        sectorId = data.id;
      }

      if (member_ids && sectorId) {
        // Sync members: delete then insert
        await supabase.from('sector_members').delete().eq('sector_id', sectorId);
        if (member_ids.length > 0) {
          const rows = member_ids.map((uid) => ({ sector_id: sectorId!, user_id: uid }));
          const { error } = await supabase.from('sector_members').insert(rows);
          if (error) throw error;
        }
      }

      return sectorId;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sectors'] });
      queryClient.invalidateQueries({ queryKey: ['my-sectors'] });
    },
  });
}

export function useDeleteSector() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('sectors').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sectors'] });
    },
  });
}
