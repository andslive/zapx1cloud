import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { toast } from 'sonner';

export interface Squad {
  id: string;
  name: string;
  description: string | null;
  icon_url: string | null;
  product_id: string | null;
  organization_id: string;
  leader_id: string | null;
  color: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  product?: {
    id: string;
    name: string;
  } | null;
  members_count?: number;
}

export interface SquadMember {
  id: string;
  squad_id: string;
  user_id: string;
  role: string;
  joined_at: string;
  profile?: {
    id: string;
    full_name: string;
    email: string;
    avatar_url: string | null;
  };
}

export interface CreateSquadData {
  name: string;
  description?: string;
  icon_url?: string;
  product_id?: string;
  leader_id?: string;
  color?: string;
}

export interface UpdateSquadData extends Partial<CreateSquadData> {
  id: string;
  is_active?: boolean;
}

export function useSquads() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['squads'],
    queryFn: async () => {
      const { data: squads, error } = await supabase
        .from('sales_squads')
        .select(`
          *,
          product:products(id, name)
        `)
        .eq('is_active', true)
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Get member counts
      const squadIds = squads?.map(s => s.id) || [];
      if (squadIds.length > 0) {
        const { data: membersData } = await supabase
          .from('squad_members')
          .select('squad_id')
          .in('squad_id', squadIds);

        const countMap = new Map<string, number>();
        membersData?.forEach(m => {
          countMap.set(m.squad_id, (countMap.get(m.squad_id) || 0) + 1);
        });

        return squads?.map(s => ({
          ...s,
          members_count: countMap.get(s.id) || 0
        })) as Squad[];
      }

      return squads as Squad[];
    },
    enabled: !!user
  });
}

export function useSquad(id: string | undefined) {
  return useQuery({
    queryKey: ['squad', id],
    queryFn: async () => {
      if (!id) return null;
      
      const { data, error } = await supabase
        .from('sales_squads')
        .select(`
          *,
          product:products(id, name)
        `)
        .eq('id', id)
        .single();

      if (error) throw error;
      return data as Squad;
    },
    enabled: !!id
  });
}

export function useSquadMembers(squadId: string | undefined) {
  return useQuery({
    queryKey: ['squad-members', squadId],
    queryFn: async () => {
      if (!squadId) return [];

      const { data, error } = await supabase
        .from('squad_members')
        .select('*')
        .eq('squad_id', squadId)
        .order('joined_at', { ascending: true });

      if (error) throw error;

      // Get profiles for each member
      const userIds = data?.map(m => m.user_id) || [];
      if (userIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, full_name, email, avatar_url')
          .in('id', userIds);

        const profileMap = new Map(profiles?.map(p => [p.id, p]));

        return data?.map(m => ({
          ...m,
          profile: profileMap.get(m.user_id)
        })) as SquadMember[];
      }

      return data as SquadMember[];
    },
    enabled: !!squadId
  });
}

export function useCreateSquad() {
  const queryClient = useQueryClient();
  const { user, profile } = useAuth();
  const organizationId = profile?.organization_id;

  return useMutation({
    mutationFn: async (data: CreateSquadData) => {
      if (!organizationId) throw new Error('No organization');

      const { data: squad, error } = await supabase
        .from('sales_squads')
        .insert({
          ...data,
          organization_id: organizationId,
          created_by: user?.id
        })
        .select()
        .single();

      if (error) throw error;
      return squad;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['squads'] });
      toast.success('Squad criado com sucesso!');
    },
    onError: (error) => {
      toast.error('Erro ao criar squad');
      console.error(error);
    }
  });
}

export function useUpdateSquad() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...data }: UpdateSquadData) => {
      const { data: squad, error } = await supabase
        .from('sales_squads')
        .update(data)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return squad;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['squads'] });
      queryClient.invalidateQueries({ queryKey: ['squad', variables.id] });
      toast.success('Squad atualizado!');
    },
    onError: (error) => {
      toast.error('Erro ao atualizar squad');
      console.error(error);
    }
  });
}

export function useDeleteSquad() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('sales_squads')
        .update({ is_active: false })
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['squads'] });
      toast.success('Squad removido!');
    },
    onError: (error) => {
      toast.error('Erro ao remover squad');
      console.error(error);
    }
  });
}

export function useAddSquadMember() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ squadId, userId, role = 'member' }: { squadId: string; userId: string; role?: string }) => {
      const { data, error } = await supabase
        .from('squad_members')
        .insert({
          squad_id: squadId,
          user_id: userId,
          role
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['squad-members', variables.squadId] });
      queryClient.invalidateQueries({ queryKey: ['squads'] });
      toast.success('Membro adicionado ao squad!');
    },
    onError: (error: any) => {
      if (error.code === '23505') {
        toast.error('Este membro já está no squad');
      } else {
        toast.error('Erro ao adicionar membro');
      }
      console.error(error);
    }
  });
}

export function useRemoveSquadMember() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ squadId, memberId }: { squadId: string; memberId: string }) => {
      const { error } = await supabase
        .from('squad_members')
        .delete()
        .eq('id', memberId);

      if (error) throw error;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['squad-members', variables.squadId] });
      queryClient.invalidateQueries({ queryKey: ['squads'] });
      toast.success('Membro removido do squad!');
    },
    onError: (error) => {
      toast.error('Erro ao remover membro');
      console.error(error);
    }
  });
}

export function useUpdateSquadMemberRole() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ memberId, role, squadId }: { memberId: string; role: string; squadId: string }) => {
      const { error } = await supabase
        .from('squad_members')
        .update({ role })
        .eq('id', memberId);

      if (error) throw error;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['squad-members', variables.squadId] });
      toast.success('Função atualizada!');
    },
    onError: (error) => {
      toast.error('Erro ao atualizar função');
      console.error(error);
    }
  });
}

export function useUploadSquadIcon() {
  return useMutation({
    mutationFn: async (file: File) => {
      const fileExt = file.name.split('.').pop();
      const fileName = `${crypto.randomUUID()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('squad-icons')
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      const { data } = supabase.storage
        .from('squad-icons')
        .getPublicUrl(fileName);

      return data.publicUrl;
    },
    onError: (error) => {
      toast.error('Erro ao fazer upload da imagem');
      console.error(error);
    }
  });
}
