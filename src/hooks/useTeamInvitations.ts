import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export interface TeamInvitation {
  id: string;
  email: string;
  role: 'admin' | 'manager' | 'seller';
  squad_id: string | null;
  invited_by: string | null;
  organization_id: string;
  token: string;
  status: 'pending' | 'accepted' | 'expired' | 'cancelled';
  expires_at: string;
  created_at: string;
  squad?: {
    id: string;
    name: string;
    color: string;
  } | null;
  inviter?: {
    full_name: string;
  } | null;
}

export function useTeamInvitations() {
  const { profile } = useAuth();
  
  return useQuery({
    queryKey: ['team-invitations', profile?.organization_id],
    queryFn: async () => {
      if (!profile?.organization_id) return [] as TeamInvitation[];
      const { data, error } = await supabase
        .from('team_invitations')
        .select(`
          *,
          squad:squad_id (id, name, color),
          inviter:invited_by (full_name)
        `)
        .eq('organization_id', profile.organization_id)
        .eq('status', 'pending')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data as TeamInvitation[];
    },
    enabled: !!profile?.organization_id,
  });
}

export function useInvitationByToken(token: string | null) {
  return useQuery({
    queryKey: ['invitation', token],
    queryFn: async () => {
      if (!token) return null;
      
      const { data, error } = await supabase
        .from('team_invitations')
        .select(`
          *,
          squad:squad_id (id, name, color),
          organization:organization_id (id, name, logo_url)
        `)
        .eq('token', token)
        .eq('status', 'pending')
        .gt('expires_at', new Date().toISOString())
        .single();
      
      if (error) return null;
      return data;
    },
    enabled: !!token,
  });
}

async function sendInviteEmail(params: {
  email: string;
  token: string;
  role: string;
  squadName?: string;
  invitedByName?: string;
  organizationName?: string;
}) {
  const inviteLink = `${window.location.origin}/aceitar-convite?token=${params.token}`;
  
  try {
    const response = await supabase.functions.invoke('send-invite-email', {
      body: {
        email: params.email,
        inviteLink,
        role: params.role,
        squadName: params.squadName,
        invitedByName: params.invitedByName,
        organizationName: params.organizationName,
      },
    });
    
    if (response.error) {
      console.error('Erro ao enviar email:', response.error);
    }
    
    return response;
  } catch (error) {
    console.error('Erro ao chamar edge function:', error);
  }
}

export function useCreateInvitation() {
  const queryClient = useQueryClient();
  const { profile, user } = useAuth();
  
  return useMutation({
    mutationFn: async ({ email, role, squadId }: {
      email: string;
      role: 'admin' | 'manager' | 'seller';
      squadId?: string | null;
    }) => {
      if (!profile?.organization_id) throw new Error('Organização não encontrada');
      
      // Check if invitation already exists
      const { data: existing } = await supabase
        .from('team_invitations')
        .select('id')
        .eq('email', email.toLowerCase())
        .eq('organization_id', profile.organization_id)
        .eq('status', 'pending')
        .single();
      
      if (existing) {
        throw new Error('Já existe um convite pendente para este email');
      }
      
      // Get squad name if squadId is provided
      let squadName: string | undefined;
      if (squadId) {
        const { data: squad } = await supabase
          .from('sales_squads')
          .select('name')
          .eq('id', squadId)
          .single();
        squadName = squad?.name;
      }

      // Get organization name
      let organizationName: string | undefined;
      const { data: org } = await supabase
        .from('organizations')
        .select('name')
        .eq('id', profile.organization_id)
        .single();
      organizationName = org?.name;
      
      const { data, error } = await supabase
        .from('team_invitations')
        .insert({
          email: email.toLowerCase(),
          role,
          squad_id: squadId || null,
          invited_by: user?.id,
          organization_id: profile.organization_id,
        })
        .select()
        .single();
      
      if (error) throw error;
      
      // Send invitation email
      await sendInviteEmail({
        email: email.toLowerCase(),
        token: data.token,
        role,
        squadName,
        invitedByName: profile.full_name,
        organizationName,
      });
      
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['team-invitations'] });
    },
  });
}

export function useCancelInvitation() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (invitationId: string) => {
      const { error } = await supabase
        .from('team_invitations')
        .update({ status: 'cancelled' })
        .eq('id', invitationId);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['team-invitations'] });
    },
  });
}

export function useResendInvitation() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (invitation: TeamInvitation) => {
      // Reset expiration date
      const { data, error } = await supabase
        .from('team_invitations')
        .update({ 
          expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() 
        })
        .eq('id', invitation.id)
        .select()
        .single();
      
      if (error) throw error;
      
      // Resend email
      await sendInviteEmail({
        email: invitation.email,
        token: data.token,
        role: invitation.role,
        squadName: invitation.squad?.name,
        invitedByName: invitation.inviter?.full_name,
      });
      
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['team-invitations'] });
    },
  });
}

export function useAcceptInvitation() {
  return useMutation({
    mutationFn: async ({ token, userId }: { token: string; userId: string }) => {
      const { data, error } = await supabase
        .rpc('accept_invitation', { 
          invitation_token: token, 
          user_id: userId 
        });
      
      if (error) throw error;
      if (!data) throw new Error('Convite inválido ou expirado');
      
      return data;
    },
  });
}
