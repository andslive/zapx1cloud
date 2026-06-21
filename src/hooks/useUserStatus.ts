import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

export type UserStatusType = 'online' | 'away' | 'offline';

interface UserStatusData {
  status: UserStatusType;
  activeLeadsCount: number;
  isLoading: boolean;
  setStatus: (status: UserStatusType) => Promise<void>;
  teamStatuses: TeamMemberStatus[];
}

export interface TeamMemberStatus {
  user_id: string;
  status: UserStatusType;
  active_leads_count: number;
  updated_at: string;
}

export function useUserStatus(): UserStatusData {
  const { user, profile } = useAuth();
  const [status, setStatusState] = useState<UserStatusType>('offline');
  const [activeLeadsCount, setActiveLeadsCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [teamStatuses, setTeamStatuses] = useState<TeamMemberStatus[]>([]);

  // Fetch current status
  useEffect(() => {
    if (!user?.id || !profile?.organization_id) {
      setIsLoading(false);
      return;
    }

    const fetchStatus = async () => {
      const { data, error } = await supabase
        .from('user_status')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

      if (error) {
        console.error('Error fetching user status:', error);
        setIsLoading(false);
        return;
      }

      if (data) {
        setStatusState(data.status as UserStatusType);
        setActiveLeadsCount(data.active_leads_count);
      } else {
        // Create initial status record using upsert to avoid race conditions
        await supabase.from('user_status').upsert({
          user_id: user.id,
          organization_id: profile.organization_id,
          status: 'offline',
          active_leads_count: 0,
        }, { onConflict: 'user_id' });
      }
      setIsLoading(false);
    };

    fetchStatus();
  }, [user?.id, profile?.organization_id]);

  // Fetch team statuses
  useEffect(() => {
    if (!profile?.organization_id) return;

    const fetchTeam = async () => {
      const { data } = await supabase
        .from('user_status')
        .select('user_id, status, active_leads_count, updated_at')
        .eq('organization_id', profile.organization_id);

      if (data) {
        setTeamStatuses(data as TeamMemberStatus[]);
      }
    };

    fetchTeam();

    // Subscribe to realtime changes
    const channel = supabase
      .channel('user-status-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'user_status',
          filter: `organization_id=eq.${profile.organization_id}`,
        },
        (payload) => {
          const newData = payload.new as any;
          if (newData) {
            setTeamStatuses(prev => {
              const idx = prev.findIndex(s => s.user_id === newData.user_id);
              const updated: TeamMemberStatus = {
                user_id: newData.user_id,
                status: newData.status,
                active_leads_count: newData.active_leads_count,
                updated_at: newData.updated_at,
              };
              if (idx >= 0) {
                const copy = [...prev];
                copy[idx] = updated;
                return copy;
              }
              return [...prev, updated];
            });

            // Update own status if it changed externally
            if (newData.user_id === user?.id) {
              setStatusState(newData.status);
              setActiveLeadsCount(newData.active_leads_count);
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [profile?.organization_id, user?.id]);

  const setStatus = useCallback(async (newStatus: UserStatusType) => {
    if (!user?.id || !profile?.organization_id) return;

    const { error } = await supabase
      .from('user_status')
      .upsert({
        user_id: user.id,
        organization_id: profile.organization_id,
        status: newStatus,
        last_status_change: new Date().toISOString(),
      }, { onConflict: 'user_id' });

    if (error) {
      console.error('Error updating status:', error);
      toast.error('Erro ao atualizar status');
      return;
    }

    setStatusState(newStatus);

    // If going online, process pending queue
    if (newStatus === 'online') {
      try {
        const { data } = await supabase.rpc('process_pending_queue', { p_user_id: user.id });
        if (data && data.length > 0) {
          toast.success('🎯 Lead pendente atribuído a você!', {
            description: 'Um lead da fila foi atribuído automaticamente.',
          });
        }
      } catch (e) {
        console.warn('Error processing queue:', e);
      }
    }

    const labels: Record<UserStatusType, string> = {
      online: '🟢 Disponível',
      away: '🟡 Ausente',
      offline: '🔴 Offline',
    };
    toast.success(`Status: ${labels[newStatus]}`);
  }, [user?.id, profile?.organization_id]);

  return { status, activeLeadsCount, isLoading, setStatus, teamStatuses };
}
