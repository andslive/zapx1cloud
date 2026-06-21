import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

export interface MassEmailCampaign {
  id: string;
  organization_id: string;
  template_id: string | null;
  subject: string;
  html_content: string;
  target_type: 'all' | 'squad' | 'role' | 'custom';
  target_filters: {
    squadIds?: string[];
    roles?: string[];
    userIds?: string[];
  };
  scheduled_at: string | null;
  sent_at: string | null;
  status: 'draft' | 'scheduled' | 'sending' | 'sent' | 'failed';
  stats: {
    total: number;
    sent: number;
    failed: number;
  };
  created_by: string | null;
  created_at: string;
}

export interface MassEmailRecipient {
  id: string;
  campaign_id: string;
  user_id: string | null;
  email: string;
  status: 'pending' | 'sent' | 'failed';
  sent_at: string | null;
  error_message: string | null;
  created_at: string;
}

export function useMassEmailCampaigns() {
  const { profile } = useAuth();

  return useQuery({
    queryKey: ['mass-email-campaigns', profile?.organization_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('mass_email_campaigns')
        .select('*')
        .eq('organization_id', profile!.organization_id!)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as MassEmailCampaign[];
    },
    enabled: !!profile?.organization_id
  });
}

export function useCampaignRecipients(campaignId: string | null) {
  return useQuery({
    queryKey: ['campaign-recipients', campaignId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('mass_email_recipients')
        .select('*')
        .eq('campaign_id', campaignId!)
        .order('created_at', { ascending: true });

      if (error) throw error;
      return data as MassEmailRecipient[];
    },
    enabled: !!campaignId
  });
}

export function useCreateCampaign() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();

  return useMutation({
    mutationFn: async (campaign: Omit<MassEmailCampaign, 'id' | 'organization_id' | 'created_at' | 'sent_at' | 'stats' | 'created_by'>) => {
      const { data, error } = await supabase
        .from('mass_email_campaigns')
        .insert({
          organization_id: profile!.organization_id!,
          created_by: profile!.id,
          stats: { total: 0, sent: 0, failed: 0 },
          ...campaign
        })
        .select()
        .single();

      if (error) throw error;
      return data as MassEmailCampaign;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mass-email-campaigns'] });
      toast.success('Campanha criada');
    },
    onError: (error) => {
      toast.error('Erro ao criar campanha: ' + error.message);
    }
  });
}

export function useUpdateCampaign() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...campaign }: Partial<MassEmailCampaign> & { id: string }) => {
      const { error } = await supabase
        .from('mass_email_campaigns')
        .update(campaign)
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mass-email-campaigns'] });
      toast.success('Campanha atualizada');
    },
    onError: (error) => {
      toast.error('Erro ao atualizar campanha: ' + error.message);
    }
  });
}

export function useDeleteCampaign() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('mass_email_campaigns')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mass-email-campaigns'] });
      toast.success('Campanha excluída');
    },
    onError: (error) => {
      toast.error('Erro ao excluir campanha: ' + error.message);
    }
  });
}

export function useSendCampaign() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ campaignId, recipients }: { 
      campaignId: string; 
      recipients: Array<{ user_id: string; email: string; full_name: string }> 
    }) => {
      // First, create recipient records
      const { error: recipientError } = await supabase
        .from('mass_email_recipients')
        .insert(
          recipients.map(r => ({
            campaign_id: campaignId,
            user_id: r.user_id,
            email: r.email,
            status: 'pending'
          }))
        );

      if (recipientError) throw recipientError;

      // Update campaign stats and status
      const { error: updateError } = await supabase
        .from('mass_email_campaigns')
        .update({
          status: 'sending',
          stats: { total: recipients.length, sent: 0, failed: 0 }
        })
        .eq('id', campaignId);

      if (updateError) throw updateError;

      // Call edge function to send emails
      const { error: sendError } = await supabase.functions.invoke('send-mass-email', {
        body: { campaignId }
      });

      if (sendError) throw sendError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mass-email-campaigns'] });
      queryClient.invalidateQueries({ queryKey: ['campaign-recipients'] });
      toast.success('Campanha enviada');
    },
    onError: (error) => {
      toast.error('Erro ao enviar campanha: ' + error.message);
    }
  });
}
